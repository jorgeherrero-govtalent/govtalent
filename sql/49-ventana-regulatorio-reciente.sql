-- =====================================================================
-- 49 — LA VENTANA DE regulatorio_reciente
--
-- La vista se anuncia como "los últimos siete días" y en realidad son
-- seis:
--
--   fecha > (CURRENT_DATE - '7 days'::interval)
--
-- El lado derecho es un TIMESTAMP (2026-09-11 00:00:00). `fecha` es un
-- date, así que se compara a medianoche y `> 11-sep 00:00` equivale a
-- `>= 12-sep`. El séptimo día queda fuera entero.
--
-- No es teórico: el día que se detectó, el Congreso tenía su última
-- carga fechada justo en ese día frontera, y sus 18 asuntos recientes
-- no llegaban a ningún aviso.
--
-- Se compara date con date para que no vuelva a pasar.
--
-- OJO: esto NO cambia el filtro `activo`, que es el que más corta (de
-- 4.116 expedientes solo 5 lo cumplen). Si eso hay que revisarlo, es
-- otra conversación y otra vista.
-- =====================================================================


-- =====================================================================
-- PASO 0 — COMPROBACIÓN (solo lectura)
-- =====================================================================

-- 0.1 La definición actual, para poder volver atrás si hiciera falta
select pg_get_viewdef('regulatorio_reciente'::regclass, true);

-- 0.2 Qué hay hoy, por tipo
select kind, count(*) as filas, min(fecha) as desde, max(fecha) as hasta
from regulatorio_reciente
group by kind
order by filas desc;

-- 0.3 Qué entraría de más con el arreglo: exactamente el día frontera
select kind, count(*) as se_recuperan
from regulatorio_search
where activo and fecha = current_date - 7
group by kind
order by se_recuperan desc;

-- 0.4 Nada depende de esta vista aparte del cron de avisos, pero se
--     comprueba antes de reemplazarla
select dependent_ns.nspname as esquema, dependent_view.relname as objeto
from pg_depend
join pg_rewrite      on pg_depend.objid       = pg_rewrite.oid
join pg_class as dependent_view on pg_rewrite.ev_class = dependent_view.oid
join pg_class as source_table   on pg_depend.refobjid  = source_table.oid
join pg_namespace dependent_ns  on dependent_view.relnamespace = dependent_ns.oid
where source_table.relname = 'regulatorio_reciente'
  and dependent_view.relname <> 'regulatorio_reciente';


-- =====================================================================
-- PASO 1 — LA VISTA
--
-- Mismas columnas y mismo orden que la original: create or replace
-- exige que no cambien, y así ningún consumidor se entera.
-- =====================================================================

create or replace view regulatorio_reciente as
select
  kind,
  ref_id,
  titulo,
  contexto,
  fuente,
  ruta,
  plazo,
  fecha,
  activo
from regulatorio_search s
where activo
  and fecha >= current_date - 7;


-- =====================================================================
-- PASO 2 — COMPROBACIÓN FINAL
-- =====================================================================

select pg_get_viewdef('regulatorio_reciente'::regclass, true);

select kind, count(*) as filas, min(fecha) as desde, max(fecha) as hasta
from regulatorio_reciente
group by kind
order by filas desc;

-- `desde` tiene que ser current_date - 7, no current_date - 6.
