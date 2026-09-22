-- =====================================================================
-- 54-asesores-parlamentarios.sql
--
-- Personal eventual del Congreso de los Diputados: los asesores,
-- asistentes y asistentes tecnicos que los grupos parlamentarios, la
-- Mesa y las presidencias de comision tienen a su disposicion.
--
-- DE DONDE SALE. Del BOCG, Seccion Congreso, Serie D, que publica cada
-- nombramiento y cada cese. No hay dataset abierto ni buscador que se
-- pueda consultar por maquina: hay que leer los boletines uno a uno. Se
-- han recorrido los 582 de la XV Legislatura; 146 traian seccion
-- PERSONAL, con 991 movimientos sobre 464 personas. Una persona esta
-- activa cuando su ultimo movimiento publicado es un nombramiento sin
-- cese posterior: 321 a 22-09-2026.
--
-- HUECOS CONOCIDOS. El boletin 10 pesa mas de 30 MB y no se pudo
-- descargar; los numeros 153, 227, 238, 255, 287 y 388 no existen en el
-- servidor del Congreso aunque sus vecinos si. Quien fuera nombrado en
-- el 10 y nunca cesara no aparece aqui.
--
-- EL CORREO NO VIENE DEL BOCG. El Boletin publica nombre, cargo,
-- adscripcion y fecha de efectos, nunca datos de contacto. Los 270
-- correos salen de enriquecimiento comercial, asi que no tienen el
-- mismo respaldo que el `mailto:` oficial de la ficha de un diputado.
-- Por eso la columna `email_origen` lo deja escrito y por eso el BLOQUE
-- 4 cierra la columna al navegador con el mismo reparto de permisos que
-- 53-diputados-email-privado.sql.
--
-- Ejecutar los bloques POR SEPARADO, no el fichero entero.
-- =====================================================================


-- =====================================================================
-- BLOQUE 0 — COMPROBACION (no modifica nada)
-- Ejecutar entero y leer los cuatro resultados antes de seguir.
-- =====================================================================

-- 0.a Las tres tablas con las que se va a enlazar deben existir.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('parliamentary_groups', 'es_committees', 'deputies')
order by table_name;
-- Se esperan 3 filas. Si falta alguna, parar aqui.

-- 0.b El tipo de las claves primarias a las que se apuntara. El BLOQUE 1
--     crea las columnas con el tipo que salga aqui, sea cual sea, asi
--     que esto es informativo: sirve para entender el resultado.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('parliamentary_groups', 'es_committees')
  and column_name = 'id'
order by table_name;

-- 0.c Que grupos hay cargados y como se llaman exactamente. Son pocos y
--     conviene mirarlos: de que el nombre case depende el BLOQUE 3.
select id, name, short_name, slug, member_count, active
from parliamentary_groups
order by member_count desc nulls last;

-- 0.d unaccent hace falta para cruzar nombres. Si no sale, instalarlo
--     con: create extension if not exists unaccent;
select extname from pg_extension where extname in ('unaccent', 'pg_trgm');


-- =====================================================================
-- BLOQUE 1 — ESQUEMA
-- Idempotente: se puede relanzar sin romper nada.
-- =====================================================================

create table if not exists parliamentary_staff (
  id                   bigserial   primary key,
  legislature_code     text        not null default 'XV',

  -- Identidad
  full_name            text        not null,
  slug                 text        not null unique,
  -- Mismo criterio que clave_persona(): palabras del nombre ordenadas
  -- alfabeticamente, sin tildes. Comparar por un solo apellido produce
  -- falsos positivos con nombres espanoles.
  clave                text        not null,

  -- Puesto
  categoria            text        not null,
  cargo                text        not null,
  ambito               text        not null
                       check (ambito in ('grupo', 'comision', 'mesa', 'presidencia')),
  organo               text,
  proponente           text,

  -- Vigencia y procedencia
  fecha_alta           date        not null,
  fecha_baja           date,
  active               boolean     not null default true,
  boletin              integer     not null,
  boletin_url          text,
  source               text        not null default 'BOCG Serie D',
  source_updated_at    timestamptz not null default now(),

  -- Contacto. Ver BLOQUE 4: estas columnas no se sirven al navegador.
  email                text,
  email_origen         text        check (email_origen in ('enriquecimiento', 'oficial')),
  email_checked_at     timestamptz,
  linkedin_url         text,

  -- Derecho de oposicion. Las consultas filtran por objecion = false, el
  -- mismo criterio que la ruta del directorio institucional.
  objecion             boolean     not null default false,

  created_at           timestamptz not null default now()
);

-- Las dos columnas de enlace se anaden aparte, copiando el tipo exacto
-- de la clave a la que apuntan. Escribirlo a mano obliga a saber de
-- antemano si es bigint o uuid, y el DDL de esas tablas no esta en el
-- repositorio.
do $$
declare
  t_grupo text;
  t_com   text;
begin
  select data_type into t_grupo
  from information_schema.columns
  where table_schema = 'public' and table_name = 'parliamentary_groups' and column_name = 'id';

  select data_type into t_com
  from information_schema.columns
  where table_schema = 'public' and table_name = 'es_committees' and column_name = 'id';

  if t_grupo is null or t_com is null then
    raise exception 'No se han encontrado parliamentary_groups.id o es_committees.id';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'parliamentary_staff'
                   and column_name = 'parliamentary_group_id') then
    execute format('alter table parliamentary_staff add column parliamentary_group_id %s', t_grupo);
    execute 'alter table parliamentary_staff
             add constraint parliamentary_staff_group_fk
             foreign key (parliamentary_group_id)
             references parliamentary_groups(id) on delete set null';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'parliamentary_staff'
                   and column_name = 'committee_id') then
    execute format('alter table parliamentary_staff add column committee_id %s', t_com);
    execute 'alter table parliamentary_staff
             add constraint parliamentary_staff_committee_fk
             foreign key (committee_id)
             references es_committees(id) on delete set null';
  end if;
end $$;

create index if not exists parliamentary_staff_group_idx
  on parliamentary_staff (parliamentary_group_id) where active;
create index if not exists parliamentary_staff_committee_idx
  on parliamentary_staff (committee_id) where active;
create index if not exists parliamentary_staff_clave_idx
  on parliamentary_staff (clave);
create index if not exists parliamentary_staff_activos_idx
  on parliamentary_staff (active, objecion);

-- Tabla de paso. Se sube staging_asesores.csv desde el Table Editor de
-- Supabase (Import data from CSV) y se vuelca en el BLOQUE 3. Todo texto
-- a proposito: las conversiones se hacen al cargar, no al importar.
create table if not exists staging_asesores (
  nombre      text,
  slug        text,
  clave       text,
  categoria   text,
  cargo       text,
  ambito      text,
  grupo       text,
  comision    text,
  organo      text,
  fecha_alta  text,
  boletin     text,
  email       text,
  email_ok    text,
  linkedin    text
);


-- =====================================================================
-- BLOQUE 2 — VERIFICACION DEL STAGING (solo lectura)
-- Ejecutar DESPUES de subir el CSV y ANTES del BLOQUE 3.
-- =====================================================================

-- 2.1 Recuento por ambito. Se esperan 321 filas:
--     grupo 251 · comision 37 · mesa 23 · presidencia 10
select ambito, count(*) from staging_asesores group by ambito order by 2 desc;

-- 2.2 Los grupos del staging que NO casan con parliamentary_groups.
--     Debe devolver 0 filas. Si sale alguno, el nombre en la tabla de
--     grupos no coincide: mirar el resultado de 0.c y corregir la
--     columna `grupo` del staging antes de cargar.
select distinct s.grupo
from staging_asesores s
where s.ambito = 'grupo'
  and not exists (
    select 1 from parliamentary_groups g
    where lower(unaccent(g.name)) = lower(unaccent(s.grupo))
       or (g.short_name is not null and g.short_name <> ''
           and lower(unaccent(s.grupo)) like '%' || lower(unaccent(g.short_name)) || '%')
  );

-- 2.3 Las comisiones citadas en el cargo que no casan con es_committees.
--     Aqui SI se admiten filas: de los 37 de ambito comision, 22 no
--     dicen en el texto del nombramiento de que comision se trata, asi
--     que se quedaran con committee_id nulo. Nulo antes que inventado.
select distinct s.comision
from staging_asesores s
where s.ambito = 'comision' and coalesce(s.comision, '') <> ''
  and not exists (
    select 1 from es_committees c
    where lower(unaccent(c.name)) = lower(unaccent(s.comision))
  );

-- 2.4 Duplicados de slug dentro del propio fichero. Debe devolver 0.
select slug, count(*) from staging_asesores group by slug having count(*) > 1;

-- 2.5 Personas del staging que ya existen como diputado. Debe devolver
--     0 filas: un diputado no es personal eventual. Si sale alguna, es
--     un homonimo o un error de extraccion y hay que mirarlo a mano.
--     El cruce va por la clave ordenada, no por apellido: "Marti Marti,
--     Xavier" y "Xavier Marti Marti" tienen que colapsar.
with claves_diputados as (
  select
    d.slug,
    d.full_name,
    (select string_agg(p, ' ' order by p)
       from unnest(string_to_array(
              btrim(regexp_replace(lower(unaccent(d.full_name)), '[^a-z0-9]+', ' ', 'g')),
              ' ')) as p) as clave
  from deputies d
  where d.active
)
select s.nombre as en_staging, c.full_name as es_diputado, c.slug
from staging_asesores s
join claves_diputados c on c.clave = s.clave;

-- 2.6 Cobertura de correo, para contrastar con lo esperado (270 de 321).
select email_ok, count(*) from staging_asesores group by email_ok order by 2 desc;


-- =====================================================================
-- BLOQUE 3 — CARGA
-- Ejecutar entero, de una vez. Es transaccional: si algo falla no queda
-- nada a medias.
--
-- POR QUE NO ES UN DELETE + INSERT. Borrar y recargar parece lo comodo
-- hasta que alguien ha ejercido el derecho de oposicion: su fila vuelve
-- con objecion = false y reaparece en el directorio. Aqui se hace
-- upsert por slug sin tocar `objecion`, y a quien ya no esta en el
-- staging se le pone active = false en vez de borrarlo, que ademas
-- conserva el historial de quien paso por la Camara.
-- =====================================================================

begin;

insert into parliamentary_staff (
  legislature_code, full_name, slug, clave, categoria, cargo, ambito,
  parliamentary_group_id, committee_id, organo,
  fecha_alta, active, boletin, boletin_url,
  email, email_origen, email_checked_at, linkedin_url,
  source, source_updated_at
)
select
  'XV',
  btrim(s.nombre),
  btrim(s.slug),
  btrim(s.clave),
  btrim(s.categoria),
  btrim(s.cargo),
  btrim(s.ambito),

  -- Grupo: primero por nombre completo, si no por sigla corta.
  (select g.id from parliamentary_groups g
    where s.ambito = 'grupo'
      and (lower(unaccent(g.name)) = lower(unaccent(s.grupo))
        or (g.short_name is not null and g.short_name <> ''
            and lower(unaccent(s.grupo)) like '%' || lower(unaccent(g.short_name)) || '%'))
    order by length(g.name) desc
    limit 1),

  -- Comision: solo cuando el nombramiento la nombra y casa exactamente.
  (select c.id from es_committees c
    where s.ambito = 'comision' and coalesce(s.comision, '') <> ''
      and lower(unaccent(c.name)) = lower(unaccent(s.comision))
    limit 1),

  nullif(btrim(coalesce(s.organo, '')), ''),

  to_date(btrim(s.fecha_alta), 'DD-MM-YYYY'),
  true,
  btrim(s.boletin)::integer,
  'https://www.congreso.es/public_oficiales/L15/CONG/BOCG/D/BOCG-15-D-'
    || btrim(s.boletin) || '.PDF',

  nullif(btrim(coalesce(s.email, '')), ''),
  case when coalesce(btrim(s.email), '') <> '' then 'enriquecimiento' end,
  case when btrim(coalesce(s.email_ok, '')) = 'si' then now() end,
  nullif(btrim(coalesce(s.linkedin, '')), ''),

  'BOCG Serie D',
  now()
from staging_asesores s
where coalesce(btrim(s.nombre), '') <> ''

on conflict (slug) do update set
  full_name              = excluded.full_name,
  clave                  = excluded.clave,
  categoria              = excluded.categoria,
  cargo                  = excluded.cargo,
  ambito                 = excluded.ambito,
  parliamentary_group_id = excluded.parliamentary_group_id,
  committee_id           = excluded.committee_id,
  organo                 = excluded.organo,
  fecha_alta             = excluded.fecha_alta,
  fecha_baja             = null,
  active                 = true,
  boletin                = excluded.boletin,
  boletin_url            = excluded.boletin_url,
  email                  = coalesce(excluded.email, parliamentary_staff.email),
  email_origen           = coalesce(excluded.email_origen, parliamentary_staff.email_origen),
  email_checked_at       = coalesce(excluded.email_checked_at, parliamentary_staff.email_checked_at),
  linkedin_url           = coalesce(excluded.linkedin_url, parliamentary_staff.linkedin_url),
  source_updated_at      = now();
  -- `objecion` y `created_at` se quedan como estaban, a proposito.

-- Quien estaba activo y ya no viene en el staging, ha cesado.
update parliamentary_staff p
   set active     = false,
       fecha_baja = coalesce(p.fecha_baja, current_date),
       source_updated_at = now()
 where p.legislature_code = 'XV'
   and p.active
   and not exists (select 1 from staging_asesores s where btrim(s.slug) = p.slug);

commit;


-- =====================================================================
-- BLOQUE 4 — CERRAR EL CORREO AL NAVEGADOR
-- Mismo mecanismo que 53-diputados-email-privado.sql: en PostgreSQL el
-- permiso de tabla manda sobre el de columna, asi que hay que quitar el
-- SELECT entero y devolverlo columna a columna.
--
-- A PARTIR DE AQUI, select('*') SOBRE parliamentary_staff FALLA DESDE EL
-- CLIENTE. El correo se pedira a una ruta de servidor que compruebe el
-- plan, como /api/instituciones/diputados/contacto.
-- =====================================================================

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

-- OJO AL ANADIR COLUMNAS: el reparto es una foto del momento. Una
-- columna nueva nace sin permiso y no se vera desde el navegador hasta
-- que se relance este bloque.

alter table parliamentary_staff enable row level security;

drop policy if exists parliamentary_staff_select_publico on parliamentary_staff;
create policy parliamentary_staff_select_publico
  on parliamentary_staff for select
  to anon, authenticated
  using (active and not objecion);


-- =====================================================================
-- BLOQUE 5 — VERIFICACION FINAL (solo lectura)
-- =====================================================================

-- 5.1 Reparto por ambito. Se esperan 321 en total.
select ambito, count(*) from parliamentary_staff where active group by ambito order by 2 desc;

-- 5.2 Asesores por grupo, con el nombre del grupo resuelto. Se esperan
--     9 filas y ningun grupo a null:
--     Socialista 90 · Popular 82 · VOX 25 · SUMAR 22 · Republicano 10
--     Mixto 10 · Vasco 4 · Bildu 4 · Junts 4
select g.name, count(*) as asesores
from parliamentary_staff p
left join parliamentary_groups g on g.id = p.parliamentary_group_id
where p.active and p.ambito = 'grupo'
group by g.name
order by 2 desc;

-- 5.3 Sin enlazar. Los de ambito grupo deben ser 0. Los de comision
--     seran 22 —los que no nombran la comision en el nombramiento— si
--     es_committees tiene cargadas las 15 que si aparecen citadas; si
--     sale un numero mayor, faltan comisiones en esa tabla y la lista
--     de cuales la da la consulta 2.3.
select ambito, count(*) as sin_enlazar
from parliamentary_staff
where active
  and ((ambito = 'grupo' and parliamentary_group_id is null)
    or (ambito = 'comision' and committee_id is null))
group by ambito;

-- 5.4 Cobertura de correo. Se esperan 270 con correo de 321.
select count(*) filter (where email is not null) as con_email,
       count(*) as total
from parliamentary_staff where active;

-- 5.5 El navegador no debe poder leer las tres columnas de correo.
--     Cero filas es lo correcto.
select grantee, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'parliamentary_staff'
  and privilege_type = 'SELECT'
  and grantee in ('anon', 'authenticated')
  and column_name in ('email', 'email_checked_at', 'email_origen');

-- 5.6 Una vez comprobado todo, la tabla de paso sobra.
-- drop table staging_asesores;
