-- 127. Licitaciones: carga histórica y datos para la ficha (11-11-2026).
--
-- contratacion_historico: la cola de ZIP de datos abiertos de la
-- Plataforma (un trabajo por feed y periodo, AAAA o AAAAMM). La recorre
-- /api/sync/contratacion-historico con descargas parciales; siguiente es
-- el índice del próximo fichero ATOM dentro del ZIP.
--
-- En los expedientes, lo que necesitan la ficha y Vencimientos:
--   fecha_formalizacion  la primera formalización (TenderResult/Contract)
--   fin_contrato         fin previsto del contrato: el del periodo de
--                        ejecución si viene, o formalización (o
--                        adjudicación) + duración. Sin prórrogas: esas van
--                        en datos.prorrogas como texto.

create table if not exists public.contratacion_historico (
  id bigserial primary key,
  feed text not null check (feed in ('perfiles', 'agregacion', 'menores')),
  periodo text not null check (periodo ~ '^\d{4}(\d{2})?$'),
  prioridad int not null default 10,
  url text,
  bytes bigint,
  ficheros int,
  siguiente int not null default 0,
  entradas bigint not null default 0,
  guardadas bigint not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecho', 'error', 'no_existe')),
  error text,
  actualizado_en timestamptz not null default now(),
  unique (feed, periodo)
);
alter table public.contratacion_historico enable row level security;
revoke all on public.contratacion_historico from anon, authenticated;

alter table public.contratacion_expedientes add column if not exists fecha_formalizacion date;
alter table public.contratacion_expedientes add column if not exists fin_contrato date;
create index if not exists contratacion_exp_fin_contrato_idx on public.contratacion_expedientes (fin_contrato) where fin_contrato is not null;
