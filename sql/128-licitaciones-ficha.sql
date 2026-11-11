-- 128. Licitaciones: ficha propia (11-11-2026).
-- En Seguimiento, una licitación seguida lleva a su ficha en GovTalent
-- (/licitaciones/<fuente>/<id>) en vez de a la Plataforma o a TED.

do $$
declare
  d text := pg_get_viewdef('public.my_follows'::regclass);
  antes text := d;
begin
  d := replace(d, $a$WHEN 'licitacion'::text THEN ( SELECT c.url
               FROM contratacion_expedientes c
              WHERE (c.id = f.ref_id))$a$, $a$WHEN 'licitacion'::text THEN ('/licitaciones/'::text || replace(f.ref_id, ':'::text, '/'::text))$a$);
  if d = antes then
    if position('/licitaciones/' in d) > 0 then return; end if;
    raise exception 'my_follows: no encuentro la ruta de licitacion';
  end if;
  execute 'create or replace view public.my_follows with (security_invoker = true) as ' || d;
end $$;
