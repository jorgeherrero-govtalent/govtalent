-- =====================================================================
-- 110 · ccaa_tramites: dos grupos con enmiendas el mismo día ya caben
--
-- La clave única era (expediente_id, tipo, fecha, plazo_hasta): si dos
-- grupos presentaban enmiendas el mismo día, la segunda se descartaba sin
-- aviso. En la LIDER (madrid:PL-10/2026) solo había las del PSOE al
-- articulado y faltaba la admisión de la enmienda a la totalidad del PSOE.
--
-- huella = los números de registro que cita el acto (RGEP.20078/2026,
-- reg. 113817, C-1179/2026), normalizados y ordenados; vacía si no cita
-- ninguno (entonces todo sigue como antes). La misma regla que
-- lib/ccaa/huella.js: si cambia una, hay que cambiar la otra.
--
-- Se aplica en dos pasos para no romper el código desplegado:
--   1. columna, relleno y el índice nuevo (los dos índices conviven);
--   2. tras desplegar el código que usa la huella, se borra el índice viejo.
-- =====================================================================

-- Paso 1
alter table public.ccaa_tramites add column if not exists huella text not null default '';

update public.ccaa_tramites t
set huella = coalesce((
  select string_agg(x, '|' order by x collate "C")
  from (
    select distinct upper(regexp_replace(m[1], '[\s.]', '', 'g')) x
    from regexp_matches(t.descripcion, '(RGEP\.?\s*\d+/\d{2,4}|reg\.\s*\d+|C-\d+/\d{4})', 'gi') m
  ) q
), '')
where t.descripcion is not null;

create unique index if not exists ccaa_tramites_unico_huella
  on public.ccaa_tramites (expediente_id, tipo, fecha, plazo_hasta, huella) nulls not distinct;

-- Paso 2 (después del despliegue)
-- drop index if exists public.ccaa_tramites_unico;
