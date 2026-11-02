-- 114: registro de búsquedas del buscador de Contactos.
--
-- Petición de Jorge (02-11-2026): saber qué contactos buscan los usuarios y
-- si aparecen. Hasta ahora solo quedaba el recuento de usos de la IA
-- (ai_usage_log, endpoint 'contactos-busqueda'), sin el texto ni el
-- resultado. Las búsquedas «fuera de GovTalent» ya se guardan en
-- descubrimientos.
--
-- Una fila por búsqueda nueva (primera página de unos filtros distintos).
-- Paginar no crea filas; cambiar un filtro sí (origen 'filtros').
-- La escribe solo /api/contactos/buscar con la clave de servicio: RLS
-- activado y sin políticas, nadie lo lee desde el navegador.

create table if not exists public.contactos_busquedas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  consulta           text check (char_length(consulta) <= 500),
  origen             text not null default 'filtros' check (origen in ('frase', 'idea', 'filtros')),
  filtros            jsonb not null default '{}'::jsonb,
  persona            text check (char_length(persona) <= 200),
  persona_encontrada boolean,
  total              integer not null default 0,
  en_pagina          integer not null default 0,
  con_correo         integer not null default 0,
  con_enriquecido    integer not null default 0,
  con_probable       integer not null default 0,
  created_at         timestamptz not null default now()
);

comment on table public.contactos_busquedas is
  'Búsquedas del buscador de Contactos (sql/114). consulta = frase escrita; origen frase|idea|filtros; persona = nombre que interpretó la IA y persona_encontrada si sale en la primera página; con_* cuentan solo la primera página.';

create index if not exists contactos_busquedas_creada on public.contactos_busquedas (created_at desc);
create index if not exists contactos_busquedas_usuario on public.contactos_busquedas (user_id, created_at desc);

alter table public.contactos_busquedas enable row level security;
revoke all on public.contactos_busquedas from anon, authenticated;

-- Misma conservación que page_views: 12 meses.
select cron.schedule(
  'purgar-contactos-busquedas',
  '19 3 * * *',
  $$delete from public.contactos_busquedas where created_at < now() - interval '12 months'$$
);
