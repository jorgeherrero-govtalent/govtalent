// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Parlamentos autonómicos (fase 0)
// app/api/debug/parlamentos/route.js
//
// OBJETIVO: saber, DESDE LA RED DE VERCEL (que es desde donde correrá el
// sync), qué fuentes de los parlamentos autonómicos se pueden leer y
// cuáles no. Desde fuera de Vercel la mitad fallan por certificado, 403 o
// tiempo agotado, y no sabemos si es por la red o por el sitio.
//
// Para cada URL dice: si el robots.txt del sitio la permite, el código
// HTTP, el tipo de contenido, el tamaño, el tiempo y una muestra (el
// título de la página o si es un PDF). Lo que el robots.txt prohíbe NO se
// pide: se informa como «prohibido por robots.txt».
//
// Fuera de esta prueba, por decisión del 04-10-2026: Canarias, Cataluña y
// Extremadura (su robots.txt prohíbe partes clave; se evalúan al final,
// caso a caso).
//
// Va despacio a propósito: una petición cada vez por sitio, respetando
// el Crawl-delay que pida cada robots.txt (máximo 10 s). Los sitios se
// prueban en paralelo entre sí.
//
// Desde el 04-10-2026 (segunda ronda) se identifica como GovTalentBot
// (lib/govtalentBot.js) y aplica el grupo del robots.txt que corresponde
// a ese nombre. Sin ?p= prueba los de la fase 1 (desde el 09-10-2026,
// también Madrid y Cataluña).
//
// Uso:
//   ?key=<DEBUG_KEY>                    los 7 de la fase 1
//   ?key=<DEBUG_KEY>&p=todos            los 14 parlamentos
//   ?key=<DEBUG_KEY>&p=navarra          solo uno (claves: ver FUENTES)
//   ?key=<DEBUG_KEY>&p=navarra,rioja    varios
//
// BORRAR ESTE ARCHIVO al cerrar la fase 0.
// =====================================================================

import { fetchGob } from '@/lib/fetchGob';
import { HEADERS_BOT, UA_GOVTALENTBOT, leerRobots, permitidoPorRobots } from '@/lib/govtalentBot';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// La región (fra1, Fráncfort) se fija en Vercel → Settings → Functions:
// preferredRegion en este archivo no tenía efecto.

const TIMEOUT_MS = 20000;
const PAUSA_MIN_MS = 1000;
const PAUSA_MAX_MS = 10000;
const MUESTRA_MAX = 600;

const HEADERS = HEADERS_BOT;

const FASE1 = ['andalucia', 'aragon', 'asturias', 'cantabria', 'castillayleon', 'rioja', 'valencia', 'madrid', 'cataluna'];

// ---------------------------------------------------------------------
// Las fuentes, del inventario del 04-10-2026. Cada una con su capa:
// boletin, mesa, agenda, diario, tramitacion, ficha, control,
// composicion, datos.
// ---------------------------------------------------------------------

const AND = 'https://www.parlamentodeandalucia.es/webdinamica/portal-web-parlamento';
const FUENTES = {
  andalucia: [
    ['boletin', `${AND}/utilidades/sindicacionrss.do?contenido=Bopa`],
    ['boletin', `${AND}/pdf.do?tipodoc=bopa&id=205554`],
    ['tramitacion', `${AND}/utilidades/sindicacionrss.do?contenido=Iniciativas`],
    ['tramitacion', `${AND}/actividadparlamentaria/tramitacionencurso/legislativas.do`],
    ['ficha', `${AND}/actividadparlamentaria/todaslasiniciativas/portipo.do?numexp=13-26/PPL-000002`],
    ['control', `${AND}/actividadparlamentaria/tramitacionencurso/decontrol.do`],
    ['agenda', `${AND}/utilidades/sindicacionrss.do?contenido=Agendas`],
    ['composicion', `${AND}/composicionyfuncionamiento/organosparlamentarios/comisiones.do`],
  ],
  aragon: [
    ['boletin', 'https://bases.cortesaragon.es/bases/original.nsf/(BOCA1)?OpenView'],
    ['boletin', 'https://bases.cortesaragon.es/bases/original.nsf/(BOCA1)/00093D3478617398C1258E6D003C2283/$File/BOCA_32.pdf'],
    ['tramitacion', 'https://www.cortesaragon.es/Leyes.2580.0.html?no_cache=1'],
    ['agenda', 'https://www.cortesaragon.es/Agenda.2230.0.html?no_cache=1'],
    ['agenda', 'https://ecomisiones.cortesaragon.es/'],
    ['composicion', 'https://www.cortesaragon.es/Comisiones-permanentes.2265.0.html?no_cache=1'],
  ],
  asturias: [
    // www.jgpa.es veta expresamente a ClaudeBot en su robots.txt: solo se
    // lee el robots.txt, para dejar constancia. Las pruebas van contra
    // agoranet, que no tiene robots.txt.
    ['robots', 'https://www.jgpa.es/robots.txt'],
    ['boletin', 'https://agoranet.jgpa.es/documentos/Boletines/PDF/12B-736.pdf'],
    ['boletin', 'https://agoranet.jgpa.es/docuAst/rss.jsp'],
    ['tramitacion', 'https://agoranet.jgpa.es/appAst/SInicial?HC=1'],
    ['tramitacion', 'https://agoranet.jgpa.es/appAst/SInicial?HC=7&M=0'],
    ['diario', 'https://agoranet.jgpa.es/documentos/Diarios/PDF/12J117.pdf'],
  ],
  baleares: [
    ['boletin', 'https://www.parlamentib.es/Publicacions/Detalle.aspx'],
    ['boletin', 'https://web.parlamentib.es/repositori/PUBLICACIONS/11/bopibs/bopib-11-130.pdf'],
    ['agenda', 'https://www.parlamentib.es/Actividad/Actividad.aspx'],
    ['composicion', 'https://www.parlamentib.es/Representants/Diputats.aspx?criteria=1'],
    ['composicion', 'https://www.parlamentib.es/Representants/Comissions.aspx'],
  ],
  cantabria: [
    ['boletin', 'https://parlamento-cantabria.es/actividad/publicaciones/boletin-oficial-del-parlamento-de-cantabria'],
    ['boletin', 'https://parlamento-cantabria.es/publicaciones/boletindelparlamento/bopca-no-36911'],
    ['tramitacion', 'https://parlamento-cantabria.es/actividad/tramitacion-parlamentaria'],
    ['ficha', 'https://parlamento-cantabria.es/actividad/tramitacion/expediente-no-11l1000-0019'],
    ['agenda', 'https://parlamento-cantabria.es/agenda-semana'],
    ['composicion', 'https://parlamento-cantabria.es/informacion-general/comisiones-permanentes'],
  ],
  castillalamancha: [
    ['web', 'https://www.cortesclm.es/'],
    ['boletin', 'https://www.cortesclm.es/web2/paginas/publicaciones/boletin/boletin11/pdf/148.pdf'],
  ],
  castillayleon: [
    ['boletin', 'https://www.ccyl.es/Actividad/BoletinOficial'],
    ['boletin', 'https://www.ccyl.es/Publicaciones/EntradasPublicacion?Legislatura=12&SeriePublicacion=BOCCL&NumeroPublicacion=14'],
    ['boletin', 'https://sirdoc.ccyl.es/sirdoc/PDF/PUBLOFI/BO/CCL/12L/BOCCL1200014A.pdf'],
    ['boletin', 'https://boccl.ccyl.es/cms/es/ultimasPublicaciones'],
    ['tramitacion', 'https://www.ccyl.es/Actividad/TramitacionParlamentaria'],
    ['agenda', 'https://www.ccyl.es/Agenda/Semana'],
  ],
  galicia: [
    ['web', 'https://www.parlamentodegalicia.gal/'],
    ['boletin', 'https://www.parlamentodegalicia.es/sitios/web/BibliotecaBoletinsOficiais/B120389_2.pdf'],
    ['agenda', 'https://www.parlamentodegalicia.gal/Axenda/'],
    ['tramitacion', 'https://www.parlamentodegalicia.gal/Buscador/Expedientes'],
    ['composicion', 'https://www.parlamentodegalicia.gal/Composicion'],
  ],
  // 09-10-2026: solo el subdominio ctyp (PDF del BOAM); la web principal
  // sigue detrás de Sucuri y no se usa.
  madrid: [
    ['boletin', 'https://ctyp.asambleamadrid.es/static/doc/publicaciones/BOAM_13_00172.pdf'],
    // 09-10-2026: el buscador de iniciativas y las fichas (HTML) en los
    // subdominios de las comisiones, como alternativa al BOAM cifrado.
    ['tramitacion', 'https://ctyp.asambleamadrid.es/es/web/guest/actividad/iniciativas'],
    ['datos', 'https://ctyp.asambleamadrid.es/es/web/guest/servicios/datos-abiertos'],
    // Ficheros del catálogo de datos abiertos de la Asamblea (CSV).
    ['datos', 'https://ctyp.asambleamadrid.es/static/doc/opendata/ARCHIVO.F_PRINCIPALES_OPENDATA_VIEW.csv'],
    ['datos', 'https://ctyp.asambleamadrid.es/static/doc/opendata/SGP_ADMIN.OPENDATA_BOAM_VIEW.csv'],
    ['ficha', 'https://ctyp.asambleamadrid.es/actividad/iniciativa?iniciativa=490496'],
    ['tramitacion', 'https://presup-xiii.asambleamadrid.es/es/actividad/iniciativas'],
    ['ficha', 'https://presup-xiii.asambleamadrid.es/actividad/iniciativa?iniciativa=490496'],
  ],
  // 09-10-2026: listados, RSS y PDF del BOPC. /ext (SIAP) está prohibido.
  cataluna: [
    ['tramitacion', 'https://www.parlament.cat/web/activitat-parlamentaria/iniciatives-legislatives/projectes-llei/index.html'],
    ['tramitacion', 'https://www.parlament.cat/web/activitat-parlamentaria/iniciatives-legislatives/proposicions-llei/index.html'],
    ['boletin', 'https://www.parlament.cat/rss/RSS5_0.XML'],
    ['boletin', 'https://www.parlament.cat/rss/RSS1_PUB_BOPC.XML'],
    ['boletin', 'https://www.parlament.cat/document/bopc/444236765.pdf'],
    ['tramitacion', 'https://www.parlament.cat/rss/RSS1_EXP_PROJECTES_LLEI.XML'],
    ['agenda', 'https://www.parlament.cat/rss/RSS1_AGENDA_SESS_ORGAN.XML'],
  ],
  murcia: [
    ['web', 'https://www.asambleamurcia.es/'],
    ['boletin', 'https://www.asambleamurcia.es/publicaciones/boletin-oficial'],
    ['tramitacion', 'https://www.asambleamurcia.es/arm/tramitacion-parlamentaria'],
    ['agenda', 'https://www.asambleamurcia.es/agenda'],
    ['composicion', 'https://www.asambleamurcia.es/arm/grupos'],
  ],
  navarra: [
    ['boletin', 'https://parlamentodenavarra.es/feeds/parlamento_boletines/rss.xml'],
    ['boletin', 'https://parlamentodenavarra.es/sites/default/files/boletines/B2026089.pdf'],
    ['tramitacion', 'https://parlamentodenavarra.es/feeds/parlamento_expedientes/rss.xml'],
    ['ficha', 'https://parlamentodenavarra.es/es/expedientes/11-26ley-00005'],
    ['agenda', 'https://parlamentodenavarra.es/feeds/parlamento_sesiones/rss.xml'],
    ['composicion', 'https://parlamentodenavarra.es/es/composicion-organos/organos-parlamento'],
  ],
  paisvasco: [
    ['web', 'https://www.legebiltzarra.eus/'],
    ['agenda', 'https://www.legebiltzarra.eus/agenda/c_agenda_semanal.html'],
    ['tramitacion', 'https://www.legebiltzarra.eus/c_recientes.html'],
    ['tramitacion', 'https://www.legebiltzarra.eus/calendario/c_calendario.html'],
    ['datos', 'https://www.legebiltzarra.eus/portal/es/transparencia/open-data'],
  ],
  rioja: [
    ['boletin', 'https://www.parlamento-larioja.org/recursos-de-informacion/publicaciones-oficiales/ultimos-boletines-oficiales/RSS'],
    ['boletin', 'https://www.parlamento-larioja.org/recursos-de-informacion/publicaciones-oficiales/boletin-oficial/bopr-11-155a'],
    ['control', 'https://www.parlamento-larioja.org/actividad-parlamentaria/listado-ultimas-iniciativas/RSS'],
    ['ficha', 'https://www.parlamento-larioja.org/actividad-parlamentaria/iniciativas/pl/11l-pl-0019'],
    ['agenda', 'https://www.parlamento-larioja.org/actividad-parlamentaria/sesiones-parlamentarias/sesiones-parlamentarias/RSS'],
    ['composicion', 'https://www.parlamento-larioja.org/composicion-y-organos/legislatura-11/organos/comisiones'],
  ],
  valencia: [
    ['tramitacion', 'https://www.cortsvalencianes.es/ca-va/actividad/iniciativa/rss.xml'],
    ['boletin', 'https://www.cortsvalencianes.es/publicaciones-CV/obtenerPdfBO?f_id_bocv=XI00248000&idioma=es_ES'],
    ['agenda', 'https://www.cortsvalencianes.es/ca-va/actividad/actualidad/agenda.xml'],
    ['composicion', 'https://www.cortsvalencianes.es/es/composicion/organos/comisiones/xi/ec/diputados'],
    ['composicion', 'https://www.cortsvalencianes.es/es/parlament-obert/transparencia/organizacion/gp/personal'],
  ],
};

// ---------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------

// leerRobots y permitidoPorRobots están en lib/govtalentBot.js.

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
    const res = await fetchGob(url, { headers: HEADERS, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const tipo = res.headers?.get?.('content-type') || null;
    const texto = await res.text();
    return { status: res.status, tipo, bytes: texto.length, ms: Date.now() - t0, texto, final: res.url && res.url !== url ? res.url : null };
  } catch (e) {
    return { status: null, error: e.name === 'TimeoutError' || /timeout/i.test(e.message) ? 'tiempo agotado' : causa(e), ms: Date.now() - t0 };
  }
}

/** Qué es lo que ha llegado, en pocas palabras. */
function muestra(texto, tipo) {
  const t = String(texto || '');
  if (t.startsWith('%PDF')) return 'PDF';
  if (/<rss|<rdf:RDF|<feed/i.test(t.slice(0, 2000))) {
    const n = (t.match(/<item[\s>]/gi) || []).length || (t.match(/<entry[\s>]/gi) || []).length;
    const primero = (t.match(/<item[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    return `RSS con ${n} elementos · ${primero.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\s+/g, ' ').trim()}`.slice(0, MUESTRA_MAX);
  }
  const titulo = (t.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  if (titulo) return `HTML · ${titulo.replace(/\s+/g, ' ').trim()}`.slice(0, 160);
  // CSV: cabecera y dos filas, para ver las columnas.
  if (/csv/i.test(tipo || '') || /;|,/.test(t.split('\n')[0] || '')) return `${tipo || 'desconocido'} · ${t.split(/\r?\n/).slice(0, 3).join(' ⏎ ')}`.slice(0, MUESTRA_MAX);
  return `${tipo || 'desconocido'} · ${t.replace(/\s+/g, ' ').slice(0, 100)}`.slice(0, MUESTRA_MAX);
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
      prohibe_para_todos: reglas.disallow.filter(Boolean),
      permite: reglas.allow.filter(Boolean),
      crawl_delay: reglas.crawlDelay,
      agentes_nombrados: leido.nombrados.slice(0, 20),
      vetados_del_todo: leido.vetadosDelTodo.slice(0, 20),
    };
  } else if (r.status === 404) {
    robots = { estado: 'no existe (todo permitido)' };
  } else {
    robots = { estado: r.error ? `ilegible: ${r.error}` : `ilegible: HTTP ${r.status}` };
  }
  const pausa = Math.min(PAUSA_MAX_MS, Math.max(PAUSA_MIN_MS, (reglas.crawlDelay || 0) * 1000));

  for (const [capa, url] of entradas) {
    if (capa === 'robots') continue;
    const ruta = new URL(url).pathname + new URL(url).search;
    // Si el robots.txt no se pudo leer, no se sabe qué permite: se prueba
    // igual (es una única petición) y se marca para revisarlo.
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
      muestra: p.texto != null ? muestra(p.texto, p.tipo) : undefined,
    });
  }
  return { origen, robots, urls: salida };
}

/** Veredicto rápido por parlamento: cuántas URL respondieron bien. */
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
  const t0 = Date.now();
  const pedidos = !sp.get('p') ? FASE1 : sp.get('p') === 'todos' ? Object.keys(FUENTES) : sp.get('p').split(',').map((s) => s.trim()).filter((s) => FUENTES[s]);
  if (pedidos.length === 0) return Response.json({ error: `p debe ser una de: ${Object.keys(FUENTES).join(', ')}` }, { status: 400 });

  // Agrupar por sitio (origen), para no pedir dos cosas a la vez al mismo
  const resultado = await Promise.all(
    pedidos.map(async (clave) => {
      const porOrigen = new Map();
      for (const e of FUENTES[clave]) {
        const o = new URL(e[1]).origin;
        if (!porOrigen.has(o)) porOrigen.set(o, []);
        porOrigen.get(o).push(e);
      }
      const sitios = await Promise.all([...porOrigen].map(([o, es]) => probarSitio(o, es)));
      return [clave, { veredicto: veredicto(sitios), sitios }];
    })
  );

  return Response.json({
    probado_desde: `Vercel (${process.env.VERCEL_REGION || 'región desconocida'})`,
    identificado_como: UA_GOVTALENTBOT,
    fecha: new Date().toISOString(),
    ms_total: Date.now() - t0,
    resumen: Object.fromEntries(resultado.map(([k, v]) => [k, v.veredicto])),
    detalle: Object.fromEntries(resultado),
  });
}
