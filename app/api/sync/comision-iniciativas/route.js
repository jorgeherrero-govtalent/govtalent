// =====================================================================
// SYNC — Iniciativas y consultas de la Comisión Europea
// app/api/sync/comision-iniciativas/route.js
//
// Fuente: brpapi de "Have your say". JSON, sin autenticación.
//
// TRES COSAS QUE VIENEN DEL DIAGNÓSTICO, NO DE SUPONER:
//
//  1. Los filtros de estado del servidor se IGNORAN. Pedir
//     receivingFeedbackStatus=OPEN devuelve los 4.092 registros igual.
//     Así que se trae todo y se filtra en base de datos.
//
//  2. El id llega como número decimal (14858.0). Si se guarda tal cual,
//     los identificadores acaban con ".0" pegado.
//
//  3. Las fechas vienen como "2026/09/09 23:59:59", con barras y sin zona
//     horaria. No es ISO: new Date() las interpreta de forma distinta
//     según el motor. Se parsean a mano.
//
// POR QUÉ ESTE FICHERO CAMBIÓ (diagnóstico del 12/09/2026)
// ---------------------------------------------------------------------
// La versión anterior empezaba SIEMPRE en la página 0 y se cortaba por
// presupuesto de tiempo a las tres páginas. Devolvía la página por la que
// continuar en `continuar_en`, pero nadie la llamaba: el cron de
// vercel.json invoca la ruta sin parámetros. Resultado medido en la base
// de datos:
//
//   - 3.808 filas en total, de las cuales solo 303 tenían last_synced_at
//     de las últimas 48 h. Las otras 3.505 seguían con el estado del día
//     de la carga inicial, un mes antes.
//   - La cuenta de ventanas abiertas solo bajaba (44 -> 38), porque el
//     reloj cierra las que ya estaban marcadas OPEN y nada abre las
//     nuevas.
//
// El descubrimiento NO era el problema: la fuente devuelve lo más
// reciente primero y las altas nuevas (1-2 por día laborable) sí
// entraban. El problema es que en "Have your say" un expediente se crea
// semanas o meses antes de que se abra su ventana de retroalimentación.
// Cuando se abre, ese registro ya no está entre los más recientes y
// nunca se volvía a leer.
//
// `comision-detalle` tampoco cubría este hueco: solo escribe campos
// descriptivos (resumen, dg_code, autor, adjuntos) y solo sobre filas con
// detail_synced_at a null, es decir una vez en la vida de cada registro.
// No toca feedback_status, feedback_start, feedback_end ni stage.
//
// CÓMO SE ARREGLA
// ---------------------------------------------------------------------
// Dos cosas en cada invocación:
//
//   a) CABEZA. La página 0 se lee siempre. Cubre el descubrimiento de
//      altas nuevas con margen de sobra (100 huecos para 1-2 altas) y de
//      paso da el total de la fuente para validar y paginar.
//
//   b) BARRIDO. Se continúa desde un cursor persistido en
//      `sync_cursores`, en lotes paralelos, hasta agotar el presupuesto.
//      Al terminar se guarda la posición y se relanza la ruta sin esperar
//      la respuesta, igual que hace comision-detalle. Con 8 páginas por
//      invocación y ~39 páginas en origen, la fuente entera se refresca
//      en unas cinco invocaciones encadenadas, unos cuatro minutos.
//
// Una página que falle no detiene el barrido ni retrocede el cursor: como
// la vuelta completa se cierra todos los días, un fallo transitorio se
// corrige solo en la pasada siguiente. Queda registrado en el informe.
//
// Parámetros:
//   ?key=<DEBUG_KEY>          lanzarlo a mano
//   ?dry=1                    no escribe, no mueve el cursor, solo informa
//   ?from=12                  forzar la posición de inicio del barrido
//   ?pages=5                  limitar páginas DEL BARRIDO (pruebas). La
//                             cabeza se lee siempre aparte, así que
//                             pages=5 descarga 6 páginas en total, y con
//                             `pages` no se encadena.
//   ?paralelo=4               páginas simultáneas (1-8)
//   ?encadenar=0              no relanzar la pasada siguiente
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BRP = 'https://ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives';
// El servidor CAPA a 100 registros por página, pero calcula totalPages con
// el size que le mandes. Pedir 200 devuelve 100 y anuncia 21 páginas en vez
// de 41: el recorrido se saltaría media fuente sin dar ningún error.
// Verificado en diagnóstico: size=200 -> 100 registros.
const PAGE_SIZE_MAXIMO = 100;
// 20 s, no 25. Medido: una página tarda unos 14 s. En el caso peor, con
// la cabeza y el primer lote agotando el timeout, 25 dejaba la función en
// 50 s antes de empezar a escribir, con el límite de Vercel en 60. Con 20
// el caso peor baja a 40 y la operación normal no se entera.
const TIMEOUT_MS = 20000;
const LOTE_BD = 500;
// Presupuesto de descarga. Una página tarda unos 14 s y la comprobación se
// hace ANTES de lanzar el lote, así que hay que reservar el tiempo de ese
// lote más el de la escritura. Con 30 s: la cabeza acaba sobre los 14, el
// último lote arranca como muy tarde a los 29 y acaba sobre los 43, y
// quedan unos 15 s para escribir antes del límite de 60.
const PRESUPUESTO_MS = 30000;
// Páginas simultáneas. Mismo criterio que eu-feedback: cuatro no hace
// sudar al servidor de la Comisión y multiplica por cuatro el alcance.
const PARALELO = 4;
// Tope de eslabones. Con 8 páginas por invocación y ~39 páginas, cinco
// bastan; diez dejan margen sin arriesgar una cadena infinita si algún día
// la fuente crece o se ralentiza.
const MAX_CADENA = 10;
const MS_LANZAR_SIGUIENTE = 1200;
const CLAVE_CURSOR = 'comision-iniciativas';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function slugify(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

// "2026/09/09 23:59:59" -> ISO. Se construye la fecha por partes en vez de
// dejársela a new Date(): con ese formato, el resultado depende del motor
// y de la zona horaria, y aquí las fechas de cierre son el producto.
function parseFecha(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mes, d, h, min, seg] = m;
  // Las horas de Bruselas se guardan como UTC: la diferencia no cambia el
  // día de cierre en la práctica y evita depender de la zona del servidor.
  return `${y}-${mes}-${d}T${h}:${min}:${seg}Z`;
}

async function pedirPagina(page, size) {
  const url = `${BRP}?text=&language=EN&size=${size}&page=${page}`;
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        // Pedir gzip reduce mucho el peso: cada iniciativa arrastra sus 24
        // traducciones y la respuesta sin comprimir es enorme.
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    if (res.status !== 200) return { ok: false, status: res.status, ms: Date.now() - t0 };
    const data = await res.json();
    const p = data?.initiativeResultDtoPage;
    if (!p) return { ok: false, status: 200, motivo: 'respuesta sin initiativeResultDtoPage', ms: Date.now() - t0 };
    return { ok: true, contenido: p.content || [], total: p.totalElements ?? null, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, motivo: e.name === 'AbortError' ? 'timeout' : e.message, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

function traducir(traducciones, idioma, campo = 'SHORT_TITLE') {
  if (!Array.isArray(traducciones)) return null;
  const t = traducciones.find((x) => x.language === idioma && x.field === campo);
  return t?.value || null;
}

function transformar(raw) {
  const id = raw?.id != null ? Math.trunc(Number(raw.id)) : null;
  if (!id || Number.isNaN(id)) return null;

  const estados = Array.isArray(raw.currentStatuses) ? raw.currentStatuses : [];
  const vigente = estados.find((s) => s.isCurrent) || estados[0] || {};

  const titleEn = traducir(raw.initiativeTranslations, 'EN') || raw.shortTitle || null;
  const titleEs = traducir(raw.initiativeTranslations, 'ES');

  return {
    iniciativa: {
      id,
      reference: raw.reference || null,
      slug: `${slugify(titleEn || raw.shortTitle || 'iniciativa')}-${id}`,
      status: raw.initiativeStatus || null,
      act_type: raw.foreseenActType || null,
      title_en: titleEn,
      title_es: titleEs,
      stage: vigente.frontEndStage || null,
      feedback_status: vigente.receivingFeedbackStatus || null,
      feedback_start: parseFecha(vigente.feedbackStartDate),
      feedback_end: parseFecha(vigente.feedbackEndDate),
      raw_statuses: estados,
      // Verificado: el portal redirige de /initiatives/{id} a la URL larga con
      // título, así que basta el número. Reconstruir el slug sería frágil:
      // usa la traducción inglesa, no el shortTitle que guardamos.
      source_url: `https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/${id}`,
      last_synced_at: new Date().toISOString(),
    },
    topics: (Array.isArray(raw.topics) ? raw.topics : [])
      .filter((t) => t && t.code)
      .map((t) => ({ code: t.code, label_en: t.label || null })),
  };
}

async function enLotes(filas, fn) {
  let escritas = 0;
  const errores = [];
  for (let i = 0; i < filas.length; i += LOTE_BD) {
    const lote = filas.slice(i, i + LOTE_BD);
    const { error } = await fn(lote);
    if (error) errores.push(`${i}: ${error.message}`);
    else escritas += lote.length;
  }
  return { escritas, errores };
}

/**
 * Posición del barrido. Si la fila no existe todavía, se empieza en 1: la
 * página 0 la cubre siempre la cabeza.
 */
async function leerCursor(supabase) {
  const { data, error } = await supabase
    .from('sync_cursores')
    .select('posicion, vuelta')
    .eq('clave', CLAVE_CURSOR)
    .limit(1)
    .maybeSingle();
  if (error || !data) return { posicion: 1, vuelta: 0, error: error?.message || null };
  return { posicion: Number.isFinite(data.posicion) ? data.posicion : 1, vuelta: data.vuelta ?? 0, error: null };
}

async function guardarCursor(supabase, { posicion, vuelta, paginasTotales, completado }) {
  const fila = {
    clave: CLAVE_CURSOR,
    posicion,
    vuelta,
    paginas_total: paginasTotales,
    actualizado_at: new Date().toISOString(),
  };
  if (completado) fila.completado_at = new Date().toISOString();
  const { error } = await supabase.from('sync_cursores').upsert(fila, { onConflict: 'clave' });
  return error ? error.message : null;
}

/**
 * Lanza la siguiente pasada sin esperar a que termine.
 *
 * Se aborta la espera a propósito: la nueva invocación tarda casi un
 * minuto y esperarla agotaría el tiempo de esta. Basta con que Vercel
 * reciba la petición para que arranque una función independiente.
 *
 * El AbortError que se produce al cortar NO es un fallo: es el
 * comportamiento buscado.
 */
async function lanzarSiguiente(request, eslabon) {
  const url = new URL(request.url);
  url.searchParams.set('cadena', String(eslabon));
  // El cursor vive en la base de datos: la pasada siguiente lo lee de
  // allí. Arrastrar un `from` heredado la haría volver atrás.
  url.searchParams.delete('from');
  url.searchParams.delete('pages');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MS_LANZAR_SIGUIENTE);
  try {
    await fetch(url.toString(), {
      signal: controller.signal,
      headers: request.headers.get('authorization')
        ? { authorization: request.headers.get('authorization') }
        : {},
      cache: 'no-store',
    });
    return { lanzado: true, motivo: 'respondió antes de tiempo' };
  } catch (e) {
    if (e.name === 'AbortError') return { lanzado: true };
    return { lanzado: false, motivo: e.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const dry = sp.get('dry') === '1';
  // Se ignora cualquier size mayor que el máximo real: si se aceptara, el
  // cálculo de páginas saldría mal y el recorrido dejaría registros fuera.
  const sizePedido = parseInt(sp.get('size') || String(PAGE_SIZE_MAXIMO), 10);
  const size = Math.min(Math.max(sizePedido, 1), PAGE_SIZE_MAXIMO);
  const paralelo = Math.min(Math.max(parseInt(sp.get('paralelo') || String(PARALELO), 10), 1), 8);
  const maxPaginas = parseInt(sp.get('pages') || '0', 10);
  const eslabon = Math.max(parseInt(sp.get('cadena') || '0', 10), 0);
  const encadenar = sp.get('encadenar') !== '0';
  const desdeManual = sp.get('from') !== null ? Math.max(parseInt(sp.get('from') || '0', 10), 0) : null;

  const supabase = admin();

  const informe = {
    inicio: new Date().toISOString(),
    dry_run: dry,
    tamano_pagina: size,
    paralelismo: paralelo,
    eslabon,
    fases: {},
  };
  if (sizePedido > PAGE_SIZE_MAXIMO) {
    informe.aviso_size = `Se pidió size=${sizePedido} pero el servidor capa a ${PAGE_SIZE_MAXIMO}; se usa ${size}.`;
  }

  // --- FASE 1: cabeza --------------------------------------------------
  // La página 0 se lee siempre, pase lo que pase con el cursor. Es el
  // descubrimiento de altas nuevas y de paso valida la fuente.
  const t1 = Date.now();
  const primera = await pedirPagina(0, size);
  if (!primera.ok) {
    return NextResponse.json({ error: 'no se pudo leer la página de cabecera', detalle: primera }, { status: 502 });
  }

  const total = primera.total || 0;
  // Salvaguarda: si la fuente devuelve mucho menos de lo habitual, algo va
  // mal y es mejor no escribir que corromper la tabla.
  if (total < 1000) {
    return NextResponse.json(
      { error: `total sospechosamente bajo (${total}), se aborta sin escribir`, ms: Date.now() - t0 },
      { status: 502 }
    );
  }

  // El número de páginas se calcula con lo que el servidor DEVUELVE, no con
  // lo que se le pidió. Si algún día capa por debajo de 100, esto lo absorbe
  // en vez de saltarse registros en silencio.
  const devueltosPrimera = primera.contenido.length;
  const sizeReal = devueltosPrimera > 0 ? devueltosPrimera : size;
  const paginasTotales = Math.ceil(total / sizeReal);

  if (sizeReal !== size) {
    informe.aviso_size_real = `Se pidieron ${size} registros por página y el servidor devolvió ${sizeReal}. Se recalcula: ${paginasTotales} páginas.`;
  }

  // --- FASE 2: barrido desde el cursor ---------------------------------
  const guardado = desdeManual !== null ? { posicion: desdeManual, vuelta: 0, error: null } : await leerCursor(supabase);
  if (guardado.error) {
    informe.aviso_cursor = `No se pudo leer el cursor (${guardado.error}); se empieza en 1. Si el mensaje habla de una relación inexistente, falta ejecutar sync_cursores.sql.`;
  }

  // Fuera de rango significa cursor corrupto o fuente encogida: se
  // reinicia la vuelta en vez de quedarse dando vueltas en el vacío.
  let cursor = guardado.posicion;
  if (!Number.isFinite(cursor) || cursor < 1 || cursor >= paginasTotales) cursor = 1;

  const tope = maxPaginas > 0 ? Math.min(cursor + maxPaginas, paginasTotales) : paginasTotales;

  let crudas = [...primera.contenido];
  const fallidas = [];
  const tiempos = [primera.ms];
  let p = cursor;
  let cortadoPorTiempo = false;

  while (p < tope) {
    if (Date.now() - t0 > PRESUPUESTO_MS) {
      cortadoPorTiempo = true;
      break;
    }
    const lote = [];
    for (let k = 0; k < paralelo && p + k < tope; k++) lote.push(p + k);
    const respuestas = await Promise.all(lote.map((n) => pedirPagina(n, size)));
    respuestas.forEach((r, i) => {
      tiempos.push(r.ms);
      if (r.ok) crudas = crudas.concat(r.contenido);
      // Una página fallida no retrocede el cursor: la vuelta completa se
      // cierra a diario, así que un fallo transitorio se corrige solo.
      else fallidas.push({ pagina: lote[i], ...r });
    });
    p += lote.length;
  }

  let proximoCursor = p;
  let vueltaCompletada = false;
  if (proximoCursor >= paginasTotales) {
    proximoCursor = 1;
    vueltaCompletada = true;
  }

  informe.fases['1_descarga'] = {
    total_en_fuente: total,
    size_real_por_pagina: sizeReal,
    paginas_totales: paginasTotales,
    cursor_inicial: cursor,
    cursor_final: proximoCursor,
    vuelta_completada: vueltaCompletada,
    paginas_leidas: tiempos.length,
    registros: crudas.length,
    // Registros únicos: si la fuente repitiera páginas, aquí se vería.
    registros_unicos: new Set(crudas.map((c) => c?.id).filter((x) => x != null)).size,
    ms_medio_pagina: Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length),
    cortado_por_tiempo: cortadoPorTiempo,
    paginas_fallidas: fallidas.length,
    detalle_fallos: fallidas.slice(0, 5),
    ms: Date.now() - t1,
  };

  // --- FASE 3: transformación ------------------------------------------
  const t2 = Date.now();
  const porId = new Map();
  const temasMap = new Map();
  const relaciones = [];
  let descartadas = 0;
  let sinFecha = 0;

  for (const raw of crudas) {
    const t = transformar(raw);
    if (!t) {
      descartadas++;
      continue;
    }
    if (t.iniciativa.feedback_status === 'OPEN' && !t.iniciativa.feedback_end) sinFecha++;

    // La cabeza y el barrido pueden solaparse cuando el cursor está cerca
    // del principio. Un upsert con la misma clave repetida dentro del mismo
    // lote hace fallar a PostgREST, así que se deduplica por id.
    porId.set(t.iniciativa.id, t.iniciativa);
    for (const tema of t.topics) {
      if (!temasMap.has(tema.code)) temasMap.set(tema.code, tema);
      relaciones.push({ initiative_id: t.iniciativa.id, topic_code: tema.code });
    }
  }

  const iniciativas = [...porId.values()];

  // Las relaciones también pueden venir repetidas por el mismo solape.
  const relacionesUnicas = [
    ...new Map(relaciones.map((r) => [`${r.initiative_id}|${r.topic_code}`, r])).values(),
  ];

  const abiertas = iniciativas.filter(
    (i) => i.feedback_status === 'OPEN' && i.feedback_end && new Date(i.feedback_end) > new Date()
  );

  informe.fases['2_transformacion'] = {
    transformadas: iniciativas.length,
    descartadas_sin_id: descartadas,
    duplicadas_por_solape: crudas.length - descartadas - iniciativas.length,
    marcadas_OPEN_sin_fecha: sinFecha,
    ventanas_realmente_abiertas: abiertas.length,
    temas_distintos: temasMap.size,
    relaciones: relacionesUnicas.length,
    con_titulo_es: iniciativas.filter((i) => i.title_es).length,
    ms: Date.now() - t2,
  };

  if (dry) {
    informe.ms_total = Date.now() - t0;
    informe.nota = 'dry run: no se ha escrito nada ni se ha movido el cursor';
    informe.muestra_iniciativa = iniciativas[0] ? { ...iniciativas[0], raw_statuses: '[...recortado]' } : null;
    informe.muestra_abiertas = abiertas.slice(0, 3).map((i) => ({
      id: i.id,
      title: i.title_es || i.title_en,
      cierra: i.feedback_end,
    }));
    informe.temas = [...temasMap.values()];
    return NextResponse.json(informe);
  }

  // --- FASE 4: escritura ------------------------------------------------
  // Orden obligado por las claves foráneas: temas, iniciativas, relaciones.
  const t3 = Date.now();

  const wTemas = await enLotes([...temasMap.values()], (lote) =>
    supabase.from('eu_topics').upsert(lote, { onConflict: 'code' })
  );
  const wInit = await enLotes(iniciativas, (lote) =>
    supabase.from('eu_initiatives').upsert(lote, { onConflict: 'id' })
  );
  const wRel = await enLotes(relacionesUnicas, (lote) =>
    supabase.from('eu_initiative_topics').upsert(lote, { onConflict: 'initiative_id,topic_code' })
  );

  informe.fases['3_escritura'] = {
    temas: wTemas,
    iniciativas: wInit,
    relaciones: wRel,
    ms: Date.now() - t3,
  };

  // --- FASE 5: cursor y encadenado --------------------------------------
  // El cursor se mueve DESPUÉS de escribir. Si la escritura falla, la
  // pasada siguiente repite el mismo tramo en vez de saltárselo.
  const errCursor = await guardarCursor(supabase, {
    posicion: proximoCursor,
    vuelta: (guardado.vuelta || 0) + (vueltaCompletada ? 1 : 0),
    paginasTotales,
    completado: vueltaCompletada,
  });
  if (errCursor) informe.error_cursor = errCursor;

  // SIN CURSOR NO SE ENCADENA. Si la tabla no existe o la escritura del
  // cursor falla, la pasada siguiente volvería a empezar en la misma
  // página: diez eslabones releyendo el mismo tramo y ni un registro
  // nuevo. Más vale una vuelta corta y un aviso que una cadena en falso.
  const cursorVivo = !errCursor;
  const quedaBarrido = !vueltaCompletada && maxPaginas === 0;

  if (!cursorVivo) {
    informe.aviso_cadena =
      'No se pudo guardar el cursor, así que no se encadena: sin posición persistida la pasada siguiente repetiría el mismo tramo. Comprobar que existe la tabla sync_cursores.';
  } else if (quedaBarrido && encadenar && eslabon < MAX_CADENA) {
    informe.siguiente = await lanzarSiguiente(request, eslabon + 1);
  } else if (quedaBarrido && eslabon >= MAX_CADENA) {
    informe.aviso_cadena = `Se alcanzó el tope de ${MAX_CADENA} eslabones con el cursor en ${proximoCursor}. La vuelta se retomará en la próxima ejecución del cron.`;
  }

  informe.ms_total = Date.now() - t0;
  return NextResponse.json(informe);
}
