/**
 * Calendario de las elecciones generales del 29 de noviembre de 2026.
 *
 * Una sola fuente para la franja de Novedades, el modal, el calendario
 * de suscripción (.ics) y la línea de los correos. Si cambia una fecha,
 * se cambia aquí y llega a todo, también a los calendarios suscritos.
 *
 * Fechas del Real Decreto de disolución: campaña del 13 al 27 de
 * noviembre y elecciones el 29. Presentación de candidaturas (días 15 a
 * 20 desde la convocatoria) y su publicación en el BOE (día 28) se
 * calculan con los plazos de la LOREG desde la publicación del 06-10-2026.
 */

export const ELECCIONES = {
  nombre: 'Elecciones generales',
  fecha: '2026-11-29',
  // La franja y la línea del correo dejan de salir este día.
  retirarDesde: '2026-11-30',
  claveOculto: 'oculto:calendario-29n',
};

// `enCalendario: false`: ya ha pasado al publicarse y no tiene sentido
// meterlo en el calendario de nadie.
export const HITOS = [
  {
    id: 'disolucion',
    titulo: 'Disolución y convocatoria',
    frase: 'disolución y convocatoria',
    inicio: '2026-10-06',
    fin: '2026-10-06',
    enCalendario: false,
    descripcion: 'Publicación en el BOE del Real Decreto de disolución de las Cortes y convocatoria de elecciones.',
  },
  {
    id: 'candidaturas',
    titulo: 'Presentación de candidaturas',
    frase: 'presentación de candidaturas',
    inicio: '2026-10-21',
    fin: '2026-10-26',
    enCalendario: true,
    descripcion: 'Plazo para presentar las candidaturas ante las juntas electorales provinciales.',
  },
  {
    id: 'proclamacion',
    titulo: 'Proclamación en el BOE',
    frase: 'proclamación de candidaturas en el BOE',
    inicio: '2026-11-03',
    fin: '2026-11-03',
    enCalendario: true,
    descripcion: 'Publicación en el BOE de las candidaturas proclamadas.',
  },
  {
    id: 'campana',
    titulo: 'Campaña electoral',
    frase: 'campaña electoral',
    inicio: '2026-11-13',
    fin: '2026-11-27',
    enCalendario: true,
    descripcion: 'Campaña electoral, del 13 al 27 de noviembre.',
  },
  {
    id: 'jornada',
    titulo: 'Jornada electoral',
    frase: 'jornada electoral',
    inicio: '2026-11-29',
    fin: '2026-11-29',
    enCalendario: true,
    descripcion: 'Elecciones al Congreso de los Diputados y al Senado.',
  },
];

export const RUTA_ICS = '/calendario/elecciones-29n.ics';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Hoy en Madrid, como AAAA-MM-DD. Los días cuentan en hora peninsular. */
export function hoyMadrid(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

function aUTC(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

/** Días naturales de `desde` a `hasta`, ambos AAAA-MM-DD. */
export function diasEntre(desde, hasta) {
  return Math.round((aUTC(hasta) - aUTC(desde)) / 86400000);
}

/** «21–26 oct», «3 nov». */
export function fechaHito(h) {
  const [, m1, d1] = h.inicio.split('-').map(Number);
  const [, m2, d2] = h.fin.split('-').map(Number);
  if (h.inicio === h.fin) return `${d1} ${MESES[m1 - 1]}`;
  if (m1 === m2) return `${d1}–${d2} ${MESES[m1 - 1]}`;
  return `${d1} ${MESES[m1 - 1]}–${d2} ${MESES[m2 - 1]}`;
}

/** «del 21 al 26 de octubre», «el 3 de noviembre». Para frases. */
export function fechaHitoLarga(h) {
  const [, m1, d1] = h.inicio.split('-').map(Number);
  const [, m2, d2] = h.fin.split('-').map(Number);
  if (h.inicio === h.fin) return `el ${d1} de ${MESES_LARGOS[m1 - 1]}`;
  if (m1 === m2) return `del ${d1} al ${d2} de ${MESES_LARGOS[m1 - 1]}`;
  return `del ${d1} de ${MESES_LARGOS[m1 - 1]} al ${d2} de ${MESES_LARGOS[m2 - 1]}`;
}

export function estadoHito(h, hoy) {
  if (h.fin < hoy) return 'pasado';
  if (h.inicio === hoy && h.fin === hoy) return 'hoy';
  if (h.inicio <= hoy) return 'en_curso';
  return 'futuro';
}

/**
 * Lo que muestran la franja y los correos hoy. `null` cuando el proceso
 * ya ha terminado y no hay nada que enseñar.
 */
export function situacionElectoral(hoy = hoyMadrid()) {
  if (hoy >= ELECCIONES.retirarDesde) return null;
  // La disolución ya ha pasado al publicarse: el «próximo» sale de los
  // hitos que van al calendario.
  const proximo = HITOS.find((h) => h.enCalendario && estadoHito(h, hoy) !== 'pasado') || null;
  const estado = proximo ? estadoHito(proximo, hoy) : null;
  return {
    hoy,
    diasParaElecciones: diasEntre(hoy, ELECCIONES.fecha),
    proximo,
    // 'futuro' | 'en_curso' (plazo de varios días abierto) | 'hoy'
    estadoProximo: estado,
    proximoEnCurso: estado === 'en_curso',
    hitos: HITOS.map((h) => ({ ...h, estado: estadoHito(h, hoy) })),
  };
}

/** Enlaces para suscribirse al calendario desde cada aplicación. */
export function enlacesCalendario(siteUrl) {
  const base = String(siteUrl || 'https://govtalent.app').replace(/\/$/, '');
  const https = `${base}${RUTA_ICS}`;
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
  };
}

/**
 * La línea de los correos semanales: { titulo, cuando, dias }, o null si
 * el proceso ha terminado. La pinta bloqueElectoral() en las plantillas.
 */
export function hitoParaCorreo(hoy = hoyMadrid()) {
  const s = situacionElectoral(hoy);
  if (!s || !s.proximo) return null;
  const nombre = s.proximo.frase;
  if (s.diasParaElecciones === 0) return { titulo: 'Hoy se vota:', cuando: 'jornada electoral', dias: 0 };
  if (s.estadoProximo === 'hoy') return { titulo: 'Hoy:', cuando: nombre, dias: s.diasParaElecciones };
  if (s.proximoEnCurso) {
    return {
      titulo: `En curso: ${nombre},`,
      cuando: `hasta ${fechaHitoLarga({ ...s.proximo, inicio: s.proximo.fin })}`,
      dias: s.diasParaElecciones,
    };
  }
  return { titulo: `Próximo hito: ${nombre},`, cuando: fechaHitoLarga(s.proximo), dias: s.diasParaElecciones };
}
