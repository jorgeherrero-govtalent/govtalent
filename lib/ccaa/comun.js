// =====================================================================
// Utilidades comunes a los lectores de parlamentos autonómicos
// lib/ccaa/comun.js
// =====================================================================

/**
 * Tipo de trámite (ccaa_tramites.tipo) a partir del texto con que lo
 * describe el parlamento en la ficha. El orden importa: «ampliación del
 * plazo de enmiendas» es ampliación, no plazo; «enmiendas a la
 * totalidad» no son parciales.
 */
export function tipoTramite(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/amplia|prorroga|prorrog|prorroga/.test(t) && /plazo|termini/.test(t)) return 'ampliacion_plazo';
  if (/totalidad|totalitat/.test(t)) return 'enmiendas_totalidad';
  if (/(plazo|termini).*(enmienda|esmena)|apertura del plazo|obertura del termini/.test(t)) return 'plazo_enmiendas';
  if (/enmienda|esmena/.test(t)) return 'enmiendas_parciales';
  if (/toma en consideracion|presa en consideracio/.test(t)) return 'toma_consideracion';
  if (/criterio (del gobierno|de la junta)|conformidad del gobierno|criteri del consell/.test(t)) return 'criterio_gobierno';
  if (/comparecen|comparei?xen/.test(t)) return 'comparecencias';
  if (/ponencia|ponencia/.test(t)) return 'ponencia';
  if (/dictamen|dictamen/.test(t)) return 'dictamen';
  if (/retirad|retirada/.test(t)) return 'retirada';
  if (/caduc/.test(t)) return 'caducidad';
  if (/rechaz|rebutj/.test(t)) return 'rechazo';
  if (/aprobacion (definitiva|final)|aprobad[ao] (la ley|por el pleno)|ley aprobada|aprovacio/.test(t)) return 'aprobacion';
  if (/admision|admitid|calificacion|admissio/.test(t)) return 'admision';
  if (/publicacion|publicacio/.test(t)) return 'publicacion';
  if (/pleno|debate final|ple /.test(t)) return 'pleno';
  if (/comision|comissio/.test(t)) return 'comision';
  if (/entrada|registro|presentacion|presentada/.test(t)) return 'registro';
  return 'otro';
}

/** Título reducido a palabras clave, para casar el mismo expediente entre fuentes. */
export function normTitulo(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^\s*(proyecto|proposicion|projecte|proposicio)\s+(de\s+)?(ley|llei)\s*/i, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(de|del|la|las|el|los|y|e|en|para|por|a|al|i|per|les|dels|la)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿Son el mismo título? Iguales, o uno contiene al otro y es largo. */
export function mismoTitulo(a, b) {
  const x = normTitulo(a);
  const y = normTitulo(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x];
  return corto.length >= 25 && largo.includes(corto);
}

/** Un expediente está cerrado si su situación lo dice. */
export function cerrado(situacion) {
  const t = String(situacion || '').toLowerCase();
  if (/en tramitaci|tramitando|en tramit/.test(t)) return false;
  return /cerrad|aprobad|rechazad|retirad|caducad|decaid|finalizad|conclu|archivad|inadmitid|convertid/.test(t);
}

export function resultadoDe(situacion) {
  const t = String(situacion || '').toLowerCase();
  if (/aprobad/.test(t)) return 'aprobada';
  if (/rechazad/.test(t)) return 'rechazada';
  if (/retirad/.test(t)) return 'retirada';
  if (/caducad|decaid/.test(t)) return 'caducada';
  if (/inadmitid/.test(t)) return 'inadmitida';
  return null;
}
