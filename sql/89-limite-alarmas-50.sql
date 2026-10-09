-- =====================================================================
-- 89 — Límite de alarmas según el plan de Vigilancia (09-10-2026)
--
-- limite_alarmas() seguía con el tope antiguo (3 para Pro). Pasa a 50,
-- igual que lib/alarmas.js (alarmasIncluidas(1) en lib/precios.js).
-- Free sigue en 1. El trigger alarmas_limite_trg no cambia: ya lee de aquí.
-- =====================================================================

create or replace function public.limite_alarmas(p_user uuid)
returns integer
language sql
stable security definer
set search_path to 'public'
as $function$
  select case when public.nivel_avisos_de(p_user) = 'pro' then 50 else 1 end;
$function$;
