-- =====================================================================
-- 97 · Búsqueda de personas fuera de GovTalent por cargo (13-10-2026)
--
-- Cada búsqueda («secretarios del Departament de Territori…») guarda lo
-- que devolvió la IA, para dar de alta después solo a quien el usuario
-- seleccione y para medir coste. 2 créditos por búsqueda, solo si
-- encuentra a alguien nuevo (decisión de Jorge).
-- =====================================================================

create table if not exists public.descubrimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  q text not null,
  personas jsonb not null default '[]'::jsonb,
  nuevos integer not null default 0,
  cobrado boolean not null default false,
  coste_usd numeric(10,5),
  created_at timestamptz not null default now()
);
create index if not exists descubrimientos_user_idx on public.descubrimientos (user_id, created_at desc);
alter table public.descubrimientos enable row level security;
-- Sin políticas: solo el servidor.

-- 98 · Diagnóstico de cada búsqueda (stop_reason, búsquedas, cómo se leyó
-- el JSON y el final de la respuesta), para revisar las que salen vacías.
alter table public.descubrimientos add column if not exists diagnostico jsonb;
