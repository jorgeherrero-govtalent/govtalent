-- =====================================================================
-- 82 · Contactos: filtrar por grupo parlamentario y por cargo exacto
--
-- · La unidad de los asistentes de eurodiputados lleva el grupo al final
--   («Equipo de Nora JUNCO GARCÍA · PPE»), como la de los eurodiputados
--   («PPE»). grupo_contacto() saca el grupo de las dos.
-- · contactos_filtrados(p_filtros): los filtros en un solo sitio, para la
--   búsqueda y para los valores de las cabeceras.
-- · p_filtros nuevos: grupos (códigos: PPE, S&D…) y cargos_exactos.
-- · facetas_contactos(p_filtros, p_campo): valores con su recuento para
--   las cabeceras (cargo, grupo, institución), sin el filtro de esa misma
--   columna para que se puedan marcar varios.
-- =====================================================================

-- 1. El grupo en la unidad de los asistentes.
do $$
declare
  v_def text := pg_get_viewdef('public.directorio_pro'::regclass, true);
begin
  if position('''Equipo de ''::text || r.mep_nombre' in v_def) = 0 or position('r.mep_nombre) || COALESCE' in v_def) > 0 then
    return;
  end if;
  v_def := replace(v_def, '''Equipo de ''::text || r.mep_nombre', '(''Equipo de ''::text || r.mep_nombre) || COALESCE('' · ''::text || r.grupo, ''''::text)');
  v_def := regexp_replace(v_def, ';\s*$', '');
  execute 'create or replace view public.directorio_pro as ' || v_def;
end;
$$;

-- 2. Grupo político de una fila (solo Parlamento Europeo).
create or replace function public.grupo_contacto(p_unidad text, p_jur text, p_tipo text)
returns text language sql immutable as $$
  select case
    when p_jur = 'UE' and p_tipo = 'legislativo' and nullif(trim(p_unidad), '') is not null
      then nullif(trim(regexp_replace(p_unidad, '^.*·\s*', '')), '')
  end;
$$;

-- 3. Los filtros, una vez.
create or replace function public.contactos_filtrados(p_filtros jsonb)
returns setof public.directorio_pro
language plpgsql stable security definer set search_path to 'public'
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
  select d.*
    from directorio_pro d
   where not d.objecion
     and (v_jur is null or d.jurisdiccion = v_jur)
     and (cardinality(v_tipos) = 0 or d.tipo_institucion = any(v_tipos))
     and (cardinality(v_bandas) = 0 or d.banda = any(v_bandas))
     and (cardinality(v_paises) = 0 or upper(coalesce(d.pais, '')) = any(v_paises))
     and (cardinality(v_grupos) = 0 or grupo_contacto(d.unidad, d.jurisdiccion, d.tipo_institucion) = any(v_grupos))
     and (cardinality(v_cargos_ex) = 0 or d.cargo = any(v_cargos_ex))
     and (not v_tit or d.es_titular)
     and (not v_cont or coalesce(d.email, d.email_unidad, d.telefono) is not null)
     and (v_prov is null or unaccent(lower(coalesce(d.provincia, ''))) like '%' || v_prov || '%')
     and (v_nombre is null or unaccent(lower(coalesce(d.nombre, ''))) like '%' || v_nombre || '%')
     and (v_correo is null
          or (v_correo = 'con' and coalesce(d.email, d.email_unidad) is not null)
          or (v_correo = 'sin' and d.email is null and d.email_unidad is null))
     and (not v_tel or d.telefono is not null)
     and (cardinality(v_terminos) = 0 or not exists (
            select 1 from unnest(v_terminos) t
             where unaccent(lower(concat_ws(' ', d.nombre, d.cargo, d.unidad, d.institucion, d.area))) not like '%' || t || '%'))
     and (cardinality(v_cargos) = 0 or exists (select 1 from unnest(v_cargos) t where unaccent(lower(coalesce(d.cargo, ''))) like '%' || t || '%'))
     and (cardinality(v_insts) = 0 or exists (select 1 from unnest(v_insts) t where unaccent(lower(coalesce(d.institucion, ''))) like '%' || t || '%'))
     and (cardinality(v_unids) = 0 or exists (select 1 from unnest(v_unids) t where unaccent(lower(coalesce(d.unidad, ''))) like '%' || t || '%'));
end;
$function$;

-- 4. La búsqueda, sobre los filtros.
create or replace function public.buscar_contactos(p_filtros jsonb, p_desde integer default 0, p_cuantos integer default 50)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
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
                 es_titular desc nulls last, contactabilidad desc nulls last, orden asc nulls last, nombre asc
               offset greatest(p_desde, 0) limit least(greatest(p_cuantos, 1), 2000)) p
    ), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$function$;

-- 5. Valores de una columna con su recuento.
create or replace function public.facetas_contactos(p_filtros jsonb, p_campo text)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_res jsonb;
begin
  -- Sin el filtro de la propia columna, para poder marcar varios valores.
  if p_campo = 'cargo' then f := f - 'cargos_exactos';
  elsif p_campo = 'grupo' then f := f - 'grupos';
  elsif p_campo = 'institucion' then f := f - 'instituciones';
  else return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('v', v, 'n', n) order by n desc, v), '[]'::jsonb) into v_res
    from (
      select v, count(*) as n
        from (
          select case p_campo
                   when 'cargo' then d.cargo
                   when 'grupo' then grupo_contacto(d.unidad, d.jurisdiccion, d.tipo_institucion)
                   else d.institucion
                 end as v
            from contactos_filtrados(f) d
        ) s
       where v is not null
       group by v
       order by 2 desc
       limit 80
    ) x;
  return v_res;
end;
$function$;

revoke all on function public.contactos_filtrados(jsonb) from public, anon, authenticated;
revoke all on function public.buscar_contactos(jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.facetas_contactos(jsonb, text) from public, anon, authenticated;
grant execute on function public.contactos_filtrados(jsonb) to service_role;
grant execute on function public.buscar_contactos(jsonb, integer, integer) to service_role;
grant execute on function public.facetas_contactos(jsonb, text) to service_role;
