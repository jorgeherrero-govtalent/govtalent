// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — API del Parlamento Europeo (v3)
//
// Ya confirmado en v2:
//   - 719 eurodiputados en una llamada (455 ms)
//   - la ficha individual trae foto, email, redes, contacto y
//     pertenencias con rol (MEMBER / MEMBER_SUBSTITUTE)
//   - las pertenencias referencian la organización como "org/1234"
//
// Lo que falta medir aquí:
//   1. ¿La ficha de un órgano trae nombre completo y legislatura?
//   2. ¿Funciona la paginación por offset en corporate-bodies?
//   3. ¿Cuánto tarda resolver N fichas en paralelo? -> ¿cabe el sync
//      de los 719 en una sola ejecución de Vercel?
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://data.europarl.europa.eu/api/v2';
const TIMEOUT_MS = 25000;

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
    const txt = await res.text();
    let data = null;
    try {
      data = JSON.parse(txt);
    } catch {
      data = null;
    }
    return { http_status: res.status, ms: Date.now() - started, data, raw_head: txt.slice(0, 300) };
  } catch (e) {
    return {
      http_status: null,
      ms: Date.now() - started,
      data: null,
      fallo: e.name === 'AbortError' ? 'timeout' : e.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function items(d) {
  if (!d || typeof d !== 'object') return [];
  if (Array.isArray(d.data)) return d.data;
  if (Array.isArray(d['@graph'])) return d['@graph'];
  return [];
}

// Ejecuta tareas en paralelo con un tope de concurrencia, que es como
// tendrá que funcionar el sync real: ni en serie (demasiado lento) ni
// 719 peticiones de golpe (nos banean).
async function enParalelo(tareas, concurrencia) {
  const resultados = [];
  let cursor = 0;
  async function trabajador() {
    while (cursor < tareas.length) {
      const i = cursor++;
      resultados[i] = await tareas[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrencia }, trabajador));
  return resultados;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const muestra = Math.min(parseInt(sp.get('muestra') || '30', 10), 120);
  const concurrencia = Math.min(parseInt(sp.get('concurrencia') || '10', 10), 25);
  const salida = { generado: new Date().toISOString(), pasos: {} };

  // ---------------------------------------------------------------
  // PASO 1 — Ficha de un órgano concreto.
  // org/6567 y org/6585 son comisiones reales de Bocheński (v2).
  // ¿Trae nombre completo? ¿Trae legislatura?
  // ---------------------------------------------------------------
  const orgIds = (sp.get('orgIds') || '6567,6585,7037,6702').split(',');
  const fichasOrg = await Promise.all(
    orgIds.map(async (id) => {
      const r = await callEP(`${BASE}/corporate-bodies/${id}?format=application%2Fld%2Bjson`);
      const it = items(r.data)[0] || null;
      return {
        org_id: id,
        http_status: r.http_status,
        ms: r.ms,
        claves: it ? Object.keys(it) : null,
        contenido: it ? JSON.stringify(it).slice(0, 1500) : r.raw_head,
      };
    })
  );
  salida.pasos['1_ficha_organo'] = {
    pregunta: '¿La ficha del órgano trae nombre completo y legislatura?',
    fichas: fichasOrg,
  };

  // ---------------------------------------------------------------
  // PASO 2 — Paginación por offset.
  // En v2, limit=1000 devolvió justo 1000: estaba truncado.
  // ---------------------------------------------------------------
  const pag = {};
  for (const offset of [0, 1000, 2000]) {
    const r = await callEP(
      `${BASE}/corporate-bodies?limit=1000&offset=${offset}&format=application%2Fld%2Bjson`
    );
    const lista = items(r.data);
    pag[`offset_${offset}`] = {
      http_status: r.http_status,
      ms: r.ms,
      devueltos: lista.length,
      primer_id: lista[0]?.id || null,
      ultimo_id: lista[lista.length - 1]?.id || null,
    };
  }
  salida.pasos['2_paginacion_organos'] = {
    pregunta: '¿Funciona offset? ¿Cuántos órganos hay en total?',
    paginas: pag,
    nota: 'Si primer_id cambia entre páginas, offset funciona. Si devueltos<1000, es la última.',
  };

  // ---------------------------------------------------------------
  // PASO 3 — Medición de concurrencia. LA DECISIVA.
  // Resolvemos N fichas en paralelo y extrapolamos a 719.
  // ---------------------------------------------------------------
  const listado = await callEP(`${BASE}/meps/show-current?limit=800&format=application%2Fld%2Bjson`);
  const todos = items(listado.data);
  const seleccion = todos.slice(0, muestra);

  const t0 = Date.now();
  const fichas = await enParalelo(
    seleccion.map((m) => async () => {
      const r = await callEP(`${BASE}/meps/${m.identifier}?format=application%2Fld%2Bjson`);
      const it = items(r.data)[0];
      return {
        ok: r.http_status === 200 && !!it,
        status: r.http_status,
        ms: r.ms,
        pertenencias: it && Array.isArray(it.hasMembership) ? it.hasMembership.length : 0,
        orgs: it && Array.isArray(it.hasMembership) ? it.hasMembership.map((x) => x.organization) : [],
        tiene_foto: !!(it && it.img),
        tiene_email: !!(it && it.hasEmail),
      };
    }),
    concurrencia
  );
  const transcurrido = Date.now() - t0;

  const fallidas = fichas.filter((f) => !f.ok);
  const orgsDistintos = [...new Set(fichas.flatMap((f) => f.orgs).filter(Boolean))];

  salida.pasos['3_concurrencia'] = {
    pregunta: '¿Caben las 719 fichas en una ejecución de Vercel?',
    muestra_pedida: muestra,
    concurrencia,
    ms_totales: transcurrido,
    ms_por_ficha: Math.round(transcurrido / Math.max(seleccion.length, 1)),
    fallidas: fallidas.length,
    status_de_fallidas: [...new Set(fallidas.map((f) => f.status))],
    // Extrapolación lineal a los 719. Si supera ~50000 ms, hay que trocear.
    estimacion_719_ms: Math.round((transcurrido / Math.max(seleccion.length, 1)) * 719),
    con_foto: fichas.filter((f) => f.tiene_foto).length,
    con_email: fichas.filter((f) => f.tiene_email).length,
    media_pertenencias: (
      fichas.reduce((a, f) => a + f.pertenencias, 0) / Math.max(fichas.length, 1)
    ).toFixed(1),
    orgs_distintos_en_la_muestra: orgsDistintos.length,
    ejemplo_orgs: orgsDistintos.slice(0, 20),
  };

  salida.veredicto = {
    total_meps: todos.length,
    fichas_ok: fichas.length - fallidas.length,
    cabe_en_una_ejecucion:
      salida.pasos['3_concurrencia'].estimacion_719_ms < 50000 && fallidas.length === 0,
  };

  return new Response(JSON.stringify(salida, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
