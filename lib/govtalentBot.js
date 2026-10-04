// =====================================================================
// GovTalentBot — cómo se identifica GovTalent al leer webs ajenas
// lib/govtalentBot.js
//
// Desde el 04-10-2026, GovTalent se presenta con su propio nombre en las
// webs que lee de forma automática (empezando por los parlamentos
// autonómicos), en vez de hacerse pasar por un navegador. Es lo que se
// promete en las peticiones de acceso enviadas a los parlamentos: si un
// parlamento quiere autorizarnos, bloquearnos o pedirnos que vayamos más
// despacio, puede hacerlo por este nombre en su robots.txt.
//
// La página https://govtalent.app/bot explica quiénes somos, qué leemos
// y cómo contactar.
//
// Además de la identificación, aquí está la lectura del robots.txt: qué
// grupo se aplica a GovTalentBot (el suyo si lo nombra; si no, el de
// «*»), qué rutas permite y qué pausa pide entre peticiones.
// =====================================================================

export const NOMBRE_BOT = 'GovTalentBot';
export const URL_BOT = 'https://govtalent.app/bot';
export const CONTACTO_BOT = 'hola@govtalent.app';

export const UA_GOVTALENTBOT = `Mozilla/5.0 (compatible; ${NOMBRE_BOT}/1.0; +${URL_BOT})`;

export const HEADERS_BOT = {
  'User-Agent': UA_GOVTALENTBOT,
  From: CONTACTO_BOT,
  Accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml,application/pdf,*/*',
  'Accept-Language': 'es-ES,es;q=0.9',
};

/**
 * Lee un robots.txt y devuelve las reglas que se aplican a GovTalentBot:
 * las de su propio grupo si lo nombra, o las de «*» si no. Además, la
 * lista de agentes que nombra y los que veta del todo (para informes).
 */
export function leerRobots(texto) {
  const grupos = [];
  let actual = null;
  let ultimoFueAgente = false;
  for (const cruda of String(texto || '').split(/\r?\n/)) {
    const linea = cruda.replace(/#.*$/, '').trim();
    if (!linea) continue;
    const m = linea.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const campo = m[1].toLowerCase();
    const valor = m[2].trim();
    if (campo === 'user-agent') {
      if (!actual || !ultimoFueAgente) {
        actual = { agentes: [], disallow: [], allow: [], crawlDelay: null };
        grupos.push(actual);
      }
      actual.agentes.push(valor.toLowerCase());
      ultimoFueAgente = true;
      continue;
    }
    ultimoFueAgente = false;
    if (!actual) continue;
    if (campo === 'disallow') actual.disallow.push(valor);
    if (campo === 'allow') actual.allow.push(valor);
    if (campo === 'crawl-delay') actual.crawlDelay = parseFloat(valor) || null;
  }
  const nombre = NOMBRE_BOT.toLowerCase();
  const propio = grupos.find((g) => g.agentes.includes(nombre));
  const general = grupos.find((g) => g.agentes.includes('*'));
  const reglas = propio || general || { disallow: [], allow: [], crawlDelay: null };
  return {
    reglas,
    grupo: propio ? NOMBRE_BOT : general ? '*' : 'ninguno',
    nombrados: [...new Set(grupos.flatMap((g) => g.agentes).filter((a) => a !== '*'))],
    vetadosDelTodo: grupos.filter((g) => g.disallow.includes('/')).flatMap((g) => g.agentes),
  };
}

/** Patrón de robots.txt («*» y «$») → expresión regular. */
function patron(regla) {
  const escapada = regla.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escapada.endsWith('\\$') ? escapada.slice(0, -2) + '$' : escapada}`);
}

/** Permitido si la regla más larga que encaja es Allow, o si no encaja ninguna. */
export function permitidoPorRobots(reglas, ruta) {
  let mejor = { largo: -1, permite: true };
  for (const r of reglas.disallow || []) {
    if (r && patron(r).test(ruta) && r.length > mejor.largo) mejor = { largo: r.length, permite: false };
  }
  for (const r of reglas.allow || []) {
    if (r && patron(r).test(ruta) && r.length >= mejor.largo) mejor = { largo: r.length, permite: true };
  }
  return mejor.permite;
}
