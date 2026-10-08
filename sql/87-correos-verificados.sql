-- =====================================================================
-- 87 · Correos probables, paso 2: verificación (MillionVerifier)
--
-- email_verificaciones: caché de cada correo comprobado (no se paga dos
--   veces el mismo). resultado: ok · catch_all · unknown · invalid ·
--   disposable · error.
-- correos_verificados: para cada persona sin correo, qué se probó y qué
--   quedó: 'ok' (existe), 'catch_all' (el servidor acepta todo: no se
--   puede saber), 'no_existe' (todas las variantes rebotan), 'desconocido'.
-- email_patrones.catch_all: el dominio acepta cualquier dirección; no se
--   gastan más créditos en él.
-- Lo rellena /api/sync/verificar-correos.
-- =====================================================================

create table if not exists public.email_verificaciones (
  email text primary key,
  resultado text not null,
  subresultado text,
  calidad text,
  verificado_at timestamptz not null default now()
);

create table if not exists public.correos_verificados (
  persona_id text primary key,
  email text,
  resultado text not null,
  dominio text,
  patron text,
  probados jsonb not null default '[]'::jsonb,
  actualizado timestamptz not null default now()
);

alter table public.email_patrones add column if not exists catch_all boolean;

alter table public.email_verificaciones enable row level security;
alter table public.correos_verificados enable row level security;
grant all on public.email_verificaciones, public.correos_verificados to service_role;
