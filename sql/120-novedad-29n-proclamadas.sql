-- 120: marca de envío del segundo correo ¡Novedad! del 29N, el de las
-- candidaturas proclamadas (03-11-2026), para no mandarlo dos veces.
alter table public.users add column if not exists novedad_29n_proclamadas_sent_at timestamptz;
