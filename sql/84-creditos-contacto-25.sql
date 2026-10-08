-- =====================================================================
-- 84 · Créditos de contacto: 25 al mes por suscripción al Directorio
--
-- Antes eran 50 por cada usuario con Directorio. Desde el 08-10-2026 el
-- Directorio cuesta 350 € al año con un usuario y 80 € por usuario
-- adicional, y los créditos van por suscripción (no por usuario): 25 al
-- mes, compartidos por quienes tienen acceso.
--
-- Suscripciones de una bolsa = usuarios con su propio Directorio activo
-- (users.directorio_status). Si nadie lo tiene pero hay acceso por otra
-- vía (plan Teams antiguo o un puesto adicional), cuenta como una.
-- =====================================================================

create or replace function public.creditos_mensuales(p_bolsa bigint)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select 25 * coalesce((
    select case
      when b.organization_id is not null then greatest(
        (select count(*)::int from organization_members m join users u on u.id = m.user_id
          where m.organization_id = b.organization_id and u.directorio_status in ('active', 'past_due')),
        (select case when exists (select 1 from organization_members m
                                   where m.organization_id = b.organization_id and tiene_directorio_de(m.user_id))
                     then 1 else 0 end))
      else (case when tiene_directorio_de(b.user_id) then 1 else 0 end)
    end
    from creditos_bolsas b where b.id = p_bolsa
  ), 0);
$function$;
