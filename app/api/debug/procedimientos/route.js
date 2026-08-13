// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Procedimientos legislativos
//
// OBJETIVO: averiguar si podemos construir el recorrido completo de un
// expediente (propuesta → lecturas → Consejo → pleno → trílogo → Diario
// Oficial), que es lo que muestra Reversa.
//
// LO QUE YA SABEMOS:
//   - Nuestras 3.790 iniciativas NO traen número interinstitucional.
//     Solo referencias internas de la Comisión: Ares(2026)..., PLAN/...
//   - 844 de ellas (22%) son propuestas legislativas (PROP_REG, PROP_DIR,
//     PROP_DEC, PROP_RECO) y por tanto SÍ deberían tener número. Las
//     1.514 de ejecución y delegadas no pasan por el Parlamento.
//   - El Observatorio Legislativo (oeil.secure.europarl.europa.eu) NO
//     tiene API: comprobado en el panel de red, 348 peticiones y ninguna
//     de datos. Se sirve desde el servidor.
//
// LO QUE FALTA: si la API abierta del Parlamento —la misma que nos dio
// los 719 eurodiputados— publica procedimientos con sus etapas.
//
// Uso:
//   ?key=<DEBUG_KEY>          sondea los candidatos
//   ?key=...&url=<url>        una URL suelta (solo europa.eu)
//   ?key=...&ref=2021/0106    probar con otro procedimiento
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TIMEOUT_MS = 15000;
const EP = 'https://data.europarl.europa.eu/api/v2';
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
      headers: { Accept: 'application/ld+json, application/json' },
      cache: 'no-store',
    });
    const txt = await res.text();
    let data = null;
    try {
      data = JSON.parse(txt);
    } catch {}
    return { url, status: res.status, ms: Date.now() - t0, data, texto: txt };
  } catch (e) {
    return { url, status: null, ms: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Resume la forma de la respuesta sin volcar miles de líneas.
function forma(data) {
  if (!data) return null;
  const lista = data.data || data.items || (Array.isArray(data) ? data : null);
  if (Array.isArray(lista)) {
    return {
      es_lista: true,
      elementos: lista.length,
      claves_del_primero: lista[0] ? Object.keys(lista[0]) : null,
      muestra: lista[0] ? JSON.stringify(lista[0]).slice(0, 900) : null,
    };
  }
  return {
    es_lista: false,
    claves: Object.keys(data),
    muestra: JSON.stringify(data).slice(0, 900),
  };
}

// Busca el número interinstitucional (2021/0106(COD)) en cualquier parte
// de la respuesta. Es la clave que uniría Comisión y Parlamento.
function buscarNumeroProcedimiento(obj, ruta = '', h = [], p = 0) {
  if (p > 6 || !obj || typeof obj !== 'object') return h;
  const RE = /\b(19|20)\d{2}\/\d{4}\s*\(\s*[A-Z]{3,4}\s*\)/;
  for (const [k, v] of Object.entries(obj)) {
    const r = ruta ? `${ruta}.${k}` : k;
    if (typeof v === 'string' && RE.test(v)) {
      h.push({ campo: r, valor: v.slice(0, 120) });
    } else if (v && typeof v === 'object') {
      buscarNumeroProcedimiento(v, r, h, p + 1);
    }
  }
  return h;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  // --- Modo: leer el OpenAPI y extraer solo lo que interesa -----------
  // La API se documenta a sí misma. En vez de adivinar parámetros, se
  // leen de ahí. La muestra genérica se corta a 900 caracteres y no llega
  // a la sección 'paths', que es justo la que hace falta.
  if (sp.get('spec')) {
    const r = await pedir(`${EP}/`);
    const spec = r.data || {};
    const paths = spec.paths || {};
    const filtro = sp.get('spec');
    const rutas = Object.keys(paths).filter((p) => p.toLowerCase().includes(filtro.toLowerCase()));

    // El OpenAPI define los parámetros con $ref a components.parameters.
    // Sin resolverlos, todos los campos salen vacíos.
    const resolver = (p) => {
      if (!p) return null;
      if (p.$ref) {
        const partes = p.$ref.replace(/^#\//, '').split('/');
        let nodo = spec;
        for (const t of partes) nodo = nodo?.[t];
        return nodo || { nombre_sin_resolver: p.$ref };
      }
      return p;
    };

    const detalle = rutas.slice(0, 6).map((ruta) => {
      const get = paths[ruta]?.get || {};
      return {
        ruta,
        resumen: get.summary || null,
        parametros: (get.parameters || []).map(resolver).filter(Boolean).map((p) => ({
          nombre: p.name || null,
          en: p.in || null,
          obligatorio: !!p.required,
          tipo: p.schema?.type || null,
          valores: p.schema?.enum ? p.schema.enum.slice(0, 40) : null,
          por_defecto: p.schema?.default ?? null,
          maximo: p.schema?.maximum ?? null,
          descripcion: (p.description || '').slice(0, 140) || null,
        })),
      };
    });

    return Response.json({
      modo: 'openapi',
      filtro,
      rutas_encontradas: rutas.length,
      detalle,
    });
  }

  // --- Modo: examinar un procedimiento buscando el puente ------------
  // La pregunta concreta: ¿referencia el procedimiento del Parlamento el
  // documento COM de la Comisión? Sería la clave que une ambos sistemas,
  // porque nuestras iniciativas NO traen el número interinstitucional.
  if (sp.get('proc')) {
    const id = sp.get('proc');
    const r = await pedir(`${EP}/procedures/${id}?format=application%2Fld%2Bjson`);
    const p = r.data?.data?.[0] || r.data?.[0] || r.data;

    if (!p) {
      return Response.json({ modo: 'procedimiento', id, status: r.status, error: 'sin datos', muestra: r.texto?.slice(0, 400) });
    }

    // Se recogen todas las referencias a documentos que aparezcan en
    // cualquier nivel: ahí estaría el COM si existe.
    const docs = new Set();
    (function recoger(o, prof = 0) {
      if (prof > 6 || !o || typeof o !== 'object') return;
      for (const v of Object.values(o)) {
        if (typeof v === 'string' && v.includes('doc/')) docs.add(v);
        else if (Array.isArray(v)) v.forEach((x) => (typeof x === 'string' && x.includes('doc/') ? docs.add(x) : recoger(x, prof + 1)));
        else if (v && typeof v === 'object') recoger(v, prof + 1);
      }
    })(p);

    const listaDocs = [...docs];
    // Un documento de la Comisión se identifica por llevar COM en la
    // referencia; los del Parlamento empiezan por A-, B-, C-, PV-, CRE-.
    const posiblesCOM = listaDocs.filter((d) => /COM|SEC|SWD|JOIN/i.test(d));

    return Response.json({
      modo: 'procedimiento',
      id,
      claves: Object.keys(p),
      label: p.label,
      titulo: p.process_title,
      tipo: p.process_type,
      etapa_actual: p.current_stage,
      // Este es el campo que más promete por su nombre
      created_a_realization_of: p.created_a_realization_of,
      participacion: Array.isArray(p.had_participation) ? p.had_participation.slice(0, 4) : p.had_participation,
      n_actividades: Array.isArray(p.consists_of) ? p.consists_of.length : 0,
      tipos_de_actividad: Array.isArray(p.consists_of)
        ? [...new Set(p.consists_of.map((a) => a.had_activity_type).filter(Boolean))]
        : null,
      documentos_referenciados: listaDocs.length,
      posibles_documentos_comision: posiblesCOM.slice(0, 10),
      muestra_documentos: listaDocs.slice(0, 12),
    });
  }

  if (sp.get('url')) {
    const r = await pedir(sp.get('url'));
    return Response.json({
      modo: 'url suelta',
      status: r.status,
      ms: r.ms,
      forma: forma(r.data),
      numeros_procedimiento: r.data ? buscarNumeroProcedimiento(r.data).slice(0, 5) : null,
      muestra_texto: !r.data ? r.texto?.slice(0, 500) : null,
    });
  }

  const salida = { generado: new Date().toISOString() };

  // --- A) ¿Qué endpoints existen? -------------------------------------
  // Se pide la raíz de la API: suele listar los recursos disponibles y
  // así no hay que adivinar rutas una por una.
  const raiz = await pedir(`${EP}/`);
  salida.a_raiz = {
    pregunta: '¿La API lista sus propios recursos?',
    status: raiz.status,
    forma: forma(raiz.data),
  };

  // --- B) Candidatos de procedimientos --------------------------------
  const candidatos = [
    `${EP}/procedures?limit=2&format=application%2Fld%2Bjson`,
    `${EP}/legislative-procedures?limit=2&format=application%2Fld%2Bjson`,
    `${EP}/dossiers?limit=2&format=application%2Fld%2Bjson`,
    `${EP}/adopted-texts?limit=2&format=application%2Fld%2Bjson`,
    `${EP}/documents?limit=2&format=application%2Fld%2Bjson`,
    `${EP}/events?limit=2&format=application%2Fld%2Bjson`,
  ];

  const res = [];
  for (const u of candidatos) {
    const r = await pedir(u);
    res.push({
      url: u.replace(EP, ''),
      status: r.status,
      ms: r.ms,
      forma: r.status === 200 ? forma(r.data) : null,
      numeros_procedimiento: r.data ? buscarNumeroProcedimiento(r.data).slice(0, 3) : null,
    });
  }
  salida.b_endpoints = {
    pregunta: '¿Alguno devuelve procedimientos legislativos con sus etapas?',
    nota: 'Se busca el número interinstitucional 2021/0106(COD) en toda la respuesta: es la clave que uniría Comisión y Parlamento.',
    candidatos: res,
  };

  salida.siguiente_paso =
    'Con ?url=<url> se puede probar cualquier otro endpoint de europa.eu, incluido EUR-Lex si esta vía no da resultado.';

  return Response.json(salida);
}
