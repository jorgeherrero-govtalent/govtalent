-- =====================================================================
-- 62 · AGENDA DEL GOBIERNO
-- sql/62-agenda-gobierno.sql
--
-- La agenda diaria de La Moncloa (presidente, vicepresidentes y
-- ministros), leída por /api/sync/agenda-gobierno.
--
--   agenda_dias     una fila por día leído: huella y cuándo se leyó.
--   agenda_actos    un acto por fila. No se borra nada: si un acto
--                   desaparece de la agenda se marca «retirado».
--   agenda_avisos   qué usuario recibió ya el correo de la agenda de
--                   un día (uno al día como mucho).
--
-- Y la agenda entra en las alarmas: regulatorio_reciente, que es lo que
-- evalúa /api/alarmas/vigilar, añade los actos de ayer a una semana
-- vista. NO entra en regulatorio_search: la agenda no es normativa y no
-- debe salir en el buscador ni en los listados de Regulatorio.
--
-- Ejecutar ANTES de desplegar el código.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Paso 0 · Comprobaciones (solo lectura). Deben devolver:
--   1) regulatorio_reciente con 9 columnas, la última «activo»
--   2) ninguna vista que dependa de regulatorio_reciente
--   3) ninguna tabla agenda_* todavía
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

select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'agenda\_%';


-- ---------------------------------------------------------------------
-- 1 · Tablas
-- ---------------------------------------------------------------------

create table if not exists public.agenda_dias (
  fecha        date primary key,
  url          text not null,
  huella       text,
  n_actos      integer not null default 0,
  -- Primera vez que se vio la agenda de ese día con actos: mide con
  -- cuánta antelación la publica La Moncloa.
  publicada_at timestamptz,
  leida_at     timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.agenda_actos (
  id           text primary key,              -- AAAAMMDD-hash (lib/agenda.js)
  fecha        date not null,
  hora         text,                          -- «09:00», hora de Madrid; null si no tiene
  inicio       timestamptz,                   -- fecha + hora en Madrid
  persona      text not null,                 -- como lo escribe la agenda
  cargo        text,
  miembro_slug text,                          -- government_members.slug, si se reconoce
  texto        text not null,
  titulo       text not null,                 -- «Carlos Cuerpo mantiene una reunión…»
  notas        text[] not null default '{}',  -- cobertura, hora local…
  cobertura    text,
  orden        integer,
  agenda_url   text not null,
  estado       text not null default 'vigente' check (estado in ('vigente', 'retirado')),
  retirado_at  timestamptz,
  detectado_en timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_agenda_actos_fecha on public.agenda_actos (fecha desc);
create index if not exists idx_agenda_actos_miembro on public.agenda_actos (miembro_slug, fecha desc)
  where miembro_slug is not null;

create table if not exists public.agenda_avisos (
  user_id    uuid not null references auth.users(id) on delete cascade,
  fecha      date not null,
  n_actos    integer not null default 0,
  enviado_at timestamptz not null default now(),
  primary key (user_id, fecha)
);


-- ---------------------------------------------------------------------
-- 2 · Permisos. La agenda es pública, como las Referencias del Consejo;
-- los avisos, solo los propios. Escribe solo el servidor.
-- ---------------------------------------------------------------------

alter table public.agenda_dias   enable row level security;
alter table public.agenda_actos  enable row level security;
alter table public.agenda_avisos enable row level security;

drop policy if exists agenda_dias_lectura on public.agenda_dias;
create policy agenda_dias_lectura on public.agenda_dias
  for select to anon, authenticated using (true);

drop policy if exists agenda_actos_lectura on public.agenda_actos;
create policy agenda_actos_lectura on public.agenda_actos
  for select to anon, authenticated using (true);

drop policy if exists agenda_avisos_propios on public.agenda_avisos;
create policy agenda_avisos_propios on public.agenda_avisos
  for select to authenticated using (auth.uid() = user_id);

grant all privileges on public.agenda_dias, public.agenda_actos, public.agenda_avisos to service_role;
grant select on public.agenda_dias, public.agenda_actos to anon, authenticated;
grant select on public.agenda_avisos to authenticated;


-- ---------------------------------------------------------------------
-- 3 · La agenda en las alarmas
--
-- Misma definición de regulatorio_reciente que había (pg_get_viewdef a
-- 29-09-2026) más los actos de la agenda. Mismas columnas y en el mismo
-- orden, así que basta con create or replace.
--
-- De la agenda entra lo de ayer a siete días vista y solo lo vigente:
-- avisar de un acto de hace una semana no sirve de nada.
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
    concat_ws(' · '::text,
      a.cargo,
      to_char(a.fecha, 'DD/MM') || coalesce(', ' || a.hora || ' h', ''),
      nullif(array_to_string(a.notas, ' '), '')) as contexto,
    'Agenda del Gobierno'::text as fuente,
    '/institutions/agenda/'::text || a.id as ruta,
    null::timestamptz as plazo,
    a.fecha,
    true as activo
   from agenda_actos a
  where a.estado = 'vigente'
    and a.fecha >= (current_date - 1)
    and a.fecha <= (current_date + 7);


-- ---------------------------------------------------------------------
-- 4 · Comprobación final. Debe devolver las tres tablas y 0 actos.
-- ---------------------------------------------------------------------

select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'agenda\_%') as tablas,
  (select count(*) from public.regulatorio_reciente where kind = 'agenda') as actos_en_alarmas;
