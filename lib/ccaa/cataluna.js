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
//   · RSS del Butlletí Oficial (/rss/RSS5_0.XML y RSS1_PUB_BOPC.XML): los
//     números recientes del BOPC, cuyo PDF está en /document/bopc/<id>.pdf.
//     Los PDF se leen con IA (lib/lectorBoletines.js), que es lo que da
//     los plazos de enmiendas y sus pròrrogues.
//
// Decisión de Jorge del 09-10-2026: adelantar Cataluña (antes iba al
// final, «caso a caso»), respetando el robots.txt.
// =====================================================================

import { textoPlano, fechaDeTexto, elementosRss, enlacesDe } from '@/lib/ccaa/web';

const BASE = 'https://www.parlament.cat';
const LEG = '15';
const LISTADOS = [
  { url: `${BASE}/web/activitat-parlamentaria/iniciatives-legislatives/projectes-llei/index.html`, tipo: 'Projecte de llei' },
  { url: `${BASE}/web/activitat-parlamentaria/iniciatives-legislatives/proposicions-llei/index.html`, tipo: 'Proposició de llei' },
  { url: `${BASE}/web/activitat-parlamentaria/iniciatives-legislatives/iniciativa-legislativa-popular-ilp/index.html`, tipo: 'Proposició de llei d\'iniciativa legislativa popular' },
];
const RSS_BOPC = [`${BASE}/rss/RSS5_0.XML`, `${BASE}/rss/RSS1_PUB_BOPC.XML`];
const DIAS = 45;
const MAX_BOLETINES = 12;

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

/** Bloque HTML (li, tr, article o div) que contiene la posición i. */
function bloqueAlrededor(html, i) {
  let mejor = null;
  for (const tag of ['li', 'tr', 'article']) {
    const ini = html.lastIndexOf(`<${tag}`, i);
    if (ini < 0) continue;
    const fin = html.indexOf(`</${tag}>`, i);
    if (fin < 0) continue;
    const b = html.slice(ini, fin);
    if (!mejor || b.length < mejor.length) mejor = b;
  }
  return mejor || html.slice(Math.max(0, i - 800), i + 400);
}

async function leerListado(web, { url, tipo }, ctx) {
  const html = await web.texto(url);
  const salida = new Map();
  for (const m of html.matchAll(/p15_num_expedient:(\d{3}-\d{5}\/\d{2})/g)) {
    const num = m[1];
    if (!num.endsWith(`/${LEG}`) || salida.has(num)) continue;
    const texto = textoPlano(bloqueAlrededor(html, m.index)).replace(/\s+/g, ' ');
    // Título: el texto que precede al número, sin el número ni la cloenda.
    let titulo = texto.split(num)[0].replace(/[(\s]+$/, '').trim();
    if (titulo.length < 15) titulo = texto.replace(num, '').replace(/Cloenda:.*$/i, '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    titulo = titulo.replace(/\s*(Documentació del Govern|Dossier legislatiu).*$/i, '').trim();
    if (!titulo) continue;
    const cloenda = (texto.match(/Cloenda:\s*([^)|·]+)/i) || [])[1]?.trim() || null;
    salida.set(num, {
      num_expediente: num,
      titulo,
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

/** De un elemento del RSS del BOPC, el enlace al PDF (sin pasar por /ext). */
async function pdfDe(web, it, ctx) {
  const candidatos = [it.enlace, ...(String(it.raw || '').match(/https?:\/\/[^\s"'<>]+/g) || [])].filter(Boolean);
  const directo = candidatos.find((u) => /\/document\/bopc\/\d+\.pdf/i.test(u) || (/parlament\.cat/.test(u) && /\.pdf(\?|$)/i.test(u)));
  if (directo) return directo;
  const pagina = candidatos.find((u) => /parlament\.cat/.test(u) && !/\/ext\//.test(new URL(u).pathname));
  if (!pagina) return null;
  try {
    const html = await web.texto(pagina);
    const a = enlacesDe(html, pagina).find((x) => /\/document\/bopc\/\d+\.pdf/i.test(x.href));
    return a?.href || null;
  } catch (e) {
    if (ctx.diagnostico) ctx.diagnostico[`bopc ${pagina}`] = e.message;
    return null;
  }
}

async function leerBoletines(web, ctx) {
  const limite = new Date(Date.now() - DIAS * 86400000).toISOString().slice(0, 10);
  const vistos = new Map();
  for (const rss of RSS_BOPC) {
    let items;
    try {
      items = elementosRss(await web.texto(rss));
    } catch (e) {
      if (ctx.diagnostico) ctx.diagnostico[rss] = e.message;
      continue;
    }
    if (ctx.diagnostico && !items.length) ctx.diagnostico[rss] = 'RSS sin elementos';
    for (const it of items) {
      if (vistos.size >= MAX_BOLETINES || ctx.tiempoAgotado?.()) break;
      const t = `${it.titulo || ''} ${it.descripcion || ''}`;
      if (/correcci[oó] d'errades/i.test(it.titulo || '') && !/BOPC/i.test(it.titulo || '')) continue;
      const fecha = fechaDeTexto(it.titulo) || fechaDeTexto(it.fecha) || fechaDeTexto(t);
      if (fecha && fecha < limite) continue;
      const numero = (t.match(/BOPC\s*(?:n[úu]m\.?\s*)?(\d+)/i) || t.match(/n[úu]m(?:ero)?\.?\s*(\d+)/i) || [])[1] || null;
      const pdf = await pdfDe(web, it, ctx);
      if (!pdf) {
        if (ctx.diagnostico) (ctx.diagnostico.sin_pdf ||= []).push(`${(it.titulo || '').slice(0, 80)} | ${it.enlace}`);
        continue;
      }
      const id = `cataluna:${numero ? `BOPC-${numero}` : pdf.split('/').pop().replace(/\.pdf$/i, '')}`;
      if ([...vistos.values()].some((b) => b.url_pdf === pdf)) continue;
      if (!vistos.has(id)) {
        vistos.set(id, { id, numero, fecha, titulo: it.titulo || `BOPC ${numero || ''}`.trim(), url: pdf, url_pdf: pdf });
      }
    }
  }
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
  const boletines = await leerBoletines(web, ctx);
  // Decrets llei: no tienen listado propio en /web, pero el BOPC los
  // recoge (convalidació o tramitació com a projecte) y la IA los extrae.
  return { expedientes, boletines };
}

export const _test = { bloqueAlrededor, resultadoCa };
