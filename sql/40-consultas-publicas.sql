-- 40-consultas-completo.sql
-- Completa consultas_publicas con actores, resumen y las vistas que
-- alimentan la pantalla y las alertas.
--
-- Idempotente: crea la tabla base si 39-consultas-publicas.sql no llego a
-- ejecutarse, y solo anade lo que falte si ya existe.
--
-- Ejecutar los bloques POR SEPARADO.


-- =====================================================================
-- BLOQUE 1 — TABLA BASE (por si falta)
-- =====================================================================

create table if not exists consultas_publicas (
  id                bigserial primary key,
  ministerio        text        not null,
  fuente_id         bigint      references organigrama_fuentes(id) on delete set null,
  unidad_id         bigint      references organigrama_unidades(id) on delete set null,
  tipo              text        not null
                    check (tipo in ('consulta_previa', 'audiencia_publica')),
  titulo            text        not null,
  referencia        text,
  fecha_inicio      date,
  fecha_fin         date,
  buzon             text,
  asunto_requerido  text,
  url_documento     text,
  url_origen        text        not null,
  fecha_captura     timestamptz not null default now(),
  nota              text,
  created_at        timestamptz not null default now(),
  unique (url_origen, titulo)
);

-- Resumen generado con IA a partir del texto del proyecto. Se guarda la
-- fecha para poder regenerarlo cuando cambie el documento, y no volver a
-- pagar por lo mismo mientras no cambie.
alter table consultas_publicas add column if not exists resumen text;
alter table consultas_publicas add column if not exists resumen_generado_at timestamptz;
alter table consultas_publicas add column if not exists documento_hash text;

-- Detectada por primera vez: es lo que distingue "nueva" de "ya la viste"
-- en la alerta diaria. fecha_captura se pisa en cada re-lectura; esta no.
alter table consultas_publicas add column if not exists detectada_at timestamptz not null default now();

create index if not exists idx_consultas_fin on consultas_publicas (fecha_fin desc nulls last);
create index if not exists idx_consultas_ministerio on consultas_publicas (ministerio, tipo);
create index if not exists idx_consultas_detectada on consultas_publicas (detectada_at desc);


-- =====================================================================
-- BLOQUE 2 — ACTORES
--
-- Un actor es una unidad del organigrama implicada en la consulta.
-- `fundamento` distingue de donde sale: del buzon, de la referencia del
-- expediente, del texto, o de recorrer la cadena de mando. Sin ese campo
-- no se puede justificar por que aparece un organo en la lista.
-- =====================================================================

create table if not exists consulta_actores (
  id            bigserial primary key,
  consulta_id   bigint      not null references consultas_publicas(id) on delete cascade,
  unidad_id     bigint      references organigrama_unidades(id) on delete cascade,

  -- Cuando el organo se cita pero no existe en el organigrama, se guarda
  -- el nombre en crudo y unidad_id queda null. Esas filas son la cola de
  -- altas pendientes: el uso dice que unidades faltan.
  nombre_crudo  text,

  fundamento    text        not null
                check (fundamento in ('buzon', 'referencia', 'texto', 'cadena_mando', 'manual')),
  detalle       text,
  confianza     numeric(3,2),
  created_at    timestamptz not null default now(),
  unique (consulta_id, unidad_id, fundamento)
);

create index if not exists idx_consulta_actores on consulta_actores (consulta_id);


-- =====================================================================
-- BLOQUE 3 — VISTA PRINCIPAL
--
-- El estado se calcula, no se guarda: guardarlo obligaria a un cron solo
-- para pasar de abierta a cerrada.
--
-- Los dias son NATURALES. El computo en habiles depende del calendario de
-- festivos, que sigue siendo la pregunta abierta con la CTBG.
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
  (select count(*) from consulta_actores a where a.consulta_id = c.id) as n_actores
from consultas_publicas c
left join organigrama_fuentes f on f.id = c.fuente_id;


-- =====================================================================
-- BLOQUE 4 — VISTA PARA LA ALERTA DIARIA
--
-- Dos motivos de aviso, y conviene que sean distintos: una consulta nueva
-- es una oportunidad; una a punto de vencer es un riesgo de perder el
-- plazo. La alerta debe poder tratarlos distinto.
-- =====================================================================

create or replace view consultas_alertables as
select
  e.*,
  case
    when e.detectada_at > now() - interval '24 hours' then 'nueva'
    when e.estado = 'urgente'                          then 'vence_pronto'
  end as motivo
from consultas_estado e
where e.estado in ('abierta', 'urgente')
  and (e.detectada_at > now() - interval '24 hours' or e.estado = 'urgente');


-- =====================================================================
-- BLOQUE 5 — PERMISOS
-- RLS activado y politica desde el principio: sin politica la lectura
-- publica devuelve cero filas sin dar error, que es lo que nos costo la
-- tarde con organigrama_unidades.
-- =====================================================================

alter table consultas_publicas enable row level security;
alter table consulta_actores  enable row level security;

drop policy if exists "lectura publica consultas_publicas" on consultas_publicas;
create policy "lectura publica consultas_publicas"
  on consultas_publicas for select to anon, authenticated using (true);

drop policy if exists "lectura publica consulta_actores" on consulta_actores;
create policy "lectura publica consulta_actores"
  on consulta_actores for select to anon, authenticated using (true);

grant select on consultas_publicas, consulta_actores to anon, authenticated;
grant select on consultas_estado, consultas_alertables to anon, authenticated;
grant all privileges on table consultas_publicas, consulta_actores to service_role;
grant usage, select on sequence consultas_publicas_id_seq, consulta_actores_id_seq to service_role;


-- =====================================================================
-- BLOQUE 6 — COMPROBACION
-- =====================================================================

-- 6.1 Las tres de Sanidad, con su plazo.
-- select tipo, estado, dias_restantes, fecha_fin, buzon, left(titulo, 70)
-- from consultas_estado order by fecha_fin;

-- 6.2 Que se alertaria hoy.
-- select motivo, ministerio, dias_restantes, left(titulo, 60)
-- from consultas_alertables order by dias_restantes;
