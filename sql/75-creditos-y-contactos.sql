-- =====================================================================
-- 75 · Créditos del Directorio y buscador de Contactos
--
-- Decisiones (07-10-2026):
--   · El Directorio (350 €/año por usuario) incluye 50 créditos al mes.
--     No se acumulan: el día 1 vuelve a haber 50 por usuario.
--   · Packs de pago único en Stripe (lookup_key creditos_100/500/1000, con
--     el número de créditos en los metadatos del precio). Los créditos
--     comprados NO caducan.
--   · Se gastan primero los del mes y después los comprados.
--   · Bolsa común: si el usuario pertenece a una organización, la bolsa es
--     de la organización (50 al mes por cada miembro con Directorio, y lo
--     que compre cualquiera de ellos es de todos). Si no, la bolsa es suya.
--   · Buscar en GovTalent es gratis. Un crédito = enriquecer una persona,
--     y solo se cobra si se encuentra algo.
--
-- Todo es solo de servidor: tablas con RLS sin políticas y funciones que
-- solo puede ejecutar service_role. El navegador pasa por /api/creditos.
--
-- Paso 0 (solo lectura):
--   select table_name from information_schema.tables
--    where table_schema = 'public' and table_name like 'creditos%';
--   select proname from pg_proc where proname like 'creditos%' or proname = 'buscar_contactos';
-- =====================================================================

create table if not exists public.creditos_bolsas (
  id bigserial primary key,
  organization_id uuid unique references public.organizations(id) on delete cascade,
  user_id uuid unique references public.users(id) on delete cascade,
  comprados integer not null default 0 check (comprados >= 0),
  mensuales_usados integer not null default 0 check (mensuales_usados >= 0),
  periodo date not null default (date_trunc('month', now()))::date,
  updated_at timestamptz not null default now(),
  constraint creditos_bolsas_un_dueno check (num_nonnulls(organization_id, user_id) = 1)
);

create table if not exists public.creditos_movimientos (
  id bigserial primary key,
  bolsa_id bigint not null references public.creditos_bolsas(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  tipo text not null check (tipo in ('consumo', 'compra', 'ajuste')),
  -- Positivo al sumar (compra, ajuste a favor), negativo al gastar.
  cantidad integer not null,
  de_mensuales integer not null default 0,
  de_comprados integer not null default 0,
  concepto text,
  -- Referencia externa única (id de la sesión de Stripe, etc.): hace
  -- idempotente la suma de una compra aunque el webhook llegue dos veces.
  referencia text unique,
  created_at timestamptz not null default now()
);
create index if not exists creditos_movimientos_bolsa_idx on public.creditos_movimientos (bolsa_id, created_at desc);

alter table public.creditos_bolsas enable row level security;
alter table public.creditos_movimientos enable row level security;
grant all on public.creditos_bolsas, public.creditos_movimientos to service_role;
grant usage, select on sequence public.creditos_bolsas_id_seq, public.creditos_movimientos_id_seq to service_role;

-- La bolsa de un usuario (la crea si no existe).
create or replace function public.creditos_bolsa_id(p_user uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid;
  v_id bigint;
begin
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

-- Créditos del mes de una bolsa: 50 por cada usuario con Directorio.
create or replace function public.creditos_mensuales(p_bolsa bigint)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select 50 * coalesce((
    select case
      when b.organization_id is not null then (
        select count(*)::int from organization_members m
         where m.organization_id = b.organization_id and tiene_directorio_de(m.user_id))
      else (case when tiene_directorio_de(b.user_id) then 1 else 0 end)
    end
    from creditos_bolsas b where b.id = p_bolsa
  ), 0);
$function$;

-- Si ha empezado un mes nuevo, vuelve a poner a cero lo gastado del mes.
create or replace function public.creditos_renovar(p_bolsa bigint)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update creditos_bolsas
     set mensuales_usados = 0, periodo = (date_trunc('month', now()))::date, updated_at = now()
   where id = p_bolsa and periodo < (date_trunc('month', now()))::date;
$function$;

create or replace function public.creditos_saldo(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_bolsa bigint := creditos_bolsa_id(p_user);
  v_mes integer;
  b creditos_bolsas;
begin
  perform creditos_renovar(v_bolsa);
  select * into b from creditos_bolsas where id = v_bolsa;
  v_mes := creditos_mensuales(v_bolsa);
  return jsonb_build_object(
    'mensuales', v_mes,
    'mensuales_usados', least(b.mensuales_usados, v_mes),
    'mensuales_disponibles', greatest(v_mes - b.mensuales_usados, 0),
    'comprados', b.comprados,
    'disponibles', greatest(v_mes - b.mensuales_usados, 0) + b.comprados,
    'compartida', b.organization_id is not null,
    'renuevan', (date_trunc('month', now()) + interval '1 month')::date
  );
end;
$function$;

-- Gasta créditos: primero los del mes, después los comprados. Atómico
-- (bloquea la fila de la bolsa). Si no hay bastantes, no gasta nada.
create or replace function public.creditos_consumir(p_user uuid, p_cantidad integer, p_concepto text, p_referencia text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_bolsa bigint := creditos_bolsa_id(p_user);
  v_mes integer;
  v_libres_mes integer;
  v_de_mes integer;
  v_de_comprados integer;
  b creditos_bolsas;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Cantidad no válida');
  end if;
  perform creditos_renovar(v_bolsa);
  select * into b from creditos_bolsas where id = v_bolsa for update;
  v_mes := creditos_mensuales(v_bolsa);
  v_libres_mes := greatest(v_mes - b.mensuales_usados, 0);

  if v_libres_mes + b.comprados < p_cantidad then
    return jsonb_build_object('ok', false, 'error', 'No quedan créditos suficientes', 'disponibles', v_libres_mes + b.comprados);
  end if;

  v_de_mes := least(v_libres_mes, p_cantidad);
  v_de_comprados := p_cantidad - v_de_mes;

  update creditos_bolsas
     set mensuales_usados = mensuales_usados + v_de_mes,
         comprados = comprados - v_de_comprados,
         updated_at = now()
   where id = v_bolsa;

  insert into creditos_movimientos (bolsa_id, user_id, tipo, cantidad, de_mensuales, de_comprados, concepto, referencia)
  values (v_bolsa, p_user, 'consumo', -p_cantidad, v_de_mes, v_de_comprados, p_concepto, p_referencia);

  return jsonb_build_object('ok', true, 'disponibles', v_libres_mes + b.comprados - p_cantidad);
end;
$function$;

-- Suma los créditos de una compra. Idempotente por la referencia (id de
-- la sesión de Checkout): una segunda llamada con la misma no suma nada.
create or replace function public.creditos_sumar_compra(p_user uuid, p_cantidad integer, p_referencia text, p_concepto text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_bolsa bigint := creditos_bolsa_id(p_user);
begin
  if p_cantidad is null or p_cantidad <= 0 or p_referencia is null then
    return jsonb_build_object('ok', false, 'error', 'Datos de compra no válidos');
  end if;
  if exists (select 1 from creditos_movimientos where referencia = p_referencia) then
    return jsonb_build_object('ok', true, 'duplicada', true);
  end if;
  insert into creditos_movimientos (bolsa_id, user_id, tipo, cantidad, de_comprados, concepto, referencia)
  values (v_bolsa, p_user, 'compra', p_cantidad, p_cantidad, coalesce(p_concepto, p_cantidad || ' créditos'), p_referencia);
  update creditos_bolsas set comprados = comprados + p_cantidad, updated_at = now() where id = v_bolsa;
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.creditos_bolsa_id(uuid) from public, anon, authenticated;
revoke all on function public.creditos_mensuales(bigint) from public, anon, authenticated;
revoke all on function public.creditos_renovar(bigint) from public, anon, authenticated;
revoke all on function public.creditos_saldo(uuid) from public, anon, authenticated;
revoke all on function public.creditos_consumir(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.creditos_sumar_compra(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.creditos_bolsa_id(uuid), public.creditos_mensuales(bigint), public.creditos_renovar(bigint),
  public.creditos_saldo(uuid), public.creditos_consumir(uuid, integer, text, text),
  public.creditos_sumar_compra(uuid, integer, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Buscador de Contactos sobre directorio_pro (la vista unificada de la
-- Base de datos: AGE, Congreso, Comisión, Parlamento Europeo, asesores y
-- la Agenda de la Comunicación, con fuente y fecha).
--
-- p_filtros (jsonb), todos opcionales:
--   terminos      [texto]  cada término tiene que aparecer en nombre,
--                          cargo, unidad, institución o área (Y entre ellos)
--   cargos        [texto]  alguno en el cargo (O)
--   instituciones [texto]  alguno en la institución (O)
--   unidades      [texto]  alguno en la unidad (O)
--   jurisdiccion  'España' | 'UE'
--   tipos         [tipo_institucion]
--   bandas        [banda]
--   solo_titulares boolean
--   provincia     texto
--   con_contacto  boolean  con correo propio o de la unidad, o teléfono
-- Devuelve { total, filas } ordenado por titular, contactabilidad y orden.
-- ---------------------------------------------------------------------
create or replace function public.buscar_contactos(p_filtros jsonb, p_desde integer default 0, p_cuantos integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_terminos text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'terminos', '[]')) x where trim(x) <> '');
  v_cargos text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'cargos', '[]')) x where trim(x) <> '');
  v_insts text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'instituciones', '[]')) x where trim(x) <> '');
  v_unids text[] := array(select unaccent(lower(x)) from jsonb_array_elements_text(coalesce(f->'unidades', '[]')) x where trim(x) <> '');
  v_tipos text[] := array(select x from jsonb_array_elements_text(coalesce(f->'tipos', '[]')) x);
  v_bandas text[] := array(select x from jsonb_array_elements_text(coalesce(f->'bandas', '[]')) x);
  v_jur text := nullif(f->>'jurisdiccion', '');
  v_prov text := nullif(unaccent(lower(f->>'provincia')), '');
  v_tit boolean := coalesce((f->>'solo_titulares')::boolean, false);
  v_cont boolean := coalesce((f->>'con_contacto')::boolean, false);
  v_res jsonb;
begin
  with base as (
    select d.*,
           unaccent(lower(concat_ws(' ', d.nombre, d.cargo, d.unidad, d.institucion, d.area))) as todo
      from directorio_pro d
     where not d.objecion
       and (v_jur is null or d.jurisdiccion = v_jur)
       and (cardinality(v_tipos) = 0 or d.tipo_institucion = any(v_tipos))
       and (cardinality(v_bandas) = 0 or d.banda = any(v_bandas))
       and (not v_tit or d.es_titular)
       and (not v_cont or coalesce(d.email, d.email_unidad, d.telefono) is not null)
       and (v_prov is null or unaccent(lower(coalesce(d.provincia, ''))) like '%' || v_prov || '%')
  ),
  filtrado as (
    select * from base b
     where (cardinality(v_terminos) = 0 or not exists (select 1 from unnest(v_terminos) t where b.todo not like '%' || t || '%'))
       and (cardinality(v_cargos) = 0 or exists (select 1 from unnest(v_cargos) t where unaccent(lower(coalesce(b.cargo, ''))) like '%' || t || '%'))
       and (cardinality(v_insts) = 0 or exists (select 1 from unnest(v_insts) t where unaccent(lower(coalesce(b.institucion, ''))) like '%' || t || '%'))
       and (cardinality(v_unids) = 0 or exists (select 1 from unnest(v_unids) t where unaccent(lower(coalesce(b.unidad, ''))) like '%' || t || '%'))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrado),
    'filas', coalesce((
      select jsonb_agg(to_jsonb(p) - 'todo' - 'objecion')
        from (select * from filtrado
               order by es_titular desc nulls last, contactabilidad desc nulls last, orden asc nulls last, nombre asc
               offset greatest(p_desde, 0) limit least(greatest(p_cuantos, 1), 2000)) p
    ), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$function$;

revoke all on function public.buscar_contactos(jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.buscar_contactos(jsonb, integer, integer) to service_role;
