-- =====================================================================
-- 86 · Correos probables (pasos 1 y 3; el 2, verificar, va aparte)
--
-- email_patrones: el patrón de cada dominio deducido de los correos
--   personales que ya tenemos (lib/patronesCorreo.js), con cuántos casos
--   conocidos reproduce (fiabilidad).
-- email_dominios_institucion: el dominio de correo de cada institución,
--   para saber qué patrón aplicar a quien no tiene correo.
-- Los calcula /api/sync/patrones-correo.
-- =====================================================================

create table if not exists public.email_patrones (
  dominio text primary key,
  patron text,
  aciertos integer not null default 0,
  muestras integer not null default 0,
  fiabilidad numeric(5,3) not null default 0,
  alternativas jsonb not null default '[]'::jsonb,
  fuente text not null default 'directorio',
  actualizado timestamptz not null default now()
);

create table if not exists public.email_dominios_institucion (
  institucion text primary key,
  dominio text not null,
  n integer not null,
  cuota numeric(5,3) not null,
  actualizado timestamptz not null default now()
);

alter table public.email_patrones enable row level security;
alter table public.email_dominios_institucion enable row level security;
grant all on public.email_patrones, public.email_dominios_institucion to service_role;
