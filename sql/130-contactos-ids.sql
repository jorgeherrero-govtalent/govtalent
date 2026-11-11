-- 130 — Base de datos con el Buscador dentro (11-11-2026)
--
-- La Base de datos tiene todas las filas en el navegador. Al buscar desde
-- «Nueva búsqueda», la IA devuelve unos filtros y esta función dice qué
-- personas los cumplen: solo los ids. La página se queda con esas filas
-- y sus propios filtros (pestañas, institución, área…) siguen encima.
create or replace function public.contactos_ids(p_filtros jsonb)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(f.id), '[]'::jsonb) from contactos_filtrados(p_filtros) f;
$function$;
revoke all on function public.contactos_ids(jsonb) from public, anon, authenticated;
grant execute on function public.contactos_ids(jsonb) to service_role;
