// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Comisión Europea (v2)
//
// Confirmado en la v1:
//   - brpapi/searchInitiatives devuelve JSON con feedbackEndDate y
//     receivingFeedbackStatus: ahí está la "ventana abierta".
//   - Los dos endpoints SPARQL responden, pero una consulta genérica solo
//     devuelve tripletas de la ontología: falta localizar Whoiswho.
//   - op.europa.eu está detrás de un WAF de Azure (403), así que la web
//     del directorio no es una vía: SPARQL es la única.
//
// Esta versión resuelve:
//   1. Cuántas iniciativas hay en total y si la paginación funciona
//   2. Qué filtros acepta brpapi (materia, estado, solo abiertas)
//   3. La forma completa de UNA iniciativa (para diseñar el esquema)
//   4. Si existe endpoint de ficha individual
//   5. En qué grafo vive Whoiswho y con qué clases
//
// Uso:
//   ?key=<DEBUG_KEY>                todo
//   ?key=...&url=<url>              una URL suelta (solo europa.eu)
//   ?key=...&q=<consulta sparql>    una consulta SPARQL a medida
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TIMEOUT_MS = 20000;
const BRP = 'https://ec.europa.eu/info/law/better-regulation/brpapi';
const SPARQL = 'https://publications.europa.eu/webapi/rdf/sparql';

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
        Accept: 'application/json, */*;q=0.5',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    const txt = await res.text();
    let data = null;
    try {
      data = JSON.parse(txt);
    } catch {}
    return { url, status: res.status, ms: Date.now() - t0, data, raw: txt.slice(0, 600) };
  } catch (e) {
    return { url, status: null, ms: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function sparql(consulta) {
  const url = `${SPARQL}?query=${encodeURIComponent(consulta)}&format=application%2Fsparql-results%2Bjson`;
  const r = await pedir(url);
  const bindings = r.data?.results?.bindings || [];
  return {
    consulta,
    status: r.status,
    ms: r.ms,
    error: r.error || null,
    filas: bindings.length,
    // Se aplanan las bindings: {s:{value:'x'}} -> {s:'x'}, más legible.
    resultados: bindings.map((b) => {
      const o = {};
      for (const [k, v] of Object.entries(b)) o[k] = v.value;
      return o;
    }),
  };
}

// Quita las traducciones a 24 idiomas para poder ver la forma del registro
// sin que el ruido tape los campos que importan.
function podarTraducciones(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const copia = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'initiativeTranslations' && Array.isArray(v)) {
      const es = v.filter((t) => t.language === 'ES');
      copia[k] = [...es, `[...${v.length} traducciones en total, solo se muestran las ES]`];
    } else if (v && typeof v === 'object') {
      copia[k] = podarTraducciones(v);
    } else {
      copia[k] = v;
    }
  }
  return copia;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  // --- Modos sueltos, para iterar sin desplegar ------------------------
  if (sp.get('url')) {
    const r = await pedir(sp.get('url'));
    return Response.json({ modo: 'url suelta', status: r.status, ms: r.ms, data: podarTraducciones(r.data) || r.raw });
  }
  if (sp.get('q')) {
    return Response.json({ modo: 'sparql a medida', ...(await sparql(sp.get('q'))) });
  }

  const salida = { generado: new Date().toISOString(), a_iniciativas: {}, b_whoiswho: {} };

  // -------------------------------------------------------------------
  // A) BRPAPI — iniciativas y consultas públicas
  // -------------------------------------------------------------------

  // A1. Total y paginación
  const a1 = await pedir(`${BRP}/searchInitiatives?text=&language=EN&size=1&page=0`);
  const page = a1.data?.initiativeResultDtoPage;
  salida.a_iniciativas['1_total'] = {
    pregunta: '¿Cuántas iniciativas hay y cómo pagina?',
    status: a1.status,
    ms: a1.ms,
    claves_del_page: page ? Object.keys(page) : null,
    total_elementos: page?.totalElements ?? null,
    total_paginas: page?.totalPages ?? null,
    tamano_pagina: page?.size ?? null,
  };

  // A2. ¿Se pueden pedir solo las que tienen ventana abierta?
  const filtros = [
    `${BRP}/searchInitiatives?text=&language=EN&size=3&receivingFeedbackStatus=OPEN`,
    `${BRP}/searchInitiatives?text=&language=EN&size=3&initiativeStatus=ACTIVE`,
    `${BRP}/searchInitiatives?text=batteries&language=EN&size=3`,
    `${BRP}/searchInitiatives?text=&language=ES&size=3`,
  ];
  const resFiltros = [];
  for (const u of filtros) {
    const r = await pedir(u);
    const p = r.data?.initiativeResultDtoPage;
    resFiltros.push({
      url: u.replace(BRP, ''),
      status: r.status,
      total: p?.totalElements ?? null,
      devueltos: p?.content?.length ?? null,
      // Si el filtro se ignora, el total será idéntico al de A1.
      primer_titulo: p?.content?.[0]?.shortTitle ?? null,
      primer_estado: p?.content?.[0]?.currentStatuses?.[0]?.receivingFeedbackStatus ?? null,
    });
  }
  salida.a_iniciativas['2_filtros'] = {
    pregunta: '¿Acepta filtros por estado, texto e idioma, o los ignora?',
    nota: 'Si el total coincide con el de 1_total, el filtro no se está aplicando.',
    resultados: resFiltros,
  };

  // A3. Forma completa de un registro — es lo que define el esquema
  const a3 = await pedir(`${BRP}/searchInitiatives?text=&language=EN&size=1&page=0`);
  const primera = a3.data?.initiativeResultDtoPage?.content?.[0] || null;
  salida.a_iniciativas['3_forma_registro'] = {
    pregunta: '¿Qué campos trae una iniciativa?',
    claves: primera ? Object.keys(primera) : null,
    claves_de_currentStatuses: primera?.currentStatuses?.[0] ? Object.keys(primera.currentStatuses[0]) : null,
    registro_completo: podarTraducciones(primera),
  };

  // A4. ¿Hay ficha individual? Se prueba con el id de la primera.
  const id = primera?.id != null ? String(primera.id).replace(/\.0$/, '') : null;
  if (id) {
    const candidatos = [
      `${BRP}/initiatives/${id}`,
      `${BRP}/initiative/${id}`,
      `${BRP}/searchInitiatives?id=${id}&language=EN`,
    ];
    const res = [];
    for (const u of candidatos) {
      const r = await pedir(u);
      res.push({
        url: u.replace(BRP, ''),
        status: r.status,
        es_json: !!r.data,
        claves: r.data && !Array.isArray(r.data) ? Object.keys(r.data).slice(0, 12) : null,
      });
    }
    salida.a_iniciativas['4_ficha_individual'] = {
      pregunta: '¿Existe endpoint de ficha individual? (id probado: ' + id + ')',
      candidatos: res,
    };
  }

  // -------------------------------------------------------------------
  // B) SPARQL — localizar Whoiswho
  // -------------------------------------------------------------------

  // B1. Qué grafos existen con "whoiswho" o "authority" en el nombre
  salida.b_whoiswho['1_grafos'] = await sparql(
    `SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } } LIMIT 50`
  );

  // B2. Clases disponibles: si Whoiswho está aquí, debería salir algo
  //     tipo Person, Organization o similar.
  salida.b_whoiswho['2_clases'] = await sparql(
    `SELECT ?tipo (COUNT(?s) AS ?n) WHERE { ?s a ?tipo } GROUP BY ?tipo ORDER BY DESC(?n) LIMIT 30`
  );

  // B3. Búsqueda directa de cualquier cosa con "whoiswho" en la URI
  salida.b_whoiswho['3_buscar_wiw'] = await sparql(
    `SELECT DISTINCT ?s WHERE { ?s ?p ?o . FILTER(CONTAINS(LCASE(STR(?s)), "whoiswho")) } LIMIT 20`
  );

  salida.siguiente_paso =
    'Con ?q=<consulta> puedes lanzar cualquier SPARQL, y con ?url=<url> cualquier endpoint de europa.eu.';

  return Response.json(salida);
}
