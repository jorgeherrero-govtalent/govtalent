-- 70-directorio-pro-agenda.sql
-- Base de datos (fase 2, 05-10-2026): suma a la vista directorio_pro las
-- personas de la Agenda de la Comunicación 2026-2027 (sql/69): medios,
-- partidos, sindicatos, patronales, ONG, organismos internacionales,
-- comunidades autónomas, altas instituciones, administración local,
-- delegaciones del Gobierno, gabinetes de prensa de ministerios y
-- organismos, y sector público empresarial.
--
-- Cómo: una rama más en el UNION ALL de la vista, con las mismas columnas.
-- La vista se reescribe a partir de su propia definición actual
-- (pg_get_viewdef), así no hay que copiar a mano las cinco ramas que ya
-- tiene y no se pierde ningún cambio hecho fuera del repositorio. Si la
-- rama ya está, el bloque no hace nada: se puede ejecutar dos veces.
--
-- Correos: el nominativo va en `email` y el genérico de su organización o
-- unidad en `email_unidad`, como en el resto de la vista. Así la
-- contactabilidad no cuenta un prensa@ como si fuera un correo personal.
--
-- Las personas que ya están como cargos de la Administración (un
-- secretario de Estado que también sale en la Agenda) se agrupan en la
-- página por persona, como ya pasa con quien tiene dos cargos.

------------------------------------------------------------------------
-- PASO 0 · Comprobación previa (solo lectura)
------------------------------------------------------------------------
-- 0.a La vista actual: deben salir 12.429 filas y ninguna de la Agenda.
select count(*) as filas, count(*) filter (where id like 'agenda:%') as de_la_agenda
from public.directorio_pro;

-- 0.b Lo que va a entrar: unas 5.800 personas.
select count(*) as personas_agenda
from public.directorio_contactos c
join public.directorio_entidades e on e.id = c.entidad_id
where c.activo and e.activo and coalesce(c.nombre, '') <> '';

------------------------------------------------------------------------
-- PASO 1 · Reescribir la vista con la rama de la Agenda
------------------------------------------------------------------------
do $migracion$
declare
  actual text := pg_get_viewdef('public.directorio_pro'::regclass, true);
  rama   text := $rama$
UNION ALL
 SELECT 'agenda:'::text || c.id::text AS id,
    'España'::text AS jurisdiccion,
        CASE e.categoria
            WHEN 'prensa'::text THEN 'medios'::text
            WHEN 'radio_tv'::text THEN 'medios'::text
            WHEN 'partido'::text THEN 'partidos'::text
            WHEN 'sindicato'::text THEN 'agentes sociales'::text
            WHEN 'patronal'::text THEN 'agentes sociales'::text
            WHEN 'ong'::text THEN 'tercer sector'::text
            WHEN 'religiosa'::text THEN 'tercer sector'::text
            WHEN 'organismo_internacional'::text THEN 'internacional'::text
            WHEN 'ccaa'::text THEN 'autonómico'::text
            WHEN 'local'::text THEN 'local'::text
            WHEN 'alta_institucion'::text THEN 'institucional'::text
            WHEN 'ministerio'::text THEN 'ejecutivo'::text
            WHEN 'organismo_age'::text THEN 'ejecutivo'::text
            WHEN 'delegacion_gobierno'::text THEN 'ejecutivo'::text
            ELSE 'sector público'::text
        END AS tipo_institucion,
    'ES'::text AS pais,
    e.organizacion AS institucion,
    COALESCE(e.unidad, e.grupo) AS unidad,
    e.categoria AS categoria_unidad,
    c.nombre,
    c.cargo,
    c.cargo AS cargo_canonico,
        CASE
            WHEN c.cargo ~* '^((presidente|presidenta|president|secretari[oa] general|director general|directora general|consejer[oa] delegad[oa]|lehendakari|alcalde|alcaldesa|delegad[oa] del gobierno|rector|rectora|jefe de la casa)|(director|directora)$)'::text THEN 'alta_direccion'::text
            WHEN c.cargo ~* '^subdirect'::text THEN 'subdireccion'::text
            WHEN c.cargo ~* '(director|directora|jef[ea]|portavoz|delegad[oa]|responsable|gerente|coordinador|coordinadora)'::text THEN 'direccion'::text
            ELSE 'tecnico'::text
        END AS banda,
        CASE
            WHEN c.cargo ~* '^((presidente|presidenta|president|secretari[oa] general|director general|directora general|consejer[oa] delegad[oa]|lehendakari|alcalde|alcaldesa|delegad[oa] del gobierno|rector|rectora|jefe de la casa)|(director|directora)$)'::text THEN 1
            WHEN c.cargo ~* '^subdirect'::text THEN 3
            WHEN c.cargo ~* '(director|directora|jef[ea]|portavoz|delegad[oa]|responsable|gerente|coordinador|coordinadora)'::text THEN 2
            ELSE 5
        END::smallint AS orden,
    c.orden = 1 AS es_titular,
        CASE
            WHEN e.categoria = ANY (ARRAY['prensa'::text, 'radio_tv'::text]) THEN 'Medios de comunicación'::text
            WHEN c.cargo ~* '(comunicaci|prensa|portavoz|medios|redes sociales)'::text THEN 'Comunicación y prensa'::text
            WHEN c.cargo ~* '(gabinete|asesor)'::text THEN 'Gabinete y asesoría'::text
            WHEN c.cargo ~* '(relaciones institucionales|asuntos p[úu]blicos|internacional)'::text THEN 'Relaciones institucionales'::text
            ELSE 'Otras áreas sectoriales'::text
        END AS area,
    NULLIF(split_part(c.email, ';'::text, 1), ''::text) AS email,
    NULLIF(split_part(e.email_general, ';'::text, 1), ''::text) AS email_unidad,
    NULLIF(split_part(COALESCE(c.telefono, e.telefono), ';'::text, 1), ''::text) AS telefono,
    COALESCE(c.direccion, e.direccion) AS direccion_postal,
    NULL::text AS localidad,
    e.ccaa AS provincia,
    NULL::text AS slug,
    'agenda'::text AS origen,
    e.fuente,
    e.fuente_fecha::timestamp with time zone AS fuente_fecha,
    c.objecion,
    LEAST(100,
        CASE
            WHEN c.email IS NOT NULL THEN 50
            WHEN e.email_general IS NOT NULL THEN 20
            ELSE 0
        END +
        CASE
            WHEN COALESCE(c.telefono, e.telefono) IS NOT NULL THEN 20
            ELSE 0
        END +
        CASE
            WHEN e.fuente_fecha > (now() - '6 mons'::interval) THEN 10
            ELSE 0
        END) AS contactabilidad
   FROM directorio_contactos c
     JOIN directorio_entidades e ON e.id = c.entidad_id
  WHERE c.activo AND e.activo AND COALESCE(c.nombre, ''::text) <> ''::text$rama$;
begin
  if actual like '%''agenda:''::text%' then
    raise notice 'directorio_pro ya tiene la rama de la Agenda: no se cambia nada';
    return;
  end if;
  actual := regexp_replace(actual, ';\s*$', '');
  execute 'create or replace view public.directorio_pro as ' || actual || rama;
end
$migracion$;

------------------------------------------------------------------------
-- PASO 2 · Verificación
------------------------------------------------------------------------
-- 2.a Unas 18.200 filas en total, unas 5.800 de la Agenda.
select count(*) as filas, count(*) filter (where id like 'agenda:%') as de_la_agenda
from public.directorio_pro;

-- 2.b Reparto de lo nuevo.
select tipo_institucion, count(*) as personas, count(email) as con_correo_propio
from public.directorio_pro
where id like 'agenda:%'
group by 1
order by 2 desc;

-- 2.c La carga por bloques sigue funcionando (el 4.º bloque ya trae filas).
select json_array_length(public.directorio_pro_bloque(15000, 5000) -> 'f') as filas_bloque_4;
