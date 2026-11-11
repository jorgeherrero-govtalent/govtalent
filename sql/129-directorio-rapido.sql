-- 129 — Base de datos, Buscador y Listas: carga rápida (11-11-2026)
--
-- QUÉ PASABA. La vista directorio_pro une nueve fuentes y recalcularla
-- entera cuesta entre 2 y 5 segundos. La tabla precalculada
-- (directorio_pro_mat, sql/67) solo la usaba la Base de datos; todo lo
-- demás seguía leyendo la vista en vivo:
--   - cada búsqueda del Buscador (buscar_contactos): 3 a 5 s, y otra vez
--     en cada cambio de página y en cada filtro de cabecera;
--   - la página de Listas (listas_resumen): la vista entera una vez por
--     lista, y otra más por cada lista con búsqueda guardada;
--   - el total de la Base de datos (/total): 3 s, y la página esperaba a
--     tenerlo antes de pedir los datos;
--   - «Buscar correo» de cada página de la tabla (contactos_por_ids).
--
-- QUÉ CAMBIA. La tabla precalculada pasa a llevar todas las columnas de
-- la vista y, además, los textos ya normalizados (sin tildes y en
-- minúsculas) para que buscar sea comparar texto y no recalcular. Las
-- funciones de arriba leen de ella. Se refresca cada 5 minutos, como
-- hasta ahora (refrescar_directorio_pro, sin cambios).
--
-- LO QUE SIGUE EN VIVO. Quien se acaba de dar de alta desde «Buscar fuera
-- de GovTalent» todavía no está en la tabla precalculada: por eso
-- contactos_por_ids y lista_estado van a la vista a por los que falten
-- (solo esos, y en las listas solo los añadidos en los últimos 10 minutos).

-- ---------------------------------------------------------------------
-- 1. La tabla precalculada, con todas las columnas y los textos de búsqueda
-- ---------------------------------------------------------------------
drop materialized view if exists public.directorio_pro_mat;

create materialized view public.directorio_pro_mat as
select
  d.id, d.jurisdiccion, d.tipo_institucion, d.pais, d.institucion, d.unidad,
  d.nombre, d.cargo, d.cargo_canonico, d.banda, d.orden, d.es_titular, d.area,
  d.email, d.email_unidad, d.telefono, d.direccion_postal, d.slug, d.contactabilidad,
  d.categoria_unidad,
  d.localidad, d.provincia, d.origen, d.fuente, d.fuente_fecha,
  unaccent(lower(coalesce(d.nombre, ''))) as nombre_norm,
  unaccent(lower(coalesce(d.cargo, ''))) as cargo_norm,
  unaccent(lower(coalesce(d.institucion, ''))) as institucion_norm,
  unaccent(lower(coalesce(d.unidad, ''))) as unidad_norm,
  unaccent(lower(coalesce(d.provincia, ''))) as provincia_norm,
  unaccent(lower(concat_ws(' ', d.nombre, d.cargo, d.unidad, d.institucion, d.area))) as busqueda,
  grupo_contacto(d.unidad, d.jurisdiccion, d.tipo_institucion) as grupo
from public.directorio_pro d
where d.objecion = false;

create unique index directorio_pro_mat_id on public.directorio_pro_mat (id);
create index directorio_pro_mat_orden_id on public.directorio_pro_mat (orden, id);

revoke all on public.directorio_pro_mat from public, anon, authenticated;
grant select on public.directorio_pro_mat to service_role;
analyze public.directorio_pro_mat;

-- Las mismas columnas que directorio_pro y en su mismo orden, pero leídas
-- de la tabla precalculada. Para lo que monta la fila entera con to_jsonb.
create or replace view public.directorio_pro_rapido
with (security_invoker = true) as
select
  id, jurisdiccion, tipo_institucion, pais, institucion, unidad, categoria_unidad,
  nombre, cargo, cargo_canonico, banda, orden, es_titular, area,
  email, email_unidad, telefono, direccion_postal, localidad, provincia,
  slug, origen, fuente, fuente_fecha, false as objecion, contactabilidad
from public.directorio_pro_mat;

revoke all on public.directorio_pro_rapido from public, anon, authenticated;
grant select on public.directorio_pro_rapido to service_role;

-- ---------------------------------------------------------------------
-- 2. El Buscador filtra sobre la tabla precalculada
-- ---------------------------------------------------------------------
create or replace function public.contactos_filtrados(p_filtros jsonb)
 returns setof directorio_pro
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_terminos text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'terminos', '[]')) x where trim(x) <> '');
  v_cargos text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'cargos', '[]')) x where trim(x) <> '');
  v_cargos_ex text[] := array(select x from jsonb_array_elements_text(coalesce(f->'cargos_exactos', '[]')) x where trim(x) <> '');
  v_insts text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'instituciones', '[]')) x where trim(x) <> '');
  v_unids text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'unidades', '[]')) x where trim(x) <> '');
  v_tipos text[] := array(select x from jsonb_array_elements_text(coalesce(f->'tipos', '[]')) x);
  v_bandas text[] := array(select x from jsonb_array_elements_text(coalesce(f->'bandas', '[]')) x);
  v_paises text[] := array(select upper(x) from jsonb_array_elements_text(coalesce(f->'paises', '[]')) x);
  v_grupos text[] := array(select x from jsonb_array_elements_text(coalesce(f->'grupos', '[]')) x where trim(x) <> '');
  v_jur text := nullif(f->>'jurisdiccion', '');
  v_prov text := nullif(unaccent(lower(f->>'provincia')), '');
  v_tit boolean := coalesce((f->>'solo_titulares')::boolean, false);
  v_cont boolean := coalesce((f->>'con_contacto')::boolean, false);
  v_nombre text := nullif(unaccent(lower(trim(coalesce(f->>'nombre', '')))), '');
  v_correo text := nullif(f->>'correo', '');
  v_tel boolean := coalesce((f->>'con_telefono')::boolean, false);
begin
  return query
  select d.id, d.jurisdiccion, d.tipo_institucion, d.pais, d.institucion, d.unidad, d.categoria_unidad,
         d.nombre, d.cargo, d.cargo_canonico, d.banda, d.orden, d.es_titular, d.area,
         d.email, d.email_unidad, d.telefono, d.direccion_postal, d.localidad, d.provincia,
         d.slug, d.origen, d.fuente, d.fuente_fecha, false, d.contactabilidad
    from directorio_pro_mat d
   where (v_jur is null or d.jurisdiccion = v_jur)
     and (cardinality(v_tipos) = 0 or d.tipo_institucion = any(v_tipos))
     and (cardinality(v_bandas) = 0 or d.banda = any(v_bandas))
     and (cardinality(v_paises) = 0 or upper(coalesce(d.pais, '')) = any(v_paises))
     and (cardinality(v_grupos) = 0 or d.grupo = any(v_grupos))
     and (cardinality(v_cargos_ex) = 0 or d.cargo = any(v_cargos_ex))
     and (not v_tit or d.es_titular)
     and (not v_cont or coalesce(d.email, d.email_unidad, d.telefono) is not null)
     and (v_prov is null or d.provincia_norm like '%' || v_prov || '%')
     and (v_nombre is null or d.nombre_norm like '%' || v_nombre || '%')
     and (v_correo is null
          or (v_correo = 'con' and coalesce(d.email, d.email_unidad) is not null)
          or (v_correo = 'sin' and d.email is null and d.email_unidad is null))
     and (not v_tel or d.telefono is not null)
     and (cardinality(v_terminos) = 0 or not exists (
            select 1 from unnest(v_terminos) t where d.busqueda not like '%' || t || '%'))
     and (cardinality(v_cargos) = 0 or exists (select 1 from unnest(v_cargos) t where d.cargo_norm like '%' || t || '%'))
     and (cardinality(v_insts) = 0 or exists (select 1 from unnest(v_insts) t where d.institucion_norm like '%' || t || '%'))
     and (cardinality(v_unids) = 0 or exists (select 1 from unnest(v_unids) t where d.unidad_norm like '%' || t || '%'));
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Filas por id: de la tabla precalculada; a la vista solo por las que falten
-- ---------------------------------------------------------------------
create or replace function public.contactos_por_ids(p_ids text[])
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_res jsonb;
  v_faltan text[];
begin
  select coalesce(jsonb_agg(to_jsonb(d) - 'objecion'), '[]'::jsonb) into v_res
    from directorio_pro_rapido d
   where d.id = any(p_ids);

  select array_agg(x) into v_faltan
    from unnest(p_ids) x
   where x is not null
     and x not like 'libre:%'
     and not exists (select 1 from directorio_pro_mat m where m.id = x);

  if coalesce(cardinality(v_faltan), 0) > 0 then
    select v_res || coalesce(jsonb_agg(to_jsonb(d) - 'objecion'), '[]'::jsonb) into v_res
      from directorio_pro d
     where d.id = any(v_faltan) and not d.objecion;
  end if;
  return v_res;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. El estado de una lista: igual, leyendo de la tabla precalculada
-- ---------------------------------------------------------------------
create or replace function public.lista_estado(p_lista uuid, p_max_incorporaciones integer default 50)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  l contactos_listas;
  v_ids text[];
  v_recientes text[];
  v_vivo jsonb := '{}'::jsonb;
  v_miembros jsonb;
  v_inc jsonb := '[]'::jsonb;
  v_n_inc integer := 0;
begin
  select * into l from contactos_listas where id = p_lista;
  if not found then return null; end if;

  select array_agg(persona_id) into v_ids from contactos_lista_miembros where lista_id = p_lista;

  -- Añadidos hace nada que aún no están en la tabla precalculada: su fila
  -- sale de la vista, para que no aparezcan como «salida» esos minutos.
  select array_agg(m.persona_id) into v_recientes
    from contactos_lista_miembros m
   where m.lista_id = p_lista
     and m.added_at > now() - interval '10 minutes'
     and m.persona_id not like 'libre:%'
     and not exists (select 1 from directorio_pro_mat d where d.id = m.persona_id);
  if coalesce(cardinality(v_recientes), 0) > 0 then
    select coalesce(jsonb_object_agg(d.id, to_jsonb(d) - 'objecion'), '{}'::jsonb) into v_vivo
      from directorio_pro d
     where d.id = any(v_recientes) and not d.objecion;
  end if;

  with actual as (
    select d.id, to_jsonb(d) - 'objecion' as fila
      from directorio_pro_rapido d
     where d.id = any(coalesce(v_ids, '{}'))
    union all
    select x.key, x.value from jsonb_each(v_vivo) x
  ),
  enr as (
    select e.persona_id, to_jsonb(e) - 'creado_por' - 'coste_usd' as fila
      from contactos_enriquecidos e
     where e.persona_id = any(coalesce(v_ids, '{}')) and e.estado = 'encontrado'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'persona_id', m.persona_id,
           'snapshot', m.snapshot,
           'actual', a.fila,
           'enriquecido', e.fila,
           'added_at', m.added_at,
           'cambio', case
             when a.fila is null then case when m.mantener_salida then null else 'salida' end
             when coalesce(a.fila->>'cargo', '') <> coalesce(m.snapshot->>'cargo', '')
               or coalesce(a.fila->>'unidad', '') <> coalesce(m.snapshot->>'unidad', '')
               or coalesce(a.fila->>'institucion', '') <> coalesce(m.snapshot->>'institucion', '') then 'cargo'
             when coalesce(a.fila->>'email', '') <> coalesce(m.snapshot->>'email', '')
               or coalesce(a.fila->>'email_unidad', '') <> coalesce(m.snapshot->>'email_unidad', '')
               or coalesce(a.fila->>'telefono', '') <> coalesce(m.snapshot->>'telefono', '') then 'contacto'
             else null end
         ) order by m.added_at, m.persona_id), '[]'::jsonb)
    into v_miembros
    from contactos_lista_miembros m
    left join actual a on a.id = m.persona_id
    left join enr e on e.persona_id = m.persona_id
   where m.lista_id = p_lista;

  if l.filtros is not null then
    with r as (select buscar_contactos(l.filtros, 0, 2000) as res),
    nuevos as (
      select f
        from r, jsonb_array_elements(r.res->'filas') f
       where not (f->>'id' = any(coalesce(v_ids, '{}')))
         and not (f->>'id' = any(l.descartados))
    )
    select count(*)::int,
           coalesce((select jsonb_agg(n.f) from (select f from nuevos limit greatest(p_max_incorporaciones, 0)) n), '[]'::jsonb)
      into v_n_inc, v_inc
      from nuevos;
  end if;

  return jsonb_build_object(
    'lista', jsonb_build_object('id', l.id, 'nombre', l.nombre, 'consulta', l.consulta, 'filtros', l.filtros,
                                'owner_id', l.owner_id, 'organization_id', l.organization_id,
                                'created_at', l.created_at, 'updated_at', l.updated_at),
    'miembros', v_miembros,
    'incorporaciones', v_inc,
    'n_incorporaciones', v_n_inc
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Orden estable en el Buscador
-- ---------------------------------------------------------------------
-- A igualdad de todo lo demás, el orden lo decidía la base a su antojo, y
-- al pasar de página una misma persona podía repetirse o no salir. Se
-- desempata por id.
create or replace function public.buscar_contactos(p_filtros jsonb, p_desde integer default 0, p_cuantos integer default 50)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_orden text := coalesce(nullif(p_filtros->>'orden', ''), 'relevancia');
  v_res jsonb;
begin
  with filtrado as (select * from contactos_filtrados(p_filtros))
  select jsonb_build_object(
    'total', (select count(*) from filtrado),
    'filas', coalesce((
      select jsonb_agg(to_jsonb(p) - 'objecion')
        from (select * from filtrado
               order by
                 case when v_orden = 'nombre_asc' then unaccent(lower(nombre)) end asc nulls last,
                 case when v_orden = 'nombre_desc' then unaccent(lower(nombre)) end desc nulls last,
                 case when v_orden = 'cargo_asc' then unaccent(lower(cargo)) end asc nulls last,
                 case when v_orden = 'cargo_desc' then unaccent(lower(cargo)) end desc nulls last,
                 case when v_orden = 'institucion_asc' then unaccent(lower(institucion)) end asc nulls last,
                 case when v_orden = 'institucion_desc' then unaccent(lower(institucion)) end desc nulls last,
                 es_titular desc nulls last, contactabilidad desc nulls last, orden asc nulls last, nombre asc, id asc
               offset greatest(p_desde, 0) limit least(greatest(p_cuantos, 1), 2000)) p
    ), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$function$;
