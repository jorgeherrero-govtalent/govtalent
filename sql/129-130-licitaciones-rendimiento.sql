-- 129 y 130. Licitaciones: que la lista cargue rápido (11-11-2026).
--
-- Con la carga histórica la tabla pasó de 25.000 a 74.000 filas y la
-- consulta de «En plazo» tardaba más de lo que permite la base de datos.
--
-- 129: los jsonb grandes (datos de la ficha) fuera de la fila principal
--      (toast_tuple_target bajo) e índice para las listas.
-- 130: fin_orden = fin_ofertas o infinito, para que «En plazo» sea un
--      rango sobre un índice parcial (de ~3 s a ~60 ms con el recuento).

alter table public.contratacion_expedientes set (toast_tuple_target = 256);
create index if not exists contratacion_exp_lista_idx on public.contratacion_expedientes (es_menor, estado, detectado_en desc)
  where not eliminado;

alter table public.contratacion_expedientes
  add column if not exists fin_orden timestamp generated always as (coalesce(fin_ofertas, 'infinity'::timestamp)) stored;
create index if not exists contratacion_exp_en_plazo2_idx on public.contratacion_expedientes (fin_orden, detectado_en desc, id)
  where not eliminado and not es_menor and estado in ('PUB', 'competition');
