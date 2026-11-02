-- =====================================================================
-- 119. El Senado en el Directorio
--
-- Misma vista de filas que los parlamentos autonómicos (sql/116), con el
-- Senado (sql/118, parlamento = 'senado'): institución «Senado», cargo
-- «Senador electo por Madrid» o «Senadora designada por el Parlamento de
-- Andalucía» (o el de la Mesa, si lo tiene), localidad Madrid y origen
-- 'senado'. Los ids siguen siendo 'ccaa-legislativo:senado:…'; la Base
-- de datos los clasifica en su propio nivel «Senado».
-- Se puede ejecutar más de una vez.
-- =====================================================================

create or replace view public.ccaa_directorio_filas as
with cargos as (
  select c.diputado_id, c.parlamento, c.cargo, c.cargo_norm, m.nombre as organo, m.tipo
  from ccaa_cargos c
  join ccaa_comisiones m on m.id = c.comision_id
  where c.activo and c.diputado_id is not null
),
principal as (
  select distinct on (x.diputado_id) x.diputado_id, x.texto, x.peso
  from (
    -- 1. Mesa de la Asamblea
    select diputado_id, case
        when cargo ~* '(parlament|asamblea|corts|cortes)' then cargo
        when parlamento = 'madrid' then cargo || ' de la Asamblea'
        when parlamento = 'cataluna' then cargo || ' del Parlament'
        when parlamento = 'valencia' then cargo || ' de les Corts'
        when parlamento in ('aragon', 'castillayleon', 'castillalamancha') then cargo || ' de las Cortes'
        when parlamento = 'senado' then cargo || ' del Senado'
        else cargo || ' del Parlamento' end as texto, 1 as peso
    from cargos where organo ~* '^mesa (de la asamblea|del parlament|de les corts|del parlamento|de las cortes|del senado)'
    union all
    -- 2. Gobierno de la Comunidad
    select diputado_id,
      case when organo ~* '^gobierno$' then cargo || ' de la Comunidad de Madrid'
           else cargo || ' de ' || regexp_replace(organo, '^Consejer[ií]a de\s*', '') end, 2
    from cargos where organo ~* '^(gobierno$|consejer)'
    union all
    -- 3. Portavoz del grupo (Junta de Portavoces)
    select c.diputado_id, c.cargo || ' del ' || coalesce(g.nombre, 'grupo'), case when c.cargo_norm = 'portavoz' then 3 else 4 end
    from cargos c
    join ccaa_diputados d on d.id = c.diputado_id
    left join ccaa_grupos g on g.id = d.grupo_id
    where c.organo ~* 'junta de (portav(oces|eus)|s[ií]ndics)' and c.cargo_norm in ('portavoz', 'portavoz_adjunto')
    union all
    -- 5. Presidencia o vicepresidencia de comisión
    select diputado_id, cargo || ' de la ' || organo, case when cargo_norm = 'presidencia' then 5 else 6 end
    from cargos where tipo in ('permanente', 'estudio', 'investigacion') and cargo_norm in ('presidencia', 'vicepresidencia')
    union all
    -- 7. Portavocía en comisión
    select diputado_id, case when organo ~* '^comissió' then 'Portaveu a la ' else 'Portavoz en la ' end || organo, 7
    from cargos where tipo in ('permanente', 'estudio', 'investigacion') and cargo_norm = 'portavoz'
    union all
    -- 8. Senado (designación autonómica)
    select diputado_id, cargo || ' por designación autonómica', 8
    from cargos where organo ~* '^senado$'
  ) x
  order by x.diputado_id, x.peso, x.texto
)
 SELECT 'ccaa-legislativo:'::text || d.id AS id,
    'España'::text AS jurisdiccion,
    'legislativo'::text AS tipo_institucion,
    'ES'::text AS pais,
    CASE d.parlamento WHEN 'madrid' THEN 'Asamblea de la Comunidad de Madrid' WHEN 'cataluna' THEN 'Parlament de Catalunya' WHEN 'valencia' THEN 'Les Corts Valencianes' WHEN 'rioja' THEN 'Parlamento de La Rioja' WHEN 'andalucia' THEN 'Parlamento de Andalucía' WHEN 'aragon' THEN 'Cortes de Aragón' WHEN 'canarias' THEN 'Parlamento de Canarias' WHEN 'castillayleon' THEN 'Cortes de Castilla y León' WHEN 'castillalamancha' THEN 'Cortes de Castilla-La Mancha' WHEN 'senado' THEN 'Senado' ELSE d.parlamento END AS institucion,
    COALESCE(g.nombre, 'Sin grupo') AS unidad,
    'grupo_parlamentario'::text AS categoria_unidad,
    d.nombre,
    COALESCE(p.texto, CASE WHEN d.parlamento = 'senado' THEN CASE d.sexo WHEN 'M' THEN 'Senadora' ELSE 'Senador' END || CASE WHEN d.datos->>'procedencia' = 'Designado' THEN CASE d.sexo WHEN 'M' THEN ' designada por ' ELSE ' designado por ' END || coalesce(d.datos->>'designado_por_texto', d.datos->>'designado_por', d.circunscripcion) ELSE CASE d.sexo WHEN 'M' THEN ' electa por ' ELSE ' electo por ' END || d.circunscripcion END WHEN d.parlamento = 'castillayleon' THEN CASE d.sexo WHEN 'M' THEN 'Procuradora' WHEN 'H' THEN 'Procurador' ELSE 'Procurador' END WHEN d.sexo = 'M' THEN 'Diputada' ELSE 'Diputado' END) AS cargo,
    CASE WHEN d.parlamento = 'senado' THEN 'Senador' ELSE 'Diputado autonómico' END AS cargo_canonico,
    'electo'::text AS banda,
    0::smallint AS orden,
    true AS es_titular,
    'Electo'::text AS area,
    d.email,
    NULL::text AS email_unidad,
    NULL::text AS telefono,
    NULL::text AS direccion_postal,
    CASE d.parlamento WHEN 'madrid' THEN 'Madrid' WHEN 'cataluna' THEN 'Barcelona' WHEN 'valencia' THEN 'València' WHEN 'rioja' THEN 'Logroño' WHEN 'andalucia' THEN 'Sevilla' WHEN 'aragon' THEN 'Zaragoza' WHEN 'canarias' THEN 'Santa Cruz de Tenerife' WHEN 'castillayleon' THEN 'Valladolid' WHEN 'castillalamancha' THEN 'Toledo' WHEN 'senado' THEN 'Madrid' ELSE NULL END AS localidad,
    CASE
      WHEN d.parlamento = 'madrid' THEN 'Madrid'
      WHEN d.parlamento = 'rioja' THEN 'La Rioja'
      WHEN d.parlamento = 'canarias' AND d.circunscripcion ~* '(gran canaria|lanzarote|fuerteventura)' THEN 'Las Palmas'
      WHEN d.parlamento = 'canarias' AND d.circunscripcion ~* '(tenerife|la palma|gomera|hierro)' THEN 'Santa Cruz de Tenerife'
      WHEN d.parlamento = 'canarias' THEN NULL
      ELSE d.circunscripcion END AS provincia,
    d.slug,
    CASE WHEN d.parlamento = 'senado' THEN 'senado' ELSE 'parlamento-autonomico' END AS origen,
    d.fuente,
    d.fuente_fecha,
    false AS objecion,
    LEAST(100,
        CASE WHEN d.email IS NOT NULL THEN 50 ELSE 0 END +
        CASE WHEN d.fuente_fecha > (now() - '6 mons'::interval) THEN 10 ELSE 0 END) AS contactabilidad
   FROM ccaa_diputados d
     LEFT JOIN ccaa_grupos g ON g.id = d.grupo_id
     LEFT JOIN principal p ON p.diputado_id = d.id
  WHERE d.activo
UNION ALL
 SELECT 'ccaa-legislativo-tecnico:'::text || c.id::text AS id,
    'España'::text AS jurisdiccion,
    'legislativo'::text AS tipo_institucion,
    'ES'::text AS pais,
    CASE c.parlamento WHEN 'madrid' THEN 'Asamblea de la Comunidad de Madrid' WHEN 'cataluna' THEN 'Parlament de Catalunya' WHEN 'valencia' THEN 'Les Corts Valencianes' WHEN 'rioja' THEN 'Parlamento de La Rioja' WHEN 'andalucia' THEN 'Parlamento de Andalucía' WHEN 'aragon' THEN 'Cortes de Aragón' WHEN 'canarias' THEN 'Parlamento de Canarias' WHEN 'castillayleon' THEN 'Cortes de Castilla y León' WHEN 'castillalamancha' THEN 'Cortes de Castilla-La Mancha' WHEN 'senado' THEN 'Senado' ELSE c.parlamento END AS institucion,
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
    CASE c.parlamento WHEN 'madrid' THEN 'Madrid' WHEN 'cataluna' THEN 'Barcelona' WHEN 'valencia' THEN 'València' WHEN 'rioja' THEN 'Logroño' WHEN 'andalucia' THEN 'Sevilla' WHEN 'aragon' THEN 'Zaragoza' WHEN 'canarias' THEN 'Santa Cruz de Tenerife' WHEN 'castillayleon' THEN 'Valladolid' WHEN 'castillalamancha' THEN 'Toledo' ELSE NULL END AS localidad,
    CASE c.parlamento WHEN 'madrid' THEN 'Madrid' WHEN 'cataluna' THEN 'Barcelona' WHEN 'valencia' THEN 'Valencia' WHEN 'rioja' THEN 'La Rioja' WHEN 'andalucia' THEN 'Sevilla' WHEN 'aragon' THEN 'Zaragoza' WHEN 'canarias' THEN 'Santa Cruz de Tenerife' WHEN 'castillayleon' THEN 'Valladolid' WHEN 'castillalamancha' THEN 'Toledo' ELSE NULL END AS provincia,
    NULL::text AS slug,
    'parlamento-autonomico'::text AS origen,
    c.fuente,
    c.created_at AS fuente_fecha,
    false AS objecion,
    0 AS contactabilidad
   FROM ccaa_cargos c
     LEFT JOIN ccaa_grupos g ON g.id = c.grupo_id
  WHERE c.activo AND c.diputado_id IS NULL AND c.cargo_norm = 'tecnico';

-- Solo la clave de servicio: trae correos.
revoke all on public.ccaa_directorio_filas from anon, authenticated;
