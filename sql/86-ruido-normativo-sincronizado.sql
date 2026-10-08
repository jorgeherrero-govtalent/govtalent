-- =====================================================================
-- 86 · Ruido normativo: la función SQL vuelve a ser copia exacta del JS
--
-- lib/ruidoNormativo.js ganó patrones el 08-10-2026 (inscripciones,
-- plazos de ejecución, sanciones, «convocan pruebas», ejecución de
-- sentencias) que no estaban en es_ruido_normativo() (sql/85). La función
-- decide qué documentos de la sección III del BOE están activos para las
-- alarmas; los diarios autonómicos ya se filtran en JS al leerlos.
--
-- Generada a partir de lib/ruidoNormativo.js. Misma excepción (SALVO)
-- mirada solo en el acto principal.
-- =====================================================================

create or replace function public.es_ruido_normativo(titulo text)
returns boolean
language sql
stable
as $fn$
  select case
    when t is null or t = '' then false
    when acto ~ 'bases reguladoras|por (el|la) que se (aprueba|regula|establece|desarrolla|modifica (el|la) (decreto|orden|reglamento))'
         and t !~ '^extracto\y|\yconvenios?\y|\yadenda\y' then false
    else (
         t ~ '\yconvenio\y|\yconvenios\y|\yadenda\y|encomienda de gestion|protocolo general de actuacion|acuerdo de colaboracion'
      or t ~ 'autorizacion administrativa|se autoriza\y|se otorga|modifica la autorizacion|autorizacion de apertura|autoriza la apertura|inscrib|inscripcion|registro de (fundaciones|asociaciones|cooperativas)|se clasifica|homologa|se acredita|acreditacion de|reconocimiento de (entidad|la condicion)|declara(n)?,? en concreto,? de utilidad publica|utilidad publica|extincion de la fundacion|ratifica el acuerdo de extincion'
      or t ~ 'emplaza|recurso contencioso|se notifica|notificacion|archivo del expediente|se acuerda el archivo|declara desierta|deja sin efecto la convocatoria|(ejecucion|cumplimiento) de (la )?sentencia'
      or t ~ '\ypremios?\y|\ybecas?\y|distincion|medalla|condecoracion'
      or t ~ 'comision de valoracion|tribunal calificador|se designan? (a )?(la|las|los|el)? ?(vocal|miembros)|vocalia|se nombran las personas vocales'
      or t ~ 'cuentas anuales|delegacion de (competencias|firma)|se delegan? (competencias|la firma)|rendicion de cuentas|estado de ejecucion|ejecucion del presupuesto|liquidacion (del |de la )?(consorcio|entidad|fundacion)'
      or t ~ 'resuelve la convocatoria|se resuelve la concesion|se conceden?\y|relacion de (beneficiarios|titulares|personas)|beneficiari|amplia el plazo de (ejecucion|justificacion)|plazos? de ejecucion|reintegro|perdida del derecho|sancion(es)? impuesta|expediente sancionador|convocan? pruebas|pruebas para la obtencion'
      or t ~ '^extracto\y'
      or t ~ 'plan(es)? de estudios|cambios del euro|real carta de sucesion|derecho de tanteo|vacante de academico|bien de interes cultural|estatutos de (la |el )?(mancomunidad|fundacion|asociacion|colegio|consorcio)|numero de identificacion fiscal|tipo de interes efectivo|efectos postales|\ysellos?\y|loteria|sorteo|listado definitivo'
      or t ~ 'recurso interpuesto contra|nota de calificacion|calificacion (negativa|registral)|resultados de las subastas|subastas de (bonos|letras|obligaciones)|tipo de rendimiento|carta de servicios|(rehabilitacion|revocacion) de (los )?numeros? de identificacion|se aprueban y se anulan'
      or t ~ '(declaracion|informe) de impacto ambiental|evaluacion ambiental (simplificada|ordinaria) del proyecto'
    )
  end
  from (
    select t,
           substr(t, 1, 1) || regexp_replace(substr(t, 2), '\y(en|de|por|mediante|segun) (la |el )?(orden|resolucion|decreto|ley|acuerdo|real decreto)\y.*$', '') as acto
    from (select unaccent(lower(titulo)) as t) y
  ) x
$fn$;

-- Comprobación: documentos de la sección III del BOE que siguen activos
-- en los últimos 28 días (con sql/85 eran 93).
select count(*) filter (where not public.es_ruido_normativo(titulo)) as boe_iii_activos,
       count(*) as boe_iii_total
  from public.boe_documents
 where seccion = '3' and not derogado and fecha_publicacion >= current_date - 28;
