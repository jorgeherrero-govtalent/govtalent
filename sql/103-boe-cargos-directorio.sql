-- =====================================================================
-- 103 · Nombramientos y ceses del BOE → directorio
--
-- Hasta ahora volcar_titulares_boe() solo escribía en government_officials
-- (unidades de la AGE). Las Delegaciones y Subdelegaciones del Gobierno y
-- las Direcciones Insulares no existen en age_units: vienen de la Agenda
-- de la Comunicación (directorio_entidades / directorio_contactos), así
-- que sus relevos nunca llegaban al directorio. Y el cruce por similitud
-- casaba a los delegados con las Abogacías del Estado del mismo
-- territorio (ver lib/boeCargos.js).
--
-- Este script:
--   1. Guarda en boe_appointments a qué destino va cada movimiento.
--   2. Da a cada contacto del directorio su propia fuente y fecha, para
--      que un relevo cargado del BOE diga «BOE, 21-10-2026» y no la fecha
--      de la Agenda.
--   3. Rehace volcar_titulares_boe():
--        - AGE: igual que antes, con el cargo completo como rol.
--        - Delegaciones: cese → contacto inactivo; nombramiento → contacto
--          nuevo que sustituye al anterior titular del mismo rango.
--        - Ministerios y organismos de la Agenda: un cese desactiva el
--          contacto si coinciden persona, rango y materia del cargo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Comprobación previa (solo lectura)
-- ---------------------------------------------------------------------
-- select column_name from information_schema.columns
--  where table_name in ('boe_appointments','directorio_contactos')
--    and column_name in ('destino','entidad_id','fuente','fuente_fecha');

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.boe_appointments
  add column if not exists destino text,
  add column if not exists entidad_id bigint references public.directorio_entidades(id);

alter table public.directorio_contactos
  add column if not exists fuente text,
  add column if not exists fuente_fecha date;

comment on column public.boe_appointments.destino is
  'age = unidad de age_units (government_officials); agenda = entidad de directorio_entidades (directorio_contactos)';
comment on column public.directorio_contactos.fuente is
  'Fuente propia del contacto cuando no es la de su entidad (p. ej. BOE). Si es null, manda directorio_entidades.fuente';

-- ---------------------------------------------------------------------
-- 2. directorio_pro: la fuente del contacto manda sobre la de la entidad
-- ---------------------------------------------------------------------
do $$
declare
  def text := pg_get_viewdef('public.directorio_pro'::regclass, true);
  nuevo text;
begin
  if position('COALESCE(c.fuente, e.fuente)' in def) > 0 then
    raise notice 'directorio_pro ya estaba actualizada';
    return;
  end if;

  nuevo := replace(def,
    E'    e.fuente,\n    e.fuente_fecha::timestamp with time zone AS fuente_fecha,\n    c.objecion,',
    E'    COALESCE(c.fuente, e.fuente) AS fuente,\n    COALESCE(c.fuente_fecha, e.fuente_fecha)::timestamp with time zone AS fuente_fecha,\n    c.objecion,');
  if nuevo = def then
    raise exception 'directorio_pro: no se encontró el bloque de fuente de la Agenda';
  end if;

  def := nuevo;
  nuevo := replace(def,
    E'WHEN e.fuente_fecha > (now() - ''6 mons''::interval) THEN 10',
    E'WHEN COALESCE(c.fuente_fecha, e.fuente_fecha) > (now() - ''6 mons''::interval) THEN 10');
  if nuevo = def then
    raise exception 'directorio_pro: no se encontró la contactabilidad de la Agenda';
  end if;

  execute 'create or replace view public.directorio_pro as ' || nuevo;
end $$;

-- ---------------------------------------------------------------------
-- 3. Ayudas para comparar cargos
-- ---------------------------------------------------------------------

-- Texto en minúsculas, sin tildes ni signos.
create or replace function public.texto_plano(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(t, ''), 'áéíóúüÁÉÍÓÚÜñÑ', 'aeiouuAEIOUUnN')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- Rango de un puesto territorial: delegado, subdelegado o director insular.
create or replace function public.rango_territorial(cargo text)
returns text language sql immutable as $$
  select case
    when k ~ '^subdelegad[oa] del gobierno' then 'subdelegado'
    when k ~ '^delegad[oa] del gobierno' then 'delegado'
    when k ~ '^director[a]? insular' then 'director_insular'
  end
  from (select public.texto_plano(cargo) k) x
$$;

-- Rango de un puesto en masculino, para comparar «Subsecretaria» con
-- «Subsecretario».
create or replace function public.rango_puesto(cargo text)
returns text language sql immutable as $$
  select case
    when k ~ '^secretari[oa] de estado' then 'secretario de estado'
    when k ~ '^subsecretari[oa]' then 'subsecretario'
    when k ~ '^secretari[oa] general' then 'secretario general'
    when k ~ '^subdirector[a]? general' then 'subdirector general'
    when k ~ '^director[a]? general' then 'director general'
    when k ~ '^director[a]? (del|de la) gabinete' then 'director de gabinete'
    when k ~ '^(jef[ea]) (del|de) gabinete' then 'director de gabinete'
    when k ~ '^director[a]?\y' then 'director'
    when k ~ '^vicepresident[ea]' then 'vicepresidente'
    when k ~ '^president[ea]' then 'presidente'
    when k ~ '^consejer[oa]' then 'consejero'
  end
  from (select public.texto_plano(cargo) k) x
$$;

-- Lo que queda de un cargo o unidad al quitar el rango y las palabras
-- vacías: «Subsecretario de Trabajo y Economía Social» y «Subsecretaría
-- de Trabajo y Economía Social» dan los dos «trabajo economia social».
create or replace function public.materia_puesto(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(
    public.texto_plano(t),
    '^(secretari[oa] de estado|secretari[oa] general|subsecretari[oa]|subdirecci[oó]n general|subdirector[a]? general|direccion general|director[a]? general|director[a]?|president[ea]|vicepresident[ea]|consejer[oa]|gabinete|jef[ea])\s+', ''),
    '\m(de|del|la|el|los|las|y|para|en)\M', ' ', 'g'))
$$;

-- Misma persona aunque el BOE dé un nombre más largo que la Agenda:
-- «Pilar Trinidad Núñez» = «María Pilar Trinidad Núñez». Las palabras del
-- nombre más corto (al menos tres) tienen que estar todas en el largo.
create or replace function public.misma_persona(a text, b text)
returns boolean language sql immutable as $$
  with x as (
    select string_to_array(clave_persona(a), ' ') wa, string_to_array(clave_persona(b), ' ') wb
  )
  select case
    when clave_persona(a) = clave_persona(b) then true
    when least(cardinality(wa), cardinality(wb)) < 3 then false
    else wa <@ wb or wb <@ wa
  end
  from x
$$;

-- ---------------------------------------------------------------------
-- 4. El volcado
-- ---------------------------------------------------------------------
drop function if exists public.volcar_titulares_boe();

create function public.volcar_titulares_boe()
returns table(ceses integer, altas integer, ceses_agenda integer, altas_agenda integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n_ceses integer := 0;
  n_altas integer := 0;
  n_ceses_ag integer := 0;
  n_altas_ag integer := 0;
  n integer;
  mv record;
  prev record;
  correo text;
begin
  -- ===================================================================
  -- A. Unidades de la AGE → government_officials
  -- ===================================================================
  create temp table movimientos on commit drop as
  select distinct on (a.dir3_code, lower(a.persona))
    a.dir3_code, a.persona, a.cargo, a.accion, a.fecha
  from boe_appointments a
  where a.estado = 'casado'
    and a.dir3_code is not null
    and coalesce(a.destino, 'age') = 'age'
    and not a.es_exterior
  order by a.dir3_code, lower(a.persona), a.fecha desc;

  -- 1. Ceses, comparando el nombre entero.
  update government_officials g
  set active = false, updated_at = now()
  from movimientos m
  where m.accion = 'cese'
    and g.dir3_code = m.dir3_code
    and g.active
    and misma_persona(g.full_name, m.persona);
  get diagnostics n_ceses = row_count;

  -- 2. Altas. ON CONFLICT (slug) DO NOTHING: si la persona ya está, su
  --    ficha puede llevar correcciones a mano y no se pisan.
  --
  --    El rol es el cargo completo del BOE («Director General de
  --    Carreteras»). Antes se cortaba en el primer «de» y salían roles
  --    como «Secretaria» para una secretaria de Estado o «Director» para
  --    el director de Recursos Humanos de la AEAT, que parecía el titular.
  insert into government_officials
    (ministry_name, unit_name, full_name, slug, role, active, source, source_updated_at, dir3_code, verificado_boe)
  select
    coalesce(u.raiz_nombre, u.nombre),
    u.nombre,
    case
      when array_length(string_to_array(m.persona, ' '), 1) >= 4
        then array_to_string((string_to_array(m.persona, ' '))[3:], ' ') || ', ' ||
             array_to_string((string_to_array(m.persona, ' '))[1:2], ' ')
      else array_to_string((string_to_array(m.persona, ' '))[2:], ' ') || ', ' ||
           (string_to_array(m.persona, ' '))[1]
    end,
    lower(regexp_replace(
      translate(m.persona, 'áéíóúüÁÉÍÓÚÜñÑ', 'aeiouuAEIOUUnN') || '-' || m.dir3_code,
      '[^a-zA-Z0-9]+', '-', 'g')),
    m.cargo,
    true,
    'BOE',
    m.fecha,
    m.dir3_code,
    true
  from movimientos m
  join age_units u on u.dir3_code = m.dir3_code
  where m.accion = 'nombramiento'
    and not exists (
      select 1 from government_officials g
      where g.dir3_code = m.dir3_code
        and g.active
        and misma_persona(g.full_name, m.persona)
    )
  on conflict (slug) do nothing;
  get diagnostics n_altas = row_count;

  -- ===================================================================
  -- B. Delegaciones, Subdelegaciones y Direcciones Insulares
  --    → directorio_contactos
  --
  --    Un movimiento por entidad, persona y rango: así una subdelegada que
  --    pasa a delegada en la misma entidad (Madrid) tiene su cese como
  --    subdelegada y su alta como delegada, y no se pisan.
  -- ===================================================================
  create temp table mov_agenda on commit drop as
  select distinct on (a.entidad_id, clave_persona(a.persona), rango_territorial(a.cargo))
    a.entidad_id, a.persona, a.cargo, a.accion, a.fecha, rango_territorial(a.cargo) as rango
  from boe_appointments a
  where a.estado = 'casado'
    and a.destino = 'agenda'
    and a.entidad_id is not null
  order by a.entidad_id, clave_persona(a.persona), rango_territorial(a.cargo), a.fecha desc,
           (a.accion = 'nombramiento') desc;

  -- 3. Ceses: el contacto de esa persona y ese rango deja de estar activo.
  --    No se toca un contacto cargado después del cese.
  update directorio_contactos c
  set activo = false
  from mov_agenda m
  where m.accion = 'cese'
    and c.entidad_id = m.entidad_id
    and c.activo
    and misma_persona(c.nombre, m.persona)
    and rango_territorial(c.cargo) is not distinct from m.rango
    and coalesce(c.fuente_fecha, date '1900-01-01') <= m.fecha;
  get diagnostics n = row_count;
  n_ceses_ag := n_ceses_ag + n;

  -- 4. Nombramientos.
  for mv in
    select * from mov_agenda
    where accion = 'nombramiento' and rango is not null
    order by fecha
  loop
    -- Ya está (activa), o se cargó y alguien la desactivó a mano después:
    -- no se vuelve a dar de alta.
    if exists (
      select 1 from directorio_contactos c
      where c.entidad_id = mv.entidad_id
        and misma_persona(c.nombre, mv.persona)
        and rango_territorial(c.cargo) = mv.rango
        and (c.activo or c.fuente_fecha >= mv.fecha)
    ) then
      continue;
    end if;

    -- Hay un titular de ese rango cargado después de este nombramiento:
    -- el nombramiento ya está superado.
    if exists (
      select 1 from directorio_contactos c
      where c.entidad_id = mv.entidad_id
        and c.activo
        and rango_territorial(c.cargo) = mv.rango
        and c.fuente_fecha > mv.fecha
    ) then
      continue;
    end if;

    -- El titular anterior del mismo rango: de él se heredan el teléfono,
    -- el orden y el correo si es del cargo (delegado_gobierno.madrid@…),
    -- no si es personal (lleva un apellido de la persona saliente).
    -- Puede estar ya inactivo: el cese suele publicarse el mismo día y el
    -- paso 3 lo acaba de desactivar.
    select c.* into prev
    from directorio_contactos c
    where c.entidad_id = mv.entidad_id
      and rango_territorial(c.cargo) = mv.rango
      and not misma_persona(c.nombre, mv.persona)
    order by c.activo desc, coalesce(c.fuente_fecha, date '1900-01-01') desc, c.id desc
    limit 1;

    correo := null;
    if prev.id is not null and prev.email is not null and not exists (
      select 1
      from unnest(string_to_array(clave_persona(prev.nombre), ' ')) w
      where length(w) > 3 and texto_plano(prev.email) like '%' || w || '%'
    ) then
      correo := prev.email;
    end if;

    -- Sale el anterior titular de ese rango (cargos unipersonales) y
    -- cualquier otro cargo de la propia persona en la entidad (una
    -- subdelegada ascendida a delegada).
    update directorio_contactos c
    set activo = false
    where c.entidad_id = mv.entidad_id
      and c.activo
      and coalesce(c.fuente_fecha, date '1900-01-01') <= mv.fecha
      and (
        rango_territorial(c.cargo) = mv.rango
        or misma_persona(c.nombre, mv.persona)
      );
    get diagnostics n = row_count;
    n_ceses_ag := n_ceses_ag + n;

    insert into directorio_contactos
      (entidad_id, nombre, nombre_original, cargo, email, telefono, orden, objecion, activo, fuente, fuente_fecha)
    values (
      mv.entidad_id,
      mv.persona,
      mv.persona,
      btrim(regexp_replace(mv.cargo, '\s+en\s+.*$', '', 'i')),
      correo,
      prev.telefono,
      coalesce(prev.orden, 1),
      false,
      true,
      'BOE',
      mv.fecha
    );
    n_altas_ag := n_altas_ag + 1;
  end loop;

  -- ===================================================================
  -- C. Ministerios y organismos de la Agenda: ceses
  --
  --    Solo si coinciden persona, rango y materia. Sin el rango, el cese
  --    de Sergio Cuesta como director de Gabinete se habría llevado por
  --    delante su ficha de subsecretario; sin la materia, el de Sara
  --    Hernández como secretaria general de Movilidad Sostenible, la de
  --    secretaria general de Transporte Terrestre.
  -- ===================================================================
  update directorio_contactos c
  set activo = false
  from boe_appointments a, directorio_entidades e
  where a.accion = 'cese'
    and a.estado <> 'descartado'
    and coalesce(a.destino, 'age') = 'age'
    and e.id = c.entidad_id
    and e.categoria in ('ministerio', 'organismo_age')
    and c.activo
    and misma_persona(c.nombre, a.persona)
    and rango_puesto(c.cargo) is not null
    and rango_puesto(c.cargo) = rango_puesto(a.cargo)
    and similarity(materia_puesto(coalesce(nullif(e.unidad, ''), e.organizacion)), materia_puesto(a.cargo)) >= 0.5
    and coalesce(c.fuente_fecha, e.fuente_fecha, date '1900-01-01') <= a.fecha
    -- Que no haya un nombramiento posterior de la misma persona para el
    -- mismo puesto.
    and not exists (
      select 1 from boe_appointments b
      where b.accion = 'nombramiento'
        and misma_persona(b.persona, a.persona)
        and rango_puesto(b.cargo) = rango_puesto(a.cargo)
        and materia_puesto(b.cargo) = materia_puesto(a.cargo)
        and b.fecha > a.fecha
    );
  get diagnostics n = row_count;
  n_ceses_ag := n_ceses_ag + n;

  return query select n_ceses, n_altas, n_ceses_ag, n_altas_ag;
end $function$;

revoke all on function public.volcar_titulares_boe() from public, anon, authenticated;
grant execute on function public.volcar_titulares_boe() to service_role;

-- ---------------------------------------------------------------------
-- 5. Equivalencia decidida a mano: CASA 47 es la antigua SEPES, que DIR3
--    sigue llamando «Sepes Entidad Pública Empresarial de Suelo».
-- ---------------------------------------------------------------------
insert into public.cargo_unit_map (clave_cargo, dir3_code, ignorar)
values ('casa 47 entidad publica empresarial', 'EA0000845', false)
on conflict (clave_cargo) do update set dir3_code = excluded.dir3_code, ignorar = false;

-- ---------------------------------------------------------------------
-- 6. Limpieza de los cruces erróneos (28-10-2026)
--
--    Los delegados del Gobierno casados con Abogacías del Estado, CASA 47
--    con Red.es y la secretaria de Estado de Vivienda con la
--    Subsecretaría. Se sueltan en boe_appointments (la siguiente pasada
--    del sync los vuelve a cruzar bien) y se borran las fichas que el
--    volcado creó con esos cruces: todas tienen source = 'BOE' y no
--    llevan ningún dato a mano.
-- ---------------------------------------------------------------------
update public.boe_appointments
set dir3_code = null, estado = 'sin_equivalencia', nota = 'pendiente de recruce (sql/103)'
where dir3_code is not null
  and (cargo ~* '^(sub)?delegad[oa] del gobierno en'
       or (cargo ilike '%CASA 47%' and dir3_code <> 'EA0000845')
       or (cargo ilike 'Secretari_ de Estado de Vivienda%' and dir3_code = 'E05239401')
       or (cargo ilike 'Secretari_ General para la Unión Europea' and dir3_code in (select dir3_code from public.age_units where categoria = 'secretaria_estado')));

delete from public.government_officials g
using public.age_units u
where u.dir3_code = g.dir3_code
  and g.source = 'BOE'
  and (
    (u.nombre ilike 'Abogac%' and g.role ~* '^delegad')
    or (u.nombre ilike '%Red.Es%' and g.full_name = 'Ramos Vergeles, María Isabel')
    or (u.dir3_code = 'E05239401' and g.full_name = 'Iglesias Santiago, Leire')
    or (u.categoria = 'secretaria_estado' and g.role ilike 'Secretari_ General para la Unión Europea')
  );
