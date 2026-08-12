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
// Parámetros:
//   ?key=<DEBUG_KEY>          lanzarlo a mano
//   ?dry=1                    no escribe, solo informa
//   ?pages=5                  limitar páginas (pruebas)
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BRP = 'https://ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives';
const PAGE_SIZE = 100;
const TIMEOUT_MS = 20000;
const LOTE_BD = 500;

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

async function pedirPagina(page) {
  const url = `${BRP}?text=&language=EN&size=${PAGE_SIZE}&page=${page}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    if (res.status !== 200) return { ok: false, status: res.status };
    const data = await res.json();
    const p = data?.initiativeResultDtoPage;
    if (!p) return { ok: false, status: 200, motivo: 'respuesta sin initiativeResultDtoPage' };
    return { ok: true, contenido: p.content || [], total: p.totalElements ?? null };
  } catch (e) {
    return { ok: false, motivo: e.name === 'AbortError' ? 'timeout' : e.message };
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
      source_url: `https://have-your-say.ec.europa.eu/initiatives/${id}`,
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

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const dry = sp.get('dry') === '1';
  const maxPaginas = parseInt(sp.get('pages') || '0', 10);

  const informe = { inicio: new Date().toISOString(), dry_run: dry, fases: {} };

  // --- FASE 1: descarga paginada --------------------------------------
  const t1 = Date.now();
  const primera = await pedirPagina(0);
  if (!primera.ok) {
    return NextResponse.json({ error: 'no se pudo leer la primera página', detalle: primera }, { status: 502 });
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

  const paginasTotales = Math.ceil(total / PAGE_SIZE);
  const paginas = maxPaginas > 0 ? Math.min(maxPaginas, paginasTotales) : paginasTotales;

  let crudas = [...primera.contenido];
  const fallidas = [];

  for (let p = 1; p < paginas; p++) {
    const r = await pedirPagina(p);
    if (r.ok) crudas = crudas.concat(r.contenido);
    else fallidas.push({ pagina: p, ...r });
  }

  informe.fases['1_descarga'] = {
    total_en_fuente: total,
    paginas_pedidas: paginas,
    registros: crudas.length,
    paginas_fallidas: fallidas.length,
    detalle_fallos: fallidas.slice(0, 5),
    ms: Date.now() - t1,
  };

  // --- FASE 2: transformación -----------------------------------------
  const t2 = Date.now();
  const iniciativas = [];
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

    iniciativas.push(t.iniciativa);
    for (const tema of t.topics) {
      if (!temasMap.has(tema.code)) temasMap.set(tema.code, tema);
      relaciones.push({ initiative_id: t.iniciativa.id, topic_code: tema.code });
    }
  }

  const abiertas = iniciativas.filter(
    (i) => i.feedback_status === 'OPEN' && i.feedback_end && new Date(i.feedback_end) > new Date()
  );

  informe.fases['2_transformacion'] = {
    transformadas: iniciativas.length,
    descartadas_sin_id: descartadas,
    marcadas_OPEN_sin_fecha: sinFecha,
    ventanas_realmente_abiertas: abiertas.length,
    temas_distintos: temasMap.size,
    relaciones: relaciones.length,
    con_titulo_es: iniciativas.filter((i) => i.title_es).length,
    ms: Date.now() - t2,
  };

  if (dry) {
    informe.ms_total = Date.now() - t0;
    informe.nota = 'dry run: no se ha escrito nada';
    informe.muestra_iniciativa = iniciativas[0] ? { ...iniciativas[0], raw_statuses: '[...recortado]' } : null;
    informe.muestra_abiertas = abiertas.slice(0, 3).map((i) => ({
      id: i.id,
      title: i.title_es || i.title_en,
      cierra: i.feedback_end,
    }));
    informe.temas = [...temasMap.values()];
    return NextResponse.json(informe);
  }

  // --- FASE 3: escritura ----------------------------------------------
  // Orden obligado por las claves foráneas: temas, iniciativas, relaciones.
  const t3 = Date.now();
  const supabase = admin();

  const wTemas = await enLotes([...temasMap.values()], (lote) =>
    supabase.from('eu_topics').upsert(lote, { onConflict: 'code' })
  );
  const wInit = await enLotes(iniciativas, (lote) =>
    supabase.from('eu_initiatives').upsert(lote, { onConflict: 'id' })
  );
  const wRel = await enLotes(relaciones, (lote) =>
    supabase.from('eu_initiative_topics').upsert(lote, { onConflict: 'initiative_id,topic_code' })
  );

  informe.fases['3_escritura'] = {
    temas: wTemas,
    iniciativas: wInit,
    relaciones: wRel,
    ms: Date.now() - t3,
  };

  informe.ms_total = Date.now() - t0;
  return NextResponse.json(informe);
}
