-- =====================================================================
-- 92 · Diputados autonómicos en el Directorio (Base de datos)
--
-- Añade a directorio_pro los diputados de los parlamentos autonómicos
-- (ccaa_diputados, sql/91) y los técnicos de sus grupos (ccaa_cargos sin
-- diputado). Empieza la Asamblea de Madrid: 135 diputados con el correo
-- que publica la Asamblea en su web, y los técnicos sin correo (no se
-- publica).
--
-- Ids: 'ccaa-legislativo:madrid:2026' (diputado) y
-- 'ccaa-legislativo-tecnico:<id del cargo>'. La página del directorio los
-- clasifica en «Comunidades autónomas».
--
-- Se añade la rama a la definición que ya tiene la vista, sin copiarla
-- entera: la vista ha crecido rama a rama (sql/69, 71, 78…) y repetirla
-- aquí arriesgaría pisar un cambio. Si la rama ya está, no hace nada.
-- Requiere sql/91 aplicado.
-- =====================================================================

do $$
declare
  def text := rtrim(pg_get_viewdef('public.directorio_pro'::regclass, true), E'; \n');
begin
  if position('ccaa-legislativo:' in def) > 0 then
    raise notice 'directorio_pro ya incluye los parlamentos autonómicos';
    return;
  end if;

  execute 'create or replace view public.directorio_pro as ' || def || $rama$
UNION ALL
 SELECT 'ccaa-legislativo:'::text || d.id AS id,
    'España'::text AS jurisdiccion,
    'legislativo'::text AS tipo_institucion,
    'ES'::text AS pais,
    CASE d.parlamento WHEN 'madrid' THEN 'Asamblea de Madrid' ELSE d.parlamento END AS institucion,
    COALESCE(g.nombre, 'Sin grupo') AS unidad,
    'grupo_parlamentario'::text AS categoria_unidad,
    d.nombre,
    CASE d.sexo WHEN 'M' THEN 'Diputada' WHEN 'H' THEN 'Diputado' ELSE 'Diputado' END AS cargo,
    'Diputado autonómico'::text AS cargo_canonico,
    'electo'::text AS banda,
    0::smallint AS orden,
    true AS es_titular,
    'Electo'::text AS area,
    d.email,
    NULL::text AS email_unidad,
    NULL::text AS telefono,
    NULL::text AS direccion_postal,
    CASE d.parlamento WHEN 'madrid' THEN 'Madrid' ELSE NULL END AS localidad,
    CASE d.parlamento WHEN 'madrid' THEN 'Madrid' ELSE NULL END AS provincia,
    d.slug,
    'parlamento-autonomico'::text AS origen,
    d.fuente,
    d.fuente_fecha,
    false AS objecion,
    LEAST(100,
        CASE WHEN d.email IS NOT NULL THEN 50 ELSE 0 END +
        CASE WHEN d.fuente_fecha > (now() - '6 mons'::interval) THEN 10 ELSE 0 END) AS contactabilidad
   FROM ccaa_diputados d
     LEFT JOIN ccaa_grupos g ON g.id = d.grupo_id
  WHERE d.activo
UNION ALL
 SELECT 'ccaa-legislativo-tecnico:'::text || c.id::text AS id,
    'España'::text AS jurisdiccion,
    'legislativo'::text AS tipo_institucion,
    'ES'::text AS pais,
    CASE c.parlamento WHEN 'madrid' THEN 'Asamblea de Madrid' ELSE c.parlamento END AS institucion,
    COALESCE(g.nombre, c.organo) AS unidad,
    'grupo_parlamentario'::text AS categoria_unidad,
    c.nombre,
    c.cargo,
    'Técnico de grupo parlamentario'::text AS cargo_canonico,
    'tecnico'::text AS banda,
    4::smallint AS orden,
    false AS es_titular,
    'Gabinete y asesoría'::text AS area,
    NULL::text AS email,
    NULL::text AS email_unidad,
    NULL::text AS telefono,
    NULL::text AS direccion_postal,
    CASE c.parlamento WHEN 'madrid' THEN 'Madrid' ELSE NULL END AS localidad,
    CASE c.parlamento WHEN 'madrid' THEN 'Madrid' ELSE NULL END AS provincia,
    NULL::text AS slug,
    'parlamento-autonomico'::text AS origen,
    c.fuente,
    c.created_at AS fuente_fecha,
    false AS objecion,
    0 AS contactabilidad
   FROM ccaa_cargos c
     LEFT JOIN ccaa_grupos g ON g.id = c.grupo_id
  WHERE c.activo AND c.diputado_id IS NULL AND c.cargo_norm = 'tecnico'
$rama$;

  -- Mismos permisos que tenía: solo la clave de servicio (el directorio
  -- se sirve desde el servidor, con el plan comprobado).
  execute 'revoke all on public.directorio_pro from anon, authenticated';
end $$;
