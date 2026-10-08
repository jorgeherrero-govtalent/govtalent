-- =====================================================================
-- 85 · Ruido normativo: la excepción solo mira el acto
--
-- es_ruido_normativo() (sql/84) dejaba pasar actos individuales cuyo
-- título CITA una orden de bases reguladoras («se resuelve la convocatoria
-- de subvenciones contempladas en la Orden … por la que se establecen las
-- bases reguladoras»). Ahora la excepción («bases reguladoras», «por la
-- que se aprueba/regula…») se mira solo en la parte del título anterior a
-- la primera norma citada. Misma regla que lib/ruidoNormativo.js.
--
-- Además se quitan de diarios_ccaa las filas de «otras disposiciones» que
-- con la regla corregida son ruido (paso 0: cuántas y cuáles; paso 1:
-- borrado). Las del BOE no se tocan: allí la función solo decide si están
-- activas.
-- =====================================================================

create or replace function public.es_ruido_normativo(titulo text)
returns boolean
language sql
stable
as $fn$
  select case
    when t is null or t = '' then false
    -- Lo que se queda aunque case: bases reguladoras y lo que aprueba o regula
    when acto ~ 'bases reguladoras|por (el|la) que se (aprueba|regula|establece|desarrolla|modifica (el|la) (decreto|orden|reglamento))'
         and t !~ '^extracto\y|\yconvenios?\y|\yadenda\y' then false
    else (
         t ~ '\yconvenios?\y|\yadenda\y|encomienda de gestion|protocolo general de actuacion|acuerdo de colaboracion'
      or t ~ 'autorizacion administrativa|se autoriza\y|se otorga|modifica la autorizacion|autorizacion de apertura|autoriza la apertura|inscrib|registro de (fundaciones|asociaciones|cooperativas)|se clasifica|homologa|se acredita|acreditacion de|reconocimiento de (entidad|la condicion)|utilidad publica|extincion de la fundacion|ratifica el acuerdo de extincion'
      or t ~ 'emplaza|recurso contencioso|se notifica|notificacion|archivo del expediente|se acuerda el archivo|declara desierta|deja sin efecto la convocatoria'
      or t ~ '\ypremios?\y|\ybecas?\y|distincion|medalla|condecoracion'
      or t ~ 'comision de valoracion|tribunal calificador|vocalia|se nombran las personas vocales'
      or t ~ 'cuentas anuales|delegacion de (competencias|firma)|se delegan? (competencias|la firma)|rendicion de cuentas|estado de ejecucion|ejecucion del presupuesto|liquidacion (del |de la )?(consorcio|entidad|fundacion)'
      or t ~ 'resuelve la convocatoria|se resuelve la concesion|se conceden?\y|relacion de (beneficiarios|titulares|personas)|beneficiari|amplia el plazo de (ejecucion|justificacion)|reintegro|perdida del derecho'
      or t ~ '^extracto\y'
      or t ~ 'plan(es)? de estudios|cambios del euro|real carta de sucesion|derecho de tanteo|vacante de academico|bien de interes cultural|estatutos de (la |el )?(mancomunidad|fundacion|asociacion|colegio|consorcio)|numero de identificacion fiscal|tipo de interes efectivo|efectos postales|\ysellos?\y|loteria|sorteo|listado definitivo'
      or t ~ 'recurso interpuesto contra|nota de calificacion|calificacion (negativa|registral)|resultados de las subastas|subastas de (bonos|letras|obligaciones)|tipo de rendimiento|carta de servicios|(rehabilitacion|revocacion) de (los )?numeros? de identificacion|se aprueban y se anulan'
      or t ~ '(declaracion|informe) de impacto ambiental|evaluacion ambiental (simplificada|ordinaria) del proyecto'
    )
  end
  from (
    select t,
           -- El acto, sin las normas que cita («…contempladas en la Orden de…»)
           substr(t, 1, 1) || regexp_replace(substr(t, 2), '\y(en|de|por|mediante|segun) (la |el )?(orden|resolucion|decreto|ley|acuerdo|real decreto)\y.*$', '') as acto
    from (select unaccent(lower(titulo)) as t) y
  ) x
$fn$;

-- Paso 0 · Qué se va a quitar de diarios_ccaa
select id, diario, left(titulo, 120) as titulo
  from public.diarios_ccaa
 where tipo = 'otra_disposicion' and public.es_ruido_normativo(titulo);

-- Paso 1 · Quitarlas (y marcarlas como vistas y no incluidas)
update public.diarios_ccaa_vistos v set incluido = false
  from public.diarios_ccaa d
 where d.id = v.id and d.tipo = 'otra_disposicion' and public.es_ruido_normativo(d.titulo);
delete from public.diarios_ccaa
 where tipo = 'otra_disposicion' and public.es_ruido_normativo(titulo);
