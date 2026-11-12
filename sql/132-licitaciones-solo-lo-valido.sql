-- 132. Licitaciones: guardar solo lo que la plataforma usa (12-11-2026).
--
-- El 12-11-2026 la carga histórica llenó el disco y dejó la base de datos
-- sin servicio. Desde entonces:
--
--   1. contratacion_eventos (una fila por cada versión vista de cada
--      expediente) deja de escribirse: ninguna pantalla ni proceso la lee.
--      Se vacía. La tabla se conserva por si los avisos la necesitan.
--   2. Los expedientes cerrados (ADJ, RES, ANUL) se guardan en formato
--      reducido: sin datos.documentos y con datos.criterios solo con tipo
--      y peso. Es lo que ya hacía la carga de años anteriores
--      (lib/contratacion/guardar.js, opciones.ligero). Aquí se aplica a
--      los que ya estaban cargados.
--
-- Ejecutar después de desplegar el código que deja de escribir eventos.

-- Paso 0 (solo lectura): qué se va a tocar.
select
  (select count(*) from public.contratacion_eventos) as eventos,
  (select count(*) from public.contratacion_expedientes
    where estado in ('ADJ', 'RES', 'ANUL') and datos ? 'documentos') as cerradas_con_documentos;

-- Paso 1: vaciar el historial de versiones.
truncate table public.contratacion_eventos;

-- Paso 2: cerradas a formato reducido. Por tandas, para no pasar del
-- tiempo límite: repetir hasta que no actualice ninguna fila.
with tanda as (
  select id from public.contratacion_expedientes
   where estado in ('ADJ', 'RES', 'ANUL') and datos ? 'documentos'
   limit 20000
)
update public.contratacion_expedientes e
   set datos = (e.datos - 'documentos') || jsonb_build_object(
         'criterios',
         coalesce(
           (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('tipo', c -> 'tipo', 'peso', c -> 'peso')))
              from jsonb_array_elements(case when jsonb_typeof(e.datos -> 'criterios') = 'array' then e.datos -> 'criterios' else '[]'::jsonb end) c),
           '[]'::jsonb))
  from tanda
 where e.id = tanda.id;

-- Paso 3: devolver el espacio al disco (bloquea la tabla unos minutos;
-- hacerlo fuera de la franja de la carga histórica).
-- vacuum full public.contratacion_expedientes;
