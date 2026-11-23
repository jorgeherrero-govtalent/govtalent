-- 143-consultas-ccaa.sql
-- Consultas públicas de los gobiernos autonómicos (23-11-2026). Empieza por
-- la Comunidad de Madrid (exportaciones del Portal de Transparencia).
--
-- Van en la misma tabla que las de los ministerios, con dos columnas
-- nuevas: ambito ('estado' | 'ccaa') y ccaa (la clave de
-- lib/parlamentosAutonomicos.js: madrid, cataluna...). Así heredan la
-- ficha, el seguimiento, las alarmas y el buscador.
--
-- Dónde se ven: en /parlamentos-autonomicos, con la fase «Consulta
-- pública»; /regulatorio/consultas sigue siendo solo la del Estado. En el
-- Dashboard de Regulatorio suman Estado + CCAA (por ámbito).
--
-- Ejecutar los bloques por separado.


-- =====================================================================
-- BLOQUE 1 — COLUMNAS
-- =====================================================================

alter table consultas_publicas add column if not exists ambito text not null default 'estado';
alter table consultas_publicas drop constraint if exists consultas_publicas_ambito_check;
alter table consultas_publicas add constraint consultas_publicas_ambito_check check (ambito in ('estado', 'ccaa'));
alter table consultas_publicas add column if not exists ccaa text;
-- Los temas que publica la comunidad (Salud, Vivienda...), tal cual.
alter table consultas_publicas add column if not exists temas text;
-- Documentos de la ficha: [{ "nombre": "Memoria justificativa", "url": "..." }].
alter table consultas_publicas add column if not exists documentos jsonb;

create index if not exists idx_consultas_ambito on consultas_publicas (ambito, ccaa);


-- =====================================================================
-- BLOQUE 2 — VISTA (mismas columnas y en el mismo orden; las nuevas, al
-- final, para que create or replace no tenga que tirar las dependientes:
-- consultas_alertables y regulatorio_search)
-- =====================================================================

create or replace view consultas_estado as
select
  c.id,
  c.ministerio,
  c.fuente_id,
  c.unidad_id,
  c.tipo,
  c.titulo,
  c.referencia,
  c.fecha_inicio,
  c.fecha_fin,
  c.buzon,
  c.asunto_requerido,
  c.url_documento,
  c.url_origen,
  c.resumen,
  c.nota,
  c.detectada_at,
  f.slug                                      as ministerio_slug,
  case
    when c.fecha_fin is null              then 'sin_plazo'
    when c.fecha_fin < current_date       then 'cerrada'
    when c.fecha_fin <= current_date + 7  then 'urgente'
    else 'abierta'
  end                                         as estado,
  (c.fecha_fin - current_date)                as dias_restantes,
  (select count(*) from consulta_actores a where a.consulta_id = c.id) as n_actores,
  c.ambito,
  c.ccaa,
  c.temas,
  c.documentos,
  c.url_ficha
from consultas_publicas c
left join organigrama_fuentes f on f.id = c.fuente_id;


-- =====================================================================
-- BLOQUE 3 — DASHBOARD: las consultas y audiencias suman por ámbito
-- (sustituye a la función de 140-panel-regulatorio.sql)
-- =====================================================================

create or replace function public.panel_regulatorio_general(p_dias integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with lim as (
    select greatest(1, least(coalesce(p_dias, 7), 90)) as dias,
           (now() at time zone 'Europe/Madrid')::date as hoy
  ),
  per as (select hoy - dias + 1 as desde, hoy from lim),
  -- Normas: leyes, decretos (también reales decretos) y órdenes del BOE,
  -- sección I, estatales y autonómicas, y de los boletines autonómicos.
  -- Una norma autonómica sale primero en su boletín y semanas después en
  -- el BOE: se cuenta una vez por comunidad, tipo y número.
  leyes_todas as (
    select fecha_publicacion as d, departamento as org, rango, titulo, 'boe' as src from boe_documents, per
     where seccion = '1'
       and rango in ('Ley', 'Ley Orgánica', 'Ley Foral', 'Real Decreto-ley', 'Decreto-ley',
                     'Real Decreto Legislativo', 'Decreto Legislativo', 'Decreto Foral Legislativo',
                     'Real Decreto', 'Decreto', 'Decreto Foral', 'Orden', 'Circular', 'Instrucción', 'Reglamento')
       and fecha_publicacion >= per.desde
    union all
    select fecha, comunidad, rango, titulo, 'diario' from diarios_ccaa, per
     where rango in ('Ley', 'Decreto-ley', 'Decreto Legislativo', 'Decreto', 'Orden')
       and fecha >= per.desde
  ),
  leyes as (
    select case when src = 'diario' or org ~* '^(Comunidad|Comunitat|Principado|Región|Illes|Ciudad Autónoma|Diputación Foral|Junta de|Generalitat|Gobierno de |Xunta)'
                then 'ccaa' else 'estado' end as ambito,
           lower(regexp_replace(coalesce(org, ''), '^(Comunidad Autónoma|Comunidad Foral|Comunidad|Comunitat) (de la |de las |del |de )?', '', 'i'))
             || '|' || case when rango ilike '%decreto-ley%' then 'decreto-ley' when rango ilike '%legislativo%' then 'decreto-legislativo' when rango ilike '%decreto%' then 'decreto' when rango ilike 'orden%' then 'orden' when rango ilike '%orgánica%' then 'organica' when rango ilike 'ley%' then 'ley' else lower(rango) end
             || '|' || coalesce(substring(titulo from '(\d+/\d{4})'), titulo) as clave,
           min(d) as primera,
           max(d) as ultima
      from leyes_todas
     group by 1, 2
  ),
  ini_estado as (
    select fecha_presentacion as d from es_initiatives, per where fecha_presentacion >= per.desde
  ),
  ini_ccaa as (
    select expediente_id, max((created_at at time zone 'Europe/Madrid')::date) as d
      from ccaa_tramites, per
     where (created_at at time zone 'Europe/Madrid')::date >= per.desde
     group by expediente_id
  ),
  ini_ue as (
    select last_activity_at as d from ep_procedures, per where last_activity_at >= per.desde
    union all
    select (feedback_start at time zone 'Europe/Madrid')::date from eu_initiatives, per
     where (feedback_start at time zone 'Europe/Madrid')::date >= per.desde
  ),
  -- Serie diaria de 60 días: todo lo que entra en Regulatorio, por ámbito.
  dias60 as (
    select generate_series((select hoy from lim) - 59, (select hoy from lim), interval '1 day')::date as d
  ),
  mov as (
    select fecha_publicacion as d, 'estado' as a from boe_documents where fecha_publicacion >= (select hoy from lim) - 59
    union all select fecha_consejo, 'estado' from consejo_acuerdos where fecha_consejo >= (select hoy from lim) - 59
    union all select fecha_inicio, ambito from consultas_publicas where fecha_inicio >= (select hoy from lim) - 59
    union all select fecha_presentacion, 'estado' from es_initiatives where fecha_presentacion >= (select hoy from lim) - 59
    union all select coalesce((publicado_en at time zone 'Europe/Madrid')::date, fecha), 'estado' from cnmc_actos
       where coalesce((publicado_en at time zone 'Europe/Madrid')::date, fecha) >= (select hoy from lim) - 59
    union all select fecha, 'ccaa' from diarios_ccaa where fecha >= (select hoy from lim) - 59
    union all select (created_at at time zone 'Europe/Madrid')::date, 'ccaa' from ccaa_tramites
       where (created_at at time zone 'Europe/Madrid')::date >= (select hoy from lim) - 59
    union all select last_activity_at, 'ue' from ep_procedures where last_activity_at >= (select hoy from lim) - 59
    union all select (feedback_start at time zone 'Europe/Madrid')::date, 'ue' from eu_initiatives
       where (feedback_start at time zone 'Europe/Madrid')::date >= (select hoy from lim) - 59
  ),
  serie as (
    select dias60.d,
           count(*) filter (where mov.a = 'estado') as estado,
           count(*) filter (where mov.a = 'ccaa') as ccaa,
           count(*) filter (where mov.a = 'ue') as ue
      from dias60 left join mov on mov.d = dias60.d
     group by dias60.d
  )
  select jsonb_build_object(
    'hoy', (select hoy from lim),
    'dias', (select dias from lim),
    'consultas', jsonb_build_object(
      'estado', (select count(*) from consultas_estado where ambito = 'estado' and tipo = 'consulta_previa' and estado in ('abierta', 'urgente')),
      'estado_hoy', (select count(*) from consultas_estado where ambito = 'estado' and tipo = 'consulta_previa' and estado in ('abierta', 'urgente')
                       and (detectada_at at time zone 'Europe/Madrid')::date = (select hoy from lim)),
      'ccaa', (select count(*) from consultas_estado where ambito = 'ccaa' and tipo = 'consulta_previa' and estado in ('abierta', 'urgente')),
      'ccaa_hoy', (select count(*) from consultas_estado where ambito = 'ccaa' and tipo = 'consulta_previa' and estado in ('abierta', 'urgente')
                       and (detectada_at at time zone 'Europe/Madrid')::date = (select hoy from lim)),
      'ue', (select count(*) from eu_initiatives where feedback_end > now()),
      'ue_hoy', (select count(*) from eu_initiatives where feedback_end > now()
                   and (feedback_start at time zone 'Europe/Madrid')::date = (select hoy from lim))
    ),
    'audiencias', jsonb_build_object(
      'estado', (select count(*) from consultas_estado where ambito = 'estado' and tipo = 'audiencia_publica' and estado in ('abierta', 'urgente')),
      'estado_hoy', (select count(*) from consultas_estado where ambito = 'estado' and tipo = 'audiencia_publica' and estado in ('abierta', 'urgente')
                       and (detectada_at at time zone 'Europe/Madrid')::date = (select hoy from lim)),
      'ccaa', (select count(*) from consultas_estado where ambito = 'ccaa' and tipo = 'audiencia_publica' and estado in ('abierta', 'urgente')),
      'ccaa_hoy', (select count(*) from consultas_estado where ambito = 'ccaa' and tipo = 'audiencia_publica' and estado in ('abierta', 'urgente')
                       and (detectada_at at time zone 'Europe/Madrid')::date = (select hoy from lim))
    ),
    'leyes', jsonb_build_object(
      'estado', (select count(*) from leyes where ambito = 'estado'),
      'estado_hoy', (select count(*) from leyes where ambito = 'estado' and ultima = (select hoy from lim)),
      'ccaa', (select count(*) from leyes where ambito = 'ccaa'),
      'ccaa_hoy', (select count(*) from leyes where ambito = 'ccaa' and ultima = (select hoy from lim))
    ),
    'iniciativas', jsonb_build_object(
      'estado', (select count(*) from ini_estado),
      'estado_hoy', (select count(*) from ini_estado where d = (select hoy from lim)),
      'ccaa', (select count(*) from ini_ccaa),
      'ccaa_hoy', (select count(*) from ini_ccaa where d = (select hoy from lim)),
      'ue', (select count(*) from ini_ue),
      'ue_hoy', (select count(*) from ini_ue where d = (select hoy from lim))
    ),
    'serie', (select jsonb_agg(jsonb_build_object('d', d, 'estado', estado, 'ccaa', ccaa, 'ue', ue) order by d) from serie)
  );
$$;

revoke all on function public.panel_regulatorio_general(integer) from public;
grant execute on function public.panel_regulatorio_general(integer) to authenticated;
