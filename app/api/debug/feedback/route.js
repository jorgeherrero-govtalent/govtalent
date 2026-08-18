// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Contribuciones a las consultas
//
// OBJETIVO: saber quién ha aportado a cada expediente de la Comisión.
// Es el hueco que quedó al comparar con Fren: ellos citaban a Plastics
// Europe y EuRIC como actores; nosotros solo teníamos a los funcionarios
// que lo tramitan.
//
// LO QUE YA SABEMOS:
//   El registro de transparencia enlaza cada contribución con
//   /initiatives/12263-reducing-packaging-waste... y ese número es el
//   mismo id de eu_initiatives. Así que el cruce es directo.
//
//   Y la página de feedback usa:
//     /api/top3Feedback?publicationId=12354&language=en
//
//   El nombre dice que solo devuelve tres. Pero esa API tiene hermanos
//   —groupInitiatives apareció así— y probablemente haya uno que los
//   devuelva todos con paginación.
//
//   Ojo: publicationId (12354) no es el id de la iniciativa (12095). Es
//   la fase concreta de consulta, y una iniciativa puede tener varias.
//
// Uso:
//   ?key=<DEBUG_KEY>                    prueba las variantes
//   ?key=...&pub=12354                  con otra publicación
//   ?key=...&iniciativa=15352           busca las publicaciones de una
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API = 'https://ec.europa.eu/info/law/better-regulation/api';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, */*',
  'Accept-Language': 'en',
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
    return { url, status: res.status, ms: Date.now() - t0, texto: txt, data };
  } catch (e) {
    return { url, status: null, ms: Date.now() - t0, error: e.message };
  }
}

/**
 * Resume una respuesta de feedback sin volcarla entera.
 *
 * Lo que importa: cuántas contribuciones trae, si dice el nombre de la
 * organización y si incluye su número de registro de transparencia —eso
 * permitiría enlazar con el directorio sin cruzar por texto.
 */
function resumir(r) {
  if (r.error) return { error: r.error };
  const base = { status: r.status, ms: r.ms, tamano: r.texto?.length };
  if (!r.data) return { ...base, formato: 'no es JSON', muestra: r.texto?.slice(0, 200) };

  const lista = Array.isArray(r.data)
    ? r.data
    : r.data._embedded?.feedback || r.data.content || r.data.feedback || r.data.data || null;

  const primero = Array.isArray(lista) ? lista[0] : null;

  return {
    ...base,
    claves_raiz: !Array.isArray(r.data) ? Object.keys(r.data) : null,
    // El total suele venir aparte de la página actual
    total: r.data.totalElements ?? r.data.total ?? r.data.page?.totalElements ?? null,
    registros: Array.isArray(lista) ? lista.length : null,
    campos: primero ? Object.keys(primero) : null,
    // Lo que decide si se puede enlazar con el registro de transparencia
    tiene_organizacion: primero
      ? Object.keys(primero).some((k) => /organi|company|entity/i.test(k))
      : null,
    tiene_registro_transparencia: primero
      ? Object.keys(primero).some((k) => /transparency|register|tr_?number/i.test(k))
      : null,
    muestra: primero ? JSON.stringify(primero).slice(0, 700) : null,
  };
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  // --- Modo: qué publicaciones tiene una iniciativa -------------------
  // Hace falta porque publicationId no es el id de la iniciativa, y sin
  // saber la correspondencia no se puede recorrer el catálogo.
  if (sp.get('iniciativa')) {
    const id = sp.get('iniciativa');
    const pruebas = [
      `${API}/publications?initiativeId=${id}`,
      `${API}/initiatives/${id}`,
      `${API}/initiative/${id}`,
      `${API}/groupInitiatives/${id}`,
    ];
    const salida = { modo: 'publicaciones', iniciativa: id, pruebas: [] };
    for (const u of pruebas) {
      const r = await pedir(u);
      salida.pruebas.push({
        url: u.replace(API, ''),
        status: r.status,
        es_json: !!r.data,
        // Se busca cualquier cosa que parezca un publicationId
        menciona_publication: /publicationId|publication_id/i.test(r.texto || ''),
        claves: r.data && !Array.isArray(r.data) ? Object.keys(r.data).slice(0, 15) : null,
        muestra: (r.texto || '').slice(0, 400),
      });
    }
    return Response.json(salida);
  }

  const pub = sp.get('pub') || '12354';
  const salida = { generado: new Date().toISOString(), publicationId: pub };

  // --- A) El endpoint conocido, para tener referencia -----------------
  salida.a_conocido = {
    pregunta: '¿Qué devuelve el que usa la web?',
    ...resumir(await pedir(`${API}/top3Feedback?publicationId=${pub}&language=en`)),
  };

  // --- B) Variantes que podrían devolverlos todos ---------------------
  // El nombre "top3" sugiere que hay uno sin límite. Se prueban las
  // formas habituales de esta API.
  const variantes = [
    `${API}/allFeedback?publicationId=${pub}&language=en`,
    `${API}/feedback?publicationId=${pub}&language=en`,
    `${API}/feedbacks?publicationId=${pub}&language=en`,
    `${API}/feedback?publicationId=${pub}&language=en&page=0&size=100`,
    `${API}/allFeedback?publicationId=${pub}&language=en&page=0&size=100`,
  ];

  salida.b_variantes = [];
  for (const u of variantes) {
    const r = await pedir(u);
    salida.b_variantes.push({ url: u.replace(API, ''), ...resumir(r) });
  }

  salida.siguiente_paso =
    'Con ?iniciativa=<id> se busca cómo llegar del expediente a sus publicaciones. Con ?pub=<id> se prueba otra consulta.';

  return Response.json(salida);
}
