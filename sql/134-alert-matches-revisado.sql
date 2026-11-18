-- «Por revisar» (Novedades): el tic de revisado. Quita el asunto de la
-- bandeja sin descartarlo: el agente puede seguir trayéndolo y se ve en la
-- edición del agente. Distinto de `visto` (el punto de «nuevo») y de
-- `descartado` (que enseña al agente a no volver a traerlo).
alter table public.sector_alert_matches
  add column if not exists revisado boolean not null default false;

-- La tabla da UPDATE por columnas a `authenticated` (descartado, visto…):
-- sin esto el tic fallaba con «No se ha podido guardar».
grant update (revisado) on public.sector_alert_matches to authenticated;
