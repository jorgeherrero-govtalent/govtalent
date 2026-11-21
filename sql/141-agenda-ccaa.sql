-- =====================================================================
-- 141. AGENDAS DE LOS GOBIERNOS AUTONÓMICOS
-- sql/141-agenda-ccaa.sql
--
-- La agenda de gobierno de Madrid, Cataluña, Andalucía y la Comunitat
-- Valenciana, leída por /api/sync/agenda-ccaa (lib/agendaCcaa).
--
--   agenda_ccaa_actos   un acto por fila. No se borra nada: si un acto
--                       desaparece de la agenda se marca «retirado».
--
-- Y entra en las alarmas: regulatorio_reciente, que es lo que evalúa
-- /api/alarmas/vigilar, añade los actos de ayer a una semana vista con
-- kind 'agenda_ccaa', salvo los de las delegaciones territoriales (son
-- actos locales y metían ruido). Como la agenda de La Moncloa, NO entra
-- en regulatorio_search: no es normativa.
--
-- Ejecutar ANTES de desplegar el código.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Paso 0. Comprobaciones (solo lectura). Deben devolver:
--   1) regulatorio_reciente con 9 columnas, la última «activo»
--   2) ninguna vista que dependa de regulatorio_reciente
--   3) ninguna tabla agenda_ccaa_actos todavía
-- ---------------------------------------------------------------------

select a.attnum, a.attname, format_type(a.atttypid, a.atttypmod)
from pg_attribute a
where a.attrelid = 'public.regulatorio_reciente'::regclass and a.attnum > 0
order by a.attnum;

select c.relname
from pg_depend d
join pg_rewrite r on r.oid = d.objid
join pg_class c on c.oid = r.ev_class
where d.refobjid = 'public.regulatorio_reciente'::regclass
  and c.relname <> 'regulatorio_reciente';

select to_regclass('public.agenda_ccaa_actos');


-- ---------------------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------------------

create table if not exists public.agenda_ccaa_actos (
  id           text primary key,              -- mad-…, cat-…, and-…, val-… (lib/agendaCcaa)
  ccaa         text not null check (ccaa in ('madrid', 'cataluna', 'andalucia', 'valenciana')),
  fecha        date not null,
  hora         text,                          -- «09:00»; null si no tiene
  inicio       timestamptz,                   -- fecha + hora en Madrid
  nivel        text not null check (nivel in ('presidente', 'consejero', 'alto_cargo', 'delegacion')),
  organo       text,                          -- consejería o departamento
  persona      text,
  cargo        text,
  titulo       text not null,
  texto        text,
  lugar        text,
  url          text,                          -- el acto en la web de la comunidad
  agenda_url   text not null,                 -- la página de la que sale
  source_id    text,
  estado       text not null default 'vigente' check (estado in ('vigente', 'retirado')),
  retirado_at  timestamptz,
  detectado_en timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_agenda_ccaa_fecha on public.agenda_ccaa_actos (ccaa, fecha desc);
create index if not exists idx_agenda_ccaa_reciente on public.agenda_ccaa_actos (fecha)
  where estado = 'vigente' and nivel <> 'delegacion';


-- ---------------------------------------------------------------------
-- 2. Permisos. La agenda es pública, como la de La Moncloa. Escribe
-- solo el servidor.
-- ---------------------------------------------------------------------

alter table public.agenda_ccaa_actos enable row level security;

drop policy if exists agenda_ccaa_actos_lectura on public.agenda_ccaa_actos;
create policy agenda_ccaa_actos_lectura on public.agenda_ccaa_actos
  for select to anon, authenticated using (true);

grant all privileges on public.agenda_ccaa_actos to service_role;
grant select on public.agenda_ccaa_actos to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. La agenda autonómica en las alarmas
--
-- Misma definición de regulatorio_reciente que había (pg_get_viewdef a
-- 21-11-2026) más los actos autonómicos. Mismas columnas y en el mismo
-- orden, así que basta con create or replace.
--
-- La fuente dice la comunidad («Agenda de la Junta de Andalucía»): es lo
-- que la IA ve entre corchetes y lo que sale en la pantalla de alarmas.
-- El contexto: órgano, día, hora y lugar, separados por comas.
-- ---------------------------------------------------------------------

create or replace view public.regulatorio_reciente as
 select s.kind,
    s.ref_id,
    s.titulo,
    s.contexto,
    s.fuente,
    s.ruta,
    s.plazo,
    s.fecha,
    s.activo
   from regulatorio_search s
  where s.activo and s.fecha >= (current_date - 7)
union all
 select 'agenda'::text as kind,
    a.id as ref_id,
    a.titulo,
    concat_ws(', '::text, a.cargo, to_char(a.fecha::timestamp with time zone, 'DD/MM'::text) || coalesce((', '::text || a.hora) || ' h'::text, ''::text), nullif(array_to_string(a.notas, ' '::text), ''::text)) as contexto,
    'Agenda del Gobierno'::text as fuente,
    '/institutions/agenda/'::text || a.id as ruta,
    null::timestamp with time zone as plazo,
    a.fecha,
    true as activo
   from agenda_actos a
  where a.estado = 'vigente'::text and a.fecha >= (current_date - 1) and a.fecha <= (current_date + 7)
union all
 select 'agenda_ccaa'::text as kind,
    c.id as ref_id,
    c.titulo,
    concat_ws(', '::text,
      c.organo,
      to_char(c.fecha::timestamp with time zone, 'DD/MM'::text) || coalesce((', '::text || c.hora) || ' h'::text, ''::text),
      c.lugar) as contexto,
    case c.ccaa
      when 'madrid' then 'Agenda de la Comunidad de Madrid'
      when 'cataluna' then 'Agenda del Govern de Catalunya'
      when 'andalucia' then 'Agenda de la Junta de Andalucía'
      when 'valenciana' then 'Agenda de la Generalitat Valenciana'
    end as fuente,
    '/institutions/agenda-ccaa/'::text || c.id as ruta,
    null::timestamp with time zone as plazo,
    c.fecha,
    true as activo
   from agenda_ccaa_actos c
  where c.estado = 'vigente'::text and c.nivel <> 'delegacion'::text
    and c.fecha >= (current_date - 1) and c.fecha <= (current_date + 7);


-- ---------------------------------------------------------------------
-- 4. Comprobación
-- ---------------------------------------------------------------------

select kind, count(*) from public.regulatorio_reciente
where kind in ('agenda', 'agenda_ccaa') group by kind;
