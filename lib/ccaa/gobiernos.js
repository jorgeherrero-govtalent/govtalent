// =====================================================================
// GOBIERNOS AUTONÓMICOS: qué gobierno es cada uno y quién es quién
// lib/ccaa/gobiernos.js
//
// Instituciones › Comunidades autónomas › Gobiernos (maqueta B, elegida
// por Jorge el 21-11-2026): una tarjeta por gobierno y su ficha con
// Organigrama, Consejerías y Personas, como Ministerios.
//
// Los datos salen de dos sitios:
//   - directorio_entidades/directorio_contactos (Agenda de la
//     Comunicación), subcategoría «Gobierno»: el presidente y el gabinete
//     de comunicación de los 19 gobiernos.
//   - fuentes_personas (directorios públicos cargados en octubre de
//     2026): los altos cargos de 12 gobiernos, con su unidad. No hay una
//     jerarquía (qué dirección general cuelga de qué consejería) salvo en
//     Cataluña, que trae el departamento en `area`.
//
// Lo de aquí son funciones puras: valen en el servidor
// (/api/instituciones/gobiernos-ccaa) y en las páginas.
// =====================================================================

/**
 * Los 19 gobiernos. `ccaa` es el nombre de directorio_entidades.ccaa (y el
 * de la bandera, components/BanderaCcaa); `fuentes`, el nombre de la
 * institución en fuentes_personas cuando hay organigrama cargado.
 */
export const GOBIERNOS = [
  { slug: 'andalucia', ccaa: 'Andalucía', nombre: 'Junta de Andalucía', fuentes: 'Junta de Andalucía' },
  { slug: 'aragon', ccaa: 'Aragón', nombre: 'Gobierno de Aragón', fuentes: 'Gobierno de Aragón' },
  { slug: 'asturias', ccaa: 'Principado de Asturias', nombre: 'Gobierno del Principado de Asturias', fuentes: null },
  { slug: 'baleares', ccaa: 'Illes Balears', nombre: 'Govern de les Illes Balears', fuentes: 'Govern de les Illes Balears' },
  { slug: 'canarias', ccaa: 'Canarias', nombre: 'Gobierno de Canarias', fuentes: 'Gobierno de Canarias' },
  { slug: 'cantabria', ccaa: 'Cantabria', nombre: 'Gobierno de Cantabria', fuentes: null },
  { slug: 'castilla-la-mancha', ccaa: 'Castilla-La Mancha', nombre: 'Junta de Comunidades de Castilla-La Mancha', fuentes: 'Junta de Comunidades de Castilla-La Mancha' },
  { slug: 'castilla-y-leon', ccaa: 'Castilla y León', nombre: 'Junta de Castilla y León', fuentes: 'Junta de Castilla y León' },
  { slug: 'cataluna', ccaa: 'Cataluña', nombre: 'Generalitat de Catalunya', fuentes: 'Generalitat de Catalunya' },
  { slug: 'ceuta', ccaa: 'Ceuta', nombre: 'Gobierno de la Ciudad Autónoma de Ceuta', fuentes: null },
  { slug: 'valencia', ccaa: 'Comunidad Valenciana', nombre: 'Generalitat Valenciana', fuentes: 'Generalitat Valenciana' },
  { slug: 'extremadura', ccaa: 'Extremadura', nombre: 'Junta de Extremadura', fuentes: null },
  { slug: 'galicia', ccaa: 'Galicia', nombre: 'Xunta de Galicia', fuentes: 'Xunta de Galicia' },
  { slug: 'rioja', ccaa: 'La Rioja', nombre: 'Gobierno de La Rioja', fuentes: null },
  { slug: 'madrid', ccaa: 'Madrid', nombre: 'Gobierno de la Comunidad de Madrid', fuentes: 'Gobierno de la Comunidad de Madrid' },
  { slug: 'melilla', ccaa: 'Melilla', nombre: 'Gobierno de la Ciudad Autónoma de Melilla', fuentes: null },
  { slug: 'navarra', ccaa: 'Navarra', nombre: 'Gobierno de Navarra', fuentes: 'Gobierno de Navarra' },
  { slug: 'pais-vasco', ccaa: 'País Vasco', nombre: 'Gobierno Vasco', fuentes: 'Gobierno Vasco-Eusko Jaurlaritza' },
  { slug: 'murcia', ccaa: 'Región de Murcia', nombre: 'Gobierno de la Región de Murcia', fuentes: null },
];

export const gobiernoPorSlug = (slug) => GOBIERNOS.find((g) => g.slug === slug) || null;

/** Minúsculas y sin tildes, para comparar. */
export function norm(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const CONSEJERO = /(^|,\s*|\sy\s|\si\s)(consejer[oa]|conseller(a)?|consellera|conselleir[oa])\s+(de|del|d'|da|do|dos|das)\b/i;
// «Consejero delegado», «consejera técnica», «consejero de cuentas»… no son
// miembros del gobierno.
const NO_CONSEJERO = /delegad|t[eé]cnic|asesor|de cuentas|de comptes|de contas|consultiv|del consejo|del consell |de la junta (arbitral|superior)/i;

/** Miembro del gobierno como consejero (con su cartera). */
export function esConsejero(cargo) {
  const c = String(cargo || '');
  return CONSEJERO.test(c) && !NO_CONSEJERO.test(c);
}

/**
 * Vicepresidente del gobierno, no de un consejo u observatorio: lleva
 * cartera o habla del gobierno, o su unidad es la vicepresidencia.
 */
export function esVicepresidente(cargo) {
  const c = String(cargo || '');
  if (!/^vicepresident[ae]?\b/i.test(c)) return false;
  // Solo por el cargo: una «Vicepresidenta» a secas con la unidad
  // «Vicepresidencia» puede ser la de cualquier consejo u observatorio.
  return /consejer|conseller|conselleir|del gobierno|del govern|del consell\b|de la xunta|de la junta de|secretari[oa] del consejo de gobierno|portavoz/i.test(c);
}

const UNIDAD_CONSEJERIA = /^(consejer[ií]a|conselleria|consell[eé]ria|departament|departamento|vicepresidencia)\b/i;

/**
 * La consejería de un consejero: su unidad si ya es una consejería o un
 * departamento; si no, la que dice su cargo («Consejera de Sanidad» →
 * «Consejería de Sanidad»).
 */
export function consejeriaDe(cargo, unidad) {
  const u = String(unidad || '').trim();
  if (UNIDAD_CONSEJERIA.test(u)) return u;
  const m = String(cargo || '').match(/(consejer[oa]|conseller[a]?|consellera|conselleir[oa])\s+(?:del departamento\s+)?(de|del|d'|da|do)\s+(.+?)(?:,|\sy portavoz|\sy secretari|\s+e portavoz|$)/i);
  if (!m) return u || null;
  const resto = m[3].trim();
  return /^departament/i.test(resto) ? resto : `Consejería ${m[2].toLowerCase() === 'del' ? 'del' : 'de'} ${resto}`;
}

/** «Vicepresidente Primero y Consejero de…» → «Vicepresidente primero y consejero». */
export function rolCorto(cargo) {
  const c = String(cargo || '').trim().replace(/\s+/g, ' ');
  // Hasta la palabra «consejero» (lo que sigue es la cartera, que la
  // tarjeta ya enseña aparte); sin ella, el cargo entero.
  const m = c.match(/^(.*?(?:consejer[oa]|conseller[a]?|consellera|conselleir[oa]))\s+(?:(?:de|del|da|do)\s|d')/i);
  const corto = m ? m[1] : c;
  return corto.charAt(0).toUpperCase() + corto.slice(1).toLowerCase().replace(/\bgobierno\b/, 'Gobierno');
}

/** El presidente en los contactos de la Agenda: «Presidente», «Presidenta», «Lehendakari». */
export function esPresidente(cargo) {
  return /^(president[ae]?|lehendakari)\b/i.test(String(cargo || '').trim()) && !/de la (junta|c[aá]mara|comisi)|del consejo/i.test(String(cargo || ''));
}

/** Nivel del cargo para el filtro de Personas (banda de fuentes_personas). */
export const NIVELES = [
  { value: 'alta_direccion', label: 'Alta dirección' },
  { value: 'direccion', label: 'Dirección' },
  { value: 'subdireccion', label: 'Subdirección' },
  { value: 'mando_intermedio', label: 'Otros cargos' },
];

/** Siglas para el cuadrado de las tarjetas de consejerías. */
export function siglas(nombre) {
  const sin = String(nombre || '')
    .replace(/^(consejer[ií]a|conselleria|consell[eé]ria|departament|departamento|vicepresidencia[^,]*?)\s+(de la|de los|de las|del|de|d')\s*/i, '')
    .replace(/\b[dl]'/gi, '')
    .replace(/\b(de|del|la|las|los|el|y|e|i|en|para|con|a)\b/gi, ' ');
  const palabras = sin.split(/[\s,]+/).filter((w) => /^[A-ZÁÉÍÓÚÑÀÈÒ]/.test(w));
  // Con una sola palabra («Sanidad») una letra deja el cuadrado vacío: las
  // tres primeras, como en Ministerios.
  if (palabras.length === 1) return palabras[0].slice(0, 3).toUpperCase();
  return (palabras.map((w) => w[0].toUpperCase()).join('') || 'C').slice(0, 4);
}
