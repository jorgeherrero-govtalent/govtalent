// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Comisión Europea
//
// Dos fuentes a comprobar:
//   A) "Have your say" (have-your-say.ec.europa.eu) — consultas públicas
//      y convocatorias de aportaciones. NO hay API documentada; se sondean
//      varios candidatos para ver si el buscador tira de algún JSON.
//   B) EU Whoiswho — directorio oficial (comisarios, gabinetes, DG).
//      Expone SPARQL, no REST.
//
// Uso:
//   ?key=<DEBUG_KEY>              sondea todos los candidatos
//   ?key=...&url=<url>            prueba una URL concreta (solo europa.eu)
//   ?key=...&sparql=1             lanza una consulta SPARQL de prueba
//   ?key=...&chars=2000           tamaño de la muestra devuelta
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TIMEOUT_MS = 15000;

// Solo dominios de la UE. Esta ruta acepta una URL por parámetro, así que
// sin esta comprobación sería una puerta abierta a SSRF.
const HOST_PERMITIDO = /(^|\.)europa\.eu$/i;

function hostOk(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return HOST_PERMITIDO.test(u.hostname);
  } catch {
    return false;
  }
}

async function sondear(url, { accept = 'application/json, text/html;q=0.8, */*;q=0.5', method = 'GET', body = null } = {}) {
  if (!hostOk(url)) return { url, error: 'host no permitido (solo https en *.europa.eu)' };

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      body,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: accept,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      cache: 'no-store',
    });

    const ct = res.headers.get('content-type') || '';
    const texto = await res.text();

    let esJson = false;
    let claves = null;
    let elementos = null;

    if (texto.trim().startsWith('{') || texto.trim().startsWith('[')) {
      try {
        const data = JSON.parse(texto);
        esJson = true;
        if (Array.isArray(data)) {
          elementos = data.length;
          claves = data[0] ? Object.keys(data[0]) : null;
        } else {
          claves = Object.keys(data);
          // Formas habituales: {results:{bindings:[...]}} en SPARQL,
          // {items:[...]} o {content:[...]} en buscadores.
          const lista = data.results?.bindings || data.items || data.content || data.data;
          if (Array.isArray(lista)) {
            elementos = lista.length;
            if (lista[0]) claves = [...claves, '→ primer elemento: ' + Object.keys(lista[0]).join(', ')];
          }
        }
      } catch {
        esJson = false;
      }
    }

    return {
      url,
      status: res.status,
      ms: Date.now() - started,
      content_type: ct,
      tamano: texto.length,
      es_json: esJson,
      claves,
      elementos,
      // Si es HTML, interesa saber si el contenido viene renderizado o lo
      // pinta JavaScript: si apenas hay texto, es lo segundo.
      pista_html: !esJson && ct.includes('html') ? (texto.length < 5000 ? 'HTML corto — probablemente lo renderiza JS' : 'HTML largo — puede traer contenido') : null,
      muestra: texto.slice(0, 1200),
    };
  } catch (e) {
    return {
      url,
      status: null,
      ms: Date.now() - started,
      error: e.name === 'AbortError' ? `timeout tras ${TIMEOUT_MS} ms` : e.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const key = sp.get('key');

  if (!process.env.DEBUG_KEY || key !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  const chars = parseInt(sp.get('chars') || '1200', 10);
  const salida = { generado: new Date().toISOString() };

  // --- Modo URL suelta, para iterar rápido -----------------------------
  const urlSuelta = sp.get('url');
  if (urlSuelta) {
    const r = await sondear(urlSuelta);
    if (r.muestra) r.muestra = r.muestra.slice(0, chars);
    return Response.json({ modo: 'url suelta', resultado: r });
  }

  // --- Modo SPARQL -----------------------------------------------------
  // El endpoint del Publications Office (CELLAR) es el que sirve Whoiswho.
  if (sp.get('sparql')) {
    const consulta = 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 5';
    const candidatosSparql = [
      `https://publications.europa.eu/webapi/rdf/sparql?query=${encodeURIComponent(consulta)}&format=application%2Fsparql-results%2Bjson`,
      `https://data.europa.eu/sparql?query=${encodeURIComponent(consulta)}&format=application%2Fsparql-results%2Bjson`,
    ];
    const res = [];
    for (const u of candidatosSparql) res.push(await sondear(u));
    return Response.json({ modo: 'sparql', consulta, resultados: res });
  }

  // --- A) Have your say ------------------------------------------------
  // Ninguno está documentado: son conjeturas razonables sobre cómo puede
  // alimentarse el buscador del portal. Lo que importa es cuál responde
  // JSON, no acertar a la primera.
  const candidatosHYS = [
    'https://have-your-say.ec.europa.eu/index_en',
    'https://ec.europa.eu/info/law/better-regulation/api/search',
    'https://ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives?text=&language=EN&size=5',
    'https://ec.europa.eu/info/law/better-regulation/brpapi/allInitiatives?size=5',
    'https://have-your-say.ec.europa.eu/api/initiatives?size=5',
  ];

  const resHYS = [];
  for (const u of candidatosHYS) {
    const r = await sondear(u);
    if (r.muestra) r.muestra = r.muestra.slice(0, chars);
    resHYS.push(r);
  }
  salida.a_have_your_say = {
    pregunta: '¿Hay algún endpoint JSON detrás del buscador de consultas?',
    candidatos: resHYS,
  };

  // --- B) EU Whoiswho --------------------------------------------------
  const candidatosWIW = [
    'https://op.europa.eu/en/web/who-is-who',
    'https://data.europa.eu/api/hub/search/datasets/eu-whoiswho-the-official-directory-of-the-european-union',
  ];

  const resWIW = [];
  for (const u of candidatosWIW) {
    const r = await sondear(u);
    if (r.muestra) r.muestra = r.muestra.slice(0, chars);
    resWIW.push(r);
  }
  salida.b_whoiswho = {
    pregunta: '¿Cómo se accede al directorio? ¿Hay descarga estructurada además de SPARQL?',
    candidatos: resWIW,
  };

  salida.resumen = [...resHYS, ...resWIW].map((r) => ({
    url: r.url,
    status: r.status ?? 'fallo',
    json: r.es_json || false,
    elementos: r.elementos ?? null,
    nota: r.error || r.pista_html || null,
  }));

  salida.siguiente_paso =
    'Prueba también ?sparql=1 para el endpoint de consultas RDF, y ?url=<url> para cualquier candidato nuevo.';

  return Response.json(salida);
}
