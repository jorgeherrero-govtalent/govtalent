-- =====================================================================
-- 80 · Correo y LinkedIn de los asistentes de los eurodiputados
--
-- Primera carga: export de Enginy de Jorge (07-10-2026), 57 asistentes
-- españoles con correo profesional y LinkedIn. Se cruzan por nombre con
-- eu_asistentes (sql/79). Se descartan los correos que no son de
-- @europarl.europa.eu o cuyo nombre no cuadra con la persona (eran de
-- otro asistente).
--
-- El correo es del Directorio: la columna se cierra al navegador y sale
-- por /api/instituciones/asistentes-contacto, que comprueba el plan.
-- =====================================================================

alter table public.eu_asistentes
  add column if not exists email text,
  add column if not exists linkedin_url text,
  add column if not exists email_fuente text;

-- Columnas visibles para cualquier usuario con sesión: todas menos el correo.
revoke select on public.eu_asistentes from authenticated;
grant select (id, nombre, nombre_norm, activo, created_at, synced_at, linkedin_url) on public.eu_asistentes to authenticated;

create or replace view public.eu_asistentes_resumen as
select
  a.id,
  a.nombre,
  (array_agg(m.country_code order by m.country_code))[1] as pais,
  count(distinct v.mep_id) as n_meps,
  (array_agg(m.full_name order by
     case v.tipo when 'acreditado' then 1 when 'local' then 2 when 'becario' then 3 when 'acreditado_agrupacion' then 4 else 5 end, m.full_name))[1] as mep_nombre,
  (array_agg(m.political_group_code order by m.political_group_code))[1] as grupo,
  (array_agg(v.tipo order by
     case v.tipo when 'acreditado' then 1 when 'local' then 2 when 'becario' then 3 when 'acreditado_agrupacion' then 4 else 5 end))[1] as tipo,
  max(v.synced_at) as synced_at,
  a.email
from public.eu_asistentes a
join public.eu_asistentes_meps v on v.asistente_id = a.id
join public.eu_meps m on m.id = v.mep_id
where a.activo and v.tipo in ('acreditado', 'acreditado_agrupacion', 'local', 'local_agrupacion', 'becario')
group by a.id, a.nombre, a.email;

-- La rama de asistentes de directorio_pro pasa a leer el correo.
do $$
declare
  v_def text := pg_get_viewdef('public.directorio_pro'::regclass, true);
  p int := position('asistente_eurodiputado' in v_def);
  cabeza text;
  cola text;
begin
  if p = 0 or position('r.email' in substr(v_def, p)) > 0 then
    return;
  end if;
  cabeza := substr(v_def, 1, p - 1);
  cola := substr(v_def, p);
  cola := regexp_replace(cola, 'NULL::text AS email,', 'r.email,');
  cola := regexp_replace(cola, 'WHEN r\.synced_at > ', 'WHEN r.email IS NOT NULL THEN 60 WHEN r.synced_at > ');
  v_def := regexp_replace(cabeza || cola, ';\s*$', '');
  execute 'create or replace view public.directorio_pro as ' || v_def;
end;
$$;
