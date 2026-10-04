// =====================================================================
// RUTA TEMPORAL — Muestras de los 7 parlamentos de la fase 1
// app/api/debug/parlamentos-muestras/route.js
//
// Para escribir los lectores de cada parlamento hace falta ver el
// contenido real de sus RSS, listados y fichas. Desde el entorno de
// desarrollo no se pueden abrir sus webs, así que esta ruta los lee desde
// Vercel (como GovTalentBot, respetando el robots.txt) y devuelve el
// contenido en bruto, recortado:
//   · RSS/XML: el texto tal cual (hasta 60 KB).
//   · HTML: sin <script>, <style> ni <svg>, hasta 80 KB, más la lista de
//     enlaces de la página.
//   · PDF: solo el tamaño (los PDF los leerá la IA).
// Si una URL es un RSS con «seguir», también trae la página del primer
// elemento (para ver cómo es una ficha).
//
// Uso:
//   ?key=<DEBUG_KEY>                 los 7
//   ?key=<DEBUG_KEY>&p=rioja,valencia
//
// BORRAR al terminar los lectores de la fase 1.
// =====================================================================

import { fetchGob } from '@/lib/fetchGob';
import { HEADERS_BOT, leerRobots, permitidoPorRobots } from '@/lib/govtalentBot';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TIMEOUT_MS = 25000;
const MAX_XML = 60000;
const MAX_HTML = 80000;
const MAX_ENLACES = 400;

const AND = 'https://www.parlamentodeandalucia.es/webdinamica/portal-web-parlamento';
const FUENTES = {
  andalucia: [
    ['rss_boletines', `${AND}/utilidades/sindicacionrss.do?contenido=Bopa`, { seguir: true }],
    ['rss_iniciativas', `${AND}/utilidades/sindicacionrss.do?contenido=Iniciativas`, { seguir: true }],
    ['listado_legislativas', `${AND}/actividadparlamentaria/tramitacionencurso/legislativas.do`],
    ['ficha', `${AND}/actividadparlamentaria/todaslasiniciativas/portipo.do?numexp=13-26/PPL-000002`],
    ['rss_agenda', `${AND}/utilidades/sindicacionrss.do?contenido=Agendas`],
  ],
  aragon: [
    ['indice_boletines', 'https://bases.cortesaragon.es/bases/original.nsf/(BOCA1)?OpenView'],
    ['listado_leyes', 'https://www.cortesaragon.es/Leyes.2580.0.html?no_cache=1'],
    ['agenda', 'https://www.cortesaragon.es/Agenda.2230.0.html?no_cache=1'],
  ],
  asturias: [
    ['rss_boletines', 'https://agoranet.jgpa.es/docuAst/rss.jsp'],
    ['busqueda_expedientes', 'https://agoranet.jgpa.es/appAst/SInicial?HC=1'],
    ['busqueda_plazos', 'https://agoranet.jgpa.es/appAst/SInicial?HC=7&M=0'],
  ],
  cantabria: [
    ['indice_boletines', 'https://parlamento-cantabria.es/actividad/publicaciones/boletin-oficial-del-parlamento-de-cantabria'],
    ['boletin', 'https://parlamento-cantabria.es/publicaciones/boletindelparlamento/bopca-no-36911'],
    ['listado_tramitacion', 'https://parlamento-cantabria.es/actividad/tramitacion-parlamentaria'],
    ['ficha', 'https://parlamento-cantabria.es/actividad/tramitacion/expediente-no-11l1000-0019'],
    ['agenda', 'https://parlamento-cantabria.es/agenda-semana'],
  ],
  castillayleon: [
    ['indice_boletines', 'https://www.ccyl.es/RecursosInformacion/BoletinOficial'],
    ['boletin', 'https://www.ccyl.es/Publicaciones/EntradasPublicacion?Legislatura=12&SeriePublicacion=BOCCL&NumeroPublicacion=14'],
    ['listado_tramitacion', 'https://www.ccyl.es/Actividad/TramitacionParlamentaria'],
    ['agenda', 'https://www.ccyl.es/Agenda/Semana'],
  ],
  rioja: [
    ['rss_boletines', 'https://www.parlamento-larioja.org/recursos-de-informacion/publicaciones-oficiales/ultimos-boletines-oficiales/RSS'],
    ['rss_iniciativas', 'https://www.parlamento-larioja.org/actividad-parlamentaria/listado-ultimas-iniciativas/RSS', { seguir: true }],
    ['ficha', 'https://www.parlamento-larioja.org/actividad-parlamentaria/iniciativas/pl/11l-pl-0019'],
    ['rss_sesiones', 'https://www.parlamento-larioja.org/actividad-parlamentaria/sesiones-parlamentarias/sesiones-parlamentarias/RSS'],
  ],
  valencia: [
    ['rss_iniciativas', 'https://www.cortsvalencianes.es/ca-va/actividad/iniciativa/rss.xml', { seguir: true }],
    ['rss_agenda', 'https://www.cortsvalencianes.es/ca-va/actividad/actualidad/agenda.xml'],
  ],
};

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Texto decodificado con el juego de caracteres que declara el servidor. */
async function leer(url) {
  const t0 = Date.now();
  try {
    const res = await fetchGob(url, { headers: HEADERS_BOT, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const tipo = res.headers?.get?.('content-type') || '';
    let texto;
    if (res.arrayBuffer) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.subarray(0, 4).toString() === '%PDF') return { status: res.status, tipo, ms: Date.now() - t0, pdf: true, kb: Math.round(buf.length / 1024) };
      const cs = (tipo.match(/charset=([\w-]+)/i) || [])[1]?.toLowerCase();
      texto = new TextDecoder(cs === 'iso-8859-1' || cs === 'windows-1252' ? 'latin1' : 'utf-8').decode(buf);
    } else {
      texto = await res.text();
    }
    return { status: res.status, tipo, ms: Date.now() - t0, texto, final: res.url && res.url !== url ? res.url : undefined };
  } catch (e) {
    return { status: null, error: String(e?.cause?.code || e?.message || e).slice(0, 200), ms: Date.now() - t0 };
  }
}

function esXml(texto, tipo) {
  return /xml|rss|atom/i.test(tipo) || /^\s*<\?xml|<rss|<feed/i.test(texto.slice(0, 300));
}

function limpiarHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ');
}

function enlaces(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    let h = m[1];
    try { h = new URL(h, base).toString(); } catch {}
    out.push([t.slice(0, 160), h]);
    if (out.length >= MAX_ENLACES) break;
  }
  return out;
}

function primerEnlaceRss(xml) {
  const item = (xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/i) || [])[0] || '';
  return (item.match(/<link[^>]*>\s*(?:<!\[CDATA\[)?([^<\]]+)/i) || [])[1]?.trim()
    || (item.match(/<link[^>]*href=["']([^"']+)/i) || [])[1];
}

function empaquetar(capa, url, r) {
  const base = { capa, url, status: r.status, tipo: r.tipo, ms: r.ms, redirige_a: r.final, error: r.error };
  if (r.pdf) return { ...base, pdf_kb: r.kb };
  if (r.texto == null) return base;
  if (esXml(r.texto, r.tipo)) return { ...base, formato: 'xml', bytes: r.texto.length, contenido: r.texto.slice(0, MAX_XML) };
  const limpio = limpiarHtml(r.texto);
  return { ...base, formato: 'html', bytes: limpio.length, enlaces: enlaces(limpio, r.final || url), contenido: limpio.slice(0, MAX_HTML) };
}

async function robotsDe(origen) {
  const r = await leer(`${origen}/robots.txt`);
  if (r.status === 200 && r.texto && !/<html/i.test(r.texto.slice(0, 500))) return leerRobots(r.texto).reglas;
  return { disallow: [], allow: [], crawlDelay: null };
}

async function muestrasDe(entradas) {
  const salida = [];
  const robots = new Map();
  for (const [capa, url, opc = {}] of entradas) {
    const u = new URL(url);
    if (!robots.has(u.origin)) robots.set(u.origin, await robotsDe(u.origin));
    const reglas = robots.get(u.origin);
    if (!permitidoPorRobots(reglas, u.pathname + u.search)) {
      salida.push({ capa, url, robots: 'prohibido por robots.txt' });
      continue;
    }
    await espera(Math.max(1000, Math.min(10000, (reglas.crawlDelay || 0) * 1000)));
    const r = await leer(url);
    salida.push(empaquetar(capa, url, r));
    if (opc.seguir && r.texto && esXml(r.texto, r.tipo)) {
      const enlace = primerEnlaceRss(r.texto);
      if (enlace) {
        const v = new URL(enlace, url);
        if (!robots.has(v.origin)) robots.set(v.origin, await robotsDe(v.origin));
        if (permitidoPorRobots(robots.get(v.origin), v.pathname + v.search)) {
          await espera(1000);
          salida.push(empaquetar(`${capa}__primer_elemento`, v.toString(), await leer(v.toString())));
        }
      }
    }
  }
  return salida;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }
  const pedidos = sp.get('p') ? sp.get('p').split(',').map((s) => s.trim()).filter((s) => FUENTES[s]) : Object.keys(FUENTES);
  if (!pedidos.length) return Response.json({ error: `p debe ser una de: ${Object.keys(FUENTES).join(', ')}` }, { status: 400 });
  const t0 = Date.now();
  const resultado = await Promise.all(pedidos.map(async (k) => [k, await muestrasDe(FUENTES[k])]));
  return Response.json({ fecha: new Date().toISOString(), ms_total: Date.now() - t0, muestras: Object.fromEntries(resultado) });
}
