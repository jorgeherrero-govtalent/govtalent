// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — ¿hay descripción de las iniciativas?
//
// El listado de brpapi trae 7 campos y ninguno es descriptivo. Pero la
// página pública del portal sí muestra un resumen, así que ese texto está
// en algún sitio. Esta ruta busca dónde.
//
// Se prueba con la iniciativa 14858 (baterías), cuya página verificamos
// que carga: ec.europa.eu/info/law/better-regulation/have-your-say/
// initiatives/14858
//
// Uso:
//   ?key=<DEBUG_KEY>          sondea los candidatos
//   ?key=...&id=<n>           con otra iniciativa
//   ?key=...&url=<url>        una URL suelta (solo europa.eu)
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TIMEOUT_MS = 20000;
const BRP = 'https://ec.europa.eu/info/law/better-regulation/brpapi';
const HOST_PERMITIDO = /(^|\.)europa\.eu$/i;

function hostOk(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOST_PERMITIDO.test(u.hostname);
  } catch {
    return false;
  }
}

async function pedir(url) {
  if (!hostOk(url)) return { url, error: 'host no permitido' };
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/html;q=0.8, */*;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    const ct = res.headers.get('content-type') || '';
    const txt = await res.text();
    let data = null;
    try {
      data = JSON.parse(txt);
    } catch {}
    return { url, status: res.status, ms: Date.now() - t0, content_type: ct, texto: txt, data };
  } catch (e) {
    return { url, status: null, ms: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Busca recursivamente campos que parezcan texto descriptivo: cualquier
// clave que suene a resumen, o cualquier cadena larga de prosa.
function buscarDescripcion(obj, ruta = '', hallazgos = [], prof = 0) {
  if (prof > 7 || !obj || typeof obj !== 'object') return hallazgos;
  const CLAVES = /(descr|summar|abstract|content|objectiv|context|body|text|detail|scope|rationale)/i;
  for (const [k, v] of Object.entries(obj)) {
    const r = ruta ? `${ruta}.${k}` : k;
    if (typeof v === 'string') {
      const esProsa = v.length > 120 && v.split(' ').length > 20;
      if (CLAVES.test(k) || esProsa) {
        hallazgos.push({ campo: r, longitud: v.length, muestra: v.slice(0, 260) });
      }
    } else if (v && typeof v === 'object') {
      buscarDescripcion(v, r, hallazgos, prof + 1);
    }
  }
  return hallazgos;
}

// Extrae la meta description del HTML: si el portal la rellena con el
// resumen, ya tenemos la respuesta sin necesidad de API.
function metaDelHtml(html) {
  const out = {};
  const md = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{40,})["']/i);
  if (md) out.meta_description = md[1].slice(0, 300);
  const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{40,})["']/i);
  if (og) out.og_description = og[1].slice(0, 300);
  // Datos incrustados en JSON dentro del HTML
  const js = html.match(/<script[^>]*>\s*window\.__\w+\s*=\s*(\{[\s\S]{200,}?\})\s*;?\s*<\/script>/i);
  if (js) out.json_incrustado = js[1].slice(0, 300);
  return out;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  if (sp.get('url')) {
    const r = await pedir(sp.get('url'));
    return Response.json({
      modo: 'url suelta',
      status: r.status,
      content_type: r.content_type,
      tamano: r.texto?.length,
      campos_descriptivos: r.data ? buscarDescripcion(r.data) : null,
      meta_html: !r.data && r.texto ? metaDelHtml(r.texto) : null,
      muestra: r.texto?.slice(0, 800),
    });
  }

  const id = sp.get('id') || '14858';
  const salida = { generado: new Date().toISOString(), iniciativa: id };

  // --- A) La página pública: ¿trae el texto en el HTML? ---------------
  const pagina = await pedir(
    `https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/${id}`
  );
  salida.a_pagina_publica = {
    pregunta: '¿La página trae el resumen en el HTML, o lo pinta JavaScript?',
    status: pagina.status,
    tamano: pagina.texto?.length,
    meta: pagina.texto ? metaDelHtml(pagina.texto) : null,
    // Si el HTML es corto, el contenido lo carga el navegador y habría que
    // buscar el endpoint que consulta.
    veredicto:
      pagina.texto && pagina.texto.length < 8000
        ? 'HTML corto: lo renderiza JavaScript, hay que encontrar su endpoint'
        : 'HTML largo: puede traer contenido extraíble',
  };

  // --- B) Endpoints de brpapi que puedan traer la ficha completa ------
  const candidatos = [
    `${BRP}/initiativeDetails/${id}`,
    `${BRP}/initiative/${id}/details`,
    `${BRP}/getInitiative?id=${id}`,
    `${BRP}/initiatives/${id}/description`,
    `${BRP}/searchInitiatives?text=&language=ES&size=1&initiativeId=${id}`,
    `${BRP}/publications?initiativeId=${id}&size=3`,
    `${BRP}/feedback?initiativeId=${id}&size=1`,
  ];

  const res = [];
  for (const u of candidatos) {
    const r = await pedir(u);
    res.push({
      url: u.replace(BRP, ''),
      status: r.status,
      es_json: !!r.data,
      claves: r.data && !Array.isArray(r.data) ? Object.keys(r.data).slice(0, 10) : null,
      campos_descriptivos: r.data ? buscarDescripcion(r.data).slice(0, 3) : null,
      tamano: r.texto?.length ?? null,
    });
  }
  salida.b_endpoints = {
    pregunta: '¿Algún endpoint devuelve la ficha con descripción?',
    candidatos: res,
  };

  // --- C) El propio listado, mirado a fondo ---------------------------
  // Por si hubiera algún campo descriptivo que se nos pasara al revisar
  // solo las claves de primer nivel.
  const listado = await pedir(`${BRP}/searchInitiatives?text=&language=ES&size=1&page=0`);
  const primera = listado.data?.initiativeResultDtoPage?.content?.[0];
  salida.c_listado = {
    pregunta: '¿Hay algún campo descriptivo escondido en el listado?',
    claves: primera ? Object.keys(primera) : null,
    campos_descriptivos: primera ? buscarDescripcion(primera) : null,
    // Las traducciones tienen un campo 'field': quizá haya más tipos
    // además de SHORT_TITLE.
    tipos_de_traduccion: primera?.initiativeTranslations
      ? [...new Set(primera.initiativeTranslations.map((t) => t.field))]
      : null,
  };

  salida.siguiente_paso = 'Con ?url=<url> puedes probar cualquier otro endpoint de europa.eu.';
  return Response.json(salida);
}
