-- 136. Ceses y nombramientos del BOE en la ficha y en la Base de datos (19-11-2026)
--
-- Regla de Jorge: un contacto tiene que estar a la vez en la ficha de su
-- organización y en la Base de datos. Un cese lo quita de los dos sitios;
-- un nombramiento lo pone en los dos.
--
-- volcar_titulares_boe() (sql/103) solo aplicaba los ceses «casados» con
-- una unidad DIR3 y, fuera de government_officials, solo en entidades de
-- categoría ministerio/organismo_age. Se quedaban vivos:
--   - copias de la Agenda en entidades públicas (presidente de Renfe);
--   - filas de fuentes_personas (embajadores del MAEC), porque los ceses
--     exteriores se descartan;
--   - ceses casados con otra unidad DIR3 o sin equivalencia (Presidencia
--     del Gobierno).
--
-- Este paso general busca a la persona en las tres tablas que alimentan
-- ficha y Base de datos y la desactiva si:
--   1) es la misma persona (misma_persona),
--   2) el dato es anterior o igual a la fecha del cese,
--   3) el cargo casa: mismo rango y materia parecida, o para embajadores
--      el país del cese aparece en el cargo,
--   4) no hay un nombramiento posterior de esa persona que case mejor con
--      esa fila (traslados el mismo día, renombramientos).
-- Y da de alta en fuentes_personas a los embajadores nombrados que no
-- están en ninguna parte (los nombramientos exteriores se descartaban).

create or replace function public.boe_pais_embajada(cargo text)
returns text language sql immutable as $$
  select case when cargo ~* '^embajador'
    then lower(unaccent(regexp_replace(cargo, '^.* (en|de|del) (la |el |los |las )?', '')))
  end
$$;

create or replace function public.boe_casa_cargo(fila_cargo text, fila_materia text, boe_cargo text)
returns real language sql stable as $$
  select case
    when fila_cargo ~* '^embajador' and boe_cargo ~* '^embajador' then
      case when length(boe_pais_embajada(boe_cargo)) >= 3
            and position(boe_pais_embajada(boe_cargo) in lower(unaccent(fila_cargo))) > 0
           then 1::real else 0::real end
    when rango_puesto(fila_cargo) is not null
     and rango_puesto(fila_cargo) = rango_puesto(boe_cargo)
     and length(fila_materia) >= 6 then
      greatest(similarity(fila_materia, materia_puesto(boe_cargo)),
               word_similarity(fila_materia, materia_puesto(boe_cargo)))
    else 0::real
  end
$$;

create or replace function public.boe_aplicar_en_ficha_y_base()
returns table(ceses integer, altas integer)
language plpgsql security definer set search_path to 'public' as $$
declare
  n_ceses integer := 0;
  n_altas integer := 0;
  n integer;
begin
  create temp table filas_vivas on commit drop as
  select 'g'::text as t, g.id::text as id, g.nombre_display as nombre, g.role as cargo,
         materia_puesto(coalesce(g.role,'')||' '||coalesce(g.unit_name,'')||' '||coalesce(g.ministry_name,'')) as mr,
         coalesce(g.source_updated_at::date, date '1900-01-01') as f
  from government_officials g where g.active
  union all
  select 'c', c.id::text, c.nombre, c.cargo,
         materia_puesto(coalesce(c.cargo,'')||' '||coalesce(e.unidad,'')||' '||e.organizacion),
         coalesce(c.fuente_fecha, e.fuente_fecha, date '1900-01-01')
  from directorio_contactos c join directorio_entidades e on e.id = c.entidad_id
  where c.activo and coalesce(c.nombre,'') <> ''
  union all
  select 'f', f.id::text, f.nombre, f.cargo,
         materia_puesto(coalesce(f.cargo,'')||' '||coalesce(f.unidad,'')||' '||coalesce(f.institucion,'')),
         coalesce(f.fuente_fecha, date '1900-01-01')
  from fuentes_personas f where f.activo;

  create temp table a_cesar on commit drop as
  select distinct r.t, r.id
  from filas_vivas r
  join boe_appointments a
    on a.accion = 'cese' and a.persona is not null
   and clave_persona(a.persona) = clave_persona(r.nombre)
   and misma_persona(r.nombre, a.persona)
  where r.f <= a.fecha
    and boe_casa_cargo(r.cargo, r.mr, a.cargo) >= 0.5
    and not exists (
      select 1 from boe_appointments b
      where b.accion = 'nombramiento' and b.persona is not null
        and clave_persona(b.persona) = clave_persona(r.nombre)
        and b.fecha >= a.fecha
        and boe_casa_cargo(r.cargo, r.mr, b.cargo) > 0
        and boe_casa_cargo(r.cargo, r.mr, b.cargo) >= boe_casa_cargo(r.cargo, r.mr, a.cargo)
    );

  update government_officials g set active = false, updated_at = now()
  from a_cesar x where x.t = 'g' and g.id::text = x.id and g.active;
  get diagnostics n = row_count; n_ceses := n_ceses + n;

  update directorio_contactos c set activo = false
  from a_cesar x where x.t = 'c' and c.id::text = x.id and c.activo;
  get diagnostics n = row_count; n_ceses := n_ceses + n;

  update fuentes_personas f set activo = false
  from a_cesar x where x.t = 'f' and f.id::text = x.id and f.activo;
  get diagnostics n = row_count; n_ceses := n_ceses + n;

  -- Embajadores nombrados que no están en ninguna parte.
  insert into fuentes_personas
    (fuente, fuente_fecha, fuente_clave, jurisdiccion, tipo_institucion, pais, institucion,
     unidad, categoria_unidad, nombre, cargo, banda, orden, es_titular, area, extra)
  select distinct on (clave_persona(b.persona))
    'BOE', b.fecha, 'boe-emb:' || clave_persona(b.persona),
    'España', 'ejecutivo', 'ES', 'Ministerio de Asuntos Exteriores, Unión Europea y Cooperación',
    'Embajada de España en ' || regexp_replace(b.cargo, '^Embajadora? de España en ', '', 'i'),
    'embajada_espana', b.persona, b.cargo, 'alta_direccion', 1, true, 'Relaciones internacionales',
    jsonb_build_object('boe_id', b.boe_id)
  from boe_appointments b
  where b.accion = 'nombramiento' and b.persona is not null and b.cargo ~* '^embajador'
    and not exists (
      select 1 from boe_appointments c
      where c.accion = 'cese' and clave_persona(c.persona) = clave_persona(b.persona)
        and c.fecha > b.fecha and boe_pais_embajada(c.cargo) = boe_pais_embajada(b.cargo))
    and not exists (select 1 from fuentes_personas f where f.activo and misma_persona(f.nombre, b.persona))
    and not exists (select 1 from government_officials g where g.active and misma_persona(g.full_name, b.persona))
  order by clave_persona(b.persona), b.fecha desc
  on conflict do nothing;
  get diagnostics n_altas = row_count;

  return query select n_ceses, n_altas;
end $$;

-- Engancharlo al volcado diario (/api/sync/boe-cargos → volcar_titulares_boe):
-- se añade al final, antes del return, y suma sus cifras a las de la agenda.
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.volcar_titulares_boe'::regproc);
  if position('boe_aplicar_en_ficha_y_base' in def) = 0 then
    def := replace(def, '  correo text;' || chr(10), '  correo text;' || chr(10) || '  extra record;' || chr(10));
    def := replace(def, '  return query select n_ceses, n_altas, n_ceses_ag, n_altas_ag;',
      '  -- sql/136: el cese o el nombramiento, en la ficha y en la Base de datos' || chr(10) ||
      '  select * into extra from boe_aplicar_en_ficha_y_base();' || chr(10) ||
      '  n_ceses_ag := n_ceses_ag + extra.ceses;' || chr(10) ||
      '  n_altas_ag := n_altas_ag + extra.altas;' || chr(10) || chr(10) ||
      '  return query select n_ceses, n_altas, n_ceses_ag, n_altas_ag;');
    execute def;
  end if;
end $do$;
