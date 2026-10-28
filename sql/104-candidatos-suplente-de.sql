-- =====================================================================
-- 104 · Candidatos: suplentes del Senado por titular
--
-- En el Senado cada candidato lleva sus propios suplentes («Suplente 1»,
-- «Suplente 2»). Con la clave de sql/83 el «Suplente 1» del segundo
-- candidato pisaba al del primero. suplente_de = número del titular.
-- =====================================================================
alter table public.candidatos add column if not exists suplente_de smallint not null default 0;
comment on column public.candidatos.suplente_de is 'Senado: número del titular al que sustituye este suplente (cada candidato al Senado tiene los suyos). 0 en el Congreso y en los titulares.';
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.candidatos'::regclass and contype = 'u' loop
    execute format('alter table public.candidatos drop constraint %I', c);
  end loop;
end $$;
alter table public.candidatos add constraint candidatos_clave_key unique (eleccion, camara, circunscripcion, candidatura, suplente, suplente_de, orden);
