// =====================================================================
// SYNC — Licitaciones y contratos (Plataforma de Contratación)
// app/api/sync/contratacion/route.js
//
// Lee los tres feeds de datos abiertos de la Plataforma (perfiles,
// agregación y contratos menores; lib/contratacion/placsp.js) y guarda en
// las tablas de sql/123.
//
// Cómo avanza, gastando lo mínimo:
//   1. Pide solo la cabecera HTTP del feed. Si su Last-Modified es el de
//      la última pasada completa, no descarga nada. (Los feeds se rehacen
//      una vez al día; el cron pasa cada hora y casi siempre sale aquí.)
//   2. Si cambió, empieza una pasada: baja página a página (rel="next",
//      ~5 MB cada una) guardando todo lo posterior a la marca (lo más
//      reciente ya leído entero). Para cuando llega a una página que ya
//      tiene entradas anteriores a la marca.
//   3. Cada página guardada se apunta en contratacion_lectura: si Vercel
//      corta, la siguiente ejecución sigue por la misma página.
//   Una entrada solo pisa el expediente si es más reciente que lo
//   guardado; cada versión queda en contratacion_eventos.
//
// La primera vez no hay marca: se empieza por lo publicado en las últimas
// 36 horas (?desde=AAAA-MM-DD para otra fecha). El histórico irá desde
// los ZIP mensuales, en otro paso.
//
// Uso:
//   cron (CRON_SECRET)                    los tres feeds
//   ?key=<DEBUG_KEY>&feed=menores         uno solo
//   ?key=<DEBUG_KEY>&dry=1                lee la primera página, sin guardar
//   ?key=<DEBUG_KEY>&forzar=1             aunque la cabecera no haya cambiado
//   ?key=<DEBUG_KEY>&desde=2026-11-01     marca inicial si el feed no tiene
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { FEEDS, cabecera, descargar, leerCabecera, leerEntradas, leerBajas, idFuente, aFilas } from '@/lib/contratacion/placsp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 800;

// Margen para cerrar antes de que Vercel corte (800 s). Una página tarda
// entre 20 y 90 s en bajar.
const PRESUPUESTO_MS = 560000;
const MARGEN_PAGINA_MS = 150000;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export const GET = conRegistro('/api/sync/contratacion', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && String(sp.get('key') || '').toLowerCase() === process.env.DEBUG_KEY.toLowerCase();
  if (!isCron && !isManual) return Response.json({ error: 'no autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const forzar = sp.get('forzar') === '1';
  const elegido = sp.get('feed');
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('desde') || '') ? new Date(`${sp.get('desde')}T00:00:00+01:00`) : null;

  const res = { ok: true, dry, feeds: {} };
  const db = admin();

  for (const [feed, url] of Object.entries(FEEDS)) {
    if (elegido && elegido !== feed) continue;
    if (Date.now() - t0 > PRESUPUESTO_MS - MARGEN_PAGINA_MS) {
      res.feeds[feed] = { omitido: 'sin tiempo; sigue en la próxima ejecución' };
      continue;
    }
    try {
      res.feeds[feed] = await leerFeed({ db, feed, url, dry, forzar, desde, t0 });
    } catch (e) {
      res.ok = false;
      res.feeds[feed] = { error: String(e.message || e).slice(0, 500) };
      if (!dry) await db.from('contratacion_lectura').upsert({ feed, ultima_ejecucion: new Date().toISOString(), ultimo_error: res.feeds[feed].error }, { onConflict: 'feed' });
    }
  }
  res.ms = Date.now() - t0;
  return Response.json(res);
}

async function leerFeed({ db, feed, url, dry, forzar, desde, t0 }) {
  const { data: fila } = await db.from('contratacion_lectura').select('*').eq('feed', feed).maybeSingle();
  const estado = fila || { feed };
  const salida = { paginas: 0, entradas: 0, guardadas: 0, omitidas_antiguas: 0, eventos: 0, adjudicaciones: 0, bajas: 0 };

  // ---- 1. ¿Hay algo nuevo? -------------------------------------------
  let pagina = estado.pendiente_url;
  let marca = estado.pendiente_marca ? new Date(estado.pendiente_marca) : null;
  let lmPasada = estado.pendiente_last_modified;
  let nuevaMarca = estado.nueva_marca ? new Date(estado.nueva_marca) : null;

  if (!pagina || dry) {
    const cab = await cabecera(url).catch(() => ({ status: 0, modificado: null }));
    salida.last_modified = cab.modificado;
    if (!dry && !forzar && cab.modificado && cab.modificado === estado.last_modified) {
      salida.sin_cambios = true;
      await db.from('contratacion_lectura').upsert({ feed, ultima_ejecucion: new Date().toISOString(), ultimo_error: null }, { onConflict: 'feed' });
      return salida;
    }
    pagina = url;
    marca = estado.marca ? new Date(estado.marca) : (desde || new Date(Date.now() - 36 * 3600 * 1000));
    lmPasada = cab.modificado;
    nuevaMarca = null;
    salida.pasada_nueva = true;
  } else {
    salida.continua_desde = pagina;
  }
  salida.marca = marca?.toISOString() || null;

  // ---- 2. Página a página ----------------------------------------------
  let terminada = false;
  while (pagina) {
    if (Date.now() - t0 > PRESUPUESTO_MS - MARGEN_PAGINA_MS) break;
    const r = await descargar(pagina);
    if (r.status !== 200) throw new Error(`HTTP ${r.status} en ${pagina}: ${r.texto.slice(0, 200)}`);
    const cab = leerCabecera(r.texto);
    const entradas = leerEntradas(r.texto);
    salida.paginas += 1;
    salida.entradas += entradas.length;

    const nuevas = entradas.filter((e) => e.actualizado && new Date(e.actualizado) > marca);
    const llegaAlaMarca = nuevas.length < entradas.length;
    for (const e of nuevas) {
      const f = new Date(e.actualizado);
      if (!nuevaMarca || f > nuevaMarca) nuevaMarca = f;
    }

    if (dry) {
      salida.muestra = nuevas.slice(0, 2).map((e) => aFilas(e, feed));
      salida.nuevas_en_primera_pagina = nuevas.length;
      terminada = true;
      break;
    }

    const g = await guardar(db, feed, nuevas);
    salida.guardadas += g.guardadas;
    salida.omitidas_antiguas += g.omitidas;
    salida.eventos += g.eventos;
    salida.adjudicaciones += g.adjudicaciones;
    salida.bajas += await aplicarBajas(db, feed, leerBajas(r.texto));

    pagina = llegaAlaMarca ? null : cab.siguiente;
    if (!pagina) terminada = true;

    // Apuntar por dónde va: si Vercel corta, se sigue desde aquí.
    await db.from('contratacion_lectura').upsert({
      feed,
      pendiente_url: pagina,
      pendiente_marca: pagina ? marca.toISOString() : null,
      pendiente_last_modified: pagina ? lmPasada : null,
      nueva_marca: pagina ? nuevaMarca?.toISOString() || null : null,
      ...(terminada ? {
        marca: new Date(Math.max(marca.getTime(), nuevaMarca?.getTime() || 0)).toISOString(),
        last_modified: lmPasada,
      } : {}),
      ultima_ejecucion: new Date().toISOString(),
      ultimo_error: null,
    }, { onConflict: 'feed' });
  }

  salida.terminada = terminada;
  if (!dry) {
    await db.from('contratacion_lectura').update({ ultimo_resultado: salida }).eq('feed', feed);
  }
  return salida;
}

/** Guarda las entradas de una página. Una entrada no pisa una versión más reciente. */
async function guardar(db, feed, entradas) {
  const out = { guardadas: 0, omitidas: 0, eventos: 0, adjudicaciones: 0 };
  // Dentro de la página, una sola versión por expediente: la más reciente.
  const porId = new Map();
  for (const e of entradas) {
    const f = aFilas(e, feed);
    if (!f) continue;
    const previa = porId.get(f.expediente.id);
    if (!previa || new Date(f.expediente.actualizado_fuente) > new Date(previa.expediente.actualizado_fuente)) porId.set(f.expediente.id, f);
  }
  const todas = [...porId.values()];
  const eventos = entradas.map((e) => aFilas(e, feed)?.evento).filter(Boolean);
  if (!todas.length) return out;

  for (let i = 0; i < todas.length; i += 200) {
    const lote = todas.slice(i, i + 200);
    const ids = lote.map((f) => f.expediente.id);
    const { data: existentes, error: e0 } = await db.from('contratacion_expedientes').select('id, actualizado_fuente').in('id', ids);
    if (e0) throw new Error(`leer expedientes: ${e0.message}`);
    const guardado = new Map((existentes || []).map((x) => [x.id, x.actualizado_fuente ? new Date(x.actualizado_fuente) : null]));
    const aGuardar = lote.filter((f) => {
      const g = guardado.get(f.expediente.id);
      return !g || new Date(f.expediente.actualizado_fuente) > g;
    });
    out.omitidas += lote.length - aGuardar.length;
    if (!aGuardar.length) continue;

    const { error: e1 } = await db.from('contratacion_expedientes').upsert(aGuardar.map((f) => f.expediente), { onConflict: 'id' });
    if (e1) throw new Error(`guardar expedientes: ${e1.message}`);
    out.guardadas += aGuardar.length;

    const conAdj = aGuardar.filter((f) => f.adjudicaciones.length);
    if (aGuardar.length) {
      const { error: e2 } = await db.from('contratacion_adjudicaciones').delete().in('expediente_id', aGuardar.map((f) => f.expediente.id));
      if (e2) throw new Error(`borrar adjudicaciones: ${e2.message}`);
    }
    const adj = conAdj.flatMap((f) => f.adjudicaciones);
    if (adj.length) {
      const { error: e3 } = await db.from('contratacion_adjudicaciones').insert(adj);
      if (e3) throw new Error(`guardar adjudicaciones: ${e3.message}`);
      out.adjudicaciones += adj.length;
    }
  }

  for (let i = 0; i < eventos.length; i += 500) {
    const lote = eventos.slice(i, i + 500).filter((ev) => porId.has(ev.expediente_id));
    if (!lote.length) continue;
    const { error, count } = await db.from('contratacion_eventos')
      .upsert(lote, { onConflict: 'expediente_id,actualizado_fuente', ignoreDuplicates: true, count: 'exact' });
    if (error) throw new Error(`guardar eventos: ${error.message}`);
    out.eventos += count ?? lote.length;
  }
  return out;
}

async function aplicarBajas(db, feed, bajas) {
  const ids = bajas.map((b) => idFuente(b.ref)).filter(Boolean).map((n) => `${feed}:${n}`);
  if (!ids.length) return 0;
  const { error, count } = await db.from('contratacion_expedientes')
    .update({ eliminado: true, updated_at: new Date().toISOString() }, { count: 'exact' })
    .in('id', ids);
  if (error) throw new Error(`bajas: ${error.message}`);
  return count || 0;
}
