-- =====================================================================
-- 63 · CORREO DEL CONSEJO DE MINISTROS
-- sql/63-correo-consejo.sql
--
-- Un correo por Consejo a todos los usuarios, en cuanto La Moncloa
-- publica la Referencia (app/api/alerts/consejo):
--   · Free: el resumen general.
--   · Pro y Teams: arriba, lo que afecta a sus alarmas y seguimientos.
--
--   consejo_referencias.ampliacion   el texto de «Ampliación de
--                                    contenidos», para que la IA explique
--                                    cada norma.
--   consejo_referencias.evaluada_at  cuándo pasaron las alarmas sobre sus
--                                    acuerdos: el correo espera a eso para
--                                    poder decir a cada Pro qué le afecta.
--   consejo_resumenes                el resumen de cada Referencia (uno,
--                                    generado una vez) y su estado de envío.
--   consejo_correos                  a quién se ha enviado ya: si el envío
--                                    se corta, la pasada siguiente sigue.
--   alert_preferences.consejo        la baja de este correo, aparte del
--                                    resto.
--
-- Ejecutar ANTES de desplegar el código.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Paso 0 · Comprobaciones (solo lectura). Deben devolver:
--   1) ninguna de las columnas nuevas todavía
--   2) ninguna tabla consejo_resumenes / consejo_correos todavía
-- ---------------------------------------------------------------------

select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'consejo_referencias' and column_name in ('ampliacion', 'evaluada_at'))
    or (table_name = 'alert_preferences' and column_name = 'consejo'));

select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('consejo_resumenes', 'consejo_correos');


-- ---------------------------------------------------------------------
-- 1 · Columnas nuevas
-- ---------------------------------------------------------------------

alter table public.consejo_referencias add column if not exists ampliacion text;
alter table public.consejo_referencias add column if not exists evaluada_at timestamptz;

-- Sin fila en alert_preferences, o con la columna a true, se recibe.
alter table public.alert_preferences add column if not exists consejo boolean not null default true;


-- ---------------------------------------------------------------------
-- 2 · Tablas
-- ---------------------------------------------------------------------

create table if not exists public.consejo_resumenes (
  referencia_url text primary key references public.consejo_referencias(url) on delete cascade,
  fecha          date not null,
  resumen        jsonb,                 -- lo que devuelve lib/resumenConsejo.js
  modelo         text,                  -- 'claude-sonnet-5' o 'sin_ia' si la IA falló
  generado_at    timestamptz,
  -- pendiente → enviando → enviado. 'omitido': no se envía (los
  -- Consejos anteriores a este correo).
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'omitido')),
  enviado_at     timestamptz,
  n_enviados     integer not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.consejo_correos (
  user_id        uuid not null references auth.users(id) on delete cascade,
  referencia_url text not null references public.consejo_referencias(url) on delete cascade,
  pro            boolean not null default false,
  n_tuyos        integer not null default 0,   -- cuántos «Te afecta» llevaba
  enviado_at     timestamptz not null default now(),
  primary key (user_id, referencia_url)
);


-- ---------------------------------------------------------------------
-- 3 · Permisos. Escribe solo el servidor. El resumen es público, como
-- las Referencias; los envíos, solo los propios.
-- ---------------------------------------------------------------------

alter table public.consejo_resumenes enable row level security;
alter table public.consejo_correos   enable row level security;

drop policy if exists consejo_resumenes_lectura on public.consejo_resumenes;
create policy consejo_resumenes_lectura on public.consejo_resumenes
  for select to anon, authenticated using (true);

drop policy if exists consejo_correos_propios on public.consejo_correos;
create policy consejo_correos_propios on public.consejo_correos
  for select to authenticated using (auth.uid() = user_id);

grant all privileges on public.consejo_resumenes, public.consejo_correos to service_role;
grant select on public.consejo_resumenes to anon, authenticated;
grant select on public.consejo_correos to authenticated;


-- ---------------------------------------------------------------------
-- 4 · Los Consejos que ya están guardados no se envían: el correo
-- empieza con el próximo. (Para probar con uno de ellos, la ruta acepta
-- ?fecha=…&user=<tu id>, que envía solo a ti aunque esté omitido.)
-- ---------------------------------------------------------------------

insert into public.consejo_resumenes (referencia_url, fecha, estado)
select url, fecha, 'omitido' from public.consejo_referencias
on conflict (referencia_url) do nothing;


-- ---------------------------------------------------------------------
-- 5 · Comprobación final: las 2 tablas, las 3 columnas y todas las
-- Referencias guardadas como 'omitido'.
-- ---------------------------------------------------------------------

select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('consejo_resumenes', 'consejo_correos')) as tablas,
  (select count(*) from information_schema.columns where table_schema = 'public'
     and ((table_name = 'consejo_referencias' and column_name in ('ampliacion', 'evaluada_at'))
       or (table_name = 'alert_preferences' and column_name = 'consejo'))) as columnas,
  (select count(*) from public.consejo_resumenes where estado = 'omitido') as omitidos,
  (select count(*) from public.consejo_referencias) as referencias;
