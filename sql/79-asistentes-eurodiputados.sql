-- =====================================================================
-- 79 · Asistentes de los eurodiputados
--
-- Fuente: la pestaña «Asistentes» de la ficha de cada eurodiputado en
-- europarl.europa.eu (lo que el Parlamento publica por obligación:
-- asistentes acreditados, locales, en agrupación, becarios, prestadores
-- de servicios y agentes pagadores). Sin correo ni teléfono.
--
-- Una persona puede trabajar para varios eurodiputados (las
-- «agrupaciones» de una delegación), así que hay una tabla de personas y
-- otra de vínculos. Sync: /api/sync/ep-asistentes (empieza por los
-- españoles).
--
-- En directorio_pro entran como «ue-legislativo-asistente:<id>», una fila
-- por persona, sin prestadores ni agentes pagadores (suelen ser empresas).
-- =====================================================================

create table if not exists public.eu_asistentes (
  id bigserial primary key,
  nombre text not null,
  nombre_norm text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create table if not exists public.eu_asistentes_meps (
  asistente_id bigint not null references public.eu_asistentes (id) on delete cascade,
  mep_id text not null,
  tipo text not null check (tipo in ('acreditado', 'acreditado_agrupacion', 'local', 'local_agrupacion', 'becario', 'prestador', 'agente_pagador', 'otro')),
  etiqueta text,
  synced_at timestamptz not null default now(),
  primary key (asistente_id, mep_id, tipo)
);
create index if not exists eu_asistentes_meps_mep_idx on public.eu_asistentes_meps (mep_id);

alter table public.eu_asistentes enable row level security;
alter table public.eu_asistentes_meps enable row level security;
grant all on public.eu_asistentes, public.eu_asistentes_meps to service_role;
grant usage, select on sequence public.eu_asistentes_id_seq to service_role;
-- Los nombres son públicos (los publica el Parlamento): lectura para
-- cualquier usuario con sesión, como eu_meps.
grant select on public.eu_asistentes, public.eu_asistentes_meps to authenticated;
create policy eu_asistentes_leer on public.eu_asistentes for select to authenticated using (true);
create policy eu_asistentes_meps_leer on public.eu_asistentes_meps for select to authenticated using (true);

-- Una fila por asistente para el directorio: su eurodiputado (o cuántos,
-- si es de agrupación) y el tipo «más personal» que tenga.
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
  max(v.synced_at) as synced_at
from public.eu_asistentes a
join public.eu_asistentes_meps v on v.asistente_id = a.id
join public.eu_meps m on m.id = v.mep_id
where a.activo and v.tipo in ('acreditado', 'acreditado_agrupacion', 'local', 'local_agrupacion', 'becario')
group by a.id, a.nombre;
grant select on public.eu_asistentes_resumen to service_role;

-- Ampliar directorio_pro (solo si aún no tiene la rama).
do $$
declare
  v_def text := pg_get_viewdef('public.directorio_pro'::regclass, true);
begin
  if position('eu_asistentes_resumen' in v_def) > 0 then
    return;
  end if;
  v_def := regexp_replace(v_def, ';\s*$', '');
  execute 'create or replace view public.directorio_pro as ' || v_def || $rama$
UNION ALL
 SELECT 'ue-legislativo-asistente:'::text || r.id::text AS id,
    'UE'::text AS jurisdiccion,
    'legislativo'::text AS tipo_institucion,
    r.pais,
    'Parlamento Europeo'::text AS institucion,
        CASE
            WHEN r.n_meps = 1 THEN 'Equipo de '::text || r.mep_nombre
            ELSE 'Asistentes en agrupación · '::text || COALESCE(r.grupo, 'Parlamento Europeo'::text)
        END AS unidad,
    'asistente_eurodiputado'::text AS categoria_unidad,
    r.nombre,
        CASE r.tipo
            WHEN 'acreditado'::text THEN 'Asistente parlamentario acreditado'::text
            WHEN 'acreditado_agrupacion'::text THEN 'Asistente parlamentario acreditado (agrupación)'::text
            WHEN 'local'::text THEN 'Asistente local'::text
            WHEN 'local_agrupacion'::text THEN 'Asistente local (agrupación)'::text
            WHEN 'becario'::text THEN 'Becario'::text
            ELSE 'Asistente'::text
        END AS cargo,
    'Asistente parlamentario'::text AS cargo_canonico,
    'tecnico'::text AS banda,
    5::smallint AS orden,
    false AS es_titular,
    'Gabinete y asesoría'::text AS area,
    NULL::text AS email,
    NULL::text AS email_unidad,
    NULL::text AS telefono,
    NULL::text AS direccion_postal,
    'Bruselas'::text AS localidad,
    NULL::text AS provincia,
    NULL::text AS slug,
    'europarl'::text AS origen,
    'europarl-asistentes'::text AS fuente,
    r.synced_at AS fuente_fecha,
    false AS objecion,
        CASE
            WHEN r.synced_at > (now() - '6 mons'::interval) THEN 10
            ELSE 0
        END AS contactabilidad
   FROM eu_asistentes_resumen r
$rama$;
end;
$$;

-- Personas sin ningún vínculo vigente: inactivas (no se borran).
create or replace function public.eu_asistentes_desactivar_sueltos()
returns integer language sql security definer set search_path = public as $$
  with u as (
    update public.eu_asistentes a set activo = (exists (select 1 from public.eu_asistentes_meps v where v.asistente_id = a.id))
    where a.activo <> (exists (select 1 from public.eu_asistentes_meps v where v.asistente_id = a.id))
    returning 1
  ) select count(*)::int from u;
$$;
revoke all on function public.eu_asistentes_desactivar_sueltos() from public, anon, authenticated;
grant execute on function public.eu_asistentes_desactivar_sueltos() to service_role;
