// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Votaciones del Congreso
//
// OBJETIVO: saber qué trae cada votación y cómo se recorren todas.
//
// LO QUE YA SABEMOS, de la exploración del portal:
//   La sección /es/opendata/votaciones lista ficheros con esta forma:
//     /webpublica/opendata/votaciones/Leg15/Sesion193/20260723/
//       Votacion001/VOT_20260723211929.json
//
//   Un fichero por votación, organizados por legislatura, sesión, fecha
//   y número de votación. Con 193 sesiones podrían ser miles.
//
// LO QUE HAY QUE AVERIGUAR:
//   1. Qué campos trae una votación: ¿el voto de cada diputado, o solo
//      el recuento por grupo?
//   2. Si enlaza con un expediente, para poder cruzarla con las 8.007
//      iniciativas que ya tenemos.
//   3. Cómo listar todas: la página del portal puede que solo muestre
//      las últimas.
//
// Uso:
//   ?key=<DEBUG_KEY>            explora la sección
//   ?key=...&url=<url>          descarga una votación concreta
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.congreso.es';
const SECCION = `${BASE}/es/opendata/votaciones`;

// Sin cabeceras de navegador el portal responde 403.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'es-ES,es;q=0.9',
};

async function pedir(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    const txt = await res.text();
    let data = null;
    try {
      data = JSON.parse(txt);
    } catch {}
    return { status: res.status, ms: Date.now() - t0, texto: txt, data };
  } catch (e) {
    return { status: null, ms: Date.now() - t0, error: e.message };
  }
}

// Los enlaces a ficheros de votación que haya en la página
function ficheros(html) {
  const re = /\/webpublica\/opendata\/votaciones\/[A-Za-z0-9_\-/]+\.json/g;
  return [...new Set(html.match(re) || [])];
}

// De la ruta se saca legislatura, sesión, fecha y número
function partesDeLaRuta(ruta) {
  const m = ruta.match(/Leg(\d+)\/Sesion(\d+)\/(\d{8})\/Votacion(\d+)\//);
  return m ? { legislatura: m[1], sesion: m[2], fecha: m[3], votacion: m[4] } : null;
}

/**
 * Resume una votación sin volcarla entera.
 *
 * Lo que importa saber: si trae el voto individual de cada diputado o
 * solo el recuento, y si enlaza con un expediente.
 */
function resumirVotacion(data) {
  if (!data) return null;
  const claves = Object.keys(data);

  // El voto de cada diputado suele venir en una lista anidada
  const posiblesListas = claves.filter((k) => Array.isArray(data[k]) && data[k].length > 0);
  const listaVotos = posiblesListas.find((k) => data[k].length > 100) || posiblesListas[0];

  return {
    claves_raiz: claves,
    // Todo lo que no sea la lista grande: ahí está la cabecera de la
    // votación (título, expediente, resultado)
    cabecera: Object.fromEntries(
      Object.entries(data)
        .filter(([k, v]) => !Array.isArray(v) || v.length < 20)
        .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : v])
    ),
    listas: posiblesListas.map((k) => ({ campo: k, registros: data[k].length })),
    // Un voto de ejemplo: dice si hay nombre de diputado y sentido
    ejemplo_voto: listaVotos && data[listaVotos][0] ? data[listaVotos][0] : null,
    // ¿Menciona un expediente? Sería la clave para cruzar con las
    // iniciativas que ya tenemos.
    menciona_expediente: /\d{3}\/\d{6}/.test(JSON.stringify(data).slice(0, 5000)),
  };
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  // --- Modo: una votación concreta -----------------------------------
  if (sp.get('url')) {
    const url = sp.get('url').startsWith('http') ? sp.get('url') : `${BASE}${sp.get('url')}`;
    if (!url.startsWith(`${BASE}/webpublica/opendata/votaciones/`)) {
      return Response.json({ error: 'solo rutas de votaciones' }, { status: 400 });
    }
    const r = await pedir(url);
    return Response.json({
      modo: 'votacion',
      url,
      status: r.status,
      ms: r.ms,
      tamano: r.texto?.length,
      es_json: !!r.data,
      resumen: resumirVotacion(r.data),
      muestra_texto: !r.data ? r.texto?.slice(0, 500) : null,
    });
  }

  const salida = { generado: new Date().toISOString() };

  // --- A) La sección: qué ficheros lista ------------------------------
  const sec = await pedir(SECCION);
  const lista = sec.texto ? ficheros(sec.texto) : [];
  salida.a_seccion = {
    pregunta: '¿Cuántas votaciones lista la página y de qué sesiones?',
    status: sec.status,
    ficheros: lista.length,
    // Agrupadas por sesión, para ver si están todas o solo las últimas
    sesiones: [
      ...new Set(lista.map((f) => partesDeLaRuta(f)?.sesion).filter(Boolean)),
    ].sort((a, b) => Number(b) - Number(a)),
    muestra: lista.slice(0, 5),
  };

  // --- B) Una votación al detalle -------------------------------------
  if (lista.length > 0) {
    const r = await pedir(`${BASE}${lista[0]}`);
    salida.b_votacion = {
      pregunta: '¿Trae el voto de cada diputado o solo el recuento?',
      ruta: lista[0],
      partes: partesDeLaRuta(lista[0]),
      status: r.status,
      tamano: r.texto?.length,
      ...(resumirVotacion(r.data) || { error: 'no es JSON', muestra: r.texto?.slice(0, 300) }),
    };
  }

  salida.siguiente_paso =
    'Con ?url=<ruta> se descarga cualquier votación. Lo que decide el módulo es si trae voto individual y si enlaza con un expediente.';

  return Response.json(salida);
}
