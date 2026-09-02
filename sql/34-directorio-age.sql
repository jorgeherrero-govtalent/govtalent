-- 34-directorio-age.sql
-- Vista unica que alimenta las dos pantallas del directorio:
-- el organigrama visual y la tabla con filtros.
--
-- Aditivo: dos columnas nuevas en age_units, una funcion y una vista.
-- No modifica ni borra nada existente.

-- =====================================================================
-- PASO 0 — VERIFICACION EN SOLO LECTURA
-- Las tres deben devolver 0 filas.
-- =====================================================================

-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='age_units'
--   and column_name in ('unit_email','unit_phone');

-- select routine_name from information_schema.routines
-- where routine_schema='public' and routine_name='rango_cargo';

-- select table_name from information_schema.views
-- where table_schema='public' and table_name='directorio_age';


-- =====================================================================
-- PASO 1 — CONTACTO EN LA UNIDAD
--
-- La fila de persona conserva su copia de unit_email/unit_phone, tal
-- como se decidio. Estas columnas son adicionales, no sustitutas: sirven
-- para que una unidad sin titular conocido siga siendo contactable.
-- Sin esto, la fila "D.G. de Libertad Religiosa / sin titular /
-- dglr@justicia.es" del mockup no se puede representar, porque
-- government_officials.full_name es NOT NULL.
-- =====================================================================

alter table age_units add column if not exists unit_email text;
alter table age_units add column if not exists unit_phone text;


-- =====================================================================
-- PASO 2 — RANGO DEL CARGO
--
-- Devuelve solo el rango, sin la materia: la materia ya esta en el
-- nombre de la unidad y repetirla llena la tabla de redundancia.
--
--   "Directora General de Cooperacion Juridica Internacional"
--     -> "Directora General"
--   "Subdirector General Adjunto de Publicaciones"
--     -> "Subdirector General Adjunto"
--
-- Si no reconoce el patron devuelve el cargo entero. Es deliberado:
-- en gabinetes y organos colegiados el cargo NO coincide con la unidad
-- y recortarlo perderia informacion util. Preferible redundante que
-- incompleto.
-- =====================================================================

create or replace function rango_cargo(p_cargo text)
returns text
language sql
immutable
as $$
  select coalesce(
    (
      select m[1]
      from regexp_match(
        coalesce(p_cargo, ''),
        '^(Secretari[oa] de Estado|Subsecretari[oa]|Secretari[oa] General T[eé]cnic[oa]|Secretari[oa] General|Director[a]? General Adjunt[oa]|Director[a]? General|Subdirector[a]? General Adjunt[oa]|Subdirector[a]? General|Director[a]? del Gabinete|Jefe?[a]? del? Gabinete|Director[a]? Adjunt[oa]|Director[a]? de Programa|Director[a]?|Vocal Asesor[a]?|Consejer[oa] T[eé]cnic[oa]|Abogad[oa] General del Estado|Presidente|Presidenta|Vicepresidente|Vicepresidenta|Gerente|Jefe?[a]? de Servicio|Jefe?[a]? de [AÁ]rea)\y',
        'i'
      ) as m
    ),
    nullif(trim(p_cargo), '')
  );
$$;


-- =====================================================================
-- PASO 3 — VISTA DEL DIRECTORIO
--
-- Una fila por persona-en-unidad, MAS una fila por unidad sin titular.
-- Eso lo da el left join: sin el, las unidades vacantes desaparecen y
-- son justo las que interesa mostrar.
-- =====================================================================

create or replace view directorio_age as
select
  o.dir3_code,
  o.nombre                                   as unidad,
  o.raiz_nombre                              as ministerio,
  o.banda,
  o.orden_banda,
  o.categoria,
  o.superior_code,
  o.relevante,

  g.id                                       as official_id,
  g.full_name                                as titular,
  g.slug                                     as titular_slug,
  rango_cargo(g.role)                        as cargo,
  g.role                                     as cargo_completo,

  -- El correo de la persona manda; si no lo tiene, el de la unidad.
  coalesce(g.unit_email, o.unit_email)       as email,
  coalesce(g.unit_phone, o.unit_phone)       as telefono,
  g.unit_website                             as web,

  -- Se conserva pero no se muestra como columna en la tabla; va en la
  -- ficha de la unidad y sirve de filtro.
  g.source                                   as fuente,
  g.source_updated_at                        as fuente_fecha,

  (g.id is null)                             as sin_titular,
  (coalesce(g.unit_email, o.unit_email) is not null) as tiene_email

from organigrama_age o
left join government_officials g
  on g.dir3_code = o.dir3_code
 and g.active
where o.en_organigrama;


-- =====================================================================
-- PASO 4 — COMPROBACIONES
-- =====================================================================

-- 4.1 Cobertura: cuantas filas, cuantas con titular, cuantas con correo.
-- select banda,
--        count(*)                              as filas,
--        count(*) filter (where not sin_titular) as con_titular,
--        count(*) filter (where tiene_email)     as con_email
-- from directorio_age
-- group by banda, orden_banda
-- order by orden_banda;

-- 4.2 Que devuelve rango_cargo: revisar que no recorta de mas.
-- select distinct cargo_completo, cargo
-- from directorio_age
-- where cargo_completo is not null
-- order by cargo_completo
-- limit 50;
