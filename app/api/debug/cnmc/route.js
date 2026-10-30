// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — CNMC (paso 0)
// app/api/debug/cnmc/route.js
//
// OBJETIVO: saber, DESDE LA RED DE VERCEL y como GovTalentBot, qué se
// puede leer de cnmc.es antes de activar el sync (documento del proyecto
// «cnmc-fuente.md»):
//   - el robots.txt (desde fuera no se pudo leer) y qué permite;
//   - si el RSS general está al día (el 27-10 la última entrada era del
//     08-10) y cuántas entradas son de expedientes;
//   - el listado de Actuaciones (página 0): cuántas filas reconoce el
//     lector y cómo se clasifican;
//   - una ficha de expediente, ya leída;
//   - las consultas públicas.
//
// Lo prohibido por robots.txt NO se pide: se informa. Una petición cada
// vez y respetando el Crawl-delay (lib/ccaa/web.js).
//
// Uso:  ?key=<DEBUG_KEY>                 todo
//       ?key=<DEBUG_KEY>&slug=s001725    con esa ficha
//       ?key=<DEBUG_KEY>&html=1          además, trozos de HTML en bruto
//
// BORRAR ESTE ARCHIVO al cerrar el paso 0.
// =====================================================================

import { crearWeb } from '@/lib/ccaa/web';
import { fetchGob } from '@/lib/fetchGob';
import { HEADERS_BOT, UA_GOVTALENTBOT, leerRobots, permitidoPorRobots } from '@/lib/govtalentBot';
import { ORIGEN, URL_RSS, URL_LISTADO, urlFicha, bloqueDe, leerRss, leerListado, leerFicha, frescuraRss } from '@/lib/cnmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const URL_CONSULTAS = `${ORIGEN}/participa/consultas-publicas`;

async function paso(nombre, fn) {
  const t0 = Date.now();
  try {
    return { paso: nombre, ok: true, ms: Date.now() - t0, ...(await fn()) };
  } catch (e) {
    return { paso: nombre, ok: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 300), robots: e.robots || undefined, status: e.status, cuerpo: e.cuerpo?.slice(0, 300) };
  }
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || String(sp.get('key') || '').toLowerCase() !== process.env.DEBUG_KEY.toLowerCase()) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }
  const conHtml = sp.get('html') === '1';
  const t0 = Date.now();
  const web = crearWeb();
  const pasos = [];

  // 1. robots.txt, en bruto (para ver qué dice además del grupo que aplica).
  let reglas = { disallow: [], allow: [], crawlDelay: null };
  pasos.push(await paso('robots.txt', async () => {
    const r = await fetchGob(`${ORIGEN}/robots.txt`, { headers: HEADERS_BOT, cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const texto = await r.text();
    if (r.status !== 200) return { status: r.status, muestra: texto.slice(0, 300) };
    const leido = leerRobots(texto);
    reglas = leido.reglas;
    const rutas = ['/feed/all', '/somos-cnmc/transparencia/actuaciones?page=0', '/expedientes/s001725', '/participa/consultas-publicas', '/sites/default/files/x.pdf'];
    return {
      status: r.status,
      grupo_aplicado: leido.grupo,
      prohibe: reglas.disallow.filter(Boolean).slice(0, 60),
      permite: reglas.allow.filter(Boolean).slice(0, 30),
      crawl_delay: reglas.crawlDelay,
      vetados_del_todo: leido.vetadosDelTodo.slice(0, 20),
      nos_permite: Object.fromEntries(rutas.map((ruta) => [ruta, permitidoPorRobots(reglas, ruta)])),
      texto: texto.slice(0, 3000),
    };
  }));

  // 2. RSS
  pasos.push(await paso('rss', async () => {
    const xml = await web.texto(URL_RSS);
    const items = leerRss(xml);
    return {
      mas_reciente: frescuraRss(xml),
      expedientes: items.length,
      de_api: items.filter((i) => i.api).length,
      muestra: items.slice(0, 8).map((i) => ({ slug: i.slug, titulo: i.titulo, publicado_en: i.publicado_en, bloque: bloqueDe(i) || 'fuera' })),
    };
  }));

  // 3. Listado, página 0
  let slugPrueba = sp.get('slug');
  pasos.push(await paso('listado', async () => {
    const html = await web.texto(`${URL_LISTADO}?page=0`);
    const filas = leerListado(html);
    const conBloque = filas.map((f) => ({ ...f, bloque: bloqueDe(f) }));
    if (!slugPrueba) slugPrueba = conBloque.find((f) => f.bloque)?.slug || 's001725';
    const i = html.search(/<tr\b[^>]*>[\s\S]{0,4000}?\/expedientes\//i);
    return {
      filas: filas.length,
      dentro: conBloque.filter((f) => f.bloque).length,
      muestra: conBloque.slice(0, 25).map((f) => ({ codigo: f.codigo || f.slug, bloque: f.bloque || 'fuera', procedimiento: f.procedimiento, ambito: f.ambito, actos: f.actos, titulo: String(f.titulo || '').slice(0, 90) })),
      html: conHtml || filas.length === 0 ? (i >= 0 ? html.slice(i, i + 3000) : html.slice(0, 3000)) : undefined,
    };
  }));

  // 4. Una ficha
  pasos.push(await paso('ficha', async () => {
    const html = await web.texto(urlFicha(slugPrueba));
    const f = leerFicha(html, slugPrueba);
    const i = html.search(/<h1\b/i);
    return {
      slug: slugPrueba,
      ficha: { ...f, bloque: bloqueDe(f) || 'fuera' },
      html: conHtml || !f.codigo || f.cronologia.length === 0 ? html.slice(Math.max(0, i), Math.max(0, i) + 5000) : undefined,
    };
  }));

  // 5. Consultas públicas
  pasos.push(await paso('consultas', async () => {
    const html = await web.texto(URL_CONSULTAS);
    const enlaces = [...html.matchAll(/href\s*=\s*["']([^"']*\/consultas-publicas\/[^"'?#]+)["']/gi)].map((m) => m[1]);
    const unicos = [...new Set(enlaces)];
    const plazos = [...html.matchAll(/Desde\s+\d{1,2}\s+de\s+\S+\s+del?\s+\d{4}\s+hasta\s+\d{1,2}\s+de\s+\S+\s+del?\s+\d{4}/gi)].map((m) => m[0]);
    const i = html.search(/Desde\s+\d{1,2}\s+de/i);
    return {
      consultas_enlazadas: unicos.length,
      muestra_enlaces: unicos.slice(0, 10),
      plazos_vistos: plazos.slice(0, 10),
      html: conHtml ? html.slice(Math.max(0, i - 1500), Math.max(0, i - 1500) + 3000) : undefined,
    };
  }));

  return Response.json({
    probado_desde: `Vercel (${process.env.VERCEL_REGION || 'región desconocida'})`,
    identificado_como: UA_GOVTALENTBOT,
    fecha: new Date().toISOString(),
    ms_total: Date.now() - t0,
    resumen: Object.fromEntries(pasos.map((p) => [p.paso, p.ok ? 'ok' : `error: ${p.error}`])),
    pasos,
  });
}
