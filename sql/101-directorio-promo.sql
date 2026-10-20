-- =====================================================================
-- 101 · Correo de presentación del Directorio (20-10-2026)
--
-- Marca de envío del correo que sale 2 días después del registro a quien
-- no tiene el Directorio (app/api/cron/directorio-promo). Evita mandarlo
-- dos veces a la misma persona.
-- =====================================================================

alter table public.users
  add column if not exists directorio_promo_sent_at timestamptz;
