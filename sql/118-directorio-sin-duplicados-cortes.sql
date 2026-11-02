-- =====================================================================
-- 118. Directorio: fuera los diputados duplicados de Aragón, Canarias,
--      Castilla y León y Castilla-La Mancha
--
-- Estos cuatro parlamentos estaban en el directorio por los Excel del
-- directorio público (fuentes_personas, 15-10-2026). Con su composición
-- ya en ccaa_diputados (lectores y sql/117), cada diputado saldría dos
-- veces, y el Excel tiene además a quien ya no es diputado (p. ej. quien
-- pasó al Gobierno). Como con Madrid:
--   1. el correo del Excel pasa al diputado si este no tiene. Casa por
--      clave_persona() o, si el Excel abrevia el nombre («Pilar Alegría
--      Continente» / «María Pilar Alegría Continente»), por los dos
--      apellidos más un nombre de pila en común; nunca por un apellido
--      suelto;
--   2. se borran del Excel las filas de diputado y de Mesa de esas
--      Cámaras («Diputada de las Cortes de Aragón por Teruel», «Secretario
--      Primero del Parlamento de Canarias»…): la composición oficial
--      manda. Se quedan el personal de las Cámaras y los cargos que no son
--      de la Cámara (Procurador del Común, Diputada del Común, consejos…).
-- Antes de borrar se comprobó que ninguna de esas filas estaba en listas,
-- enriquecida ni revelada.
-- =====================================================================

-- 1. Correos.
with fp as (
  select f.id, f.nombre, f.email,
    case f.institucion
      when 'Cortes de Aragón' then 'aragon' when 'Parlamento de Canarias' then 'canarias'
      when 'Cortes de Castilla y León' then 'castillayleon' when 'Cortes de Castilla-La Mancha' then 'castillalamancha' end as p,
    string_to_array(lower(unaccent(f.nombre)), ' ') as w
  from public.fuentes_personas f
  where f.institucion in ('Cortes de Aragón', 'Parlamento de Canarias', 'Cortes de Castilla y León', 'Cortes de Castilla-La Mancha')
    and f.banda = 'electo' and f.email ~ '@'
),
dp as (
  select d.id, d.nombre, d.parlamento as p, string_to_array(lower(unaccent(d.nombre)), ' ') as w
  from public.ccaa_diputados d
  where d.activo and d.email is null and d.parlamento in ('aragon', 'canarias', 'castillayleon', 'castillalamancha')
),
casan as (
  select distinct on (dp.id) dp.id, fp.email
  from dp join fp on fp.p = dp.p and (
    public.clave_persona(fp.nombre) = public.clave_persona(dp.nombre)
    or (fp.w[array_length(fp.w, 1) - 1:] = dp.w[array_length(dp.w, 1) - 1:]
        and array_length(fp.w, 1) >= 3 and array_length(dp.w, 1) >= 3
        and (fp.w[1] = any(dp.w[1:array_length(dp.w, 1) - 2]) or dp.w[1] = any(fp.w[1:array_length(fp.w, 1) - 2]))))
  order by dp.id, fp.email
)
update public.ccaa_diputados d set email = c.email, updated_at = now()
from casan c where d.id = c.id;

-- 2. Filas de diputado y de Mesa del Excel.
delete from public.fuentes_personas f
where f.institucion in ('Cortes de Aragón', 'Parlamento de Canarias', 'Cortes de Castilla y León', 'Cortes de Castilla-La Mancha')
  and f.banda = 'electo'
  and (f.cargo ~* '^(diputad[oa]|procurador[a]?) (de las cortes|del parlamento)'
       or f.cargo ~* '^(president[ea]|vicepresident[ea]|secretari[oa])( (primer|segund|tercer)[oa])? (de las cortes|del parlamento)');
