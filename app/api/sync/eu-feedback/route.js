// =====================================================================
// SYNC — Contribuciones a las consultas de la Comisión
// app/api/sync/eu-feedback/route.js
//
// Trae quién ha contribuido a cada consulta pública: organizaciones,
// tipo, país y su número de registro de transparencia cuando lo
// declaran.
//
// CÓMO SE ENLAZA: /brpapi/groupInitiatives/<id> devuelve el expediente
// con todas sus publicaciones dentro, y cada una trae su `id` —el
// publicationId— junto a `totalFeedback`, que dice cuántas
// contribuciones tiene antes de pedirlas.
//
// Se descartaron dos vías antes de dar con esta: la API /api/ no tiene
// ninguna ruta que enlace iniciativa con publicación, y el cruce por
// referencia Ares no funciona —el número del expediente y el de la
// contribución son series distintas—.
//
// SOLO LO ABIERTO: para una consulta cerrada, saber quién contribuyó es
// histórico; para una abierta, es inteligencia útil.
//
// OJO CON EL PARÁMETRO language: con él la API devuelve 500. Sin él
// funciona y da las 374 contribuciones de una consulta en 4 páginas.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin escribir
//   ?key=<DEBUG_KEY>&id=19033     un expediente concreto
//   ?key=<DEBUG_KEY>              todos los que tienen consulta abierta
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API = 'https://ec.europa.eu/info/law/better-regulation/api';
const BRP = 'https://ec.europa.eu/info/law/better-regulation/brpapi';
const PRESUPUESTO_MS = 45000;
const PARALELO = 4;
const PAUSA_MS = 150;

// Cuántos expedientes se revisan por pasada. Son pocos —los abiertos
// rondan los 43— así que caben todos.
const POR_PASADA = 40;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, */*',
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Las publicaciones de un expediente.
 *
 * Devuelve solo las que tienen contribuciones: `totalFeedback` lo dice
 * antes de pedirlas, así que no se gasta una llamada en las vacías.
 */
async function publicacionesDe(groupId) {
  try {
    const res = await fetch(`${BRP}/groupInitiatives/${groupId}`, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    const pubs = (data.publications || [])
      .filter((p) => (p.totalFeedback || 0) > 0)
      .map((p) => ({
        id: p.id,
        total: p.totalFeedback,
        tipo: p.type,
        estado: p.receivingFeedbackStatus,
        fin: p.endDate,
        reference: p.reference,
      }));
    return { ok: true, pubs, titulo: data.shortTitle };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function pedirPagina(pub, page) {
  try {
    // Sin language: con ese parámetro la API devuelve 500.
    const res = await fetch(`${API}/allFeedback?publicationId=${pub}&page=${page}&size=100`, {
      headers: HEADERS,
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Todas las contribuciones de una consulta.
 *
 * Se pagina hasta agotarla: una consulta popular tiene 374 repartidas en
 * cuatro páginas, y quedarse en la primera daría una imagen parcial de
 * quién ha presionado.
 */
async function contribuciones(pub, limiteMs) {
  const t0 = Date.now();
  const primera = await pedirPagina(pub, 0);
  if (!primera.ok) return { error: primera.status || primera.error };

  const total = primera.data?.totalElements ?? 0;
  const paginas = primera.data?.totalPages ?? 0;
  if (total === 0) return { vacio: true, items: [] };

  let items = primera.data.content || [];
  // Un tope por si alguna consulta tuviera miles: con 500 ya se ve de
  // sobra quién ha participado.
  for (let p = 1; p < Math.min(paginas, 5); p++) {
    if (Date.now() - t0 > limiteMs) break;
    const r = await pedirPagina(pub, p);
    if (!r.ok) break;
    items = items.concat(r.data.content || []);
  }
  return { total, items };
}

function mapear(f, pub, initiativeId) {
  return {
    id: f.id,
    publication_id: pub,
    // Se guarda al vuelo: ya sabemos de qué expediente viene, no hace
    // falta cruzarlo después.
    initiative_id: initiativeId,
    reference: f.referenceInitiative || null,
    fecha: f.dateFeedback ? new Date(f.dateFeedback.replace(/\//g, '-')).toISOString() : null,
    organizacion: f.organization || null,
    tipo: f.userType || null,
    pais: f.country || null,
    tamano: f.companySize || null,
    // El registro de transparencia enlaza con el directorio de lobbies.
    // Viene vacío en muchas: solo lo declaran los que están inscritos.
    tr_number: f.trNumber || null,
    nombre: f.firstName || null,
    apellidos: f.surname || null,
    texto: (f.feedback || '').slice(0, 8000),
    idioma: f.language || null,
    publicacion: f.publication || null,
    n_adjuntos: (f.attachments || []).length,
    adjuntos: f.attachments?.length ? f.attachments : null,
  };
}

async function escribir(supabase, tabla, filas, conflicto) {
  if (filas.length === 0) return { escritas: 0, errores: [] };
  let escritas = 0;
  const errores = [];
  for (let i = 0; i < filas.length; i += 200) {
    const grupo = filas.slice(i, i + 200);
    const { data, error } = await supabase
      .from(tabla)
      .upsert(grupo, { onConflict: conflicto, ignoreDuplicates: false })
      .select(conflicto.split(',')[0]);
    if (error) errores.push(error.message);
    else escritas += Array.isArray(data) ? data.length : 0;
  }
  return { escritas, errores: errores.slice(0, 3) };
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
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry };

  try {
    // --- Qué expedientes revisar --------------------------------------
    // Solo los que tienen consulta abierta: para uno cerrado, saber
    // quién contribuyó es histórico; para uno abierto, es inteligencia
    // útil mientras se puede actuar.
    let expedientes = [];
    if (sp.get('id')) {
      const { data } = await supabase
        .from('eu_initiatives')
        .select('id, title_es, title_en')
        .eq('id', parseInt(sp.get('id'), 10))
        .limit(1)
        .maybeSingle();
      if (data) expedientes = [data];
    } else {
      const { data } = await supabase
        .from('eu_initiatives')
        .select('id, title_es, title_en, feedback_end')
        .gt('feedback_end', new Date().toISOString())
        .order('feedback_end', { ascending: true })
        .limit(POR_PASADA);
      expedientes = data || [];
    }

    informe.expedientes = expedientes.length;
    if (expedientes.length === 0) {
      return NextResponse.json({ ...informe, nota: 'Ningún expediente con consulta abierta.', ms_total: Date.now() - t0 });
    }

    // --- Recorrer -----------------------------------------------------
    const todas = [];
    const registros = [];
    let conContribuciones = 0;
    let sinPublicaciones = 0;

    for (const exp of expedientes) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }

      const r = await publicacionesDe(exp.id);
      if (!r.ok || (r.pubs || []).length === 0) {
        sinPublicaciones += 1;
        await espera(PAUSA_MS);
        continue;
      }

      for (const p of r.pubs) {
        if (Date.now() - t0 > PRESUPUESTO_MS) break;
        const c = await contribuciones(p.id, 8000);
        if (c.error || (c.items || []).length === 0) {
          registros.push({ publication_id: p.id, estado: c.error ? 'error' : 'vacio', n_contribuciones: 0 });
          continue;
        }
        conContribuciones += 1;
        todas.push(...c.items.map((f) => mapear(f, p.id, exp.id)));
        registros.push({
          publication_id: p.id,
          reference: p.reference || null,
          estado: 'ok',
          n_contribuciones: c.total,
        });
      }

      await espera(PAUSA_MS);
    }

    informe.sin_publicaciones = sinPublicaciones;
    informe.consultas_con_contribuciones = conContribuciones;
    informe.contribuciones = todas.length;
    informe.organizaciones = [...new Set(todas.map((t) => t.organizacion).filter(Boolean))].length;
    informe.con_registro = todas.filter((t) => t.tr_number).length;
    informe.por_tipo = todas.reduce((acc, t) => {
      if (t.tipo) acc[t.tipo] = (acc[t.tipo] || 0) + 1;
      return acc;
    }, {});

    if (dry) {
      informe.muestra = todas.slice(0, 5).map((t) => ({
        organizacion: t.organizacion,
        tipo: t.tipo,
        pais: t.pais,
        tr_number: t.tr_number,
        reference: t.reference,
      }));
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    informe.escritura = {
      contribuciones: await escribir(supabase, 'eu_feedback', todas, 'id'),
      registro: await escribir(supabase, 'eu_feedback_scan', registros, 'publication_id'),
    };

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
