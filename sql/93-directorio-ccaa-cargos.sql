-- =====================================================================
-- 93 · Diputados autonómicos en el Directorio: cargo real y nombre de la
--      institución
--
-- sql/92 metía a los diputados con el cargo «Diputado/a» a secas y con la
-- institución «Asamblea de Madrid», mientras que el directorio de
-- Comunidades autónomas (Agenda de la Comunicación) ya la tenía como
-- «Asamblea de la Comunidad de Madrid». En la Base de datos salían como
-- dos instituciones y sin el cargo que interesa.
--
-- Ahora:
--   · institución «Asamblea de la Comunidad de Madrid» para todos (junta
--     diputados, técnicos y gabinete en el mismo filtro);
--   · cargo = el de más peso de cada uno: Mesa («Presidente de la
--     Asamblea»), Gobierno («Consejera de Economía, Hacienda y Empleo»),
--     portavoz del grupo, presidencia o vicepresidencia de comisión,
--     portavocía en comisión, o «Diputado/a»;
--   · las ramas autonómicas salen de una vista propia
--     (ccaa_directorio_filas), así que cambiarlas ya no obliga a rehacer
--     directorio_pro entera.
--
-- Requiere sql/91 y sql/92. Se puede ejecutar más de una vez.
-- =====================================================================

create or replace view public.ccaa_directorio_filas as
with cargos as (
  select c.diputado_id, c.cargo, c.cargo_norm, m.nombre as organo, m.tipo
  from ccaa_cargos c
  join ccaa_comisiones m on m.id = c.comision_id
  where c.activo and c.diputado_id is not null
),
principal as (
  select distinct on (x.diputado_id) x.diputado_id, x.texto, x.peso
  from (
    -- 1 · Mesa de la Asamblea
    select diputado_id, cargo || ' de la Asamblea' as texto, 1 as peso
    from cargos where organo ~* '^mesa de la asamblea'
    union all
    -- 2 · Gobierno de la Comunidad
    select diputado_id,
      case when organo ~* '^gobierno$' then cargo || ' de la Comunidad de Madrid'
           else cargo || ' de ' || regexp_replace(organo, '^Consejer[ií]a de\s*', '') end, 2
    from cargos where organo ~* '^(gobierno$|consejer)'
    union all
    -- 3 · Portavoz del grupo (Junta de Portavoces)
    select c.diputado_id, c.cargo || ' del ' || coalesce(g.nombre, 'grupo'), case when c.cargo_norm = 'portavoz' then 3 else 4 end
    from cargos c
    join ccaa_diputados d on d.id = c.diputado_id
    left join ccaa_grupos g on g.id = d.grupo_id
    where c.organo ~* 'junta de portavoces' and c.cargo_norm in ('portavoz', 'portavoz_adjunto')
    union all
    -- 5 · Presidencia o vicepresidencia de comisión
    select diputado_id, cargo || ' de la ' || organo, case when cargo_norm = 'presidencia' then 5 else 6 end
    from cargos where tipo in ('permanente', 'estudio', 'investigacion') and cargo_norm in ('presidencia', 'vicepresidencia')
    union all
    -- 7 · Portavocía en comisión
    select diputado_id, 'Portavoz en la ' || organo, 7
    from cargos where tipo in ('permanente', 'estudio', 'investigacion') and cargo_norm = 'portavoz'
    union all
    -- 8 · Senado (designación autonómica)
    select diputado_id, cargo || ' por designación de la Asamblea', 8
    from cargos where organo ~* '^senado$'
  ) x
  order by x.diputado_id, x.peso, x.texto
)
 SELECT 'ccaa-legislativo:'::text || d.id AS id,
    'España'::text AS jurisdiccion,
    'legislativo'::text AS tipo_institucion,
    'ES'::text AS pais,
    CASE d.parlamento WHEN 'madrid' THEN 'Asamblea de la Comunidad de Madrid' ELSE d.parlamento END AS institucion,
    COALESCE(g.nombre, 'Sin grupo') AS unidad,
    'grupo_parlamentario'::text AS categoria_unidad,
    d.nombre,
    COALESCE(p.texto, CASE d.sexo WHEN 'M' THEN 'Diputada' ELSE 'Diputado' END) AS cargo,
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
     LEFT JOIN principal p ON p.diputado_id = d.id
  WHERE d.activo
UNION ALL
 SELECT 'ccaa-legislativo-tecnico:'::text || c.id::text AS id,
    'España'::text AS jurisdiccion,
    'legislativo'::text AS tipo_institucion,
    'ES'::text AS pais,
    CASE c.parlamento WHEN 'madrid' THEN 'Asamblea de la Comunidad de Madrid' ELSE c.parlamento END AS institucion,
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
  WHERE c.activo AND c.diputado_id IS NULL AND c.cargo_norm = 'tecnico';

-- Solo la clave de servicio: trae correos.
revoke all on public.ccaa_directorio_filas from anon, authenticated;

-- directorio_pro: las dos ramas que puso sql/92 pasan a leer de la vista.
do $$
declare
  def text := rtrim(pg_get_viewdef('public.directorio_pro'::regclass, true), E'; \n');
  i int;
begin
  if position('ccaa_directorio_filas' in def) > 0 then
    raise notice 'directorio_pro ya lee de ccaa_directorio_filas';
    return;
  end if;
  i := position($q$'ccaa-legislativo:'$q$ in def);
  if i > 0 then
    -- Se corta desde el «UNION ALL SELECT» que abre la rama de sql/92.
    def := regexp_replace(left(def, i - 1), '\s*UNION ALL\s*SELECT\s*$', '');
  end if;
  execute 'create or replace view public.directorio_pro as ' || def ||
          E'\nUNION ALL\n SELECT * FROM public.ccaa_directorio_filas';
  execute 'revoke all on public.directorio_pro from anon, authenticated';
end $$;
