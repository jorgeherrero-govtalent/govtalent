-- =====================================================================
-- 109 · Plazos de las leyes autonómicas y su escalera de avisos (entrega C)
--
-- Entrega C de «seguimiento-leyes-autonomicas.md» (30-10-2026).
--
-- ccaa_plazos: un plazo por ley y clase (totalidad, articulado, enmiendas
--   cuando el boletín no distingue, alegaciones ciudadanas, comparecencias),
--   con su apertura, su cierre (fecha y hora) y cuántas prórrogas lleva.
--   Lo reconstruye el sync de parlamentos desde ccaa_tramites
--   (lib/ccaa/plazos.js). Desde la 3.ª prórroga el plazo está bloqueado.
--
-- ccaa_plazo_avisos: qué hito de la escalera se ha avisado ya a quién.
--   destino: 'alarma:<id>' o 'seguimiento' (el evento de la ley, común a
--   quien la siga). hito: 30, 14, 7, 3, 1 o 0 (cierra hoy). hasta: null en
--   los lejanos (30, 14, 7: una vez por plazo aunque se amplíe) y la fecha
--   de cierre en los cercanos (3, 1, 0: se repiten si el plazo se amplía).
--
-- sector_alert_matches.solo_resumen: la prórroga de un plazo bloqueado no
--   sale en el aviso al momento, sino en el resumen de primera hora.
--
-- Solo los usa el servidor: RLS activado y sin políticas.
-- =====================================================================

create table if not exists public.ccaa_plazos (
  id text primary key,                       -- «<expediente>|<clase>|<apertura>»
  expediente_id text not null references public.ccaa_expedientes(id) on delete cascade,
  clase text not null check (clase in ('totalidad', 'articulado', 'enmiendas', 'alegaciones', 'comparecencias')),
  abierto_desde date not null,
  hasta timestamptz not null,
  n_prorrogas integer not null default 0,
  tramite_apertura_id uuid,
  ultimo_tramite_id uuid,
  updated_at timestamptz not null default now()
);
create index if not exists ccaa_plazos_exp on public.ccaa_plazos (expediente_id);
create index if not exists ccaa_plazos_hasta on public.ccaa_plazos (hasta);

create table if not exists public.ccaa_plazo_avisos (
  destino text not null,
  plazo_id text not null references public.ccaa_plazos(id) on delete cascade,
  hito integer not null,
  hasta timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ccaa_plazo_avisos_unico
  on public.ccaa_plazo_avisos (destino, plazo_id, hito, hasta) nulls not distinct;

alter table public.sector_alert_matches add column if not exists solo_resumen boolean not null default false;

alter table public.ccaa_plazos enable row level security;
alter table public.ccaa_plazo_avisos enable row level security;
grant all on public.ccaa_plazos, public.ccaa_plazo_avisos to service_role;
