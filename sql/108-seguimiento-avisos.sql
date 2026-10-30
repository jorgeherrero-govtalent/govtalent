-- =====================================================================
-- 108 · Avisos de seguimiento de leyes autonómicas (entrega B)
--
-- Entrega B de «seguimiento-leyes-autonomicas.md» (30-10-2026).
--
-- 1. follow_events gana dos columnas opcionales, útiles para cualquier
--    tipo de evento: url (el documento oficial, p. ej. la página del
--    boletín) y cita (cómo se nombra, p. ej. «BOAM 178, pág. 132»). Las
--    escribe lib/ccaa/eventos.js para cada trámite autonómico.
--
-- 2. my_follow_events expone además el título propio del evento
--    (event_title: el trámite; title sigue siendo la etiqueta del
--    seguimiento, la ley), url y cita. Columnas nuevas al final: se
--    reemplaza con CREATE OR REPLACE (definición en producción a
--    30-10-2026 más esas tres columnas) y sin perder project_events.
--
-- 3. seguimiento_avisos: qué evento se ha avisado ya por correo a quién.
--    Uno por usuario y evento. canal: 'email' (enviado), 'alarma' (no se
--    envía porque ya le llega por una alarma que encontró esa ley),
--    'sin_correo' (tiene los correos apagados). Lo que no tiene fila y es
--    reciente se reintenta en la ejecución siguiente del sync. Solo lo
--    usa el servidor: RLS activado y sin políticas.
-- =====================================================================

alter table public.follow_events add column if not exists url text;
alter table public.follow_events add column if not exists cita text;

create or replace view public.my_follow_events
with (security_invoker = on) as
 SELECT e.id AS event_id,
    f.user_id,
    f.id AS follow_id,
    e.kind,
    e.ref_id,
    e.event_type,
    COALESCE(f.label, e.title) AS title,
    e.detail,
    e.occurred_at,
    f.seen_at,
    (e.occurred_at > f.seen_at) AS es_nueva,
    f.project_id,
    p.name AS project_name,
    e.title AS event_title,
    e.url,
    e.cita
   FROM ((follow_events e
     JOIN follows f ON (((f.kind = e.kind) AND (f.ref_id = e.ref_id))))
     LEFT JOIN projects p ON ((p.id = f.project_id)));

create table if not exists public.seguimiento_avisos (
  user_id uuid not null,
  event_id uuid not null references public.follow_events(id) on delete cascade,
  canal text not null check (canal in ('email', 'alarma', 'sin_correo')),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index if not exists seguimiento_avisos_event on public.seguimiento_avisos (event_id);

alter table public.seguimiento_avisos enable row level security;
grant all on public.seguimiento_avisos to service_role;
