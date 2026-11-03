-- Créditos de contacto: 25 al mes por organización, no por usuario
-- (decisión de Jorge, 03-11-2026).
--
-- creditos_mensuales multiplicaba los 25 por cada miembro de la organización
-- con el Directorio activo (& Comunicas tenía 225 al mes). Ahora la bolsa de
-- una organización recibe 25 si al menos uno de sus miembros tiene el
-- Directorio, y los comparten todos. La bolsa de un usuario sin
-- organización, igual que antes.

CREATE OR REPLACE FUNCTION public.creditos_mensuales(p_bolsa bigint)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 25 * coalesce((
    select case
      when b.organization_id is not null then
        (case when exists (select 1 from organization_members m
                             join users u on u.id = m.user_id
                            where m.organization_id = b.organization_id
                              and (u.directorio_status in ('active', 'past_due') or tiene_directorio_de(m.user_id)))
              then 1 else 0 end)
      else (case when tiene_directorio_de(b.user_id) then 1 else 0 end)
    end
    from creditos_bolsas b where b.id = p_bolsa
  ), 0);
$function$;
