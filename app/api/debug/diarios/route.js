// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Diarios oficiales autonómicos (fase 0)
// app/api/debug/diarios/route.js
//
// OBJETIVO: saber, DESDE LA RED DE VERCEL, qué se puede leer de los 17
// diarios oficiales de las comunidades (BOJA, DOGC, BOPV, BOCM…), la capa
// equivalente al BOE. Las URL salen del inventario del 08-10-2026
// (documento del proyecto «diarios-oficiales-ccaa-fuentes.md»); varias
// estaban «sin verificar» porque desde fuera de Vercel no respondían.
//
// Igual que /api/debug/parlamentos: se identifica como GovTalentBot,
// aplica el robots.txt de cada sitio (lo prohibido NO se pide, se informa
// como «prohibido por robots.txt»), una petición cada vez por sitio y
// respetando el Crawl-delay (máximo 10 s). Los sitios van en paralelo.
//
// Además, para medir la HORA DE PUBLICACIÓN, devuelve de cada respuesta
// la cabecera Last-Modified y, en los RSS, el lastBuildDate y la fecha
// del primer elemento.
//
// Las URL con fecha se calculan para HOY en hora de Madrid. En fin de
// semana o festivo es normal que esas den 404 o vacío.
//
// Uso:
//   ?key=<DEBUG_KEY>                     los 17
//   ?key=<DEBUG_KEY>&p=galicia           solo uno (claves: ver FUENTES)
//   ?key=<DEBUG_KEY>&p=galicia,madrid    varios
//
// BORRAR ESTE ARCHIVO al cerrar la fase 0.
// =====================================================================

import { fetchGob } from '@/lib/fetchGob';
import { HEADERS_BOT, UA_GOVTALENTBOT, leerRobots, permitidoPorRobots } from '@/lib/govtalentBot';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TIMEOUT_MS = 20000;
const PAUSA_MIN_MS = 1000;
const PAUSA_MAX_MS = 10000;
const MUESTRA_MAX = 160;

// ---------------------------------------------------------------------
// Fecha de hoy en Madrid, en los formatos que piden los diarios
// ---------------------------------------------------------------------

function hoyMadrid() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const { year: a, month: m, day: d } = partes;
  return { a, m, d, aaaammdd: `${a}${m}${d}`, dd_mm_aaaa: `${d}-${m}-${a}`, ddbmmbaaaa: `${d}/${m}/${a}` };
}

// ---------------------------------------------------------------------
// Las fuentes. Cada una con su capa: sumario, rss, disposicion, datos,
// portada. Las marcadas «sin verificar» en el inventario van igual: es
// justo lo que hay que comprobar.
// ---------------------------------------------------------------------

function fuentes() {
  const h = hoyMadrid();
  return {
    andalucia: [
      ['sumario', `https://www.juntadeandalucia.es/eboja/${h.aaaammdd}.html`],
      ['sumario', 'https://www.juntadeandalucia.es/eboja/2026/124/index.html'],
      ['disposicion', 'https://www.juntadeandalucia.es/boja/2026/124/1'],
    ],
    aragon: [
      ['portada', 'https://www.boa.aragon.es/'],
      ['sumario', 'https://www.boa.aragon.es/cgi-bin/EBOA/BRSCGI?CMD=VERLST&BASE=BOLE&DOCS=1-20&SEC=FIRMA&SORT=-PUBL'],
    ],
    asturias: [
      ['portada', 'https://sede.asturias.es/bopa'],
      ['sumario', `https://www.asturias.es/bopa/${h.a}/${h.m}/${h.d}/${h.aaaammdd}.pdf`],
      ['datos', 'https://descargas.asturias.es/asturias/opendata/LegislacionyJusticia/BOPA2019-28/dataset-sum-bopa-2024.json'],
    ],
    baleares: [
      ['rss', 'https://www.caib.es/eboibfront/indexrss.do'],
      ['portada', 'https://www.caib.es/eboibfront/es'],
    ],
    canarias: [
      ['rss', 'https://www.gobiernodecanarias.org/boc/feeds/capitulo/disposiciones_generales.rss'],
      ['rss', 'https://www.gobiernodecanarias.org/boc/feeds/capitulo/autoridades_personal_nombramientos.rss'],
      ['rss', 'https://www.gobiernodecanarias.org/boc/feeds/capitulo/otros_anuncios.rss'],
      ['sumario', 'https://www.gobiernodecanarias.org/boc/2024/155/index.html'],
    ],
    cantabria: [
      ['portada', 'https://boc.cantabria.es/boces/'],
    ],
    castillalamancha: [
      ['portada', 'https://docm.jccm.es/docm/'],
      ['sumario', `https://docm.jccm.es/docm/cambiarBoletin.do?fecha=${h.aaaammdd}`],
    ],
    castillayleon: [
      ['rss', 'https://bocyl.jcyl.es/rss.do'],
      ['rss', 'https://bocyl.jcyl.es/rss.do?seccion=I'],
      ['sumario', `https://bocyl.jcyl.es/boletin.do?fechaBoletin=${h.ddbmmbaaaa}`],
    ],
    cataluna: [
      ['datos', 'https://analisi.transparenciacatalunya.cat/resource/n6hn-rmy7.json?$limit=3'],
      ['portada', 'https://dogc.gencat.cat/es/inici/'],
    ],
    valencia: [
      ['portada', 'https://dogv.gva.es/es/'],
      ['disposicion', 'https://dogv.gva.es/es/eli/es-vc/l/2015/04/02/2/dof/spa/html'],
    ],
    extremadura: [
      ['rss', 'https://doe.juntaex.es/rss/rss.php?seccion=6'],
      ['rss', 'https://doe.juntaex.es/rss/rss.php?seccion=1'],
    ],
    galicia: [
      ['rss', 'https://www.xunta.gal/diario-oficial-galicia/rss/Sumario_gl.rss'],
      ['portada', 'https://www.xunta.gal/diario-oficial-galicia/suscricionsRSS.do'],
    ],
    madrid: [
      ['rss', 'https://www.bocm.es/sumarios.rss'],
      ['rss', 'https://www.bocm.es/boletines.rss'],
    ],
    murcia: [
      ['sumario', 'https://www.borm.es/services/boletin/ultimo'],
      ['sumario', `https://www.borm.es/services/boletin/fecha/${h.dd_mm_aaaa}`],
    ],
    navarra: [
      ['portada', 'https://bon.navarra.es/es/'],
    ],
    paisvasco: [
      ['rss', 'https://www.euskadi.eus/bopv2/datos/Ultimo.xml'],
      ['sumario', 'https://www.euskadi.eus/web01-bopv/es/bopv2/datos/Ultimo.shtml'],
    ],
    rioja: [
      ['portada', 'https://web.larioja.org/bor-portada'],
    ],
  };
}

// ---------------------------------------------------------------------
// Peticiones
// ---------------------------------------------------------------------

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function causa(e) {
  const c = e?.cause || e;
  return [c?.code, c?.message || e?.message].filter(Boolean).join(' · ').slice(0, 200);
}

async function pedir(url) {
  const t0 = Date.now();
  try {
    const res = await fetchGob(url, { headers: HEADERS_BOT, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const tipo = res.headers?.get?.('content-type') || null;
    const modificado = res.headers?.get?.('last-modified') || null;
    const texto = await res.text();
    return { status: res.status, tipo, modificado, bytes: texto.length, ms: Date.now() - t0, texto, final: res.url && res.url !== url ? res.url : null };
  } catch (e) {
    return { status: null, error: e.name === 'TimeoutError' || /timeout/i.test(e.message) ? 'tiempo agotado' : causa(e), ms: Date.now() - t0 };
  }
}

const limpiar = (s) => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Qué es lo que ha llegado, en pocas palabras. */
function muestra(texto, tipo) {
  const t = String(texto || '');
  if (t.startsWith('%PDF')) return 'PDF';
  if (/<rss|<rdf:RDF|<feed/i.test(t.slice(0, 2000))) {
    const n = (t.match(/<item[\s>]/gi) || []).length || (t.match(/<entry[\s>]/gi) || []).length;
    const primero = (t.match(/<(?:item|entry)[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    return `RSS con ${n} elementos · ${limpiar(primero)}`.slice(0, MUESTRA_MAX);
  }
  if (/json/i.test(tipo || '') || /^\s*[[{]/.test(t)) return `JSON · ${t.replace(/\s+/g, ' ').slice(0, 140)}`.slice(0, MUESTRA_MAX);
  if (/^\s*<\?xml/i.test(t) || /xml/i.test(tipo || '')) return `XML · ${t.replace(/\s+/g, ' ').slice(0, 140)}`.slice(0, MUESTRA_MAX);
  const titulo = (t.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  if (titulo) return `HTML · ${limpiar(titulo)}`.slice(0, MUESTRA_MAX);
  return `${tipo || 'desconocido'} · ${t.replace(/\s+/g, ' ').slice(0, 100)}`.slice(0, MUESTRA_MAX);
}

/** Fechas útiles para medir la hora de publicación de un RSS. */
function fechasFeed(texto) {
  const t = String(texto || '');
  if (!/<rss|<rdf:RDF|<feed/i.test(t.slice(0, 2000))) return undefined;
  const build = (t.match(/<lastBuildDate[^>]*>([\s\S]*?)<\/lastBuildDate>/i) || t.match(/<feed[\s\S]*?<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1];
  const primero = (t.match(/<(?:item|entry)[\s\S]*?<(?:pubDate|dc:date|updated|published)[^>]*>([\s\S]*?)<\/(?:pubDate|dc:date|updated|published)>/i) || [])[1];
  if (!build && !primero) return undefined;
  return { last_build: build ? limpiar(build) : undefined, primer_elemento: primero ? limpiar(primero) : undefined };
}

/** Todas las URL de un mismo sitio, una detrás de otra. */
async function probarSitio(origen, entradas) {
  const salida = [];
  const r = await pedir(`${origen}/robots.txt`);
  let reglas = { disallow: [], allow: [], crawlDelay: null };
  let robots;
  if (r.status === 200 && !/<html/i.test((r.texto || '').slice(0, 500))) {
    const leido = leerRobots(r.texto);
    reglas = leido.reglas;
    robots = {
      estado: 'leido',
      grupo_aplicado: leido.grupo,
      prohibe: reglas.disallow.filter(Boolean).slice(0, 40),
      permite: reglas.allow.filter(Boolean).slice(0, 20),
      crawl_delay: reglas.crawlDelay,
      vetados_del_todo: leido.vetadosDelTodo.slice(0, 20),
    };
  } else if (r.status === 404) {
    robots = { estado: 'no existe (todo permitido)' };
  } else {
    robots = { estado: r.error ? `ilegible: ${r.error}` : `ilegible: HTTP ${r.status}` };
  }
  const pausa = Math.min(PAUSA_MAX_MS, Math.max(PAUSA_MIN_MS, (reglas.crawlDelay || 0) * 1000));

  for (const [capa, url] of entradas) {
    const u = new URL(url);
    const ruta = u.pathname + u.search;
    // Si el robots.txt no se pudo leer, se prueba igual (una única
    // petición) y se marca para revisarlo.
    if (robots.estado === 'leido' && !permitidoPorRobots(reglas, ruta)) {
      salida.push({ capa, url, robots: 'prohibido por robots.txt' });
      continue;
    }
    await espera(pausa);
    const p = await pedir(url);
    salida.push({
      capa,
      url,
      robots: robots.estado === 'leido' ? 'permitido' : robots.estado.startsWith('no existe') ? 'sin robots.txt' : 'robots.txt ilegible',
      status: p.status,
      error: p.error,
      tipo: p.tipo,
      kb: p.bytes != null ? Math.round(p.bytes / 1024) : undefined,
      ms: p.ms,
      redirige_a: p.final || undefined,
      last_modified: p.modificado || undefined,
      fechas_feed: p.texto != null ? fechasFeed(p.texto) : undefined,
      muestra: p.texto != null ? muestra(p.texto, p.tipo) : undefined,
    });
  }
  return { origen, robots, urls: salida };
}

/** Veredicto rápido por diario: cuántas URL respondieron bien. */
function veredicto(sitios) {
  const urls = sitios.flatMap((s) => s.urls);
  const ok = urls.filter((u) => u.status >= 200 && u.status < 300).length;
  const prohibidas = urls.filter((u) => u.robots === 'prohibido por robots.txt').length;
  const fallos = urls.length - ok - prohibidas;
  return `${ok}/${urls.length} accesibles${prohibidas ? ` · ${prohibidas} prohibidas por robots.txt` : ''}${fallos ? ` · ${fallos} con error` : ''}`;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }
  const FUENTES = fuentes();
  const t0 = Date.now();
  const pedidos = !sp.get('p') || sp.get('p') === 'todos' ? Object.keys(FUENTES) : sp.get('p').split(',').map((s) => s.trim()).filter((s) => FUENTES[s]);
  if (pedidos.length === 0) return Response.json({ error: `p debe ser una de: ${Object.keys(FUENTES).join(', ')}` }, { status: 400 });

  // Agrupar por sitio (origen) para no pedir dos cosas a la vez al mismo.
  // Si dos diarios compartieran origen, también se serializa.
  const porOrigen = new Map();
  for (const clave of pedidos) {
    for (const e of FUENTES[clave]) {
      const o = new URL(e[1]).origin;
      if (!porOrigen.has(o)) porOrigen.set(o, []);
      porOrigen.get(o).push([clave, ...e]);
    }
  }
  const sitios = await Promise.all(
    [...porOrigen].map(async ([o, es]) => {
      const res = await probarSitio(o, es.map(([, capa, url]) => [capa, url]));
      return { claves: [...new Set(es.map(([c]) => c))], ...res };
    })
  );

  const detalle = Object.fromEntries(
    pedidos.map((clave) => {
      const suyos = sitios
        .filter((s) => s.claves.includes(clave))
        .map(({ claves, ...s }) => ({ ...s, urls: s.urls.filter((u) => FUENTES[clave].some(([, url]) => url === u.url)) }));
      return [clave, { veredicto: veredicto(suyos), sitios: suyos }];
    })
  );

  return Response.json({
    probado_desde: `Vercel (${process.env.VERCEL_REGION || 'región desconocida'})`,
    identificado_como: UA_GOVTALENTBOT,
    fecha: new Date().toISOString(),
    fecha_madrid: hoyMadrid().ddbmmbaaaa,
    ms_total: Date.now() - t0,
    resumen: Object.fromEntries(Object.entries(detalle).map(([k, v]) => [k, v.veredicto])),
    detalle,
  });
}
