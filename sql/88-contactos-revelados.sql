-- =====================================================================
-- 88 · Correos revelados por equipo (09-10-2026)
--
-- Un correo encontrado con «Buscar correo» / «Enriquecer» se guarda en la
-- caché compartida (contactos_enriquecidos), pero cada equipo (su bolsa de
-- créditos) paga 1 crédito la primera vez que lo ve. Después, ni esa
-- persona ni nadie de su equipo vuelve a pagarlo.
-- =====================================================================

create table if not exists public.contactos_revelados (
  bolsa_id bigint not null,
  persona_id text not null,
  created_at timestamptz not null default now(),
  primary key (bolsa_id, persona_id)
);
alter table public.contactos_revelados enable row level security;
grant all on public.contactos_revelados to service_role;

-- Quien ya lo encontró lo conserva.
insert into public.contactos_revelados (bolsa_id, persona_id)
select distinct public.creditos_bolsa_id(e.creado_por), e.persona_id
  from public.contactos_enriquecidos e
 where e.estado = 'encontrado' and e.email is not null and e.creado_por is not null
on conflict do nothing;
