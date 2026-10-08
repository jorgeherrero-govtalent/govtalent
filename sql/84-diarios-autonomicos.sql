-- =====================================================================
-- 84 · Diarios oficiales autonómicos (piloto)
--
-- Las disposiciones de los diarios oficiales de las comunidades (DOG,
-- BOCM, BORM, BOPV, DOE…), la capa equivalente al BOE. Cargador:
-- /api/sync/diarios-autonomicos (lib/diarios/*). Fuentes y decisiones:
-- documento del proyecto «diarios-oficiales-ccaa-fuentes.md».
--
-- Solo se guarda el alcance aprobado el 08-10-2026 (tipo):
--   disposicion_general  leyes, decretos y órdenes de carácter general
--   nombramiento         nombramientos y ceses de altos cargos (por decreto)
--   otra_disposicion     otras disposiciones de la comunidad
--   informacion_publica  información pública o audiencia de proyectos
--                        normativos (dentro de los anuncios)
-- Fuera: administración local, justicia, contratación y oposiciones.
--
-- detectado_en es cuándo lo vio GovTalent; publicado_en, la hora que da
-- la fuente cuando la da. Sirven para medir el adelanto de los avisos.
--
-- Entra en regulatorio_search como kind 'diario', así que las alarmas lo
-- evalúan sin cambios (regulatorio_reciente lo recoge). Su ruta,
-- /regulatorio/diarios/<id>, redirige de momento a la fuente oficial,
-- hasta que exista la ficha (pendiente de maquetas).
--
-- La vista se sustituye con CREATE OR REPLACE: mismas columnas y una rama
-- más al final, así que no se tocan las vistas que dependen de ella
-- (regulatorio_reciente, search_index, my_follows, asuntos_de_mis_temas).
-- =====================================================================

create table if not exists public.diarios_ccaa (
  id text primary key,                 -- '<ccaa>-<referencia de la fuente>'
  ccaa text not null,                  -- clave: galicia, madrid, murcia, paisvasco, extremadura…
  comunidad text not null,             -- 'Galicia', 'Comunidad de Madrid'…
  diario text not null,                -- 'DOG', 'BOCM', 'BORM', 'BOPV', 'DOE'…
  fecha date not null,                 -- fecha del boletín
  numero text,                         -- número del boletín
  tipo text not null check (tipo in ('disposicion_general', 'nombramiento', 'otra_disposicion', 'informacion_publica')),
  seccion text,                        -- la sección tal como la escribe el diario
  rango text,                          -- Decreto, Orden, Resolución…
  organo text,                         -- consejería u órgano emisor
  titulo text not null,
  url text not null,
  url_pdf text,
  publicado_en timestamptz,
  detectado_en timestamptz not null default now(),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists diarios_ccaa_fecha_idx on public.diarios_ccaa (fecha desc);
create index if not exists diarios_ccaa_ccaa_idx on public.diarios_ccaa (ccaa, fecha desc);

alter table public.diarios_ccaa enable row level security;
drop policy if exists diarios_ccaa_lectura on public.diarios_ccaa;
create policy diarios_ccaa_lectura on public.diarios_ccaa for select to anon, authenticated using (true);
grant select on public.diarios_ccaa to anon, authenticated;
grant all on public.diarios_ccaa to service_role;

-- Todo lo que el sync ya ha evaluado, haya entrado o no. Sirve para no
-- volver a pedir lo mismo (en el BOCM, el título de cada disposición es
-- una petición aparte con 10 s de pausa entre una y otra).
create table if not exists public.diarios_ccaa_vistos (
  id text primary key,                 -- el mismo id que en diarios_ccaa
  ccaa text not null,
  fecha date,
  incluido boolean not null,
  visto_en timestamptz not null default now()
);
create index if not exists diarios_ccaa_vistos_idx on public.diarios_ccaa_vistos (ccaa, visto_en desc);
alter table public.diarios_ccaa_vistos enable row level security;
grant all on public.diarios_ccaa_vistos to service_role;

create or replace view public.regulatorio_search as
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
    NOT d.derogado AS activo
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
    concat_ws(' · '::text, g.diario || ' ' || g.comunidad, g.organo, g.rango) AS contexto,
    'Diarios autonómicos'::text AS fuente,
    '/regulatorio/diarios/'::text || g.id AS ruta,
    NULL::timestamp with time zone AS plazo,
    g.fecha,
    g.fecha >= (CURRENT_DATE - 30) AS activo
   FROM diarios_ccaa g;
