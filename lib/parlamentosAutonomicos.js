// =====================================================================
// PARLAMENTOS AUTONÓMICOS — catálogo y utilidades comunes
// lib/parlamentosAutonomicos.js
//
// Las claves (andalucia, aragon…) son las que se guardan en
// ccaa_expedientes.parlamento y ccaa_boletines.parlamento.
//
// Fase 1 (04-10-2026): los 7 que se pueden leer respetando su robots.txt
// y sin cortafuegos. Desde el 09-10-2026, también Madrid y Cataluña. Los demás están a la espera de que respondan a la
// petición de acceso (ver claude/parlamentos-autonomicos-fuentes.md).
// =====================================================================

export const PARLAMENTOS = {
  andalucia: { nombre: 'Parlamento de Andalucía', ccaa: 'Andalucía', boletin: 'BOPA', legislatura: 'XIII', idioma: 'es', web: 'https://www.parlamentodeandalucia.es' },
  aragon: { nombre: 'Cortes de Aragón', ccaa: 'Aragón', boletin: 'BOCA', legislatura: 'XII', idioma: 'es', web: 'https://www.cortesaragon.es' },
  asturias: { nombre: 'Junta General del Principado de Asturias', ccaa: 'Asturias', boletin: 'BOJG', legislatura: 'XII', idioma: 'es', web: 'https://agoranet.jgpa.es' },
  cantabria: { nombre: 'Parlamento de Cantabria', ccaa: 'Cantabria', boletin: 'BOPCA', legislatura: 'XI', idioma: 'es', web: 'https://parlamento-cantabria.es' },
  castillayleon: { nombre: 'Cortes de Castilla y León', ccaa: 'Castilla y León', boletin: 'BOCCL', legislatura: 'XII', idioma: 'es', web: 'https://www.ccyl.es' },
  rioja: { nombre: 'Parlamento de La Rioja', ccaa: 'La Rioja', boletin: 'BOPR', legislatura: 'XI', idioma: 'es', web: 'https://www.parlamento-larioja.org' },
  valencia: { nombre: 'Corts Valencianes', ccaa: 'Comunitat Valenciana', boletin: 'BOCV', legislatura: 'XI', idioma: 'ca', web: 'https://www.cortsvalencianes.es' },
  // 09-10-2026: Madrid (CSV de expedientes de los datos abiertos de la
  // Asamblea) y Cataluña (listados y BOPC; nunca el SIAP, /ext).
  madrid: { nombre: 'Asamblea de Madrid', ccaa: 'Comunidad de Madrid', boletin: 'BOAM', legislatura: 'XIII', idioma: 'es', web: 'https://www.asambleamadrid.es' },
  cataluna: { nombre: 'Parlament de Catalunya', ccaa: 'Cataluña', boletin: 'BOPC', legislatura: 'XV', idioma: 'ca', web: 'https://www.parlament.cat' },
};

// Parlamentos dados de alta pero fuera del sync automático. Madrid volvió
// el 09-10-2026 con el CSV de datos abiertos de la Asamblea.
export const EN_PAUSA = [];
export const FASE1 = Object.keys(PARLAMENTOS).filter((p) => !EN_PAUSA.includes(p));

/**
 * Forma canónica del número de expediente, para que el mismo expediente
 * case venga de la ficha, del RSS o del boletín (donde la IA lo copia
 * tal como está impreso: con espacios, guiones distintos, minúsculas…).
 * Solo se usa para comparar y para el id; el número tal como lo publica
 * el parlamento se guarda aparte.
 */
export function claveExpediente(num) {
  return String(num || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[.,;:]+$/, '');
}

export function idExpediente(parlamento, num) {
  return `${parlamento}:${claveExpediente(num)}`;
}

export function slugExpediente(parlamento, num) {
  const s = claveExpediente(num).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${parlamento}-${s}`;
}

/**
 * Tipo normalizado a partir del tipo y el título tal como los da el
 * parlamento. Presupuestos y acompañamiento se reconocen por el título,
 * porque formalmente son proyectos de ley.
 */
export function tipoNorm(tipo, titulo) {
  const t = `${tipo || ''} ${titulo || ''}`.toLowerCase();
  if (/presupuestos generales|pressupostos generals/.test(t)) return 'presupuestos';
  if (/medidas (fiscales|tributarias)|acompañamiento|acompanyament|mesures fiscals|medidas administrativas y fiscales/.test(t)) return 'acompanamiento';
  if (/decreto[- ]ley|decret llei|decret-llei/.test(t)) return 'decreto_ley';
  if (/iniciativa legislativa popular|\bilp\b/.test(t)) return 'iniciativa_legislativa_popular';
  if (/proposici[oó]n de ley|proposici[oó] de llei|\bppl\b/.test(t)) return 'proposicion_ley';
  if (/proyecto de ley|projecte de llei|\bpl\b/.test(t)) return 'proyecto_ley';
  return 'otro';
}

/** Fecha 'YYYY-MM-DD' válida o null. */
export function fechaISO(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

/** Fin de un plazo: el día indicado a las 23:59 en Madrid, o la hora si se da. */
export function finDePlazo(fecha, hora) {
  const f = fechaISO(fecha);
  if (!f) return null;
  const h = /^\d{1,2}:\d{2}$/.test(String(hora || '')) ? String(hora).padStart(5, '0') : '23:59';
  // Madrid es UTC+1 en invierno y UTC+2 en verano: se calcula el desfase real.
  const prueba = new Date(`${f}T12:00:00Z`);
  const madrid = new Date(prueba.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const utc = new Date(prueba.toLocaleString('en-US', { timeZone: 'UTC' }));
  const desfase = Math.round((madrid - utc) / 3600000);
  return new Date(`${f}T${h}:00+0${desfase}:00`).toISOString();
}
