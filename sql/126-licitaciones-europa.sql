-- 126. Licitaciones: instituciones de la UE (11-11-2026).
--
-- De TED entraban solo los poderes adjudicadores españoles. Desde ahora
-- entran también las instituciones, órganos y agencias de la UE (los
-- organismos de otros países de la UE, no: decisión de Jorge). Cada
-- expediente lleva:
--   pais   ISO 3166 alfa-3 del comprador; en PLACSP, ESP.
--   ambito espana | ue.

alter table public.contratacion_expedientes add column if not exists pais text;
alter table public.contratacion_expedientes add column if not exists ambito text not null default 'espana';
update public.contratacion_expedientes set pais = 'ESP' where pais is null;
create index if not exists contratacion_exp_ambito_idx on public.contratacion_expedientes (ambito);
