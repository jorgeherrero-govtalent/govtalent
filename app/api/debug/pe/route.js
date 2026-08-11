// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — API del Parlamento Europeo
//
// Objetivo: ver la forma REAL de las respuestas antes de diseñar el
// esquema. Responde a tres preguntas:
//   1. /meps/show-current  -> ¿trae país y grupo político por eurodiputado?
//   2. /corporate-bodies   -> ¿cómo se identifican las comisiones?
//   3. /meps/{id}          -> ¿las comisiones vienen dentro de la ficha
//                             o hay que resolverlas aparte?
//
// BORRAR ESTE ARCHIVO cuando terminemos el diagnóstico.
//
// Notas:
// - El host está fijado en constante: no acepta URLs del usuario, así que
//   no hay superficie de SSRF aunque la ruta esté sin proteger.
// - Cada petición tiene su propio timeout para que un endpoint lento no
//   se lleve por delante a los otros dos.
// - Parámetros opcionales para iterar sin volver a desplegar:
//     ?limit=5        nº de elementos a pedir
//     ?mepId=124936   forzar un eurodiputado concreto en el paso 3
//     ?chars=4000     tamaño de la muestra cruda
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://data.europarl.europa.eu/api/v2';
const TIMEOUT_MS = 20000;

async function callEP(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/ld+json' },
      cache: 'no-store',
    });

    const rawText = await res.text();
    let data = null;
    let parseError = null;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      parseError = e.message;
    }

    return {
      url,
      http_status: res.status,
      content_type: res.headers.get('content-type'),
      ms: Date.now() - started,
      parse_error: parseError,
      // La API a veces responde 200 con un campo "error" en el cuerpo:
      // hay que detectarlo explícitamente o pasa por bueno.
      error_en_cuerpo: data && typeof data === 'object' ? data.error || null : null,
      data,
      raw_head: rawText.slice(0, 500),
    };
  } catch (e) {
    return {
      url,
      http_status: null,
      ms: Date.now() - started,
      fallo: e.name === 'AbortError' ? `timeout tras ${TIMEOUT_MS} ms` : e.message,
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Resumen estructural: lo que de verdad necesito para diseñar el esquema.
function estructura(data) {
  if (!data || typeof data !== 'object') return { tipo: typeof data };

  const graph = Array.isArray(data['@graph']) ? data['@graph'] : null;
  const primero = graph && graph.length > 0 ? graph[0] : null;

  return {
    claves_raiz: Object.keys(data),
    hay_graph: !!graph,
    elementos_en_graph: graph ? graph.length : null,
    claves_del_primer_elemento: primero ? Object.keys(primero) : null,
    primer_elemento_completo: primero,
  };
}

function muestra(data, chars) {
  if (!data) return null;
  const s = JSON.stringify(data);
  return s.length > chars ? s.slice(0, chars) + `\n\n[...recortado, total ${s.length} caracteres]` : s;
}

// Busca el identificador del primer eurodiputado en la respuesta del paso 1.
function primerMepId(data) {
  const graph = data && Array.isArray(data['@graph']) ? data['@graph'] : null;
  if (!graph || graph.length === 0) return null;
  const m = graph[0];
  if (m.identifier) return String(m.identifier);
  if (m['@id']) {
    const partes = String(m['@id']).split('/');
    return partes[partes.length - 1];
  }
  return null;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const limit = sp.get('limit') || '3';
  const chars = parseInt(sp.get('chars') || '4000', 10);
  const mepIdForzado = sp.get('mepId');

  const salida = {
    generado: new Date().toISOString(),
    base: BASE,
    pasos: {},
  };

  // ---------------------------------------------------------------
  // PASO 1 — Eurodiputados con mandato activo
  // ¿Vienen country y politicalGroup en el propio listado?
  // ---------------------------------------------------------------
  const paso1 = await callEP(`${BASE}/meps/show-current?limit=${limit}&format=application%2Fld%2Bjson`);
  salida.pasos['1_meps_show_current'] = {
    pregunta: '¿El listado trae país y grupo político por eurodiputado?',
    http_status: paso1.http_status,
    ms: paso1.ms,
    fallo: paso1.fallo || null,
    error_en_cuerpo: paso1.error_en_cuerpo || null,
    parse_error: paso1.parse_error || null,
    estructura: estructura(paso1.data),
    muestra_cruda: muestra(paso1.data, chars),
    raw_head: paso1.data ? null : paso1.raw_head,
  };

  // ---------------------------------------------------------------
  // PASO 2 — Órganos (comisiones, delegaciones, grupos políticos)
  // ¿Cómo se distinguen unos de otros?
  // ---------------------------------------------------------------
  const paso2 = await callEP(`${BASE}/corporate-bodies?limit=${limit}&format=application%2Fld%2Bjson`);
  salida.pasos['2_corporate_bodies'] = {
    pregunta: '¿Cómo se identifican comisiones vs delegaciones vs grupos políticos?',
    http_status: paso2.http_status,
    ms: paso2.ms,
    fallo: paso2.fallo || null,
    error_en_cuerpo: paso2.error_en_cuerpo || null,
    parse_error: paso2.parse_error || null,
    estructura: estructura(paso2.data),
    muestra_cruda: muestra(paso2.data, chars),
    raw_head: paso2.data ? null : paso2.raw_head,
  };

  // ---------------------------------------------------------------
  // PASO 3 — Ficha individual de un eurodiputado
  // LA PREGUNTA CLAVE: ¿trae sus comisiones, o hay que resolverlas
  // con una segunda llamada por cada uno de los 720?
  // ---------------------------------------------------------------
  const mepId = mepIdForzado || primerMepId(paso1.data);

  if (!mepId) {
    salida.pasos['3_mep_individual'] = {
      pregunta: '¿La ficha individual incluye las comisiones del eurodiputado?',
      omitido: 'No se pudo extraer ningún id del paso 1. Reintentar con ?mepId=XXXX',
    };
  } else {
    const paso3 = await callEP(`${BASE}/meps/${mepId}?format=application%2Fld%2Bjson`);
    salida.pasos['3_mep_individual'] = {
      pregunta: '¿La ficha individual incluye las comisiones del eurodiputado?',
      mep_id_usado: mepId,
      http_status: paso3.http_status,
      ms: paso3.ms,
      fallo: paso3.fallo || null,
      error_en_cuerpo: paso3.error_en_cuerpo || null,
      parse_error: paso3.parse_error || null,
      estructura: estructura(paso3.data),
      muestra_cruda: muestra(paso3.data, chars),
      raw_head: paso3.data ? null : paso3.raw_head,
    };
  }

  salida.resumen = Object.entries(salida.pasos).map(([k, v]) => ({
    paso: k,
    status: v.http_status ?? 'no ejecutado',
    ms: v.ms ?? null,
    elementos: v.estructura?.elementos_en_graph ?? null,
    problema: v.fallo || v.error_en_cuerpo || v.parse_error || v.omitido || null,
  }));

  return new Response(JSON.stringify(salida, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
