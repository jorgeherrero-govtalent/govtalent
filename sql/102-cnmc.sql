-- =====================================================================
-- 102 · CNMC: expedientes y actos
--
-- Fuente de Regulatorio aprobada el 27-10-2026 (documento del proyecto
-- «cnmc-fuente.md»): bloque normativo (IPN, PRO, circulares) y decisiones
-- de competencia (S/, C/, UM/, INF/CNMC) y de los sectores regulados
-- (SNC/, CFT/, ANME/, RAP/, INF/DE de inhabilitaciones y traspasos).
-- Cargador: /api/sync/cnmc (lib/cnmc.js).
--
--   cnmc_expedientes  un expediente dentro del alcance, con sus sujetos
--                     (empresas) y sectores CNAE: con ellos se cruzará con
--                     Organizaciones y el perfil de cada organización.
--   cnmc_actos        cada acto (incoación, resolución, informe…). Es la
--                     unidad que entra en las alarmas.
--   cnmc_vistos       todo lo evaluado, dentro o fuera, con la firma de su
--                     último acto: así no se vuelve a pedir lo que no cambia.
--
-- detectado_en es cuándo lo vio GovTalent; publicado_en, cuándo se publicó
-- (la fecha del RSS o la primera vez visto). En la carga inicial queda
-- vacío y manda la fecha del acto, para no disparar avisos de lo antiguo.
--
-- Entra en regulatorio_search como kind 'cnmc', con los sujetos en el
-- contexto (así la IA de las alarmas ve los nombres de empresa). Se
-- sustituye con CREATE OR REPLACE: mismas columnas y una rama más al final
-- (copia exacta de la vista en producción a 27-10-2026), así que no se
-- tocan las vistas que dependen de ella. La ruta, /regulatorio/cnmc/<slug>,
-- redirige de momento a la ficha en cnmc.es, hasta que exista la ficha
-- propia (maquetas antes).
-- =====================================================================

create table if not exists public.cnmc_expedientes (
  slug text primary key,                  -- 's001725' (cnmc.es/expedientes/<slug>)
  codigo text,                            -- 'S/0017/25'
  titulo text not null,
  bloque text not null check (bloque in ('normativo', 'competencia', 'sectorial')),
  prefijo text,                           -- 'S', 'C', 'IPN', 'SNC'…
  ambito text,                            -- 'Competencia', 'Energía'…
  procedimiento text,                     -- 'Concentraciones - Adquisición control conjunto'
  tipo text,
  sector text,
  estado text,                            -- 'En tramitación'…
  ultimo_resultado text,
  ultima_actualizacion date,
  sectores_cnae text[] not null default '{}',
  sujetos jsonb not null default '[]',    -- [{ nombre, papel }]
  documentos jsonb not null default '[]', -- [{ nombre, url }]
  url text not null,
  ficha_leida_en timestamptz,
  detectado_en timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cnmc_expedientes_bloque_idx on public.cnmc_expedientes (bloque);

create table if not exists public.cnmc_actos (
  id text primary key,                    -- '<slug>-<aaaammdd>-<huella del acto>'
  slug text not null references public.cnmc_expedientes (slug) on delete cascade,
  acto text not null,                     -- 'Resolución del Consejo - Autorización en 1ª fase'
  fecha date not null,                    -- fecha del acto
  publicado_en timestamptz,
  detectado_en timestamptz not null default now()
);
create index if not exists cnmc_actos_slug_idx on public.cnmc_actos (slug, fecha desc);
create index if not exists cnmc_actos_publicado_idx on public.cnmc_actos (publicado_en desc);

create table if not exists public.cnmc_vistos (
  slug text primary key,
  codigo text,
  incluido boolean not null,
  firma text,                             -- último acto conocido y nodo del RSS
  visto_en timestamptz not null default now()
);

alter table public.cnmc_expedientes enable row level security;
alter table public.cnmc_actos enable row level security;
alter table public.cnmc_vistos enable row level security;
drop policy if exists cnmc_expedientes_lectura on public.cnmc_expedientes;
create policy cnmc_expedientes_lectura on public.cnmc_expedientes for select to anon, authenticated using (true);
drop policy if exists cnmc_actos_lectura on public.cnmc_actos;
create policy cnmc_actos_lectura on public.cnmc_actos for select to anon, authenticated using (true);
grant select on public.cnmc_expedientes, public.cnmc_actos to anon, authenticated;
grant all on public.cnmc_expedientes, public.cnmc_actos, public.cnmc_vistos to service_role;

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
   FROM diarios_ccaa g
UNION ALL
 SELECT 'cnmc'::text AS kind,
    a.id AS ref_id,
    concat_ws(' - '::text, e.codigo, e.titulo) AS titulo,
    concat_ws(' · '::text, a.acto, e.ambito, e.estado,
        ( SELECT 'Sujetos: '::text || string_agg(s.value ->> 'nombre'::text, ', '::text)
           FROM ( SELECT j.value
                   FROM jsonb_array_elements(e.sujetos) j(value)
                 LIMIT 8) s)) AS contexto,
    'CNMC'::text AS fuente,
    '/regulatorio/cnmc/'::text || e.slug AS ruta,
    NULL::timestamp with time zone AS plazo,
    COALESCE((a.publicado_en AT TIME ZONE 'Europe/Madrid'::text)::date, a.fecha) AS fecha,
    COALESCE((a.publicado_en AT TIME ZONE 'Europe/Madrid'::text)::date, a.fecha) >= (CURRENT_DATE - 30) AS activo
   FROM cnmc_actos a
     JOIN cnmc_expedientes e ON e.slug = a.slug;
