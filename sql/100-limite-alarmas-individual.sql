-- =====================================================================
-- 100 · Plan individual: 6 alarmas activas a la vez (15-10-2026)
--
-- Con las horquillas de Vigilancia (lib/precios.js) cada alarma activa
-- usa 20 créditos al mes, así que las alarmas que se pueden ACTIVAR salen
-- de los créditos del plan, salvo la individual, que tiene un tope propio
-- de 6 (150 créditos, 30 libres para el Asistente): hasta 3 500 (25), hasta 6
-- 800 (40), hasta 10 1.200 (60), hasta 15 1.600 (80). users.plan_usuarios
-- guarda el tope de la horquilla (webhook de Stripe).
--
-- Solo afecta al trigger alarmas_limite (activar). La vigilancia no deja
-- de evaluar alarmas ya activas.
-- Si cambian los créditos en lib/precios.js, hay que cambiarlos aquí.
-- =====================================================================

create or replace function public.limite_alarmas(p_user uuid)
returns integer
language sql
stable security definer
set search_path to 'public'
as $$
  select case
    when public.nivel_avisos_de(p_user) <> 'pro' then 1
    else coalesce((
      select (case
        when coalesce(u.plan_usuarios, 1) <= 1 then 120  -- 6 alarmas (tope propio de la individual)
        when u.plan_usuarios <= 3 then 500
        when u.plan_usuarios <= 6 then 800
        when u.plan_usuarios <= 10 then 1200
        else 1600
      end) / 20
      from users u where u.id = p_user
     ), 6)
  end;
$$;
