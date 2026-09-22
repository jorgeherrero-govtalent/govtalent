-- =====================================================================
-- 56-directorio-asesores.sql
--
-- Anade el personal eventual del Congreso al directorio institucional.
--
-- QUE CAMBIA. `directorio_pro` tenia cuatro bloques: ejecutivo espanol,
-- diputados, Comision Europea y eurodiputados. Se le anade un quinto con
-- los asesores de `parliamentary_staff`. Los cuatro primeros van COPIADOS
-- LITERALMENTE de lo que devolvio `pg_get_viewdef`, sin tocar ni un
-- caracter: esta vista la leen la ruta del directorio y su exportacion a
-- Excel, y reescribirla de memoria es la forma mas rapida de romper
-- ambas.
--
-- COMO SE HA CONSTRUIDO EL BLOQUE NUEVO. Copiando el de los diputados,
-- que es el que mas se le parece: misma institucion, mismo pais, misma
-- forma de puntuar la contactabilidad. Las diferencias son las que hay
-- de verdad entre un diputado y un asesor, y estan comentadas una a una
-- ahi abajo.
--
-- ANTES DE EJECUTAR hay que tener aplicados 54 (la tabla) y 55 (la
-- columna `tiene_email`). El BLOQUE 0 lo comprueba.
--
-- Ejecutar los bloques POR SEPARADO.
-- =====================================================================


-- =====================================================================
-- BLOQUE 0 — COMPROBACION (no modifica nada)
-- =====================================================================

-- 0.a La tabla de asesores existe y tiene filas activas. Se esperan 321.
select count(*) filter (where active) as activos,
       count(*) filter (where active and not objecion) as visibles,
       count(*) as total
from parliamentary_staff;

-- 0.b La vista es la que creemos y sigue teniendo 26 columnas.
select count(*) as columnas
from information_schema.columns
where table_schema = 'public' and table_name = 'directorio_pro';

-- 0.c Cuantas filas sirve hoy el directorio, para comparar despues.
--     Al terminar deberia haber 321 mas.
select count(*) as filas_hoy from directorio_pro;


-- =====================================================================
-- BLOQUE 1 — LA VISTA
--
-- `create or replace view` conserva los permisos y las dependencias
-- siempre que no se renombren ni se reordenen las columnas existentes.
-- Aqui solo se anade un UNION ALL al final, asi que no cambia ninguna.
-- =====================================================================

create or replace view public.directorio_pro as
SELECT 'es-ejecutivo:'::text || g.id::text AS id,
    'España'::text AS jurisdiccion,
    'ejecutivo'::text AS tipo_institucion,
    'ES'::text AS pais,
    u.raiz_nombre AS institucion,
    u.nombre AS unidad,
    u.categoria AS categoria_unidad,
    g.nombre_display AS nombre,
    g.role AS cargo,
    g.cargo_canonico,
    g.banda,
    g.orden,
    g.es_titular,
    COALESCE(g.funcion, 'Otras áreas sectoriales'::text) AS area,
    g.email,
    COALESCE(g.unit_email, u.unit_email) AS email_unidad,
    COALESCE(g.unit_phone, u.unit_phone) AS telefono,
    NULLIF(concat_ws(', '::text, s.via, NULLIF(TRIM(BOTH FROM concat_ws(' '::text, s.cp, s.localidad)), ''::text)), ''::text) AS direccion_postal,
    s.localidad,
    s.provincia,
    g.slug,
    g.origen,
    g.source AS fuente,
    g.source_updated_at AS fuente_fecha,
    COALESCE(g.objecion, false) AS objecion,
    LEAST(100,
        CASE
            WHEN g.email IS NOT NULL THEN 50
            WHEN COALESCE(g.unit_email, u.unit_email) IS NOT NULL THEN 20
            ELSE 0
        END +
        CASE
            WHEN COALESCE(g.unit_phone, u.unit_phone) IS NOT NULL THEN 20
            ELSE 0
        END +
        CASE
            WHEN g.verificado_boe THEN 20
            ELSE 0
        END +
        CASE
            WHEN g.source_updated_at > (now() - '6 mons'::interval) THEN 10
            ELSE 0
        END) AS contactabilidad
   FROM government_officials g
     JOIN age_units u ON u.dir3_code = g.dir3_code AND u.activo
     LEFT JOIN directorio_sedes s ON s.id = u.sede_id
  WHERE g.active
UNION ALL
 SELECT 'es-legislativo:'::text || d.id::text AS id,
    'España'::text AS jurisdiccion,
    'legislativo'::text AS tipo_institucion,
    'ES'::text AS pais,
    'Congreso de los Diputados'::text AS institucion,
    d.constituency AS unidad,
    'circunscripcion'::text AS categoria_unidad,
    d.full_name AS nombre,
    'Diputado'::text AS cargo,
    'Diputado'::text AS cargo_canonico,
    'electo'::text AS banda,
    0::smallint AS orden,
    true AS es_titular,
    'Electo'::text AS area,
    d.email,
    NULL::text AS email_unidad,
    NULL::text AS telefono,
    NULL::text AS direccion_postal,
    NULL::text AS localidad,
    NULL::text AS provincia,
    d.slug,
    'congreso'::text AS origen,
    d.source AS fuente,
    d.source_updated_at AS fuente_fecha,
    false AS objecion,
    LEAST(100,
        CASE
            WHEN d.email IS NOT NULL THEN 50
            ELSE 0
        END +
        CASE
            WHEN d.source_updated_at > (now() - '6 mons'::interval) THEN 10
            ELSE 0
        END) AS contactabilidad
   FROM deputies d
  WHERE d.active
UNION ALL
 SELECT 'ue-ejecutivo:'::text || p.id::text AS id,
    'UE'::text AS jurisdiccion,
    'ejecutivo'::text AS tipo_institucion,
    NULL::text AS pais,
    COALESCE(b.name_es, b.name_en, p.body_code) AS institucion,
    COALESCE(p.unit, p.directorate, p.cabinet) AS unidad,
    p.level AS categoria_unidad,
    p.full_name AS nombre,
    p.role AS cargo,
    p.role AS cargo_canonico,
        CASE
            WHEN p.level = 'dg'::text THEN 'alta_direccion'::text
            WHEN p.role ~~* '%director%'::text THEN 'direccion'::text
            WHEN p.role ~~* '%head of unit%'::text THEN 'subdireccion'::text
            ELSE 'tecnico'::text
        END AS banda,
        CASE
            WHEN p.level = 'dg'::text THEN 1
            WHEN p.role ~~* '%director%'::text THEN 2
            WHEN p.role ~~* '%head of unit%'::text THEN 3
            ELSE 5
        END::smallint AS orden,
    p.level = 'dg'::text AS es_titular,
        CASE
            WHEN p.role ~* 'communication|press|spokesperson'::text THEN 'Comunicación y prensa'::text
            WHEN p.role ~* 'legal|justice|law'::text THEN 'Jurídico y normativo'::text
            WHEN p.role ~* 'budget|financ|economic|audit'::text THEN 'Económico y presupuestario'::text
            WHEN p.role ~* 'digital|data|informatics|cyber'::text THEN 'Transformación digital'::text
            WHEN p.role ~* 'human resources|personnel'::text THEN 'Recursos humanos'::text
            WHEN p.role ~* 'international|external relations|inter-institutional'::text THEN 'Relaciones institucionales'::text
            WHEN p.role ~* 'cabinet|adviser'::text THEN 'Gabinete y asesoría'::text
            ELSE 'Otras áreas sectoriales'::text
        END AS area,
        CASE
            WHEN COALESCE(p.email_dubious, false) THEN NULL::text
            ELSE p.email
        END AS email,
    NULL::text AS email_unidad,
    p.phone AS telefono,
    NULL::text AS direccion_postal,
    NULL::text AS localidad,
    NULL::text AS provincia,
    p.slug,
    'scraping'::text AS origen,
    p.source AS fuente,
    NULL::timestamp with time zone AS fuente_fecha,
    false AS objecion,
    LEAST(100,
        CASE
            WHEN p.email IS NOT NULL AND NOT COALESCE(p.email_dubious, false) THEN 50
            ELSE 0
        END +
        CASE
            WHEN p.phone IS NOT NULL THEN 20
            ELSE 0
        END) AS contactabilidad
   FROM ec_people p
     LEFT JOIN ec_bodies b ON b.code = p.body_code
  WHERE p.active
UNION ALL
 SELECT 'ue-legislativo:'::text || m.id AS id,
    'UE'::text AS jurisdiccion,
    'legislativo'::text AS tipo_institucion,
    m.country_code AS pais,
    'Parlamento Europeo'::text AS institucion,
    m.political_group_code AS unidad,
    'grupo_politico'::text AS categoria_unidad,
    m.full_name AS nombre,
    'Eurodiputado'::text AS cargo,
    'Eurodiputado'::text AS cargo_canonico,
    'electo'::text AS banda,
    0::smallint AS orden,
    true AS es_titular,
    'Electo'::text AS area,
    m.email,
    NULL::text AS email_unidad,
    m.phone_brussels AS telefono,
    m.office_brussels AS direccion_postal,
    'Bruselas'::text AS localidad,
    NULL::text AS provincia,
    m.slug,
    'europarl'::text AS origen,
    'europarl'::text AS fuente,
    m.last_synced_at AS fuente_fecha,
    false AS objecion,
    LEAST(100,
        CASE
            WHEN m.email IS NOT NULL THEN 50
            ELSE 0
        END +
        CASE
            WHEN m.phone_brussels IS NOT NULL THEN 20
            ELSE 0
        END +
        CASE
            WHEN m.last_synced_at > (now() - '6 mons'::interval) THEN 10
            ELSE 0
        END) AS contactabilidad
   FROM eu_meps m
  WHERE m.active
UNION ALL
 SELECT 'es-legislativo-asesor:'::text || p.id::text AS id,
    'España'::text AS jurisdiccion,
    'legislativo'::text AS tipo_institucion,
    'ES'::text AS pais,
    'Congreso de los Diputados'::text AS institucion,
    -- El diputado se adscribe a su circunscripcion; el asesor, al organo
    -- que lo tiene a su disposicion: su grupo, su comision o el organo de
    -- la Camara. Los 22 nombramientos que no dicen de que comision son
    -- caen en "Presidencias de comision", que es informacion de verdad;
    -- dejarlos en "Congreso de los Diputados" los volvia invisibles entre
    -- los 321.
    COALESCE(
        gp.name,
        c.name,
        NULLIF(p.organo, ''::text),
        CASE p.ambito
            WHEN 'comision'::text THEN 'Presidencias de comisión'::text
            ELSE 'Congreso de los Diputados'::text
        END
    ) AS unidad,
    CASE p.ambito
        WHEN 'grupo'::text THEN 'grupo_parlamentario'::text
        WHEN 'comision'::text THEN 'comision'::text
        ELSE 'organo_camara'::text
    END AS categoria_unidad,
    p.full_name AS nombre,
    p.cargo,
    -- El cargo del BOCG es largo y no agrupa ("Asistente para la
    -- atencion de los miembros del Grupo Parlamentario Socialista"). La
    -- categoria si: Asesor, Asistente tecnico, Asistente.
    p.categoria AS cargo_canonico,
    -- Todos a 'tecnico' a proposito. El BOCG si tiene escalafon —el
    -- asesor cobra el doble que el asistente— pero ninguna de las bandas
    -- de direccion describe a un asesor parlamentario, y colocarlos en
    -- 'mando_intermedio' seria inventarse una jerarquia que no existe en
    -- la Camara. La distincion real viaja en `cargo_canonico`, que es la
    -- columna que sale en el Excel como "Cargo normalizado".
    'tecnico'::text AS banda,
    -- Dentro de su unidad si se ordenan por el escalafon de verdad.
    CASE
        WHEN p.categoria ~~* '%asesor%'::text THEN 3
        WHEN p.categoria ~~* '%tecnic%'::text THEN 4
        ELSE 5
    END::smallint AS orden,
    false AS es_titular,
    'Gabinete y asesoría'::text AS area,
    p.email,
    NULL::text AS email_unidad,
    NULL::text AS telefono,
    NULL::text AS direccion_postal,
    NULL::text AS localidad,
    NULL::text AS provincia,
    p.slug,
    'bocg'::text AS origen,
    p.source AS fuente,
    p.source_updated_at AS fuente_fecha,
    -- A diferencia del bloque de diputados, que lleva `false` fijo, aqui
    -- se expone la objecion real: la ruta del directorio filtra por esta
    -- columna, asi que quien la ejerza desaparece tambien del Excel.
    p.objecion,
    -- Misma formula que los diputados: 50 por tener correo y 10 si el
    -- dato es reciente. Sin telefono ni verificacion del BOE, el techo
    -- son 60 puntos, que la tabla pinta como "Media".
    LEAST(100,
        CASE
            WHEN p.email IS NOT NULL THEN 50
            ELSE 0
        END +
        CASE
            WHEN p.source_updated_at > (now() - '6 mons'::interval) THEN 10
            ELSE 0
        END) AS contactabilidad
   FROM parliamentary_staff p
     LEFT JOIN parliamentary_groups gp ON gp.id = p.parliamentary_group_id
     LEFT JOIN es_committees c ON c.id = p.committee_id
  WHERE p.active;


-- =====================================================================
-- BLOQUE 2 — VERIFICACION (solo lectura)
-- =====================================================================

-- 2.1 Los asesores ya estan. Se esperan 321.
select count(*) as asesores
from directorio_pro
where origen = 'bocg';

-- 2.2 Reparto por unidad. Los nueve grupos deben salir con su nombre
--     completo, y ninguna fila con la unidad a null.
select unidad, categoria_unidad, count(*)
from directorio_pro
where origen = 'bocg'
group by unidad, categoria_unidad
order by 3 desc
limit 20;

-- 2.3 Contactabilidad. Se esperan 270 con 60 puntos y 51 con 10.
select contactabilidad, count(*)
from directorio_pro
where origen = 'bocg'
group by contactabilidad
order by 1 desc;

-- 2.4 Los otros cuatro bloques siguen intactos: este recuento debe
--     coincidir con el de 0.c mas 321.
select origen, count(*)
from directorio_pro
group by origen
order by 2 desc;

-- 2.5 Y la vista sigue teniendo 26 columnas, en el mismo orden.
select ordinal_position, column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'directorio_pro'
order by ordinal_position;
