// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — De la iniciativa a sus contribuciones
//
// LO QUE YA SABEMOS:
//   /api/top3Feedback?publicationId=12354 devuelve contribuciones con
//   organización, tipo, país y documento adjunto. Y trae
//   referenceInitiative en formato Ares(...), que cruza con eu_initiatives.
//
// EL CABO SUELTO: publicationId (12354) no es el id de la iniciativa
// (12095). Sin saber la correspondencia no se pueden recorrer los 3.792
// expedientes.
//
// LO QUE SE PRUEBA AQUÍ:
//   1. Si algún endpoint da las publicaciones de una iniciativa.
//   2. Si allFeedback funciona con los parámetros correctos —devolvía
//      500, así que existe pero le falta algo—.
//   3. Cuántas contribuciones trae de media un expediente.
//
// Uso:
//   ?key=<DEBUG_KEY>                 prueba con la iniciativa 12095
//   ?key=...&iniciativa=15352        con otra
//   ?key=...&pub=12354               salta al feedback directamente
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API = 'https://ec.europa.eu/info/law/better-regulation/api';
const BASE = 'https://ec.europa.eu/info/law/better-regulation/have-your-say';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
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

function resumirFeedback(r) {
  if (!r.data) return { status: r.status, formato: 'no es JSON', muestra: (r.texto || '').slice(0, 150) };
  const lista = Array.isArray(r.data) ? r.data : r.data.content || r.data._embedded?.feedback || null;
  const primero = Array.isArray(lista) ? lista[0] : null;
  return {
    status: r.status,
    total: r.data.totalElements ?? r.data.total ?? null,
    en_esta_pagina: Array.isArray(lista) ? lista.length : null,
    paginas: r.data.totalPages ?? null,
    // Lo que decide si sirve para la ficha de actores
    trae_organizacion: primero ? 'organization' in primero : null,
    trae_registro_transparencia: primero ? 'trNumber' in primero : null,
    trae_referencia: primero ? primero.referenceInitiative || null : null,
    muestra: primero
      ? {
          organizacion: primero.organization,
          tipo: primero.userType,
          pais: primero.country,
          trNumber: primero.trNumber,
          fecha: primero.dateFeedback,
        }
      : null,
  };
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  // --- Modo: probar el feedback de una publicación --------------------
  if (sp.get('pub')) {
    const pub = sp.get('pub');
    const variantes = [
      `${API}/top3Feedback?publicationId=${pub}&language=en`,
      `${API}/allFeedback?publicationId=${pub}&page=0&size=100&language=en`,
      `${API}/allFeedback?publicationId=${pub}&page=0&size=100`,
      `${API}/allFeedback?publicationId=${pub}&language=EN&page=0&size=100`,
      `${API}/feedback/allFeedback?publicationId=${pub}&page=0&size=100`,
    ];
    const salida = { modo: 'feedback', publicationId: pub, variantes: [] };
    for (const u of variantes) {
      const r = await pedir(u);
      salida.variantes.push({ url: u.replace(API, ''), ...resumirFeedback(r) });
    }
    return Response.json(salida);
  }

  const id = sp.get('iniciativa') || '12095';
  const salida = { generado: new Date().toISOString(), iniciativa: id };

  // --- A) Cómo llegar de la iniciativa a sus publicaciones ------------
  // Se prueban las rutas que sigue el patrón de esta API. La página de
  // feedback usa ?p_id=, así que ese número tiene que salir de algún
  // sitio.
  const rutas = [
    `${API}/publications?initiativeId=${id}`,
    `${API}/publicationsByInitiative/${id}`,
    `${API}/initiatives/${id}/publications`,
    `${API}/groupInitiatives/${id}`,
    `${API}/initiative/${id}?language=en`,
  ];

  salida.a_publicaciones = [];
  for (const u of rutas) {
    const r = await pedir(u);
    // Se buscan números que parezcan un publicationId
    const ids = [...new Set((r.texto || '').match(/"(?:publicationId|id)"\s*:\s*(\d{4,6})/g) || [])].slice(0, 5);
    salida.a_publicaciones.push({
      url: u.replace(API, ''),
      status: r.status,
      es_json: !!r.data,
      claves: r.data && !Array.isArray(r.data) ? Object.keys(r.data).slice(0, 12) : null,
      posibles_ids: ids,
      muestra: (r.texto || '').slice(0, 300),
    });
  }

  // --- B) La página de feedback, por si el id está en el HTML ---------
  // Es el último recurso: si la API no lo da, se puede sacar del enlace
  // que ya usa la web.
  const pagina = await pedir(`${BASE}/initiatives/${id}/feedback_en`);
  const enHtml = [...new Set((pagina.texto || '').match(/p_id=(\d+)/g) || [])].slice(0, 5);
  salida.b_desde_la_pagina = {
    status: pagina.status,
    encontrados: enHtml,
    nota: enHtml.length > 0 ? 'El id está en el HTML, se puede extraer de ahí.' : 'No aparece en el HTML.',
  };

  salida.siguiente_paso = 'Con ?pub=<id> se prueban las variantes de feedback sobre una publicación concreta.';

  return Response.json(salida);
}
