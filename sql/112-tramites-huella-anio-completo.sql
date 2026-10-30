-- =====================================================================
-- 112 · Huella de ccaa_tramites: solo números de registro con el año entero
--
-- En la relectura de la LIDER (30-10-2026) la IA copió también el registro
-- de la propia ley («PL 10/26 RGEP 14286/26») en las comparecencias, y la
-- huella cambiaba: dos comparecencias salieron duplicadas. Los números de
-- los actos llevan el año con cuatro cifras (RGEP.20078/2026); el de la
-- ley, con dos o sin año. Desde aquí solo cuentan los de cuatro cifras
-- (igual en lib/ccaa/huella.js).
--
-- Además se borran los 3 trámites antiguos que la relectura sustituye con
-- más detalle (comprobado antes que nada los referencia):
--   c9d97250… comparecencia C-1139/2026 (sin la entidad)
--   4a4a9371… comparecencia C-1179/2026
--   0ebaa7e0… rechazo en el Pleno de las dos enmiendas a la totalidad en una
--             sola fila (ahora una por grupo)
-- =====================================================================

delete from public.ccaa_tramites where id in ('c9d97250-144c-4513-b821-8b45adb67424','4a4a9371-ee84-4763-bb69-21c6dd62b9ce','0ebaa7e0-b64d-4241-b69c-0b2f18eee3c9');

update public.ccaa_tramites t
set huella = coalesce((
  select string_agg(x, '|' order by x collate "C")
  from (
    select distinct upper(regexp_replace(m[1], '[\s.]', '', 'g')) x
    from regexp_matches(t.descripcion, '(RGEP\.?\s*\d+/\d{4}|reg\.\s*\d+|C-\d+/\d{4})', 'gi') m
  ) q
), '')
where t.descripcion is not null;
