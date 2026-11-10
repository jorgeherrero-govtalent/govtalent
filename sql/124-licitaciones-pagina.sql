-- 124. Licitaciones: la página (10-11-2026).
--
-- 1. Quien ha iniciado sesión puede leer los expedientes y las
--    adjudicaciones. Son datos públicos (PLACSP y TED); la escritura
--    sigue siendo solo del sync (service_role).
-- 2. «No me interesa»: lo que cada usuario descarta, para no volver a
--    enseñárselo. Una fila por usuario y expediente.
-- 3. Seguimiento: my_follows aprende el tipo 'licitacion' (estado,
--    fuente «Contratación pública», enlace a la ficha oficial y si sigue
--    viva). Se modifica la definición actual en vez de copiarla entera,
--    y se comprueba que cada cambio ha encontrado su sitio.

drop policy if exists contratacion_exp_lectura on public.contratacion_expedientes;
create policy contratacion_exp_lectura on public.contratacion_expedientes
  for select to authenticated using (true);
drop policy if exists contratacion_adj_lectura on public.contratacion_adjudicaciones;
create policy contratacion_adj_lectura on public.contratacion_adjudicaciones
  for select to authenticated using (true);

create table if not exists public.contratacion_descartes (
  user_id uuid not null references auth.users(id) on delete cascade,
  expediente_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, expediente_id)
);
alter table public.contratacion_descartes enable row level security;
drop policy if exists contratacion_descartes_propios on public.contratacion_descartes;
create policy contratacion_descartes_propios on public.contratacion_descartes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.contratacion_descartes from anon;
grant select, insert, delete on public.contratacion_descartes to authenticated;

-- Para buscar por texto sin recorrer la tabla entera.
-- pg_trgm ya está instalada (en public).
create index if not exists contratacion_exp_titulo_trgm on public.contratacion_expedientes
  using gin (titulo public.gin_trgm_ops);
create index if not exists contratacion_exp_organo_trgm on public.contratacion_expedientes
  using gin (organo_nombre public.gin_trgm_ops);
create index if not exists contratacion_exp_detectado_idx on public.contratacion_expedientes (detectado_en desc);

do $$
declare
  d text := pg_get_viewdef('public.my_follows'::regclass);
  antes text;
begin
  if position('''licitacion''' in d) > 0 then
    return; -- ya aplicado
  end if;

  antes := d;
  d := replace(d, $a$WHEN 'consulta'::text THEN ( SELECT r.contexto$a$,
    $a$WHEN 'licitacion'::text THEN ( SELECT
                    CASE c.estado
                        WHEN 'PUB' THEN 'En plazo'
                        WHEN 'competition' THEN 'En plazo'
                        WHEN 'PRE' THEN 'Anuncio previo'
                        WHEN 'planning' THEN 'Anuncio previo'
                        WHEN 'EV' THEN 'Pendiente de adjudicación'
                        WHEN 'ADJ' THEN 'Adjudicada'
                        WHEN 'result' THEN 'Adjudicada'
                        WHEN 'RES' THEN 'Resuelta'
                        WHEN 'ANUL' THEN 'Anulada'
                        ELSE NULL::text
                    END
               FROM contratacion_expedientes c
              WHERE (c.id = f.ref_id))
            WHEN 'consulta'::text THEN ( SELECT r.contexto$a$);
  if d = antes then raise exception 'my_follows: no encuentro el estado de consulta'; end if;

  antes := d;
  d := replace(d, $a$WHEN 'consulta'::text THEN 'Consultas públicas'::text$a$,
    $a$WHEN 'consulta'::text THEN 'Consultas públicas'::text
            WHEN 'licitacion'::text THEN 'Contratación pública'::text$a$);
  if d = antes then raise exception 'my_follows: no encuentro la fuente de consulta'; end if;

  antes := d;
  d := replace(d, $a$WHEN 'consulta'::text THEN ('/regulatorio/consultas/'::text || f.ref_id)$a$,
    $a$WHEN 'consulta'::text THEN ('/regulatorio/consultas/'::text || f.ref_id)
            WHEN 'licitacion'::text THEN ( SELECT c.url
               FROM contratacion_expedientes c
              WHERE (c.id = f.ref_id))$a$);
  if d = antes then raise exception 'my_follows: no encuentro la ruta de consulta'; end if;

  antes := d;
  d := replace(d, $a$WHEN 'consulta'::text THEN COALESCE(( SELECT r.activo$a$,
    $a$WHEN 'licitacion'::text THEN COALESCE(( SELECT ((c.estado = ANY (ARRAY['PUB'::text, 'PRE'::text, 'EV'::text, 'competition'::text, 'planning'::text])) AND (NOT c.eliminado))
               FROM contratacion_expedientes c
              WHERE (c.id = f.ref_id)), false)
            WHEN 'consulta'::text THEN COALESCE(( SELECT r.activo$a$);
  if d = antes then raise exception 'my_follows: no encuentro el activo de consulta'; end if;

  execute 'create or replace view public.my_follows with (security_invoker = true) as ' || d;
end $$;

-- 4. Filtro por sector: las divisiones CPV (los dos primeros dígitos) de
--    cada expediente, en una columna calculada con índice, para poder
--    filtrar «contiene alguna de estas divisiones» desde la API.
create or replace function public.contratacion_cpv_divisiones(c text[])
returns text[] language sql immutable parallel safe
set search_path = ''
as $$ select coalesce(array(select distinct left(x, 2) from unnest(c) x where x ~ '^\d{2}'), '{}'::text[]) $$;

alter table public.contratacion_expedientes
  add column if not exists cpv_div text[] generated always as (public.contratacion_cpv_divisiones(cpv)) stored;
create index if not exists contratacion_exp_cpv_div_idx on public.contratacion_expedientes using gin (cpv_div);
