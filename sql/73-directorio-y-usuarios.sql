-- =====================================================================
-- 73 · Directorio como permiso propio y usuarios del plan Vigilancia
--
-- Hasta ahora los contactos (correo y teléfono de cargos y unidades) iban
-- con el plan Pro. Con el pricing de octubre de 2026 el Directorio se
-- contrata aparte (350 €/año por usuario) y el plan de pago pasa a ser
-- Vigilancia, de 1 a 50 usuarios. Este archivo:
--
--   1. Añade a users el estado de la suscripción al Directorio y el número
--      de usuarios contratados en Vigilancia.
--   2. Protege esas columnas: solo se cambian desde el servidor.
--   3. Crea tiene_directorio_de(uid) / tiene_directorio(), la única regla
--      de quién ve los contactos: Directorio propio activo, o miembro de una
--      organización Teams activa (el plan antiguo lo incluía).
--
-- users.plan = 'pro' sigue significando «plan de pago de vigilancia»: no se
-- renombra para no tocar el resto de comprobaciones.
-- =====================================================================

-- Paso 0 (solo lectura): comprobar que las columnas no existen ya.
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'users'
--    and column_name like 'directorio%' or column_name = 'plan_usuarios';

alter table public.users
  add column if not exists directorio_status text,
  add column if not exists directorio_subscription_id text,
  add column if not exists directorio_renews_at timestamptz,
  add column if not exists directorio_cancel_at_period_end boolean not null default false,
  add column if not exists plan_usuarios integer not null default 1;

alter table public.users drop constraint if exists users_directorio_status_check;
alter table public.users add constraint users_directorio_status_check
  check (directorio_status is null or directorio_status in ('active', 'past_due', 'canceled', 'incomplete'));

alter table public.users drop constraint if exists users_plan_usuarios_check;
alter table public.users add constraint users_plan_usuarios_check
  check (plan_usuarios between 1 and 50);

-- Las columnas nuevas, reservadas como las del plan.
create or replace function public.proteger_campos_users()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
DECLARE
  reservadas text[] := ARRAY[
    'id', 'email', 'role',
    'plan', 'plan_status', 'plan_started_at', 'plan_renews_at', 'cancel_at_period_end',
    'is_premium', 'premium_source', 'is_founding_member',
    'stripe_customer_id', 'stripe_subscription_id',
    'founder_draft_at', 'profile_reminder_sent_at', 'deletion_requested_at',
    'directorio_status', 'directorio_subscription_id', 'directorio_renews_at',
    'directorio_cancel_at_period_end', 'plan_usuarios'
  ];
  col text;
BEGIN
  IF NOT public.es_peticion_cliente() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'No está permitido crear usuarios desde el cliente'
      USING ERRCODE = '42501';
  END IF;

  col := public.columna_reservada_cambiada(to_jsonb(OLD), to_jsonb(NEW), reservadas);
  IF col IS NOT NULL THEN
    RAISE EXCEPTION 'La columna users.% solo se puede modificar desde el servidor', col
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

create or replace function public.tiene_directorio_de(p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from users u
    where u.id = p_user
      and u.directorio_status in ('active', 'past_due')
  ) or exists (
    select 1
    from organization_members m
    join organizations o on o.id = m.organization_id
    where m.user_id = p_user
      and o.plan = 'teams'
      and o.plan_status in ('active', 'trialing', 'past_due')
  );
$function$;

create or replace function public.tiene_directorio()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(public.tiene_directorio_de(auth.uid()), false);
$function$;

revoke all on function public.tiene_directorio_de(uuid) from public, anon, authenticated;
grant execute on function public.tiene_directorio() to authenticated;
grant execute on function public.tiene_directorio_de(uuid) to service_role;
