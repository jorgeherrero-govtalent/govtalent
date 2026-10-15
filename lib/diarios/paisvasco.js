// =====================================================================
// Boletín Oficial del País Vasco (BOPV) — lector
// lib/diarios/paisvasco.js
//
// Dos fuentes, cada una para lo que hace mejor (comprobado el 15-10-2026):
//
// 1. API REST de Open Data Euskadi (sin robots.txt; especificación en
//    opendata.euskadi.eus/.../data_apirest/es_def/adjuntos/bopv.json):
//      https://api.euskadi.eus/bopv/administrative-acts/{año}/{mes}?lang=SPANISH&itemsOfPage=N&currentPage=P
//    Por disposición: sección («OTRAS DISPOSICIONES», «Nombramientos,
//    situaciones e incidencias», «Oposiciones y concursos»…), rango,
//    departamento, número de boletín, fecha y PDF. Da la sección como
//    dato, así que ya no hay que deducirla del HTML.
//    Límites: va con un día de retraso (el 15-10 tenía hasta el boletín
//    196, del 14-10, y el RSS ya daba el 197) y solo trae disposiciones,
//    no anuncios. El texto completo (text.content) no se guarda.
//
// 2. RSS del último boletín, para la inmediatez (está disponible la
//    víspera, hacia las 13:45 en Madrid). No trae sección:
//      https://www.euskadi.eus/bopv2/datos/Ultimo.xml
//    Para lo del RSS que la API aún no tiene, la sección se toma del
//    sumario en HTML (robots.txt permite /*web01-*); si no se puede leer,
//    se clasifica solo por el título.
//
// Enlace entre las dos: el id de la API «2026/10/4272» es la referencia
// «2604272» del RSS (año con dos cifras + número de orden con cinco).
//
// Lo de la API que no está en el RSS (boletines anteriores) se devuelve
// también, hasta DIAS_ATRAS días: recupera lo que el día de su
// publicación se descartó por no tener sección. Lo ya guardado no se
// reescribe (upsert con ignoreDuplicates en el sync).
// =====================================================================

import { elementosRss, textoPlano, fechaDeTexto } from '@/lib/ccaa/web';
import { enlacesConSeccion } from '@/lib/diarios/comun';

const API = 'https://api.euskadi.eus/bopv/administrative-acts';
const POR_PAGINA = 100;
const MAX_PAGINAS = 5;
const DIAS_ATRAS = 7;

const RSS = 'https://www.euskadi.eus/bopv2/datos/Ultimo.xml';
const SUMARIO = 'https://www.euskadi.eus/web01-bopv/es/bopv2/datos/Ultimo.shtml';
const SECCIONES = /^(\d+\.?\s*)?(disposiciones generales|autoridades y personal|otras disposiciones|administracion de justicia|anuncios)/;
const ORGANO = /^(departamento|presidencia|lehendakaritza|vicepresidencia|osakidetza|universidad|instituto|ente|agencia|parlamento|tribunal|ararteko|comision|consejo|diputacion|ayuntamiento|junta)\b/;

/** '2604137' a partir de un enlace o un guid. */
const refDe = (s) => (String(s || '').match(/(\d{6,8})[ae]?\.(?:shtml|pdf|epub)/i) || String(s || '').match(/\b(\d{7})[ae]?\b/) || [])[1] || null;

/** Referencia del RSS a partir del id de la API: '2026/10/4272' → '2604272'. */
function refDeApi(id) {
  const m = String(id || '').match(/^(\d{4})\/\d{1,2}\/(\d+)$/);
  return m ? `${m[1].slice(2)}${m[2].padStart(5, '0')}` : null;
}

/** Fecha en Madrid ('YYYY-MM-DD'): la API da la medianoche de Madrid en UTC ('2026-09-30T22:00:00Z' = 1 de octubre). */
function fechaMadrid(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
}

/** Meses que hay que pedir: el actual y, los primeros días del mes, también el anterior. */
function mesesAPedir(hoy) {
  const [a, m, d] = hoy.split('-').map(Number);
  const meses = [[a, m]];
  if (d <= DIAS_ATRAS) meses.push(m === 1 ? [a - 1, 12] : [a, m - 1]);
  return meses;
}

/** Disposiciones de la API de los últimos DIAS_ATRAS días, por referencia. */
async function leerApi(web, hoy) {
  const desde = new Date(Date.now() - DIAS_ATRAS * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const porRef = new Map();
  const diag = { meses: [], paginas: 0 };
  for (const [anio, mes] of mesesAPedir(hoy)) {
    let pagina = 1;
    let total = 1;
    while (pagina <= total && pagina <= MAX_PAGINAS) {
      const url = `${API}/${anio}/${mes}?lang=SPANISH&itemsOfPage=${POR_PAGINA}&currentPage=${pagina}`;
      const datos = JSON.parse(await web.texto(url));
      total = Number(datos.totalPages) || 1;
      diag.paginas++;
      for (const a of datos.items || []) {
        const ref = refDeApi(a.id);
        const fecha = fechaMadrid(a.publishDate);
        if (!ref || !fecha || fecha < desde) continue;
        porRef.set(ref, a);
      }
      pagina++;
    }
    diag.meses.push(`${anio}-${mes}`);
  }
  return { porRef, diag };
}

/** Entrada del lector a partir de una disposición de la API. */
function entradaDeApi(ref, a, extra = {}) {
  const [anio, mes] = String(a.id).split('/');
  const pdf = (a.downloadable || []).find((x) => /pdf/i.test(x.format || '') || /\.pdf$/i.test(x.url || ''))?.url || null;
  return {
    ref,
    fecha: fechaMadrid(a.publishDate),
    numero: a.numBulletin != null ? String(a.numBulletin) : null,
    seccion: a.section || null,
    organo: a.department || a.issuingBody || null,
    titulo: textoPlano(a.name),
    url: `https://www.euskadi.eus/y22-bopv/es/bopv2/datos/${anio}/${mes.padStart(2, '0')}/${ref}a.shtml`,
    url_pdf: pdf,
    publicado_en: null,
    ...extra,
  };
}

export async function leer(web, ctx = {}) {
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const diag = {};

  // 1. API (sección y datos estructurados; un día de retraso).
  let api = new Map();
  try {
    const r = await leerApi(web, hoy);
    api = r.porRef;
    diag.api = { ...r.diag, disposiciones: api.size };
  } catch (e) {
    diag.api = { error: String(e.message || e).slice(0, 200) };
  }

  // 2. RSS del último boletín (inmediatez).
  const xml = await web.texto(RSS);
  const canal = xml.split(/<item[\s>]/i)[0];
  const tituloCanal = textoPlano((canal.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const numero = (tituloCanal.match(/(\d+)/) || [])[1] || null;
  const fechaCanal = fechaDeTexto(tituloCanal);
  const items = elementosRss(xml).filter((it) => it.enlace && it.titulo);

  // Sección por el sumario en HTML, solo si hay en el RSS algo que la API
  // aún no tiene (lo normal: el boletín de hoy).
  const secciones = new Map();
  const faltan = items.some((it) => !api.has(refDe(it.enlace) || refDe(it.raw)));
  if (faltan) {
    try {
      const html = await web.texto(SUMARIO);
      const enlaces = enlacesConSeccion(html, SUMARIO, { enlace: /\d{6,8}[ae]?\.shtml/i, seccion: SECCIONES, organo: ORGANO });
      for (const e of enlaces) {
        const r = refDe(e.href);
        if (r && !secciones.has(r)) secciones.set(r, e);
      }
      diag.sumario = { enlaces: enlaces.length };
    } catch (e) {
      diag.sumario = { error: String(e.message || e).slice(0, 200) };
    }
  }

  const entradas = [];
  const enRss = new Set();
  let deApi = 0;
  for (const it of items) {
    const ref = refDe(it.enlace) || refDe(it.raw);
    if (!ref) continue;
    enRss.add(ref);
    const a = api.get(ref);
    if (a) {
      // La API manda en sección y órgano; el enlace del RSS se conserva.
      entradas.push(entradaDeApi(ref, a, { url: absoluta(it.enlace) }));
      deApi++;
      continue;
    }
    const s = secciones.get(ref);
    entradas.push({
      ref,
      fecha: (it.fecha && fechaDeTexto(it.fecha)) || fechaCanal,
      numero,
      seccion: s?.seccion || null,
      organo: s?.organo || null,
      titulo: it.titulo,
      url: absoluta(it.enlace),
      url_pdf: null,
      publicado_en: null,
    });
  }

  // Boletines anteriores que ya no están en el RSS: solo por la API.
  let atrasadas = 0;
  for (const [ref, a] of api) {
    if (enRss.has(ref)) continue;
    entradas.push(entradaDeApi(ref, a));
    atrasadas++;
  }

  if (ctx.debug) {
    ctx.diagnostico.paisvasco = {
      ...diag,
      rss: { boletin: numero, fecha: fechaCanal, elementos: items.length, con_datos_de_api: deApi },
      atrasadas_de_api: atrasadas,
    };
  }
  return entradas;
}

function absoluta(u) {
  try { return new URL(u, RSS).toString(); } catch { return u; }
}
