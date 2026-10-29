-- 106: marca de envío del correo ¡Novedad! de las elecciones del 29N (29-10-2026)
-- para no mandarlo dos veces a la misma persona. Aplicada.
alter table public.users add column if not exists novedad_29n_sent_at timestamptz;
