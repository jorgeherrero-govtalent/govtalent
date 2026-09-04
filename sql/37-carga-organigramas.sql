-- 37-carga-organigramas.sql
-- Ajustes de esquema + carga de los organigramas de 5 ministerios.
--
-- Idempotente: crea las tablas si no existen y anade las columnas nuevas
-- si faltan. Se puede ejecutar aunque 36-organigramas-ministerio.sql no
-- se haya llegado a aplicar.
--
-- Ejecutar los bloques POR SEPARADO, no el fichero entero.


-- =====================================================================
-- BLOQUE 1 — ESQUEMA (crear o ajustar)
-- =====================================================================

create table if not exists organigrama_fuentes (
  id                bigserial primary key,
  ministerio        text        not null,
  dir3_ministerio   text,
  url               text,
  fecha_documento   date,
  fecha_extraccion  timestamptz not null default now(),
  n_unidades        integer,
  notas             text
);

create table if not exists organigrama_unidades (
  id            bigserial primary key,
  fuente_id     bigint      not null
                references organigrama_fuentes(id) on delete cascade,
  nombre        text        not null,
  categoria     text        not null,
  nivel         smallint    not null,
  superior_id   bigint      references organigrama_unidades(id) on delete set null,
  titular       text,
  dependencia   text        not null default 'organica'
                check (dependencia in ('organica', 'funcional')),
  confianza     text        not null default 'alta'
                check (confianza in ('alta', 'media', 'baja')),
  revisado      boolean     not null default false,
  dir3_code     text,
  orden         smallint,
  created_at    timestamptz not null default now()
);

-- Columnas que han ido apareciendo al extraer los cinco ministerios.
-- telefono: Industria publica extension directa por unidad; los demas no.
alter table organigrama_unidades add column if not exists telefono text;

-- Referencia normativa: Juventud cita el RD 211/2024 y Agricultura el
-- RD 717/2024. Es lo que permite justificar la estructura y detectar
-- cuando un organigrama queda obsoleto.
alter table organigrama_fuentes add column if not exists norma_referencia text;
alter table organigrama_fuentes add column if not exists norma_url text;
alter table organigrama_fuentes add column if not exists formato text;

create unique index if not exists idx_org_fuentes_ministerio
  on organigrama_fuentes (ministerio);
create index if not exists idx_org_unidades_fuente
  on organigrama_unidades (fuente_id, nivel, orden);
create index if not exists idx_org_unidades_superior
  on organigrama_unidades (superior_id);
create index if not exists idx_org_unidades_revision
  on organigrama_unidades (confianza, revisado) where confianza <> 'alta';

-- Nombre unico dentro de cada fuente: el arbol se resuelve por nombre al
-- cargar, asi que un duplicado dentro del mismo ministerio lo romperia.
-- (En el MTDFP habia tres cajas "Gabinete"; van desambiguadas en el CSV.)
create unique index if not exists idx_org_unidades_nombre_fuente
  on organigrama_unidades (fuente_id, nombre);


-- =====================================================================
-- BLOQUE 2 — TABLA DE STAGING
-- Crear, y despues importar organigramas_5_ministerios.csv desde el
-- Table Editor de Supabase. Columnas en el mismo nombre y orden.
-- =====================================================================

create table if not exists staging_organigramas (
  ministerio   text,
  nivel        text,
  unidad       text,
  categoria    text,
  superior     text,
  titular      text,
  telefono     text,
  dependencia  text,
  confianza    text
);


-- =====================================================================
-- BLOQUE 3 — VERIFICACION DEL STAGING (solo lectura)
-- Ejecutar ANTES de cargar. Deben salir 293 filas y 5 ministerios,
-- y las dos comprobaciones de integridad deben devolver 0 filas.
-- =====================================================================

-- 3.1 Recuento
-- select ministerio, count(*) from staging_organigramas group by ministerio order by 2 desc;

-- 3.2 Huerfanos: superiores que no existen dentro de su propio ministerio.
-- select s.ministerio, s.unidad, s.superior
-- from staging_organigramas s
-- where coalesce(s.superior,'') <> ''
--   and not exists (
--     select 1 from staging_organigramas p
--     where p.ministerio = s.ministerio and p.unidad = s.superior);

-- 3.3 Duplicados dentro de un mismo ministerio.
-- select ministerio, unidad, count(*)
-- from staging_organigramas
-- group by ministerio, unidad having count(*) > 1;


-- =====================================================================
-- BLOQUE 4 — CARGA
-- Ejecutar entero, en una sola pasada. Es transaccional: si algo falla,
-- no queda nada a medias.
-- =====================================================================

begin;

insert into organigrama_fuentes (ministerio, fecha_documento, formato, norma_referencia, n_unidades)
select
  s.ministerio,
  case s.ministerio
    when 'Ministerio para la Transformación Digital y de la Función Pública' then date '2026-06-17'
    when 'Ministerio de Industria y Turismo'                                 then date '2026-06-10'
    when 'Ministerio de Juventud e Infancia'                                 then date '2026-06-03'
    when 'Ministerio de Agricultura, Pesca y Alimentación'                   then date '2026-07-06'
    else null
  end,
  case s.ministerio
    when 'Ministerio de Sanidad'                             then 'svg'
    when 'Ministerio de Juventud e Infancia'                 then 'png'
    when 'Ministerio de Agricultura, Pesca y Alimentación'   then 'html'
    else 'pdf'
  end,
  case s.ministerio
    when 'Ministerio de Juventud e Infancia'               then 'Real Decreto 211/2024, de 27 de febrero'
    when 'Ministerio de Agricultura, Pesca y Alimentación' then 'Real Decreto 717/2024, de 23 de julio'
    else null
  end,
  count(*)
from staging_organigramas s
group by s.ministerio
on conflict (ministerio) do nothing;

-- Las unidades entran sin superior_id; el arbol se enlaza despues.
-- Hacerlo en dos pasos evita depender del orden de insercion.
insert into organigrama_unidades
  (fuente_id, nombre, categoria, nivel, titular, telefono, dependencia, confianza)
select
  f.id,
  s.unidad,
  s.categoria,
  s.nivel::smallint,
  nullif(trim(s.titular), ''),
  nullif(trim(s.telefono), ''),
  coalesce(nullif(trim(s.dependencia), ''), 'organica'),
  coalesce(nullif(trim(s.confianza), ''), 'alta')
from staging_organigramas s
join organigrama_fuentes f on f.ministerio = s.ministerio
on conflict (fuente_id, nombre) do nothing;

-- Enlazar el arbol: se resuelve por nombre dentro de la misma fuente.
update organigrama_unidades u
set superior_id = p.id
from staging_organigramas s
join organigrama_fuentes f on f.ministerio = s.ministerio
join organigrama_unidades p on p.fuente_id = f.id and p.nombre = s.superior
where u.fuente_id = f.id
  and u.nombre = s.unidad
  and coalesce(s.superior, '') <> '';

commit;


-- =====================================================================
-- BLOQUE 5 — COMPROBACION POSTERIOR
-- =====================================================================

-- 5.1 Debe haber exactamente una raiz por ministerio.
-- select f.ministerio, count(*) filter (where u.superior_id is null) as raices, count(*) as unidades
-- from organigrama_unidades u
-- join organigrama_fuentes f on f.id = u.fuente_id
-- group by f.ministerio order by unidades desc;

-- 5.2 Cobertura por categoria.
-- select categoria, count(*) as unidades,
--        count(*) filter (where titular is not null)  as con_titular,
--        count(*) filter (where telefono is not null) as con_telefono
-- from organigrama_unidades group by categoria order by unidades desc;

-- 5.3 Cola de revision: las lecturas dudosas del diagrama.
-- select f.ministerio, u.nombre, u.categoria, u.confianza
-- from organigrama_unidades u
-- join organigrama_fuentes f on f.id = u.fuente_id
-- where u.confianza <> 'alta' and not u.revisado
-- order by u.confianza, f.ministerio;

-- 5.4 Limpieza cuando todo cuadre.
-- drop table staging_organigramas;
