// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Actores de la Comisión Europea
//
// Dos preguntas que deciden el alcance:
//
//   A) ¿Existe el PDF de Whoiswho de la Comisión y es descargable?
//      op.europa.eu devolvió 403 (WAF de Azure) para la web, pero los PDF
//      pueden servirse por otra ruta. Es la vía que queda tras descartar
//      SPARQL.
//
//   B) ¿brpapi dice qué dirección general lleva cada iniciativa?
//      En el listado no aparecía ningún campo de departamento. Puede estar
//      en una ficha individual, o no estar en absoluto. De esto depende
//      que podamos colgar expedientes de personas.
//
// Uso:
//   ?key=<DEBUG_KEY>          todo
//   ?key=...&url=<url>        una URL suelta (solo europa.eu)
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TIMEOUT_MS = 20000;
const HOST_PERMITIDO = /(^|\.)europa\.eu$/i;

function hostOk(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOST_PERMITIDO.test(u.hostname);
  } catch {
    return false;
  }
}

async function sondear(url, { soloCabecera = false } = {}) {
  if (!hostOk(url)) return { url, error: 'host no permitido' };
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: '*/*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    const ct = res.headers.get('content-type') || '';
    const len = res.headers.get('content-length');

    // Con los PDF no interesa el contenido, solo saber que están ahí y
    // cuánto pesan: descargarlos entero agotaría el tiempo.
    if (soloCabecera) {
      return {
        url,
        status: res.status,
        ms: Date.now() - t0,
        content_type: ct,
        tamano_cabecera: len ? Number(len) : null,
        es_pdf: ct.includes('pdf'),
      };
    }

    const txt = await res.text();
    let data = null;
    try {
      data = JSON.parse(txt);
    } catch {}

    return {
      url,
      status: res.status,
      ms: Date.now() - t0,
      content_type: ct,
      tamano: txt.length,
      es_json: !!data,
      claves: data && !Array.isArray(data) ? Object.keys(data) : null,
      muestra: data ? JSON.stringify(data).slice(0, 1500) : txt.slice(0, 400),
    };
  } catch (e) {
    return { url, status: null, ms: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Busca recursivamente claves que suenen a departamento responsable.
// Devuelve la ruta donde aparece, para saber dónde mirar después.
function buscarCampos(obj, patron, ruta = '', hallazgos = [], profundidad = 0) {
  if (profundidad > 6 || !obj || typeof obj !== 'object') return hallazgos;
  for (const [k, v] of Object.entries(obj)) {
    const r = ruta ? `${ruta}.${k}` : k;
    if (patron.test(k)) {
      hallazgos.push({ campo: r, valor: typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : v });
    }
    if (v && typeof v === 'object') buscarCampos(v, patron, r, hallazgos, profundidad + 1);
  }
  return hallazgos;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  if (sp.get('url')) {
    return Response.json({ modo: 'url suelta', resultado: await sondear(sp.get('url')) });
  }

  const salida = { generado: new Date().toISOString() };

  // -------------------------------------------------------------------
  // A) PDF de Whoiswho — Comisión
  // Los códigos vistos en otros PDF: AGEN_OTH (agencias), COR (Comité de
  // las Regiones). El de la Comisión debería ser COM o similar.
  // -------------------------------------------------------------------
  const pdfs = [
    'https://op.europa.eu/webpub/wiw/pdf/EUWhoiswho_COM_EN.pdf',
    'https://op.europa.eu/webpub/wiw/pdf/EUWhoiswho_COMM_EN.pdf',
    'https://op.europa.eu/webpub/wiw/pdf/EUWhoiswho_EC_EN.pdf',
    'https://op.europa.eu/webpub/wiw/pdf/EUWhoiswho_AGEN_OTH_EN.pdf',
  ];
  const resPdf = [];
  for (const u of pdfs) resPdf.push(await sondear(u, { soloCabecera: true }));

  salida.a_pdf_whoiswho = {
    pregunta: '¿Existe el PDF de la Comisión y se puede descargar pese al WAF?',
    nota: 'AGEN_OTH está confirmado que existe: sirve de control. Si ese da 200 y los otros 404, es que el código del fichero es otro.',
    candidatos: resPdf,
  };

  // -------------------------------------------------------------------
  // B) ¿brpapi expone la dirección general responsable?
  // -------------------------------------------------------------------
  const BRP = 'https://ec.europa.eu/info/law/better-regulation/brpapi';

  // B1. Confirmar si searchInitiatives?id= filtra de verdad o lo ignora
  let totalConId = null;
  let devueltosConId = null;
  const b1full = await fetch(`${BRP}/searchInitiatives?id=14858&language=EN&size=5`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
    .then((r) => r.json())
    .catch(() => null);
  if (b1full?.initiativeResultDtoPage) {
    totalConId = b1full.initiativeResultDtoPage.totalElements;
    devueltosConId = (b1full.initiativeResultDtoPage.content || []).length;
  }

  salida.b1_filtro_id = {
    pregunta: '¿searchInitiatives?id= filtra de verdad, o lo ignora como los de estado?',
    total_devuelto: totalConId,
    registros: devueltosConId,
    veredicto:
      totalConId === null
        ? 'no se pudo leer'
        : totalConId === 1
          ? 'SÍ filtra: se puede refrescar una iniciativa suelta'
          : `NO filtra (total ${totalConId}): hay que recorrer todo siempre`,
  };

  // B2. Buscar campos de departamento en el registro completo
  const patron = /(dg|department|directorate|service|unit|lead|responsib|owner|author)/i;
  const registro = b1full?.initiativeResultDtoPage?.content?.[0] || null;

  salida.b2_campos_departamento = {
    pregunta: '¿Hay algún campo que identifique la dirección general responsable?',
    claves_del_registro: registro ? Object.keys(registro) : null,
    coincidencias: registro ? buscarCampos(registro, patron) : null,
    nota: 'Si coincidencias sale vacío, el listado no trae la DG y habría que buscarla en otra fuente.',
  };

  // B3. Endpoints de detalle que puedan traer más campos
  const detalles = [
    `${BRP}/initiativeDetail/14858`,
    `${BRP}/initiatives/14858/detail`,
    `${BRP}/publicationDetail/14858`,
    `${BRP}/searchInitiatives?text=&language=EN&size=1&full=true`,
  ];
  const resDetalle = [];
  for (const u of detalles) {
    const r = await sondear(u);
    resDetalle.push({
      url: u.replace(BRP, ''),
      status: r.status,
      es_json: r.es_json || false,
      claves: r.claves,
      tamano: r.tamano,
    });
  }
  salida.b3_endpoints_detalle = {
    pregunta: '¿Hay endpoint de ficha con más campos que el listado?',
    candidatos: resDetalle,
  };

  salida.siguiente_paso = 'Con ?url=<url> puedes probar cualquier otro endpoint de europa.eu.';

  return Response.json(salida);
}
