// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Datos abiertos del Congreso
//
// OBJETIVO: saber qué publica congreso.es además de los diputados, y en
// concreto si hay datos estructurados de:
//   1. Comisiones y órganos parlamentarios
//   2. Iniciativas legislativas (proyectos y proposiciones de ley)
//   3. Su tramitación: en qué comisión, quién es ponente, en qué fase
//
// LO QUE YA SABEMOS, del sync de diputados que funciona:
//   - Los ficheros viven en /webpublica/opendata/ y su nombre lleva una
//     marca de tiempo (DiputadosActivos__20260810050006.json), así que
//     hay que descubrirlos leyendo la página del portal, no guardando la
//     URL fija.
//   - Hacen falta cabeceras de navegador o la petición se rechaza.
//
// Uso:
//   ?key=<DEBUG_KEY>            recorre el portal
//   ?key=...&url=<url>          descarga un fichero concreto
//   ?key=...&pagina=<ruta>      explora otra página del portal
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.congreso.es';
const TIMEOUT_MS = 20000;

// Sin esto el portal responde 403: filtra por User-Agent.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
};

const HOST_PERMITIDO = /(^|\.)congreso\.es$/i;

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
    const res = await fetch(url, { signal: controller.signal, headers: HEADERS, cache: 'no-store' });
    const txt = await res.text();
    let data = null;
    try {
      data = JSON.parse(txt);
    } catch {}
    return { url, status: res.status, ms: Date.now() - t0, texto: txt, data, tamano: txt.length };
  } catch (e) {
    return { url, status: null, ms: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Extrae los enlaces a ficheros de datos que haya en una página del portal.
function ficherosDeLaPagina(html) {
  const out = new Map();
  const re = /\/webpublica\/opendata\/[A-Za-z0-9_\-/.]+\.(json|csv|xlsx|xml)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    // El nombre lleva marca de tiempo; se agrupa por el nombre sin ella
    // para no listar veinte versiones del mismo fichero.
    const ruta = m[0];
    const base = ruta.replace(/__\d+/, '__');
    if (!out.has(base)) out.set(base, ruta);
  }
  return [...out.values()];
}

// Enlaces a otras secciones del portal de datos abiertos.
function seccionesDelPortal(html) {
  const out = new Set();
  const re = /href="(\/es\/opendata[A-Za-z0-9_\-/]*)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return [...out];
}

// Resume la forma de un fichero de datos sin volcarlo entero.
function forma(data) {
  if (!data) return null;
  if (Array.isArray(data)) {
    return {
      es_lista: true,
      registros: data.length,
      campos: data[0] ? Object.keys(data[0]) : null,
      muestra: data[0] ? JSON.stringify(data[0]).slice(0, 700) : null,
    };
  }
  return { es_lista: false, claves: Object.keys(data), muestra: JSON.stringify(data).slice(0, 700) };
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  // --- Modo: descargar un fichero concreto ----------------------------
  // --- Modo: examinar campos concretos sin cortar ---------------------
  // La muestra genérica corta a 700 caracteres y los campos interesantes
  // de ProyectosDeLey (PLAZOS, PONENTES, TRAMITACIONSEGUIDA) son texto
  // libre largo. Sin verlos enteros no se puede diseñar el parseo.
  if (sp.get('campos') && sp.get('de')) {
    const r = await pedir(sp.get('de'));
    if (!Array.isArray(r.data)) {
      return Response.json({ error: 'no es una lista', status: r.status });
    }
    const campos = sp.get('campos').split(',').map((c) => c.trim());
    const n = Math.min(parseInt(sp.get('n') || '3', 10), 8);

    // Se eligen los registros con más contenido en esos campos: un
    // expediente recién presentado tendría los campos vacíos y no
    // enseñaría nada del formato.
    const ordenados = [...r.data].sort((a, b) => {
      const peso = (x) => campos.reduce((s, c) => s + String(x[c] || '').length, 0);
      return peso(b) - peso(a);
    });

    return Response.json({
      modo: 'campos',
      registros_totales: r.data.length,
      ejemplos: ordenados.slice(0, n).map((x) => {
        const out = { NUMEXPEDIENTE: x.NUMEXPEDIENTE, OBJETO: String(x.OBJETO || '').slice(0, 90) };
        for (const c of campos) out[c] = x[c] ?? null;
        return out;
      }),
      // Cuántos registros tienen cada campo relleno: dice si se puede
      // contar con él o si es excepcional.
      cobertura: Object.fromEntries(
        campos.map((c) => [c, r.data.filter((x) => x[c] && String(x[c]).trim()).length])
      ),
    });
  }

  if (sp.get('url')) {
    const r = await pedir(sp.get('url'));
    return Response.json({
      modo: 'fichero',
      status: r.status,
      ms: r.ms,
      tamano: r.tamano,
      forma: forma(r.data),
      muestra_texto: !r.data ? r.texto?.slice(0, 600) : null,
    });
  }

  // --- Modo: explorar otra página del portal --------------------------
  if (sp.get('pagina')) {
    const ruta = sp.get('pagina').startsWith('/') ? sp.get('pagina') : `/${sp.get('pagina')}`;
    const r = await pedir(`${BASE}${ruta}`);
    return Response.json({
      modo: 'pagina',
      ruta,
      status: r.status,
      tamano: r.tamano,
      ficheros: r.texto ? ficherosDeLaPagina(r.texto) : [],
      secciones: r.texto ? seccionesDelPortal(r.texto) : [],
    });
  }

  const salida = { generado: new Date().toISOString() };

  // --- A) El portal de datos abiertos: ¿qué secciones tiene? ----------
  const portal = await pedir(`${BASE}/es/opendata`);
  salida.a_portal = {
    pregunta: '¿Qué conjuntos de datos publica el Congreso?',
    status: portal.status,
    secciones: portal.texto ? seccionesDelPortal(portal.texto) : [],
    ficheros_en_portada: portal.texto ? ficherosDeLaPagina(portal.texto) : [],
  };

  // --- B) Secciones candidatas ----------------------------------------
  // Se prueban rutas plausibles a partir del patrón de /es/opendata/diputados,
  // que es la única que conocemos con certeza.
  const candidatas = [
    '/es/opendata/diputados',
    '/es/opendata/organos',
    '/es/opendata/comisiones',
    '/es/opendata/iniciativas',
    '/es/opendata/votaciones',
    '/es/opendata/intervenciones',
    '/es/opendata/sesiones',
  ];

  const res = [];
  for (const ruta of candidatas) {
    const r = await pedir(`${BASE}${ruta}`);
    const ficheros = r.texto ? ficherosDeLaPagina(r.texto) : [];
    res.push({
      ruta,
      status: r.status,
      // Una sección que existe pero no tiene ficheros es tan informativa
      // como una que no existe: ambas descartan esa vía.
      ficheros: ficheros.slice(0, 6),
      n_ficheros: ficheros.length,
    });
  }
  salida.b_secciones = {
    pregunta: '¿Hay secciones de comisiones, iniciativas o votaciones?',
    resultados: res,
  };

  salida.siguiente_paso =
    'Con ?url=<url del fichero> se descarga uno y se ve su estructura. Con ?pagina=<ruta> se explora otra sección.';

  return Response.json(salida);
}
