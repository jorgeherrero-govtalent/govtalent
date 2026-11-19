-- 135: marca de envío del correo ¡Novedad! de la extensión de Chrome y
-- la conexión con Claude y ChatGPT (19-11-2026), para no mandarlo dos veces.
alter table public.users add column if not exists novedad_extension_sent_at timestamptz;
