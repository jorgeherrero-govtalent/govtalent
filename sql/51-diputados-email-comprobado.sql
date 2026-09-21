-- =====================================================================
-- 51-diputados-email-comprobado.sql
--
-- 319 de los 350 diputados publican correo en su ficha. Los otros 31
-- no —comprobado el 21-09-2026: la ficha carga bien y no trae ninguno—.
-- Sin una marca de "ya mirado", el cron de la Fase 2 volvería a pedir
-- esas 31 fichas cada noche sin sacar nada.
--
-- `email_checked_at` guarda cuándo se miró por última vez. El sync
-- reintenta a los 30 días en vez de descartarlos para siempre: un
-- diputado puede darse de alta el correo más tarde, y una lista que se
-- congela es peor que una que se repasa de vez en cuando.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 0 — Comprobación (no modifica nada)
-- ---------------------------------------------------------------------

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'deputies'
  and column_name in ('email', 'email_checked_at');
-- Se espera ver `email`. Si `email_checked_at` ya aparece, el paso 1
-- sobra.


-- ---------------------------------------------------------------------
-- PASO 1 — Alta de la columna
-- ---------------------------------------------------------------------

alter table public.deputies
  add column if not exists email_checked_at timestamptz;

comment on column public.deputies.email_checked_at is
  'Cuándo se miró por última vez la ficha buscando el correo. Se rellena aunque no se encuentre, para no repetir la petición cada noche. El sync reintenta a los 30 días.';

-- Índice parcial: la consulta del sync solo mira las filas activas que
-- todavía no tienen correo, que son tres docenas de 350.
create index if not exists deputies_email_pendiente_idx
  on public.deputies (email_checked_at)
  where email is null;


-- ---------------------------------------------------------------------
-- PASO 2 — Quiénes son los que no publican correo
--
-- Para mirarlo a ojo después de la siguiente pasada del sync. Antes de
-- que corra saldrán con `email_checked_at` a nulo.
-- ---------------------------------------------------------------------

select full_name, constituency, cod_parlamentario, email_checked_at
from public.deputies
where active
  and email is null
order by full_name;


-- ---------------------------------------------------------------------
-- PASO 3 — Cobertura
-- ---------------------------------------------------------------------

select
  count(*) filter (where active) as activos,
  count(*) filter (where active and email is not null) as con_correo,
  count(*) filter (where active and email is null and email_checked_at is not null) as mirados_sin_correo,
  count(*) filter (where active and email is null and email_checked_at is null) as sin_mirar
from public.deputies;
