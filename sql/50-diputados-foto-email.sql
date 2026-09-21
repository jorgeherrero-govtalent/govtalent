-- =====================================================================
-- 50-diputados-foto-email.sql
--
-- Columnas que necesita la Fase 2 del sync de diputados:
--   cod_parlamentario  el identificador del Congreso (texto: es un
--                      código, no una cantidad; no se suma ni se ordena
--                      por él)
--   photo_url          la foto oficial, en congreso.es
--   email              el correo institucional @congreso.es
--
-- PASO 0 es solo de lectura. Ejecútalo primero y mira el resultado
-- antes de tocar nada: si las tres columnas ya existen, no hay que
-- correr el paso 1.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 0 — Comprobación (no modifica nada)
-- ---------------------------------------------------------------------

-- 0.a ¿Qué columnas tiene hoy `deputies`?
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'deputies'
order by ordinal_position;

-- 0.b Las tres que importan, de un vistazo.
select
  c.nombre,
  case when i.column_name is null then 'FALTA' else i.data_type end as estado
from (values ('cod_parlamentario'), ('photo_url'), ('email')) as c(nombre)
left join information_schema.columns i
  on i.table_schema = 'public'
 and i.table_name = 'deputies'
 and i.column_name = c.nombre;

-- 0.c Cuántos diputados activos hay y cuántos están ya completos.
select
  count(*) filter (where active) as activos,
  count(*) filter (where active and cod_parlamentario is not null) as con_codigo,
  count(*) filter (where active and photo_url is not null) as con_foto,
  count(*) filter (where active and email is not null) as con_correo
from public.deputies;
-- (0.c falla si alguna columna no existe todavía — es lo esperado:
--  significa que hay que ejecutar el paso 1.)


-- ---------------------------------------------------------------------
-- PASO 1 — Alta de columnas
--
-- `if not exists` respeta lo que ya hubiera: si una columna existe con
-- otro tipo, esta sentencia no la toca ni la rompe.
-- ---------------------------------------------------------------------

alter table public.deputies
  add column if not exists cod_parlamentario text,
  add column if not exists photo_url text,
  add column if not exists email text;

-- El sync busca por código al cruzar y al refrescar. Con 350 filas el
-- índice es casi decorativo, pero evita el escaneo completo cuando la
-- tabla acumule legislaturas anteriores.
create index if not exists deputies_cod_parlamentario_idx
  on public.deputies (cod_parlamentario);

comment on column public.deputies.cod_parlamentario is
  'Identificador del diputado en congreso.es (codParlamentario). Fuente: buscador de diputados, endpoint searchDiputados.';
comment on column public.deputies.photo_url is
  'Foto oficial en congreso.es (/docu/imgweb/diputados/{cod}_{legislatura}.jpg). Confirmada contra la ficha.';
comment on column public.deputies.email is
  'Correo institucional @congreso.es publicado en la ficha oficial.';


-- ---------------------------------------------------------------------
-- PASO 2 — Repetir 0.c para confirmar
-- ---------------------------------------------------------------------

select
  count(*) filter (where active) as activos,
  count(*) filter (where active and cod_parlamentario is not null) as con_codigo,
  count(*) filter (where active and photo_url is not null) as con_foto,
  count(*) filter (where active and email is not null) as con_correo
from public.deputies;
