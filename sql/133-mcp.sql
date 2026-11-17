-- =====================================================================
-- 133 · MCP — REGISTRO DE LLAMADAS
-- sql/133-mcp.sql
--
-- El MCP de GovTalent (app/api/mcp) deja que Claude, ChatGPT y otros
-- asistentes consulten y actúen en nombre de un usuario. Cada llamada a
-- una herramienta se apunta aquí: quién, desde qué asistente, qué
-- herramienta y cuándo.
--
-- Sirve para:
--   · el tope diario por usuario (lib/mcp/cuota.js), que es lo que
--     impide usar el MCP para llevarse el directorio;
--   · enseñar al usuario la última vez que se usó cada conexión;
--   · saber qué se pide de verdad.
--
-- Solo escribe y lee el servidor (service_role). El usuario ve lo suyo.
--
-- No borra ni modifica nada. Se puede ejecutar antes de desplegar el
-- código: mientras no exista, el MCP funciona igual, sin tope.
-- =====================================================================

create table if not exists public.mcp_llamadas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  client_id   text,
  herramienta text not null,
  grupo       text not null check (grupo in ('consulta', 'directorio', 'escritura')),
  created_at  timestamptz not null default now()
);

create index if not exists mcp_llamadas_usuario_fecha on public.mcp_llamadas (user_id, created_at desc);

alter table public.mcp_llamadas enable row level security;

drop policy if exists mcp_llamadas_propias on public.mcp_llamadas;
create policy mcp_llamadas_propias on public.mcp_llamadas
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant all privileges on public.mcp_llamadas to service_role;
grant select on public.mcp_llamadas to authenticated;

-- Comprobación final: debe devolver 1.
select count(*) as tablas from information_schema.tables
where table_schema = 'public' and table_name = 'mcp_llamadas';
