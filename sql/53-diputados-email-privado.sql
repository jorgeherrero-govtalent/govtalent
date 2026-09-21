-- =====================================================================
-- 53-diputados-email-privado.sql
--
-- Cierra la columna `email` de `deputies` a los roles del navegador.
--
-- EL PROBLEMA. La ficha hacía `select('*')` desde el cliente. Con los
-- 319 correos ya cargados, cualquier usuario registrado los veía en la
-- pestaña de red sin pagar, se pintaran o no en pantalla. Es la misma
-- fuga que se cerró en el directorio institucional, donde la vista dejó
-- de leerse desde el navegador.
--
-- POR QUÉ NO BASTA UN `revoke select (email)`. En PostgreSQL el permiso
-- de tabla manda sobre el de columna: mientras el rol tenga SELECT
-- sobre `deputies`, lee todas las columnas. Hay que quitar el permiso
-- de tabla y devolverlo columna a columna, menos las dos que se
-- protegen.
--
-- A PARTIR DE AQUÍ, `select('*')` SOBRE `deputies` FALLA DESDE EL
-- CLIENTE. Es lo buscado. La única página que lo hacía era la ficha, y
-- se cambia por una lista explícita de columnas en el mismo despliegue.
-- El correo pasa a pedirse a /api/instituciones/diputados/contacto, que
-- va con la clave de servicio y sí lo ve.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 0 — Comprobación (no modifica nada)
-- ---------------------------------------------------------------------

-- 0.a Quién puede leer qué hoy. Sin filas por columna = permiso de
--     tabla entero, que es la situación de partida.
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'deputies'
  and grantee in ('anon', 'authenticated')
order by grantee, column_name;

-- 0.b Las columnas que quedarán fuera del alcance del navegador.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'deputies'
  and column_name in ('email', 'email_checked_at');


-- ---------------------------------------------------------------------
-- PASO 1 — Quitar el permiso de tabla y devolverlo por columnas
--
-- Se genera la lista sola: escribirla a mano envejece mal, y una
-- columna olvidada desaparece de la ficha sin avisar.
-- ---------------------------------------------------------------------

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'deputies'
    and column_name not in ('email', 'email_checked_at');

  if cols is null then
    raise exception 'No se han encontrado columnas en public.deputies';
  end if;

  execute 'revoke select on public.deputies from anon, authenticated';
  execute format('grant select (%s) on public.deputies to anon, authenticated', cols);
end $$;

-- OJO AL AÑADIR COLUMNAS. Este reparto es una foto del momento: una
-- columna nueva nace sin permiso y no se verá desde el navegador hasta
-- que se vuelva a ejecutar este bloque. Es repetible: lánzalo otra vez
-- después de cada `alter table ... add column`.


-- ---------------------------------------------------------------------
-- PASO 2 — Comprobación final
-- ---------------------------------------------------------------------

-- Deben salir todas las columnas MENOS email y email_checked_at.
select grantee, count(*) as columnas_legibles
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'deputies'
  and privilege_type = 'SELECT'
  and grantee in ('anon', 'authenticated')
group by grantee;

select grantee, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'deputies'
  and privilege_type = 'SELECT'
  and grantee in ('anon', 'authenticated')
  and column_name in ('email', 'email_checked_at');
-- Cero filas es lo correcto.
