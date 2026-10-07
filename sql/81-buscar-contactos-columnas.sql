-- =====================================================================
-- 81 · buscar_contactos: filtros y orden desde las columnas (07-10-2026)
--
-- Añade a p_filtros:
--   nombre        texto que tiene que aparecer en el nombre
--   correo        'con' | 'sin' (correo propio o de la unidad)
--   con_telefono  true para solo los que tienen teléfono
--   orden         nombre_asc/desc, cargo_asc/desc, institucion_asc/desc
--                 (por defecto, relevancia: titulares y contactabilidad)
-- Sustituye a la versión de sql/77.
-- =====================================================================

create or replace function public.buscar_contactos(p_filtros jsonb, p_desde integer default 0, p_cuantos integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_terminos text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'terminos', '[]')) x where trim(x) <> '');
  v_cargos text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'cargos', '[]')) x where trim(x) <> '');
  v_insts text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'instituciones', '[]')) x where trim(x) <> '');
  v_unids text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'unidades', '[]')) x where trim(x) <> '');
  v_tipos text[] := array(select x from jsonb_array_elements_text(coalesce(f->'tipos', '[]')) x);
  v_bandas text[] := array(select x from jsonb_array_elements_text(coalesce(f->'bandas', '[]')) x);
  v_paises text[] := array(select upper(x) from jsonb_array_elements_text(coalesce(f->'paises', '[]')) x);
  v_jur text := nullif(f->>'jurisdiccion', '');
  v_prov text := nullif(unaccent(lower(f->>'provincia')), '');
  v_tit boolean := coalesce((f->>'solo_titulares')::boolean, false);
  v_cont boolean := coalesce((f->>'con_contacto')::boolean, false);
  v_nombre text := nullif(unaccent(lower(trim(coalesce(f->>'nombre', '')))), '');
  v_correo text := nullif(f->>'correo', '');
  v_tel boolean := coalesce((f->>'con_telefono')::boolean, false);
  v_orden text := coalesce(nullif(f->>'orden', ''), 'relevancia');
  v_res jsonb;
begin
  with base as (
    select d.*,
           unaccent(lower(concat_ws(' ', d.nombre, d.cargo, d.unidad, d.institucion, d.area))) as todo
      from directorio_pro d
     where not d.objecion
       and (v_jur is null or d.jurisdiccion = v_jur)
       and (cardinality(v_tipos) = 0 or d.tipo_institucion = any(v_tipos))
       and (cardinality(v_bandas) = 0 or d.banda = any(v_bandas))
       and (cardinality(v_paises) = 0 or upper(coalesce(d.pais, '')) = any(v_paises))
       and (not v_tit or d.es_titular)
       and (not v_cont or coalesce(d.email, d.email_unidad, d.telefono) is not null)
       and (v_prov is null or unaccent(lower(coalesce(d.provincia, ''))) like '%' || v_prov || '%')
       and (v_nombre is null or unaccent(lower(coalesce(d.nombre, ''))) like '%' || v_nombre || '%')
       and (v_correo is null
            or (v_correo = 'con' and coalesce(d.email, d.email_unidad) is not null)
            or (v_correo = 'sin' and d.email is null and d.email_unidad is null))
       and (not v_tel or d.telefono is not null)
  ),
  filtrado as (
    select * from base b
     where (cardinality(v_terminos) = 0 or not exists (select 1 from unnest(v_terminos) t where b.todo not like '%' || t || '%'))
       and (cardinality(v_cargos) = 0 or exists (select 1 from unnest(v_cargos) t where unaccent(lower(coalesce(b.cargo, ''))) like '%' || t || '%'))
       and (cardinality(v_insts) = 0 or exists (select 1 from unnest(v_insts) t where unaccent(lower(coalesce(b.institucion, ''))) like '%' || t || '%'))
       and (cardinality(v_unids) = 0 or exists (select 1 from unnest(v_unids) t where unaccent(lower(coalesce(b.unidad, ''))) like '%' || t || '%'))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrado),
    'filas', coalesce((
      select jsonb_agg(to_jsonb(p) - 'todo' - 'objecion')
        from (select * from filtrado
               order by
                 case when v_orden = 'nombre_asc' then unaccent(lower(nombre)) end asc nulls last,
                 case when v_orden = 'nombre_desc' then unaccent(lower(nombre)) end desc nulls last,
                 case when v_orden = 'cargo_asc' then unaccent(lower(cargo)) end asc nulls last,
                 case when v_orden = 'cargo_desc' then unaccent(lower(cargo)) end desc nulls last,
                 case when v_orden = 'institucion_asc' then unaccent(lower(institucion)) end asc nulls last,
                 case when v_orden = 'institucion_desc' then unaccent(lower(institucion)) end desc nulls last,
                 es_titular desc nulls last, contactabilidad desc nulls last, orden asc nulls last, nombre asc
               offset greatest(p_desde, 0) limit least(greatest(p_cuantos, 1), 2000)) p
    ), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$function$;

revoke all on function public.buscar_contactos(jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.buscar_contactos(jsonb, integer, integer) to service_role;
