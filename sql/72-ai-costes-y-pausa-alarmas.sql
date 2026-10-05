-- =====================================================================
-- 72 · Coste de IA por alarma y pausa de alarmas sin uso
--
-- 1. ai_costes: consumo real de tokens de cada llamada de la vigilancia,
--    por usuario y alarma, para ver el coste por cliente. Va aparte de
--    ai_usage_log porque esa tabla se usa para los límites de uso de los
--    usuarios: meter aquí la vigilancia los bloquearía.
-- 2. sector_alerts.pausada_inactividad_at: cuándo se pausó una alarma por
--    no encontrar nada en 60 días.
--
-- Paso 0 (verificación, solo lectura):
--   select to_regclass('public.ai_costes'),
--     exists(select 1 from information_schema.columns
--            where table_name='sector_alerts' and column_name='pausada_inactividad_at');
-- =====================================================================

create table if not exists public.ai_costes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  origen text not null,
  user_id uuid references auth.users(id) on delete set null,
  alert_id uuid references public.sector_alerts(id) on delete set null,
  modelo text,
  input_tokens integer not null default 0,
  cache_escritura integer not null default 0,
  cache_lectura integer not null default 0,
  output_tokens integer not null default 0,
  coste_usd numeric(12, 6)
);

create index if not exists ai_costes_created_at_idx on public.ai_costes (created_at);
create index if not exists ai_costes_user_idx on public.ai_costes (user_id, created_at);

-- Solo el servidor (service role) escribe y lee: RLS activado y sin
-- políticas para usuarios.
alter table public.ai_costes enable row level security;
grant all on public.ai_costes to service_role;

alter table public.sector_alerts
  add column if not exists pausada_inactividad_at timestamptz;
