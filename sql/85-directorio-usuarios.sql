-- =====================================================================
-- 85 · Usuarios adicionales del Directorio (maqueta A, 08-10-2026)
--
-- El titular del Directorio (350 €/año, 1 usuario) da acceso a otras
-- personas por su correo, a 80 €/año cada una, en la misma suscripción
-- de Stripe (prorrateado hasta su renovación). Quitar a alguien no
-- devuelve nada: deja de pagarse en la renovación.
--
-- · directorio_accesos: a quién ha dado acceso cada titular. Se casa por
--   correo, así que vale aunque la persona aún no tenga cuenta.
-- · tiene_directorio_de: también quien figura en los accesos de un
--   titular con el Directorio activo.
-- · creditos_bolsa_id: quien tiene acceso por un titular gasta de la bolsa
--   del titular (los 25 créditos son de la suscripción).
-- =====================================================================

create table if not exists public.directorio_accesos (
  id bigserial primary key,
  titular_id uuid not null references public.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists directorio_accesos_email_idx on public.directorio_accesos (lower(email));
create index if not exists directorio_accesos_titular_idx on public.directorio_accesos (titular_id);
alter table public.directorio_accesos enable row level security;
grant all on public.directorio_accesos to service_role;
grant usage, select on sequence public.directorio_accesos_id_seq to service_role;

alter table public.users add column if not exists directorio_usuarios_extra integer not null default 0;

-- El titular cuyo Directorio usa una persona (ella misma si lo tiene propio).
create or replace function public.directorio_titular_de(p_user uuid)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select u.id from users u where u.id = p_user and u.directorio_status in ('active', 'past_due')),
    (select a.titular_id
       from directorio_accesos a
       join users t on t.id = a.titular_id and t.directorio_status in ('active', 'past_due')
       join users u on u.id = p_user
      where lower(a.email) = lower(u.email)
      limit 1)
  );
$function$;

create or replace function public.tiene_directorio_de(p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select directorio_titular_de(p_user) is not null
  or exists (
    select 1
    from organization_members m
    join organizations o on o.id = m.organization_id
    where m.user_id = p_user
      and o.plan = 'teams'
      and o.plan_status in ('active', 'trialing', 'past_due')
  );
$function$;

create or replace function public.creditos_bolsa_id(p_user uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid;
  v_id bigint;
  v_titular uuid;
begin
  -- Con acceso por un titular: la bolsa del titular.
  v_titular := directorio_titular_de(p_user);
  if v_titular is not null and v_titular <> p_user then
    p_user := v_titular;
  end if;

  select m.organization_id into v_org
    from organization_members m
   where m.user_id = p_user
   order by m.created_at asc
   limit 1;

  if v_org is not null then
    insert into creditos_bolsas (organization_id) values (v_org) on conflict (organization_id) do nothing;
    select id into v_id from creditos_bolsas where organization_id = v_org;
  else
    insert into creditos_bolsas (user_id) values (p_user) on conflict (user_id) do nothing;
    select id into v_id from creditos_bolsas where user_id = p_user;
  end if;
  return v_id;
end;
$function$;

revoke all on function public.directorio_titular_de(uuid) from public, anon, authenticated;
grant execute on function public.directorio_titular_de(uuid) to service_role;
