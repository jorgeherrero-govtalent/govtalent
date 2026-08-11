// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — API del Parlamento Europeo (v2)
//
// CORRECCIÓN v2: la API devuelve el array en la clave "data", no en
// "@graph" (el @context la aliasea, pero el JSON literal usa "data").
// Por eso en v1 se saltó el paso 3.
//
// Preguntas que resuelve esta versión:
//   1. Paginación: ¿hasta dónde llega ?limit y cuántos devuelve?
//   2. Filtrado por país: ¿funciona en servidor?
//   3. Órganos: inventario de "classification" -> ¿salen comisiones,
//      delegaciones y grupos políticos del mismo endpoint?
//   4. Duplicados: ¿cuántas etiquetas repetidas hay (REGI aparecía 2x)?
//   5. Ficha individual: ¿trae las comisiones del eurodiputado?
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
      ms: Date.now() - started,
      parse_error: parseError,
      error_en_cuerpo: data && typeof data === 'object' ? data.error || null : null,
      data,
      raw_head: rawText.slice(0, 400),
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

// La API expone el array como "data". Se contempla "@graph" por si algún
// endpoint lo sirve sin aliasear.
function items(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data['@graph'])) return data['@graph'];
  return [];
}

// Cuenta valores distintos de un campo y guarda ejemplos.
function agrupar(lista, campo) {
  const mapa = {};
  for (const it of lista) {
    const clave = it[campo] ?? '(sin valor)';
    if (!mapa[clave]) mapa[clave] = { n: 0, ejemplos: [] };
    mapa[clave].n++;
    if (mapa[clave].ejemplos.length < 6) mapa[clave].ejemplos.push(it.label ?? it.id);
  }
  return mapa;
}

// Etiquetas que se repiten: síntoma de instancias históricas del mismo órgano.
function duplicados(lista) {
  const cuenta = {};
  for (const it of lista) {
    const l = it.label ?? '(sin label)';
    cuenta[l] = (cuenta[l] || 0) + 1;
  }
  const repetidas = Object.entries(cuenta)
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  return {
    etiquetas_distintas: Object.keys(cuenta).length,
    total_registros: lista.length,
    top_repetidas: repetidas.map(([label, n]) => ({ label, veces: n })),
  };
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const chars = parseInt(sp.get('chars') || '3000', 10);
  const salida = { generado: new Date().toISOString(), base: BASE, pasos: {} };

  // ---------------------------------------------------------------
  // PASO 1 — Paginación: pedimos 800 (hay 720 escaños).
  // ¿Los devuelve todos, o hay tope de página?
  // ---------------------------------------------------------------
  const p1 = await callEP(`${BASE}/meps/show-current?limit=800&format=application%2Fld%2Bjson`);
  const meps = items(p1.data);
  salida.pasos['1_paginacion_meps'] = {
    pregunta: '¿Cuántos devuelve al pedir 800? ¿Hay tope de página?',
    http_status: p1.http_status,
    ms: p1.ms,
    problema: p1.fallo || p1.error_en_cuerpo || p1.parse_error || null,
    devueltos: meps.length,
    claves_disponibles: meps[0] ? Object.keys(meps[0]) : null,
    grupos_politicos: agrupar(meps, 'api:political-group'),
    reparto_por_pais: Object.fromEntries(
      Object.entries(agrupar(meps, 'api:country-of-representation')).map(([k, v]) => [k, v.n])
    ),
  };

  // ---------------------------------------------------------------
  // PASO 2 — ¿Se puede filtrar por país en servidor?
  // Si funciona, la delegación española sale en una llamada.
  // ---------------------------------------------------------------
  const p2 = await callEP(
    `${BASE}/meps/show-current?country-of-representation=ESP&limit=100&format=application%2Fld%2Bjson`
  );
  const esp = items(p2.data);
  salida.pasos['2_filtro_pais'] = {
    pregunta: '¿El filtro country-of-representation funciona en servidor? (España debería dar 61)',
    http_status: p2.http_status,
    ms: p2.ms,
    problema: p2.fallo || p2.error_en_cuerpo || p2.parse_error || null,
    devueltos: esp.length,
    paises_en_respuesta: [...new Set(esp.map((m) => m['api:country-of-representation']))],
    primeros_tres: esp.slice(0, 3),
  };

  // ---------------------------------------------------------------
  // PASO 3 — Inventario de órganos.
  // ¿Comisiones, delegaciones y grupos políticos vienen todos de aquí?
  // ¿Cuántos duplicados por instancias históricas?
  // ---------------------------------------------------------------
  const p3 = await callEP(`${BASE}/corporate-bodies?limit=1000&format=application%2Fld%2Bjson`);
  const orgs = items(p3.data);
  salida.pasos['3_inventario_organos'] = {
    pregunta: '¿Qué tipos de órgano existen y cuántos duplicados hay?',
    http_status: p3.http_status,
    ms: p3.ms,
    problema: p3.fallo || p3.error_en_cuerpo || p3.parse_error || null,
    devueltos: orgs.length,
    claves_disponibles: orgs[0] ? Object.keys(orgs[0]) : null,
    por_classification: agrupar(orgs, 'classification'),
    analisis_duplicados: duplicados(orgs),
  };

  // ---------------------------------------------------------------
  // PASO 4 — LA CLAVE: ficha individual.
  // ¿Trae las comisiones, o hay que resolverlas con 720 llamadas?
  // ---------------------------------------------------------------
  const mepId = sp.get('mepId') || (meps[0] && meps[0].identifier) || '1294';
  const p4 = await callEP(`${BASE}/meps/${mepId}?format=application%2Fld%2Bjson`);
  const ficha = items(p4.data);
  salida.pasos['4_ficha_individual'] = {
    pregunta: '¿La ficha del eurodiputado incluye sus comisiones?',
    mep_id_usado: mepId,
    http_status: p4.http_status,
    ms: p4.ms,
    problema: p4.fallo || p4.error_en_cuerpo || p4.parse_error || null,
    elementos: ficha.length,
    claves_disponibles: ficha[0] ? Object.keys(ficha[0]) : null,
    ficha_completa: JSON.stringify(ficha[0] || p4.data).slice(0, chars * 2),
  };

  salida.resumen = Object.entries(salida.pasos).map(([k, v]) => ({
    paso: k,
    status: v.http_status,
    ms: v.ms,
    devueltos: v.devueltos ?? v.elementos ?? null,
    problema: v.problema || null,
  }));

  return new Response(JSON.stringify(salida, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
