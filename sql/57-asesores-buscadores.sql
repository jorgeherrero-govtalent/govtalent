-- =====================================================================
-- 57-asesores-buscadores.sql
--
-- Pone a los asesores en los dos buscadores que faltan: el global (la
-- lupa de arriba) y el selector de actores del mapa de un proyecto.
--
-- SON DOS VISTAS DISTINTAS, A PROPOSITO. La plataforma tiene tres
-- buscadores con tres fuentes: `search_index` para el global,
-- `actor_search` para los actores de proyecto y `regulatorio_search`
-- para los asuntos. Aqui se tocan las dos primeras. Cada una tiene su
-- vocabulario —el global dice `alto-cargo` y `grupo-parlamentario`, el
-- mapa dice `cargo` y `grupo`— y se respeta el de cada cual: los
-- asesores entran como `asesor-parlamentario` en el global y como
-- `asesor` en el mapa. Unificar ambos vocabularios seria mas limpio,
-- pero toca codigo que hoy funciona.
--
-- `buscar_global()` NO SE TOCA. Es una funcion que lee de
-- `search_index`, asi que con anadir el bloque a la vista ya reparte,
-- puntua y ordena a los asesores como a todo lo demas.
--
-- LOS CUATRO BLOQUES... perdon, LOS CATORCE Y LOS DOCE bloques que ya
-- tenian estas vistas van COPIADOS LITERALMENTE de `pg_get_viewdef`.
-- Las lee el buscador de toda la plataforma: reescribirlas de memoria
-- es la forma mas rapida de dejar a alguien sin encontrar nada.
--
-- Requiere 54, 55 y 56 aplicados.
--
-- Ejecutar los bloques POR SEPARADO.
-- =====================================================================


-- =====================================================================
-- BLOQUE 0 — COMPROBACION (no modifica nada)
-- =====================================================================

-- 0.a Cuantas filas sirve hoy cada buscador, para comparar al final.
--     Al terminar, search_index debe tener 321 mas y actor_search
--     tambien.
select 'search_index' as vista, count(*) as filas_hoy from search_index
union all
select 'actor_search', count(*) from actor_search;

-- 0.b Los asesores estan cargados y visibles. Se esperan 321.
select count(*) from parliamentary_staff where active and not objecion;

-- 0.c El buscador global funciona ahora mismo. Debe devolver diputados.
select kind, titulo, ruta from buscar_global('sanchez', 5);


-- =====================================================================
-- BLOQUE 1 — search_index (el buscador global)
--
-- Columnas de la vista, en este orden: kind, ref_id, titulo, contexto,
-- grupo, grupo_orden, ruta, fecha, activo, siglas, imagen.
-- =====================================================================

create or replace view public.search_index as
SELECT r.kind,
    r.ref_id,
    r.titulo,
    r.contexto,
    'Normativa'::text AS grupo,
    10 AS grupo_orden,
    r.ruta,
    r.fecha,
    COALESCE(r.activo, true) AS activo,
    NULL::text AS siglas,
    NULL::text AS imagen
   FROM regulatorio_search r
UNION ALL
 SELECT 'diputado'::text AS kind,
    d.slug AS ref_id,
    nombre_al_derecho(d.full_name) AS titulo,
    NULLIF(d.constituency, ''::text) AS contexto,
    'Personas'::text AS grupo,
    20 AS grupo_orden,
    '/institutions/deputies/'::text || d.slug AS ruta,
    NULL::date AS fecha,
    true AS activo,
    NULL::text AS siglas,
    d.photo_url AS imagen
   FROM deputies d
  WHERE d.active IS TRUE AND d.slug IS NOT NULL
UNION ALL
 SELECT 'miembro-gobierno'::text AS kind,
    g.slug AS ref_id,
    nombre_al_derecho(g.full_name) AS titulo,
    NULLIF(concat_ws(' · '::text, g.role, g.ministry_name), ''::text) AS contexto,
    'Personas'::text AS grupo,
    20 AS grupo_orden,
    '/institutions/ministries/'::text || g.slug AS ruta,
    NULL::date AS fecha,
    true AS activo,
    NULL::text AS siglas,
    g.photo_url AS imagen
   FROM government_members g
  WHERE g.active IS TRUE AND g.slug IS NOT NULL
UNION ALL
 SELECT 'alto-cargo'::text AS kind,
    o.slug AS ref_id,
    nombre_al_derecho(o.full_name) AS titulo,
    NULLIF(concat_ws(' · '::text, o.role, o.ministry_name), ''::text) AS contexto,
    'Personas'::text AS grupo,
    20 AS grupo_orden,
    '/institutions/ministries/persona/'::text || o.slug AS ruta,
    NULL::date AS fecha,
    true AS activo,
    NULL::text AS siglas,
    NULL::text AS imagen
   FROM government_officials o
  WHERE o.active IS TRUE AND o.slug IS NOT NULL
UNION ALL
 SELECT 'eurodiputado'::text AS kind,
    m.slug AS ref_id,
    nombre_al_derecho(m.full_name) AS titulo,
    NULLIF(concat_ws(' · '::text, m.national_party, m.political_group_code, m.country_code), ''::text) AS contexto,
    'Personas'::text AS grupo,
    20 AS grupo_orden,
    '/institutions/eu-parliament/'::text || m.slug AS ruta,
    NULL::date AS fecha,
    true AS activo,
    NULL::text AS siglas,
    m.photo_url AS imagen
   FROM eu_meps_directory m
  WHERE m.slug IS NOT NULL
UNION ALL
 SELECT 'comisario'::text AS kind,
    c.slug AS ref_id,
    nombre_al_derecho(c.full_name) AS titulo,
    NULLIF(concat_ws(' · '::text, c.portfolio_es, c.country_name), ''::text) AS contexto,
    'Personas'::text AS grupo,
    20 AS grupo_orden,
    '/institutions/eu-commission/comisarios/'::text || c.slug AS ruta,
    NULL::date AS fecha,
    true AS activo,
    NULL::text AS siglas,
    c.photo_url AS imagen
   FROM ec_commissioners c
  WHERE c.active IS TRUE AND c.slug IS NOT NULL
UNION ALL
 SELECT 'persona-comision-ue'::text AS kind,
    p.id::text AS ref_id,
    nombre_al_derecho(p.full_name) AS titulo,
    NULLIF(concat_ws(' · '::text, p.role, p.body_name), ''::text) AS contexto,
    'Personas'::text AS grupo,
    20 AS grupo_orden,
    '/institutions/eu-commission/'::text || p.body_code AS ruta,
    NULL::date AS fecha,
    true AS activo,
    NULL::text AS siglas,
    NULL::text AS imagen
   FROM ec_people_directory p
  WHERE p.body_code IS NOT NULL
UNION ALL
 SELECT 'organismo'::text AS kind,
    u.dir3_code AS ref_id,
    u.nombre AS titulo,
    NULLIF(concat_ws(' · '::text, u.categoria, u.raiz_nombre), ''::text) AS contexto,
    'Organismos'::text AS grupo,
    30 AS grupo_orden,
    '/institutions/organismos/'::text || u.dir3_code AS ruta,
    NULL::date AS fecha,
    true AS activo,
    siglas(u.nombre) AS siglas,
    NULL::text AS imagen
   FROM age_units u
  WHERE u.dir3_code IS NOT NULL
UNION ALL
 SELECT 'direccion-general-ue'::text AS kind,
    b.code AS ref_id,
    b.name AS titulo,
    'Comisión Europea'::text AS contexto,
    'Organismos'::text AS grupo,
    30 AS grupo_orden,
    '/institutions/eu-commission/'::text || b.code AS ruta,
    NULL::date AS fecha,
    true AS activo,
    b.code AS siglas,
    NULL::text AS imagen
   FROM ec_bodies_directory b
  WHERE b.code IS NOT NULL
UNION ALL
 SELECT 'comision'::text AS kind,
    k.slug AS ref_id,
    k.name AS titulo,
    'Congreso de los Diputados'::text AS contexto,
    'Comisiones y grupos'::text AS grupo,
    40 AS grupo_orden,
    '/institutions/comisiones/'::text || k.slug AS ruta,
    NULL::date AS fecha,
    true AS activo,
    siglas(k.name) AS siglas,
    NULL::text AS imagen
   FROM es_committees_directory k
  WHERE k.slug IS NOT NULL
UNION ALL
 SELECT 'comision-ue'::text AS kind,
    e.code AS ref_id,
    e.name AS titulo,
    NULLIF(e.short_name_es, ''::text) AS contexto,
    'Comisiones y grupos'::text AS grupo,
    40 AS grupo_orden,
    '/institutions/eu-parliament/comisiones/'::text || e.code AS ruta,
    NULL::date AS fecha,
    true AS activo,
    e.code AS siglas,
    NULL::text AS imagen
   FROM eu_committees_directory e
  WHERE e.code IS NOT NULL
UNION ALL
 SELECT 'grupo-parlamentario'::text AS kind,
    gp.slug AS ref_id,
    gp.name AS titulo,
    NULLIF(concat_ws(' · '::text, gp.short_name, gp.n_diputados || ' diputados'::text), ''::text) AS contexto,
    'Comisiones y grupos'::text AS grupo,
    40 AS grupo_orden,
    '/institutions/groups/'::text || gp.slug AS ruta,
    NULL::date AS fecha,
    true AS activo,
    gp.short_name AS siglas,
    NULL::text AS imagen
   FROM group_profile gp
  WHERE gp.slug IS NOT NULL
UNION ALL
 SELECT 'organizacion'::text AS kind,
    org.slug AS ref_id,
    org.name AS titulo,
    NULLIF(concat_ws(' · '::text, org.org_type, org.sector, org.location), ''::text) AS contexto,
    'Organizaciones'::text AS grupo,
    50 AS grupo_orden,
    '/organizations/'::text || org.slug AS ruta,
    NULL::date AS fecha,
    true AS activo,
    siglas(org.name) AS siglas,
    org.logo_url AS imagen
   FROM organizations org
  WHERE org.slug IS NOT NULL
UNION ALL
 SELECT 'oferta'::text AS kind,
    j.id::text AS ref_id,
    j.title AS titulo,
    NULLIF(concat_ws(' · '::text, j.area, j.location), ''::text) AS contexto,
    'Ofertas'::text AS grupo,
    60 AS grupo_orden,
    '/empleo/'::text || j.id AS ruta,
    NULL::date AS fecha,
    true AS activo,
    NULL::text AS siglas,
    NULL::text AS imagen
   FROM jobs j
  WHERE j.status = 'activa'::job_status
UNION ALL
 SELECT 'asesor-parlamentario'::text AS kind,
    ps.slug AS ref_id,
    -- Aqui NO se usa nombre_al_derecho(): los nombres del BOCG ya vienen
    -- en orden natural ("Sara López Núñez"), no como los de `deputies`,
    -- que van "APELLIDO, Nombre".
    ps.full_name AS titulo,
    NULLIF(concat_ws(' · '::text, ps.categoria, COALESCE(gp.name, c.name, NULLIF(ps.organo, ''::text))), ''::text) AS contexto,
    'Personas'::text AS grupo,
    20 AS grupo_orden,
    -- Un asesor no tiene ficha propia, asi que el enlace lleva a donde
    -- de verdad esta: la pestana Equipo de su grupo, la ficha de su
    -- comision, o los organos de gobierno de la Camara.
    CASE
        WHEN gp.slug IS NOT NULL THEN '/institutions/groups/'::text || gp.slug || '?tab=equipo'::text
        WHEN c.slug IS NOT NULL THEN '/institutions/comisiones/'::text || c.slug
        -- Los 22 nombramientos que no dicen de que comision son van al
        -- listado de comisiones, no a organos de gobierno: alli no estan.
        WHEN ps.ambito = 'comision'::text THEN '/institutions/comisiones'::text
        ELSE '/institutions/organos-gobierno'::text
    END AS ruta,
    NULL::date AS fecha,
    true AS activo,
    NULL::text AS siglas,
    NULL::text AS imagen
   FROM parliamentary_staff ps
     LEFT JOIN parliamentary_groups gp ON gp.id = ps.parliamentary_group_id
     LEFT JOIN es_committees c ON c.id = ps.committee_id
  WHERE ps.active AND NOT ps.objecion AND ps.slug IS NOT NULL;


-- =====================================================================
-- BLOQUE 2 — actor_search (el selector de actores del mapa)
--
-- Columnas de la vista, en este orden: kind, ref_id, nombre, detalle,
-- imagen, familia, orden_tipo.
-- =====================================================================

create or replace view public.actor_search as
SELECT 'diputado'::text AS kind,
    d.slug AS ref_id,
    d.full_name AS nombre,
    NULLIF(concat_ws(' · '::text, 'Diputado', d.constituency), ''::text) AS detalle,
    d.photo_url AS imagen,
    'persona'::text AS familia,
    1 AS orden_tipo
   FROM deputies d
  WHERE d.slug IS NOT NULL AND d.full_name IS NOT NULL AND COALESCE(d.active, true)
UNION ALL
 SELECT 'eurodiputado'::text AS kind,
    m.slug AS ref_id,
    m.full_name AS nombre,
    NULLIF(concat_ws(' · '::text, m.political_group_code, m.national_party), ''::text) AS detalle,
    m.photo_url AS imagen,
    'persona'::text AS familia,
    2 AS orden_tipo
   FROM eu_meps_directory m
  WHERE m.slug IS NOT NULL AND m.full_name IS NOT NULL
UNION ALL
 SELECT 'comisario'::text AS kind,
    c.slug AS ref_id,
    c.full_name AS nombre,
    c.portfolio_es AS detalle,
    c.photo_url AS imagen,
    'persona'::text AS familia,
    3 AS orden_tipo
   FROM ec_commissioners c
  WHERE c.slug IS NOT NULL AND c.full_name IS NOT NULL AND COALESCE(c.active, true)
UNION ALL
 SELECT 'cargo'::text AS kind,
    p.slug AS ref_id,
    p.full_name AS nombre,
    NULLIF(concat_ws(' · '::text, p.role, p.body_name), ''::text) AS detalle,
    NULL::text AS imagen,
    'persona'::text AS familia,
    4 AS orden_tipo
   FROM ec_people_directory p
  WHERE p.slug IS NOT NULL AND p.full_name IS NOT NULL
UNION ALL
 SELECT 'cargo'::text AS kind,
    g.slug AS ref_id,
    g.full_name AS nombre,
    NULLIF(concat_ws(' · '::text, g.role, g.ministry_name), ''::text) AS detalle,
    g.photo_url AS imagen,
    'persona'::text AS familia,
    4 AS orden_tipo
   FROM government_members g
  WHERE g.slug IS NOT NULL AND g.full_name IS NOT NULL AND g.full_name <> 'Gobierno'::text
UNION ALL
 SELECT 'cargo'::text AS kind,
    o.slug AS ref_id,
    o.full_name AS nombre,
    NULLIF(concat_ws(' · '::text, o.role, COALESCE(u.nombre, o.unit_name, o.ministry_name)), ''::text) AS detalle,
    NULL::text AS imagen,
    'persona'::text AS familia,
    4 AS orden_tipo
   FROM government_officials o
     LEFT JOIN age_units u ON u.dir3_code = o.dir3_code
  WHERE o.slug IS NOT NULL AND o.full_name IS NOT NULL AND o.active AND COALESCE(u.nivel::integer, 9) > 1
UNION ALL
 SELECT 'comision'::text AS kind,
    k.slug AS ref_id,
    k.name AS nombre,
    NULLIF(concat_ws(' · '::text, 'Congreso', k.tipo_label), ''::text) AS detalle,
    NULL::text AS imagen,
    'institucion'::text AS familia,
    5 AS orden_tipo
   FROM es_committees_directory k
  WHERE k.slug IS NOT NULL AND k.name IS NOT NULL
UNION ALL
 SELECT 'comision-eu'::text AS kind,
    e.code AS ref_id,
    COALESCE(e.short_name_es, e.name) AS nombre,
    'Parlamento Europeo'::text AS detalle,
    NULL::text AS imagen,
    'institucion'::text AS familia,
    6 AS orden_tipo
   FROM eu_committees_directory e
  WHERE e.code IS NOT NULL AND COALESCE(e.short_name_es, e.name) IS NOT NULL
UNION ALL
 SELECT 'grupo'::text AS kind,
    gp.slug AS ref_id,
    gp.name AS nombre,
    'Grupo parlamentario · Congreso'::text AS detalle,
    NULL::text AS imagen,
    'institucion'::text AS familia,
    7 AS orden_tipo
   FROM group_profile gp
  WHERE gp.slug IS NOT NULL AND gp.name IS NOT NULL
UNION ALL
 SELECT 'direccion'::text AS kind,
    dg.code AS ref_id,
    COALESCE(dg.name_es, dg.name_en) AS nombre,
    NULLIF(concat_ws(' · '::text, 'Comisión Europea', dg.cartera), ''::text) AS detalle,
    NULL::text AS imagen,
    'institucion'::text AS familia,
    8 AS orden_tipo
   FROM ec_dg_profile dg
  WHERE dg.code IS NOT NULL AND COALESCE(dg.name_es, dg.name_en) IS NOT NULL
UNION ALL
 SELECT 'unidad-age'::text AS kind,
    au.dir3_code AS ref_id,
    au.nombre,
    NULLIF(
        CASE
            WHEN au.nivel = 1 THEN 'Administración General del Estado'::text
            WHEN sup.nombre IS NOT NULL AND sup.nombre <> au.raiz_nombre THEN concat_ws(' · '::text, sup.nombre, au.raiz_nombre)
            ELSE au.raiz_nombre
        END, ''::text) AS detalle,
    NULL::text AS imagen,
    'institucion'::text AS familia,
    10 AS orden_tipo
   FROM age_units au
     LEFT JOIN age_units sup ON sup.dir3_code = au.superior_code
  WHERE au.activo AND (au.categoria = ANY (ARRAY['ministerio'::text, 'secretaria_estado'::text, 'secretaria_general'::text, 'subsecretaria'::text, 'direccion_general'::text, 'gabinete'::text, 'organismo_autonomo'::text, 'agencia_estatal'::text, 'entidad_derecho_publico'::text, 'entidad_gestora'::text])) AND au.nombre !~* '^(jefatura local|jefatura provincial|delegaci[oó]n provincial|direcci[oó]n provincial|oficinas delegadas)'::text AND au.nombre !~* '^(archivo|referencia|proceso t[eé]cnico|dif ge|residencia|oficina de prensa|asesor[ií]a jur[ií]dica|asuntos jur[ií]dicos)$'::text
UNION ALL
 SELECT 'organizacion'::text AS kind,
    o.slug AS ref_id,
    o.name AS nombre,
    NULLIF(o.sector::text, ''::text) AS detalle,
    o.logo_url AS imagen,
    'organizacion'::text AS familia,
    9 AS orden_tipo
   FROM organizations o
  WHERE o.slug IS NOT NULL AND o.name IS NOT NULL
UNION ALL
 SELECT 'asesor'::text AS kind,
    ps.slug AS ref_id,
    ps.full_name AS nombre,
    NULLIF(concat_ws(' · '::text, ps.categoria, COALESCE(gp.name, c.name, NULLIF(ps.organo, ''::text))), ''::text) AS detalle,
    NULL::text AS imagen,
    'persona'::text AS familia,
    -- Mismo escalon que `cargo`. El selector ordena por `orden_tipo` y
    -- corta a 14, asi que el numero decide quien llega al listado cuando
    -- hay muchas coincidencias. Va con los altos cargos porque es lo que
    -- son: personal de la Administracion y de la Camara, no electos. No
    -- se les da un escalon propio para no desplazar los nueve que ya
    -- existen.
    4 AS orden_tipo
   FROM parliamentary_staff ps
     LEFT JOIN parliamentary_groups gp ON gp.id = ps.parliamentary_group_id
     LEFT JOIN es_committees c ON c.id = ps.committee_id
  WHERE ps.active AND NOT ps.objecion AND ps.slug IS NOT NULL;


-- =====================================================================
-- BLOQUE 3 — VERIFICACION (solo lectura)
-- =====================================================================

-- 3.1 Los asesores estan en las dos vistas. Se esperan 321 en cada una.
select 'search_index' as vista, count(*) as asesores
from search_index where kind = 'asesor-parlamentario'
union all
select 'actor_search', count(*)
from actor_search where kind = 'asesor';

-- 3.2 El resto de bloques sigue intacto. Compara con lo que dio 0.a.
select 'search_index' as vista, count(*) as filas_ahora from search_index
union all
select 'actor_search', count(*) from actor_search;

-- 3.3 Las rutas se reparten como deben: la mayoria a la pestana Equipo
--     de su grupo, el resto a comisiones y a organos de gobierno.
select split_part(ruta, '?', 1) as ruta_base, count(*)
from search_index
where kind = 'asesor-parlamentario'
group by 1
order by 2 desc
limit 10;

-- 3.4 Y el buscador los encuentra de verdad. Cambia el apellido por uno
--     de los tuyos si este no da resultados.
select kind, titulo, contexto, ruta
from buscar_global('gusano', 10);

-- 3.5 Ninguna fila sin contexto ni sin ruta.
select count(*) filter (where contexto is null) as sin_contexto,
       count(*) filter (where ruta is null) as sin_ruta
from search_index
where kind = 'asesor-parlamentario';
