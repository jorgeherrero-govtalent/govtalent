-- 125. Licitaciones: el modal «Nueva búsqueda» (11-11-2026).
--
-- Funciones de lectura para los atajos del modal (sector, territorio,
-- órgano y competidores). Se ejecutan con los permisos de quien llama
-- (security invoker): la tabla ya se puede leer con sesión (sql/124).
-- «En plazo» es lo mismo que en la página: PUB o competition, con el fin
-- de presentación por llegar en hora de Madrid o sin fecha.

create index if not exists contratacion_adj_adjudicatario_trgm on public.contratacion_adjudicaciones
  using gin (adjudicatario public.gin_trgm_ops);

create or replace function public.licitaciones_en_plazo_por_sector()
returns table (division text, n bigint)
language sql stable security invoker set search_path = ''
as $$
  select d, count(*)
  from public.contratacion_expedientes e, unnest(e.cpv_div) d
  where not e.eliminado and not e.es_menor
    and e.estado in ('PUB', 'competition')
    and (e.fin_ofertas is null or e.fin_ofertas >= (now() at time zone 'Europe/Madrid'))
  group by d
$$;

create or replace function public.licitaciones_en_plazo_por_territorio()
returns table (nuts2 text, n bigint)
language sql stable security invoker set search_path = ''
as $$
  select upper(left(e.nuts, 4)), count(*)
  from public.contratacion_expedientes e
  where not e.eliminado and not e.es_menor and e.nuts is not null
    and e.estado in ('PUB', 'competition')
    and (e.fin_ofertas is null or e.fin_ofertas >= (now() at time zone 'Europe/Madrid'))
  group by 1
$$;

create or replace function public.licitaciones_buscar_organos(p_texto text default '')
returns table (organo text, total bigint, en_plazo bigint)
language sql stable security invoker set search_path = ''
as $$
  select e.organo_nombre,
         count(*),
         count(*) filter (where e.estado in ('PUB', 'competition')
                           and (e.fin_ofertas is null or e.fin_ofertas >= (now() at time zone 'Europe/Madrid')))
  from public.contratacion_expedientes e
  where not e.eliminado and e.organo_nombre is not null
    and (coalesce(trim(p_texto), '') = ''
         or e.organo_nombre ilike '%' || replace(replace(replace(trim(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  group by 1
  order by 3 desc, 2 desc
  limit 20
$$;

-- Sin personas físicas (autónomos): ni se buscan ni se listan por nombre.
create or replace function public.licitaciones_buscar_adjudicatarios(p_texto text)
returns table (adjudicatario text, contratos bigint, importe numeric)
language sql stable security invoker set search_path = ''
as $$
  select a.adjudicatario, count(distinct a.expediente_id), sum(a.importe)
  from public.contratacion_adjudicaciones a
  where not coalesce(a.persona_fisica, false)
    and a.adjudicatario is not null
    and length(trim(coalesce(p_texto, ''))) >= 2
    and a.adjudicatario ilike '%' || replace(replace(replace(trim(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  group by 1
  order by 2 desc, 3 desc nulls last
  limit 20
$$;

revoke all on function public.licitaciones_en_plazo_por_sector() from public, anon;
revoke all on function public.licitaciones_en_plazo_por_territorio() from public, anon;
revoke all on function public.licitaciones_buscar_organos(text) from public, anon;
revoke all on function public.licitaciones_buscar_adjudicatarios(text) from public, anon;
grant execute on function public.licitaciones_en_plazo_por_sector() to authenticated;
grant execute on function public.licitaciones_en_plazo_por_territorio() to authenticated;
grant execute on function public.licitaciones_buscar_organos(text) to authenticated;
grant execute on function public.licitaciones_buscar_adjudicatarios(text) to authenticated;
