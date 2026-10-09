// =====================================================================
// Parlament de Catalunya — lector
// lib/ccaa/cataluna.js
//
// El robots.txt de parlament.cat permite todo salvo /ext (SIAP, donde
// están las fichas de expediente y el buscador del BOPC), /pls, /apl,
// /extern y los recursos estáticos. Así que no se abre nunca una ficha
// del SIAP: solo se guarda su enlace para el usuario.
//
// Lo que se lee (todo permitido):
//   · Listados de iniciativas legislativas (/web/activitat-parlamentaria/
//     iniciatives-legislatives/…): número de expediente, título y, si la
//     tiene, la «Cloenda» (retirada, caducitat…). Solo la XV legislatura.
//   · Portada (/web/index.html): los tres últimos BOPC, con su fecha y el
//     enlace a la API de documentos (/api/siapcerca/v1/document?id_document=…),
//     que sirve el butlletí completo. Se lee con IA (lib/lectorBoletines.js),
//     que es lo que da los plazos de enmiendas y sus pròrrogues. Los RSS del
//     BOPC (/rss/RSS5_0.XML) están parados en septiembre de 2024: no sirven.
//     El sync corre 3 veces al día y el BOPC sale como mucho una vez al
//     día, así que con los tres últimos no se pierde ninguno.
//
// Decisión de Jorge del 09-10-2026: adelantar Cataluña (antes iba al
// final, «caso a caso»), respetando el robots.txt.
// =====================================================================

import { textoPlano, fechaDeTexto, enlacesDe } from '@/lib/ccaa/web';

const BASE = 'https://www.parlament.cat';
const LEG = '15';
const LISTADOS = [
  { url: `${BASE}/web/activitat-parlamentaria/iniciatives-legislatives/projectes-llei/index.html`, tipo: 'Projecte de llei' },
  { url: `${BASE}/web/activitat-parlamentaria/iniciatives-legislatives/proposicions-llei/index.html`, tipo: 'Proposició de llei' },
  { url: `${BASE}/web/activitat-parlamentaria/iniciatives-legislatives/iniciativa-legislativa-popular-ilp/index.html`, tipo: 'Proposició de llei d\'iniciativa legislativa popular' },
];
const PORTADA = `${BASE}/web/index.html`;

// Expediente del Parlament: 200-00031/15 (tipo 3 cifras - número / legislatura).
const SIAP = (num) => `${BASE}/ext/f?p=siap-cerca:expedient:::::p15_num_expedient:${num}`;

/** «Cloenda» del Parlament → resultado normalizado. */
function resultadoCa(c) {
  const t = c.toLowerCase();
  if (/aprova/.test(t)) return 'aprobada';
  if (/rebuig|rebutja|esmena a la totalitat/.test(t)) return 'rechazada';
  if (/retira/.test(t)) return 'retirada';
  if (/caducitat|decaïment|decaiment/.test(t)) return 'caducada';
  if (/inadmissi/.test(t)) return 'inadmitida';
  return null;
}

/** Texto con un salto de línea por cada bloque HTML. */
function lineas(html) {
  return textoPlano(String(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(li|ul|ol|p|div|h\d|dt|dd|tr|td|section|article|span class="[^"]*titol[^"]*")\b[^>]*>/gi, '\n'))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const RUIDO = /^(número d'expedient|documentació|dossier legislatiu|cloenda|consulteu|vegeu|tramitació|expedient)/i;

async function leerListado(web, { url, tipo }, ctx) {
  const html = await web.texto(url);
  const salida = new Map();
  const coincidencias = [...html.matchAll(/p15_num_expedient:(\d{3}-\d{5}\/\d{2})/g)];
  let finAnterior = 0;
  for (const [k, m] of coincidencias.entries()) {
    const num = m[1];
    // El título va antes del número, en la parte de la página entre el
    // expediente anterior y este.
    const ventana = html.slice(Math.max(finAnterior, m.index - 4000), m.index);
    finAnterior = m.index + m[0].length;
    if (!num.endsWith(`/${LEG}`) || salida.has(num)) continue;
    const titulo = lineas(ventana).filter((l) => !RUIDO.test(l) && !/^\(?\d{3}-\d{5}\/\d{2}/.test(l) && l.length >= 15).pop();
    if (ctx.diagnostico && !ctx.diagnostico.muestra_listado) ctx.diagnostico.muestra_listado = html.slice(Math.max(0, m.index - 1500), m.index + 600);
    if (!titulo) continue;
    // La cloenda (si la hay) va justo después del número.
    const siguiente = coincidencias[k + 1]?.index ?? html.length;
    const despues = textoPlano(html.slice(m.index, Math.min(siguiente, m.index + 600)));
    const cloenda = (despues.match(/Cloenda:\s*([^)|·\n]+?)(?:\)|\s{2}|$|Número|Documentació)/i) || [])[1]?.trim() || null;
    salida.set(num, {
      num_expediente: num,
      titulo: titulo.replace(/\s*\($/, ''),
      tipo,
      situacion: cloenda ? `Cloenda: ${cloenda}` : 'En tràmit',
      is_closed: !!cloenda,
      resultado: cloenda ? resultadoCa(cloenda) : null,
      url: SIAP(num),
      tramites: [],
    });
  }
  if (!salida.size && ctx.diagnostico) {
    ctx.diagnostico[url] = enlacesDe(html, url).filter((a) => /expedient|projecte|proposici/i.test(a.href + a.texto)).slice(0, 30).map((a) => `${a.texto.slice(0, 80)} | ${a.href}`);
  }
  return [...salida.values()];
}

/** Los últimos BOPC de la portada: [{ id, numero, fecha, titulo, url, url_pdf }]. */
async function leerBoletines(web, ctx) {
  const html = await web.texto(PORTADA);
  const vistos = new Map();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']*\/api\/siapcerca\/v1\/document\?id_document=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const enlaces = [...html.matchAll(re)];
  for (const [k, m] of enlaces.entries()) {
    const texto = textoPlano(m[3]).replace(/\s+/g, ' ');
    const num = texto.match(/BOPC\s*(\d+)\s*\/\s*(\d+)/i);
    if (!num || num[2] !== LEG) continue;
    const id = `cataluna:BOPC-${num[2]}-${Number(num[1])}`;
    if (vistos.has(id)) continue;
    // La fecha (08/10/2026) va junto al enlace: primero se mira después
    // (hasta el siguiente BOPC) y, si no, justo antes.
    const fin = Math.min(enlaces[k + 1]?.index ?? html.length, m.index + m[0].length + 600);
    const despues = textoPlano(html.slice(m.index + m[0].length, fin));
    const antes = textoPlano(html.slice(Math.max(0, m.index - 300), m.index));
    const f = (despues.match(/\d{2}\/\d{2}\/\d{4}/) || antes.match(/\d{2}\/\d{2}\/\d{4}(?![\s\S]*\d{2}\/\d{2}\/\d{4})/) || [])[0];
    const fecha = fechaDeTexto(f);
    const url = new URL(m[1].replace(/&amp;/g, '&'), PORTADA).toString();
    vistos.set(id, { id, numero: `${Number(num[1])}/${num[2]}`, fecha, titulo: `BOPC ${num[1]}/${num[2]}`, url, url_pdf: url });
  }
  if (!vistos.size && ctx.diagnostico) ctx.diagnostico.portada = enlacesDe(html, PORTADA).filter((a) => /bopc|butllet|siapcerca/i.test(a.href + a.texto)).slice(0, 20).map((a) => `${a.texto.slice(0, 60)} | ${a.href}`);
  return [...vistos.values()];
}

export async function leer(web, ctx = {}) {
  const porNum = new Map();
  for (const l of LISTADOS) {
    if (ctx.tiempoAgotado?.()) break;
    try {
      for (const e of await leerListado(web, l, ctx)) if (!porNum.has(e.num_expediente)) porNum.set(e.num_expediente, e);
    } catch (e) {
      if (e.robots) throw e;
      if (ctx.diagnostico) ctx.diagnostico[l.url] = e.message;
    }
  }
  const expedientes = [...porNum.values()];
  let boletines = [];
  try {
    boletines = await leerBoletines(web, ctx);
  } catch (e) {
    if (e.robots) throw e;
    if (ctx.diagnostico) ctx.diagnostico.portada = e.message;
  }
  // Decrets llei: no tienen listado propio en /web, pero el BOPC los
  // recoge (convalidació o tramitació com a projecte) y la IA los extrae.
  return { expedientes, boletines };
}

export const _test = { lineas, resultadoCa };
