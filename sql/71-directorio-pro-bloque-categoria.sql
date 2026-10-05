-- 71-directorio-pro-bloque-categoria.sql
-- La carga por bloques de la Base de datos devuelve también categoria_unidad
-- (05-10-2026). La página la necesita para clasificar cada fila en su bloque
-- (Instituciones, Organizaciones, Medios y actores sociales) y su nivel: en
-- las filas de la Agenda es la categoría de origen (patronal, sindicato,
-- prensa, ccaa, local…), que tipo_institucion agrupa demasiado.
--
-- Solo cambia la función: misma firma, una columna más al final.

-- PASO 0 · Comprobación previa (solo lectura): la función existe y la vista
-- tiene la columna.
select proname from pg_proc where proname = 'directorio_pro_bloque';
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'directorio_pro' and column_name = 'categoria_unidad';

-- PASO 1
create or replace function public.directorio_pro_bloque(p_desde integer, p_cuantos integer)
 returns json
 language sql
 stable
 set search_path to 'public'
as $function$
  select json_build_object(
    'c', json_build_array('id', 'jurisdiccion', 'tipo_institucion', 'pais', 'institucion', 'unidad',
                          'nombre', 'cargo', 'cargo_canonico', 'banda', 'orden', 'es_titular', 'area',
                          'email', 'email_unidad', 'telefono', 'direccion_postal', 'slug', 'contactabilidad',
                          'categoria_unidad'),
    'f', coalesce(json_agg(json_build_array(
           d.id, d.jurisdiccion, d.tipo_institucion, d.pais, d.institucion, d.unidad,
           d.nombre, d.cargo, d.cargo_canonico, d.banda, d.orden, d.es_titular, d.area,
           d.email, d.email_unidad, d.telefono, d.direccion_postal, d.slug, d.contactabilidad,
           d.categoria_unidad
         ) order by d.orden, d.id), '[]'::json)
  )
  from (
    select *
    from public.directorio_pro
    where objecion = false
    order by orden, id
    offset greatest(p_desde, 0)
    limit least(greatest(p_cuantos, 0), 5000)
  ) d;
$function$;

-- PASO 2 · Verificación: 20 columnas, la última categoria_unidad.
select json_array_length(public.directorio_pro_bloque(0, 1) -> 'c') as columnas,
       public.directorio_pro_bloque(0, 1) -> 'c' ->> 19 as ultima;
