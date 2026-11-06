-- =====================================================================
-- 123 · Licitaciones y contratos del sector público
--
-- Diseño: documento del proyecto «claude/licitaciones-contratos.md».
-- Cargadores: /api/sync/contratacion (Plataforma de Contratación, datos
-- abiertos ATOM/CODICE: perfiles, agregación y contratos menores) y
-- /api/sync/contratacion-ted (TED, Search API v3, poderes adjudicadores
-- españoles).
--
--   contratacion_expedientes     una licitación o contrato, en su última
--                                versión conocida.
--   contratacion_eventos         cada versión vista (una por cambio en el
--                                feed): es lo que generará los avisos.
--   contratacion_adjudicaciones  resultado por lote. RGPD: el NIF de las
--                                personas físicas no se guarda.
--   contratacion_lectura         por dónde va cada feed (cursor) y su
--                                última ejecución.
--
-- Solo el servidor lee y escribe: RLS activado sin políticas.
-- fin_ofertas es hora local de Madrid tal como la publica la fuente.
-- =====================================================================

create table if not exists public.contratacion_expedientes (
  id text primary key,                    -- '<fuente>:<id de la fuente>'
  fuente text not null check (fuente in ('perfiles', 'agregacion', 'menores', 'ted')),
  id_fuente text not null,
  expediente text,
  titulo text,
  url text,
  estado text,                            -- PUB, EV, PRE, ADJ, RES, ANUL… (TED: tipo de formulario)
  tipo text,                              -- tipo de contrato (código CODICE)
  subtipo text,
  procedimiento text,
  organo_nombre text,
  organo_dir3 text,
  organo_nif text,
  organo_ubicacion text,
  cpv text[] not null default '{}',
  nuts text,
  valor_estimado numeric,
  importe_sin_iva numeric,
  importe_total numeric,
  fin_ofertas timestamp,                  -- hora local de Madrid
  es_menor boolean not null default false,
  ted_ref text,
  anuncios jsonb not null default '[]',   -- [{ tipo, fecha }]
  datos jsonb,                            -- campos propios de la fuente que no tienen columna
  actualizado_fuente timestamptz,         -- <updated> de la entrada
  eliminado boolean not null default false,
  detectado_en timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contratacion_exp_fuente_idx on public.contratacion_expedientes (fuente);
create index if not exists contratacion_exp_estado_idx on public.contratacion_expedientes (estado);
create index if not exists contratacion_exp_dir3_idx on public.contratacion_expedientes (organo_dir3);
create index if not exists contratacion_exp_nif_idx on public.contratacion_expedientes (organo_nif);
create index if not exists contratacion_exp_fin_idx on public.contratacion_expedientes (fin_ofertas);
create index if not exists contratacion_exp_act_idx on public.contratacion_expedientes (actualizado_fuente desc);
create index if not exists contratacion_exp_cpv_idx on public.contratacion_expedientes using gin (cpv);

create table if not exists public.contratacion_eventos (
  id bigserial primary key,
  expediente_id text not null references public.contratacion_expedientes (id) on delete cascade,
  actualizado_fuente timestamptz not null,
  estado text,
  anuncios jsonb not null default '[]',
  detectado_en timestamptz not null default now(),
  unique (expediente_id, actualizado_fuente)
);
create index if not exists contratacion_eventos_det_idx on public.contratacion_eventos (detectado_en desc);

create table if not exists public.contratacion_adjudicaciones (
  id bigserial primary key,
  expediente_id text not null references public.contratacion_expedientes (id) on delete cascade,
  orden int not null,
  resultado text,
  fecha date,
  ofertas int,
  adjudicatario text,
  nif text,                               -- solo personas jurídicas
  persona_fisica boolean not null default false,
  importe numeric,
  unique (expediente_id, orden)
);
create index if not exists contratacion_adj_nif_idx on public.contratacion_adjudicaciones (nif);

create table if not exists public.contratacion_lectura (
  feed text primary key,                  -- perfiles | agregacion | menores | ted
  marca timestamptz,                      -- lo más reciente ya leído entero
  last_modified text,                     -- Last-Modified de la cabecera en la última pasada completa
  pendiente_url text,                     -- página por la que sigue una pasada a medias
  pendiente_marca timestamptz,            -- hasta dónde baja esa pasada
  pendiente_last_modified text,
  nueva_marca timestamptz,                -- lo más reciente visto en la pasada en curso
  ultima_ejecucion timestamptz,
  ultimo_resultado jsonb,
  ultimo_error text
);

alter table public.contratacion_expedientes enable row level security;
alter table public.contratacion_eventos enable row level security;
alter table public.contratacion_adjudicaciones enable row level security;
alter table public.contratacion_lectura enable row level security;

grant all on public.contratacion_expedientes, public.contratacion_eventos,
  public.contratacion_adjudicaciones, public.contratacion_lectura to service_role;
grant usage, select on sequence public.contratacion_eventos_id_seq, public.contratacion_adjudicaciones_id_seq to service_role;
