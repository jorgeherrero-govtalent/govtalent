-- =====================================================================
-- 90 · Asamblea de Madrid y Parlament de Catalunya en regulatorio_search
--
-- Desde el 09-10-2026 se leen los dos parlamentos (lib/ccaa/madrid.js y
-- lib/ccaa/cataluna.js). El contexto de cada expediente empieza por el
-- nombre del parlamento: es lo que usan las alarmas para saber de qué
-- comunidad es (lib/agenteAlarmas.js, parlamentosDe). Sin estas dos
-- líneas el contexto decía «madrid» y «cataluna».
--
-- Misma vista que la vigente (sql/84 + sql/86), solo cambia el CASE.
-- =====================================================================

CREATE OR REPLACE VIEW regulatorio_search AS
 SELECT 'ley'::text AS kind,
    i.num_expediente AS ref_id,
    i.objeto AS titulo,
    i.situacion AS contexto,
    'Congreso'::text AS fuente,
    '/congreso/'::text || i.slug AS ruta,
    i.plazo_enmiendas AS plazo,
    i.fecha_presentacion AS fecha,
    NOT i.is_closed AS activo
   FROM es_initiatives i
UNION ALL
 SELECT 'actividad'::text AS kind,
    a.num_expediente AS ref_id,
    a.titulo,
    a.situacion AS contexto,
    'Congreso'::text AS fuente,
    '/congreso/actividad/'::text || a.slug AS ruta,
    NULL::timestamp with time zone AS plazo,
    a.fecha_presentacion AS fecha,
    NOT a.is_closed AS activo
   FROM es_activity a
UNION ALL
 SELECT 'expediente'::text AS kind,
    e.id::text AS ref_id,
    COALESCE(e.title_es, e.title_en) AS titulo,
    e.stage AS contexto,
    'Comisión Europea'::text AS fuente,
    '/initiatives/'::text || e.slug AS ruta,
    e.feedback_end AS plazo,
    e.feedback_start::date AS fecha,
    e.feedback_end > now() AS activo
   FROM eu_initiatives e
UNION ALL
 SELECT 'procedimiento'::text AS kind,
    p.process_id AS ref_id,
    COALESCE(p.title_es, p.title_en) AS titulo,
    p.current_stage_label AS contexto,
    'Parlamento Europeo'::text AS fuente,
    '/procedures/'::text || p.slug AS ruta,
    NULL::timestamp with time zone AS plazo,
    p.last_activity_at AS fecha,
    NOT p.is_closed AS activo
   FROM ep_procedures p
UNION ALL
 SELECT 'boe'::text AS kind,
    d.id AS ref_id,
    d.titulo,
    d.departamento AS contexto,
    'BOE'::text AS fuente,
    '/boe/'::text || d.slug AS ruta,
    NULL::timestamp with time zone AS plazo,
    d.fecha_publicacion AS fecha,
    NOT d.derogado AND NOT (d.seccion = '3'::text AND es_ruido_normativo(d.titulo)) AS activo
   FROM boe_documents d
UNION ALL
 SELECT 'consulta'::text AS kind,
    c.id::text AS ref_id,
    c.titulo,
    c.ministerio AS contexto,
    'Consulta pública'::text AS fuente,
    '/regulatorio/consultas/'::text || c.id::text AS ruta,
    c.fecha_fin::timestamp with time zone AS plazo,
    c.fecha_inicio AS fecha,
    c.estado = ANY (ARRAY['abierta'::text, 'urgente'::text]) AS activo
   FROM consultas_estado c
UNION ALL
 SELECT 'consejo'::text AS kind,
    k.id AS ref_id,
    k.titulo,
    concat_ws(' · '::text, k.ministerio,
        CASE
            WHEN k.estado = 'pendiente'::text AND k.tipo = 'proyecto_ley'::text THEN 'Aprobado, pendiente de entrada en el Congreso'::text
            WHEN k.estado = 'pendiente'::text THEN 'Aprobado, pendiente de publicación en el BOE'::text
            WHEN k.estado = 'publicado'::text THEN 'Publicado en el BOE'::text
            WHEN k.estado = 'en_cortes'::text THEN 'Remitido a las Cortes'::text
            ELSE NULL::text
        END) AS contexto,
    'Consejo de Ministros'::text AS fuente,
    '/regulatorio/consejo/'::text || k.id AS ruta,
    NULL::timestamp with time zone AS plazo,
    k.fecha_consejo AS fecha,
    k.tipo <> 'nombramiento'::text AND (k.estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text])) AND k.fecha_consejo >= (CURRENT_DATE - 30) AS activo
   FROM consejo_acuerdos k
UNION ALL
 SELECT 'ccaa'::text AS kind,
    x.id AS ref_id,
    COALESCE(x.titulo_es, x.titulo) AS titulo,
    concat_ws(' · '::text,
        CASE x.parlamento
            WHEN 'andalucia'::text THEN 'Parlamento de Andalucía'::text
            WHEN 'aragon'::text THEN 'Cortes de Aragón'::text
            WHEN 'asturias'::text THEN 'Junta General del Principado de Asturias'::text
            WHEN 'cantabria'::text THEN 'Parlamento de Cantabria'::text
            WHEN 'castillayleon'::text THEN 'Cortes de Castilla y León'::text
            WHEN 'rioja'::text THEN 'Parlamento de La Rioja'::text
            WHEN 'valencia'::text THEN 'Corts Valencianes'::text
            WHEN 'madrid'::text THEN 'Asamblea de Madrid'::text
            WHEN 'cataluna'::text THEN 'Parlament de Catalunya'::text
            ELSE x.parlamento
        END, x.num_expediente, x.situacion) AS contexto,
    'Parlamentos autonómicos'::text AS fuente,
    '/parlamentos-autonomicos/'::text || x.slug AS ruta,
    x.plazo_enmiendas AS plazo,
    GREATEST(x.fecha_presentacion, ( SELECT max(t.fecha) AS max
           FROM ccaa_tramites t
          WHERE t.expediente_id = x.id)) AS fecha,
    NOT x.is_closed AS activo
   FROM ccaa_expedientes x
  WHERE x.slug IS NOT NULL
UNION ALL
 SELECT 'diario'::text AS kind,
    g.id AS ref_id,
    g.titulo,
    concat_ws(' · '::text, (g.diario || ' '::text) || g.comunidad, g.organo, g.rango) AS contexto,
    'Diarios autonómicos'::text AS fuente,
    '/regulatorio/diarios/'::text || g.id AS ruta,
    NULL::timestamp with time zone AS plazo,
    g.fecha,
    g.fecha >= (CURRENT_DATE - 30) AS activo
   FROM diarios_ccaa g;
