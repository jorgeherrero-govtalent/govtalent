-- =====================================================================
-- 115. Tabla TEMPORAL de desarrollo: cola de páginas que lee
--       /api/cron/rastreo (composición de Aragón, Canarias, Castilla y
--       León y Castilla-La Mancha). Solo el servidor. BORRAR al terminar:
--       drop table public.debug_rastreo;
-- =====================================================================

create table if not exists public.debug_rastreo (
  id bigserial primary key,
  url text not null unique,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecho', 'robots', 'error')),
  status int,
  tipo text,
  url_final text,
  bytes int,
  html text,
  enlaces jsonb,
  error text,
  creado_en timestamptz not null default now(),
  leido_en timestamptz
);

alter table public.debug_rastreo enable row level security;
