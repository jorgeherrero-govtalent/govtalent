-- =====================================================================
-- 55-asesores-tiene-email.sql
--
-- Un booleano derivado que dice SI un asesor tiene correo, sin decir
-- cual.
--
-- EL PROBLEMA. 54 cerro `email` a los roles del navegador, y eso esta
-- bien: el correo solo debe salir por una ruta de servidor que compruebe
-- el plan. Pero la pestana Equipo necesita saber a quien puede ofrecerle
-- el correo para pintar la pildora de Pro, y a quien no para decir "sin
-- correo". Si para averiguarlo tuviera que pedir `email`, estariamos
-- otra vez donde empezamos.
--
-- LA SOLUCION es la misma que ya usa `directorio_age` con su columna
-- `tiene_email`: una columna derivada que solo expone la existencia del
-- dato, nunca el dato. Aqui va generada por la propia base, asi que no
-- puede desincronizarse del correo real.
--
-- Ejecutar los bloques POR SEPARADO.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOQUE 0 — Comprobacion (no modifica nada)
-- ---------------------------------------------------------------------

-- 0.a La tabla existe y tiene la columna de correo.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'parliamentary_staff'
  and column_name in ('email', 'tiene_email')
order by column_name;
-- Se espera 1 fila (`email`). Si ya salen 2, este fichero ya se aplico.

-- 0.b Cuantos deberian salir con correo. Con los datos de 22-09-2026,
--     270 de 321.
select count(*) filter (where email is not null) as con_correo,
       count(*) as total
from parliamentary_staff
where active;


-- ---------------------------------------------------------------------
-- BLOQUE 1 — La columna
-- ---------------------------------------------------------------------

alter table parliamentary_staff
  add column if not exists tiene_email boolean
  generated always as (email is not null) stored;


-- ---------------------------------------------------------------------
-- BLOQUE 2 — Rehacer el reparto de permisos
--
-- OBLIGATORIO despues de anadir la columna. El reparto que hizo 54 es
-- una foto del momento: `tiene_email` nace sin permiso y el navegador no
-- la veria. Este bloque es el mismo de 54, palabra por palabra, y se
-- relanza tal cual cada vez que se anada una columna a esta tabla.
-- ---------------------------------------------------------------------

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'parliamentary_staff'
    and column_name not in ('email', 'email_checked_at', 'email_origen');

  if cols is null then
    raise exception 'No se han encontrado columnas en public.parliamentary_staff';
  end if;

  execute 'revoke select on public.parliamentary_staff from anon, authenticated';
  execute format('grant select (%s) on public.parliamentary_staff to anon, authenticated', cols);
end $$;


-- ---------------------------------------------------------------------
-- BLOQUE 3 — Verificacion final (solo lectura)
-- ---------------------------------------------------------------------

-- 3.1 El booleano cuadra con el correo real. Se esperan 270 y 51.
select tiene_email, count(*)
from parliamentary_staff
where active
group by tiene_email
order by 1 desc;

-- 3.2 El navegador SI puede leer `tiene_email`. Se esperan 2 filas,
--     una por rol.
select grantee, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'parliamentary_staff'
  and privilege_type = 'SELECT'
  and grantee in ('anon', 'authenticated')
  and column_name = 'tiene_email';

-- 3.3 Y NO puede leer el correo ni sus metadatos. Cero filas.
select grantee, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'parliamentary_staff'
  and privilege_type = 'SELECT'
  and grantee in ('anon', 'authenticated')
  and column_name in ('email', 'email_checked_at', 'email_origen');
