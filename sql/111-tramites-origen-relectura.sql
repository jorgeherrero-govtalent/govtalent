-- =====================================================================
-- 111 · ccaa_tramites.origen admite 'boletin_relectura'
--
-- La relectura sin avisos (sql/110, ?relectura=1) guarda lo recuperado con
-- origen 'boletin_relectura', que el CHECK de la columna no admitía: el
-- guardado fallaba entero y en silencio (30-10-2026, relectura de la LIDER).
-- =====================================================================

alter table public.ccaa_tramites drop constraint if exists ccaa_tramites_origen_check;
alter table public.ccaa_tramites add constraint ccaa_tramites_origen_check
  check (origen = any (array['ficha', 'rss', 'listado', 'boletin_ia', 'boletin_relectura']));
