-- =====================================================================
-- 83 · Candidaturas a las Cortes Generales
--
-- Las listas que publica el BOE (candidaturas presentadas y, una semana
-- después, proclamadas), una fila por candidato. Cargador:
-- /api/sync/candidaturas?boe=<BOE-A-…>&eleccion=2026-11-29&estado=presentada
--
-- estado: presentada → proclamada → electo (el 30N, con los resultados).
-- Una recarga con las proclamadas actualiza las mismas filas: la clave es
-- elección + cámara + circunscripción + candidatura + titular/suplente +
-- número de orden.
-- =====================================================================

create table if not exists public.candidatos (
  id bigserial primary key,
  eleccion date not null,
  camara text not null check (camara in ('congreso', 'senado')),
  circunscripcion text not null,
  candidatura text not null,
  siglas text,
  num_candidatura smallint,
  orden smallint not null,
  suplente boolean not null default false,
  nombre text not null,
  independiente boolean not null default false,
  estado text not null default 'presentada' check (estado in ('presentada', 'proclamada', 'electo', 'retirada')),
  fuente_boe text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (eleccion, camara, circunscripcion, candidatura, suplente, orden)
);
create index if not exists candidatos_eleccion_idx on public.candidatos (eleccion, camara, circunscripcion);

alter table public.candidatos enable row level security;
grant all on public.candidatos to service_role;
grant usage, select on sequence public.candidatos_id_seq to service_role;
