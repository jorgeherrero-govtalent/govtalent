// =====================================================================
// Parlamentos autonómicos — utilidades de presentación (cliente)
// lib/ccaa/vista.js
//
// Lo que comparten el listado (/parlamentos-autonomicos) y la ficha
// (/parlamentos-autonomicos/[slug]): nombres, fases, fechas y textos.
// Sin dependencias de servidor.
// =====================================================================

import { PARLAMENTOS } from '@/lib/parlamentosAutonomicos';

export const VERDE = '#1d6f5c';
export const MORADO = '#6d5aef';
export const GRIS = '#6f6b64';

export const CCAA = Object.fromEntries(Object.entries(PARLAMENTOS).map(([k, p]) => [k, p.ccaa]));
export const NOMBRE_PARLAMENTO = Object.fromEntries(Object.entries(PARLAMENTOS).map(([k, p]) => [k, p.nombre]));

// Las comunidades que aún no se leen (sin acceso o pendientes de
// autorización). Se nombran para que quien las busque sepa que vienen.
export const PROXIMAMENTE = 'Navarra, Galicia, Madrid, Illes Balears, País Vasco, Región de Murcia y Castilla-La Mancha';

// Fases en el orden de la tramitación. La fase de cada expediente la
// calcula la vista ccaa_resumen (sql/65) a partir de sus trámites.
export const FASES = [
  { id: 'admision', nombre: 'Admisión' },
  { id: 'enmiendas', nombre: 'Enmiendas' },
  { id: 'ponencia', nombre: 'Ponencia y comisión' },
  { id: 'pleno', nombre: 'Pleno' },
];
export const NOMBRE_FASE = Object.fromEntries(FASES.map((f) => [f.id, f.nombre]));

export const ETIQUETA_TIPO = {
  presupuestos: 'Presupuestos',
  acompanamiento: 'Ley de acompañamiento',
  decreto_ley: 'Decreto-ley',
  iniciativa_legislativa_popular: 'Iniciativa popular',
  proposicion_ley: 'Proposición de ley',
  proyecto_ley: 'Proyecto de ley',
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-09-30' → '30 sep'; con año si no es el actual. */
export function fechaCorta(iso) {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  const hoy = new Date().getFullYear();
  return `${d} ${MESES[m - 1]}${a !== hoy ? ` ${a}` : ''}`;
}

/** '2026-09-30' → '30 de septiembre de 2026'. */
export function fechaLarga(iso) {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return `${d} de ${MESES_LARGOS[m - 1]} de ${a}`;
}

/** Fin de plazo (timestamptz) en hora de Madrid: '12 oct, 14:00 h' (sin hora si es 23:59). */
export function finDePlazoTexto(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const hora = `${v.hour}:${v.minute}`;
  const fecha = `${v.year}-${String(v.month).padStart(2, '0')}-${String(v.day).padStart(2, '0')}`;
  return `${fechaCorta(fecha)}${hora !== '23:59' ? `, ${hora} h` : ''}`;
}

/**
 * Título legible: algunos parlamentos escriben «PROYECTO DE LEY de …» en
 * mayúsculas, y otros repiten el tipo («Proposición de ley Proposición de
 * Ley …»). Se deja una sola vez y en minúscula normal.
 */
export function tituloLegible(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  s = s.replace(/^(PROYECTO|PROPOSICI[OÓ]N) DE LEY\b/, (m) => m.charAt(0) + m.slice(1).toLowerCase().replace('de ley', 'de Ley'));
  s = s.replace(/^(Proyecto|Proposici[oó]n) de [Ll]ey,?\s+((?:Proyecto|Proposici[oó]n) de [Ll]ey\b)/, '$2');
  return s;
}

/** «cinco días», «15 días hábiles»… del texto de un plazo sin fecha final. */
export function plazoEnDias(texto) {
  const m = String(texto || '').match(/\b(\d+|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta)\s+d[ií]as(\s+h[aá]biles)?/i);
  return m ? `${m[1]} días${m[2] ? ' hábiles' : ''}` : null;
}

/** Texto corto del plazo vigente de un expediente de ccaa_resumen, o null. */
export function plazoCorto(e) {
  if (e.plazo_abierto && e.plazo_enmiendas) return `hasta ${finDePlazoTexto(e.plazo_enmiendas)}`;
  const dias = plazoEnDias(e.plazo_en_dias);
  return dias || null;
}

/** El año de los presupuestos que se tramitan ahora: en otoño, los del año siguiente. */
export function anioPresupuestos(hoy = new Date()) {
  return hoy.getMonth() >= 6 ? hoy.getFullYear() + 1 : hoy.getFullYear();
}
