-- =====================================================================
-- 140. Panel de Regulatorio (20-11-2026)
--
-- Dos funciones para la nueva portada de Regulatorio (/regulatorio,
-- pestaña «Dashboard»). Solo leen: no crean tablas ni cambian datos.
--
--   panel_regulatorio_general(p_dias)
--     Actividad general de la plataforma, igual para todos los usuarios.
--     Recuentos por ámbito (estado, ccaa, ue) para que la pantalla sume
--     los que marque el filtro «Ámbito», y la serie diaria de 60 días
--     para el gráfico de área (30 visibles + 30 para comparar).
--
--   panel_regulatorio_revisados(p_dias)
--     Lo que han revisado los agentes del usuario, por agente y día
--     (sector_alert_seen no tiene política de lectura: va por aquí).
--
-- Definiciones (las que enseña la pantalla):
--   Consultas públicas abiertas  consulta_previa abierta o urgente (Estado)
--                                + iniciativas de la Comisión con el plazo
--                                de comentarios abierto (UE)
--   Audiencias públicas abiertas audiencia_publica abierta o urgente (Estado)
--   Normas publicadas            leyes, decretos (reales decretos incluidos)
--                                y órdenes del BOE, sección I (también las
--                                autonómicas que reproduce), y de los
--                                boletines autonómicos, una vez por
--                                comunidad, tipo y número (20-11-2026)
--   Iniciativas                  presentadas en el Congreso; expedientes
--                                autonómicos con algún trámite; procedimientos
--                                del Parlamento Europeo con actividad;
--                                iniciativas de la Comisión que abren plazo
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
    union all select fecha_inicio, 'estado' from consultas_publicas where fecha_inicio >= (select hoy from lim) - 59
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
      'estado', (select count(*) from consultas_estado where tipo = 'consulta_previa' and estado in ('abierta', 'urgente')),
      'estado_hoy', (select count(*) from consultas_estado where tipo = 'consulta_previa' and estado in ('abierta', 'urgente')
                       and (detectada_at at time zone 'Europe/Madrid')::date = (select hoy from lim)),
      'ue', (select count(*) from eu_initiatives where feedback_end > now()),
      'ue_hoy', (select count(*) from eu_initiatives where feedback_end > now()
                   and (feedback_start at time zone 'Europe/Madrid')::date = (select hoy from lim))
    ),
    'audiencias', jsonb_build_object(
      'estado', (select count(*) from consultas_estado where tipo = 'audiencia_publica' and estado in ('abierta', 'urgente')),
      'estado_hoy', (select count(*) from consultas_estado where tipo = 'audiencia_publica' and estado in ('abierta', 'urgente')
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


create or replace function public.panel_regulatorio_revisados(p_dias integer default 7)
returns table (alert_id uuid, dia date, revisados bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.alert_id,
         (s.created_at at time zone 'Europe/Madrid')::date as dia,
         count(*) as revisados
    from sector_alert_seen s
    join sector_alerts a on a.id = s.alert_id
   where a.user_id = auth.uid()
     and (s.created_at at time zone 'Europe/Madrid')::date >= (now() at time zone 'Europe/Madrid')::date
                         - (2 * greatest(1, least(coalesce(p_dias, 7), 90)) - 1)
   group by s.alert_id, (s.created_at at time zone 'Europe/Madrid')::date;
$$;

revoke all on function public.panel_regulatorio_revisados(integer) from public;
grant execute on function public.panel_regulatorio_revisados(integer) to authenticated;
