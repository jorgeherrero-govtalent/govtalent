-- =====================================================================
-- 77 · buscar_contactos con filtro de país (07-10-2026)
--
-- Añade p_filtros.paises: códigos ISO de dos letras (p. ej. ["ES"]) sobre
-- directorio_pro.pais. Sirve sobre todo para el Parlamento Europeo
-- («eurodiputados españoles»). Sustituye a la versión de sql/75.
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
               order by es_titular desc nulls last, contactabilidad desc nulls last, orden asc nulls last, nombre asc
               offset greatest(p_desde, 0) limit least(greatest(p_cuantos, 1), 2000)) p
    ), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$function$;

revoke all on function public.buscar_contactos(jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.buscar_contactos(jsonb, integer, integer) to service_role;
