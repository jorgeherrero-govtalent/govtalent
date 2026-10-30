-- 113: fuera el separador «·» de todo lo que genera la base de datos.
--
-- Decisión de Jorge (30-10-2026): el punto medio no aparece en ningún sitio
-- de GovTalent. Mismo criterio que en los correos (27-10-2026): listas con
-- coma. No se toca la ele geminada del catalán («Col·legi», «Intel·ligència»),
-- que es ortografía y no un separador: solo se cambia « · » con espacios.
--
-- 1. Vistas. Se regeneran desde su definición actual cambiando solo los
--    literales del separador, para no reescribir a mano vistas de cientos de
--    líneas. Mismas columnas, así que las vistas dependientes no cambian.
--    Casos especiales:
--      directorio_pro: «Equipo de X · PPE» → «Equipo de X (PPE)» y
--                      «Asistentes en agrupación · PPE» → «… (PPE)».
--      actor_search:   «Grupo parlamentario · Congreso» → «… del Congreso».
-- 2. grupo_contacto(): saca el grupo del paréntesis final en lugar de lo que
--    iba tras el último «·».
-- 3. Datos guardados con « · » como separador → «, ».

do $$
declare
  v record;
  def text;
  opts text;
begin
  for v in
    select c.oid, c.relname, c.reloptions
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and c.relname in ('regulatorio_search', 'regulatorio_reciente', 'search_index',
                        'my_follows', 'actor_search', 'directorio_pro')
    order by array_position(array['regulatorio_search', 'regulatorio_reciente', 'search_index',
                                  'my_follows', 'actor_search', 'directorio_pro'], c.relname::text)
  loop
    def := pg_get_viewdef(v.oid, true);
    def := replace(def,
      $a$COALESCE(' · '::text || r.grupo, ''::text)$a$,
      $a$COALESCE((' ('::text || r.grupo) || ')'::text, ''::text)$a$);
    def := replace(def,
      $a$'Asistentes en agrupación · '::text || COALESCE(r.grupo, 'Parlamento Europeo'::text)$a$,
      $a$('Asistentes en agrupación ('::text || COALESCE(r.grupo, 'Parlamento Europeo'::text)) || ')'::text$a$);
    def := replace(def, $a$'Grupo parlamentario · Congreso'$a$, $a$'Grupo parlamentario del Congreso'$a$);
    def := replace(def, ' · ', ', ');
    if position('·' in def) > 0 then
      raise exception 'La vista % sigue teniendo «·»', v.relname;
    end if;
    opts := case when v.reloptions is null then ''
                 else ' with (' || array_to_string(v.reloptions, ', ') || ')' end;
    execute format('create or replace view public.%I%s as %s', v.relname, opts, def);
  end loop;
end $$;

create or replace function public.grupo_contacto(p_unidad text, p_jur text, p_tipo text)
returns text
language sql
immutable
as $function$
  select case
    when p_jur = 'UE' and p_tipo = 'legislativo' and nullif(trim(p_unidad), '') is not null
      then nullif(trim(coalesce(
        substring(p_unidad from '^(?:Equipo de .*|Asistentes en agrupación) \(([^()]*)\)$'),
        p_unidad)), '')
  end;
$function$;

-- 3. Datos. Solo « · » con espacios (nunca la ele geminada).
update public.activities            set lugar = replace(lugar, ' · ', ', ')                     where lugar like '% · %';
update public.activity_participants set cargo = replace(cargo, ' · ', ', ')                     where cargo like '% · %';
update public.activity_participants set nombre = replace(nombre, ' · ', ', ')                   where nombre like '% · %';
update public.boe_appointments      set nota = replace(nota, ' · ', ', ')                       where nota like '% · %';
update public.candidatos            set circunscripcion = replace(circunscripcion, ' · ', ', ') where circunscripcion like '% · %';
update public.ccaa_boletines        set titulo = replace(titulo, ' · ', ', ')                   where titulo like '% · %';
update public.ccaa_expedientes      set situacion = replace(situacion, ' · ', ', ')             where situacion like '% · %';
update public.ccaa_tramites         set descripcion = replace(descripcion, ' · ', ', ')         where descripcion like '% · %';
update public.contactos_listas      set nombre = replace(nombre, ' · ', ', ')                   where nombre like '% · %';
update public.diarios_ccaa          set seccion = replace(seccion, ' · ', ', ')                 where seccion like '% · %';
update public.directorio_contactos  set nombre = replace(nombre, ' · ', ', ')                   where nombre like '% · %';
update public.directorio_entidades  set unidad = replace(unidad, ' · ', ', ')                   where unidad like '% · %';
update public.ec_commissioners      set portfolio_es = replace(portfolio_es, ' · ', ', ')       where portfolio_es like '% · %';
update public.follow_events         set title = replace(title, ' · ', ', ')                     where title like '% · %';
update public.project_actors        set descripcion = replace(descripcion, ' · ', ', ')         where descripcion like '% · %';
update public.project_actors        set posicion_fuente = replace(posicion_fuente, ' · ', ', ') where posicion_fuente like '% · %';
update public.project_actors        set posicion_texto = replace(posicion_texto, ' · ', ', ')   where posicion_texto like '% · %';
update public.project_items         set etiqueta = replace(etiqueta, ' · ', ', ')               where etiqueta like '% · %';
update public.sector_alert_matches  set titulo = replace(titulo, ' · ', ', ')                   where titulo like '% · %';
update public.sector_alert_matches  set motivo = replace(motivo, ' · ', ', ')                   where motivo like '% · %';
update public.sync_log              set detalle = replace(detalle, ' · ', ', ')                 where detalle like '% · %';
