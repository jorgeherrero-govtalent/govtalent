// =====================================================================
// RUIDO NORMATIVO — actos individuales que no interesan a nadie que
// vigile normativa
// lib/ruidoNormativo.js
//
// Las secciones de «otras disposiciones» (III del BOE, III de los diarios
// autonómicos) mezclan normas de alcance general con actos que solo
// afectan a quien los recibe: convenios, autorizaciones a una empresa,
// inscripciones en un registro, premios, emplazamientos… Medido en el
// BOE (28 días hasta el 08-10-2026): 738 documentos en la sección III, y
// 382 eran convenios.
//
// Criterio (decisión del 08-10-2026: «que consuma lo menos posible y no
// aparezca ruido»): si el título describe uno de esos actos, no entra.
// Se decide por el título, que es lo único que traen todos los sumarios.
// Ante la duda, entra: es preferible un asunto de más que perder una
// orden de bases reguladoras.
// =====================================================================

const sinTildes = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const RUIDO = [
  // Convenios y figuras afines
  /\bconvenio\b|\bconvenios\b|\badenda\b|encomienda de gestion|protocolo general de actuacion|acuerdo de colaboracion/,
  // Autorizaciones, registros y reconocimientos a un destinatario concreto
  /autorizacion administrativa|se autoriza\b|se otorga|modifica la autorizacion|autorizacion de apertura|autoriza la apertura|inscrib|inscripcion|registro de (fundaciones|asociaciones|cooperativas)|se clasifica|homologa|se acredita|acreditacion de|reconocimiento de (entidad|la condicion)|declara(n)?,? en concreto,? de utilidad publica|utilidad publica|extincion de la fundacion|ratifica el acuerdo de extincion/,
  // Expedientes, emplazamientos y notificaciones
  /emplaza|recurso contencioso|se notifica|notificacion|archivo del expediente|se acuerda el archivo|declara desierta|deja sin efecto la convocatoria|(ejecucion|cumplimiento) de (la )?sentencia/,
  // Premios, becas y distinciones
  /\bpremios?\b|\bbecas?\b|distincion|medalla|condecoracion/,
  // Órganos colegiados de una convocatoria y designaciones puntuales
  /comision de valoracion|tribunal calificador|se designan? (a )?(la|las|los|el)? ?(vocal|miembros)|vocalia|se nombran las personas vocales/,
  // Gestión económica y de la propia administración
  /cuentas anuales|delegacion de (competencias|firma)|se delegan? (competencias|la firma)|rendicion de cuentas|estado de ejecucion|ejecucion del presupuesto|liquidacion (del |de la )?(consorcio|entidad|fundacion)/,
  // Resoluciones de convocatorias, beneficiarios y plazos de ejecución
  /resuelve la convocatoria|se resuelve la concesion|se conceden?\b|relacion de (beneficiarios|titulares|personas)|beneficiari|amplia el plazo de (ejecucion|justificacion)|plazos? de ejecucion|reintegro|perdida del derecho|sancion(es)? impuesta|expediente sancionador|convocan? pruebas|pruebas para la obtencion/,
  // Extractos: repiten una convocatoria que ya entra (o no) por sí misma
  /^extracto\b/,
  // Publicaciones rutinarias sin alcance normativo (medido en el BOE)
  /plan(es)? de estudios|cambios del euro|real carta de sucesion|derecho de tanteo|vacante de academico|bien de interes cultural|estatutos de (la |el )?(mancomunidad|fundacion|asociacion|colegio|consorcio)|numero de identificacion fiscal|tipo de interes efectivo|efectos postales|\bsellos?\b|loteria|sorteo|listado definitivo/,
  // Recursos registrales, deuda pública y trámites tributarios puntuales
  /recurso interpuesto contra|nota de calificacion|calificacion (negativa|registral)|resultados de las subastas|subastas de (bonos|letras|obligaciones)|tipo de rendimiento|carta de servicios|(rehabilitacion|revocacion) de (los )?numeros? de identificacion|se aprueban y se anulan/,
  // Evaluación ambiental de un proyecto concreto
  /(declaracion|informe) de impacto ambiental|evaluacion ambiental (simplificada|ordinaria) del proyecto/,
];

// Lo que se queda aunque el título case con lo anterior: las bases
// reguladoras y las convocatorias que las aprueban son normas.
const SALVO = /bases reguladoras|por (el|la) que se (aprueba|regula|establece|desarrolla|modifica (el|la) (decreto|orden|reglamento))/;

// Donde el título empieza a citar otra norma («…contempladas en la Orden
// de…», «…establecidas en la Resolución de…»). Lo que viene después
// describe la norma citada, no el acto: la excepción SALVO solo se mira
// antes de ese punto. Sin esto, «se resuelve la convocatoria de
// subvenciones contempladas en la Orden … por la que se establecen las
// bases reguladoras» se colaba como si fuera una orden de bases (08-10-2026).
const CITA = /\b(en|de|por|mediante|segun) (la |el )?(orden|resolucion|decreto|ley|acuerdo|real decreto)\b/;

/** La parte del título que describe el acto, sin las normas que cita. */
function actoPrincipal(t) {
  const m = t.slice(1).search(CITA);
  return m >= 0 ? t.slice(0, m + 1) : t;
}

/** ¿Es un acto individual que no aporta a quien vigila normativa? */
export function esRuido(titulo) {
  const t = sinTildes(titulo);
  if (!t) return false;
  if (SALVO.test(actoPrincipal(t)) && !/^extracto\b/.test(t) && !/\bconvenio\b|\badenda\b/.test(t)) return false;
  return RUIDO.some((re) => re.test(t));
}
