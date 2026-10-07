-- =====================================================================
-- 76 · Enriquecer contactos con IA y listas que avisan de los cambios
--
-- ENRIQUECER (fase 3). Claude busca el contacto en fuentes oficiales con
-- búsqueda web y solo puede devolver un dato escrito en una página; el
-- servidor lo comprueba. El resultado se guarda en una caché COMPARTIDA
-- (contactos_enriquecidos): si otro cliente ya enriqueció a esa persona,
-- el siguiente lo ve gratis. Un crédito por persona, solo si se encuentra
-- algo (sql/75, creditos_consumir).
--
-- LISTAS (fase 4). Una lista guarda personas de directorio_pro con una
-- foto de sus datos al añadirlas. Los cambios se calculan comparando esa
-- foto con el dato actual:
--   salida      la persona ya no figura en la fuente (cese, relevo…)
--   cargo       ha cambiado su cargo, unidad o institución
--   contacto    ha cambiado su correo o teléfono
--   incorporación  (listas creadas desde una búsqueda) alguien nuevo que
--               cumple los filtros guardados y no está en la lista
-- La lista es de la organización del usuario si pertenece a una (la ven
-- y editan todos sus miembros), como la bolsa de créditos.
--
-- Todo es solo de servidor (RLS sin políticas, funciones para service_role).
--
-- Paso 0 (solo lectura):
--   select table_name from information_schema.tables
--    where table_schema = 'public' and table_name like 'contactos_%';
-- =====================================================================

-- --- Enriquecer -------------------------------------------------------
create table if not exists public.contactos_enriquecidos (
  id bigserial primary key,
  persona_id text not null unique,          -- id de directorio_pro
  nombre text,
  institucion text,
  estado text not null check (estado in ('encontrado', 'no_encontrado')),
  email text,
  telefono text,
  tipo text check (tipo is null or tipo in ('personal', 'cargo', 'unidad', 'generico')),
  fuente_url text,
  verificado boolean,
  notas text,
  coste_usd numeric(10, 5),
  creado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.contactos_enriquecidos enable row level security;
grant all on public.contactos_enriquecidos to service_role;
grant usage, select on sequence public.contactos_enriquecidos_id_seq to service_role;

-- Filas de directorio_pro por id (para la foto de una lista o para
-- enriquecer). Sin objeciones.
create or replace function public.contactos_por_ids(p_ids text[])
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(to_jsonb(d) - 'objecion'), '[]'::jsonb)
    from directorio_pro d
   where d.id = any(p_ids) and not d.objecion;
$function$;

-- --- Listas -----------------------------------------------------------
create table if not exists public.contactos_listas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  consulta text,                     -- la frase con la que se creó
  filtros jsonb,                     -- si se creó desde una búsqueda
  descartados text[] not null default '{}',  -- incorporaciones descartadas
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contactos_listas_owner_idx on public.contactos_listas (owner_id);
create index if not exists contactos_listas_org_idx on public.contactos_listas (organization_id);

create table if not exists public.contactos_lista_miembros (
  lista_id uuid not null references public.contactos_listas(id) on delete cascade,
  persona_id text not null,
  snapshot jsonb not null,           -- la fila de directorio_pro al añadirla
  mantener_salida boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (lista_id, persona_id)
);

alter table public.contactos_listas enable row level security;
alter table public.contactos_lista_miembros enable row level security;
grant all on public.contactos_listas, public.contactos_lista_miembros to service_role;

-- ¿Puede este usuario ver y editar la lista? La suya, o la de una de sus
-- organizaciones.
create or replace function public.lista_accesible(p_lista uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from contactos_listas l
     where l.id = p_lista
       and (l.owner_id = p_user
            or (l.organization_id is not null and exists (
                  select 1 from organization_members m
                   where m.organization_id = l.organization_id and m.user_id = p_user)))
  );
$function$;

-- Estado de una lista: sus miembros con el dato actual y el tipo de
-- cambio, y las incorporaciones si se creó desde una búsqueda.
create or replace function public.lista_estado(p_lista uuid, p_max_incorporaciones integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  l contactos_listas;
  v_ids text[];
  v_actuales jsonb;
  v_miembros jsonb;
  v_inc jsonb := '[]'::jsonb;
  v_n_inc integer := 0;
begin
  select * into l from contactos_listas where id = p_lista;
  if not found then return null; end if;

  select array_agg(persona_id) into v_ids from contactos_lista_miembros where lista_id = p_lista;

  with actual as (
    select d.id, to_jsonb(d) - 'objecion' as fila
      from directorio_pro d
     where d.id = any(coalesce(v_ids, '{}')) and not d.objecion
  ),
  enr as (
    select e.persona_id, to_jsonb(e) - 'creado_por' - 'coste_usd' as fila
      from contactos_enriquecidos e
     where e.persona_id = any(coalesce(v_ids, '{}')) and e.estado = 'encontrado'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'persona_id', m.persona_id,
           'snapshot', m.snapshot,
           'actual', a.fila,
           'enriquecido', e.fila,
           'added_at', m.added_at,
           'cambio', case
             when a.fila is null then case when m.mantener_salida then null else 'salida' end
             when coalesce(a.fila->>'cargo', '') <> coalesce(m.snapshot->>'cargo', '')
               or coalesce(a.fila->>'unidad', '') <> coalesce(m.snapshot->>'unidad', '')
               or coalesce(a.fila->>'institucion', '') <> coalesce(m.snapshot->>'institucion', '') then 'cargo'
             when coalesce(a.fila->>'email', '') <> coalesce(m.snapshot->>'email', '')
               or coalesce(a.fila->>'email_unidad', '') <> coalesce(m.snapshot->>'email_unidad', '')
               or coalesce(a.fila->>'telefono', '') <> coalesce(m.snapshot->>'telefono', '') then 'contacto'
             else null end
         ) order by m.added_at, m.persona_id), '[]'::jsonb)
    into v_miembros
    from contactos_lista_miembros m
    left join actual a on a.id = m.persona_id
    left join enr e on e.persona_id = m.persona_id
   where m.lista_id = p_lista;

  if l.filtros is not null then
    with r as (select buscar_contactos(l.filtros, 0, 2000) as res),
    nuevos as (
      select f
        from r, jsonb_array_elements(r.res->'filas') f
       where not (f->>'id' = any(coalesce(v_ids, '{}')))
         and not (f->>'id' = any(l.descartados))
    )
    select count(*)::int,
           coalesce((select jsonb_agg(n.f) from (select f from nuevos limit greatest(p_max_incorporaciones, 0)) n), '[]'::jsonb)
      into v_n_inc, v_inc
      from nuevos;
  end if;

  return jsonb_build_object(
    'lista', jsonb_build_object('id', l.id, 'nombre', l.nombre, 'consulta', l.consulta, 'filtros', l.filtros,
                                'owner_id', l.owner_id, 'organization_id', l.organization_id,
                                'created_at', l.created_at, 'updated_at', l.updated_at),
    'miembros', v_miembros,
    'incorporaciones', v_inc,
    'n_incorporaciones', v_n_inc
  );
end;
$function$;

-- Resumen de las listas que ve un usuario, con sus cifras y cambios.
create or replace function public.listas_resumen(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_estado jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  for r in
    select l.id, l.nombre, l.owner_id, l.created_at, l.updated_at, l.filtros is not null as con_busqueda,
           coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email) as creada_por
      from contactos_listas l
      left join users u on u.id = l.owner_id
     where l.owner_id = p_user
        or (l.organization_id is not null and exists (
              select 1 from organization_members m where m.organization_id = l.organization_id and m.user_id = p_user))
     order by l.updated_at desc
  loop
    v_estado := lista_estado(r.id, 0);
    v_out := v_out || jsonb_build_object(
      'id', r.id,
      'nombre', r.nombre,
      'creada_por', r.creada_por,
      'mia', r.owner_id = p_user,
      'con_busqueda', r.con_busqueda,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'n_miembros', jsonb_array_length(v_estado->'miembros'),
      'n_con_email', (select count(*) from jsonb_array_elements(v_estado->'miembros') m
                       where coalesce(m->'actual'->>'email', m->'actual'->>'email_unidad', m->'enriquecido'->>'email',
                                      m->'snapshot'->>'email', m->'snapshot'->>'email_unidad') is not null),
      'n_cambios', (select count(*) from jsonb_array_elements(v_estado->'miembros') m where m->>'cambio' is not null)
                   + coalesce((v_estado->>'n_incorporaciones')::int, 0)
    );
  end loop;
  return v_out;
end;
$function$;

revoke all on function public.contactos_por_ids(text[]) from public, anon, authenticated;
revoke all on function public.lista_accesible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lista_estado(uuid, integer) from public, anon, authenticated;
revoke all on function public.listas_resumen(uuid) from public, anon, authenticated;
grant execute on function public.contactos_por_ids(text[]), public.lista_accesible(uuid, uuid),
  public.lista_estado(uuid, integer), public.listas_resumen(uuid) to service_role;
