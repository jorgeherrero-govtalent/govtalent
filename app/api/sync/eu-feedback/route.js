// =====================================================================
// SYNC — Contribuciones a las consultas de la Comisión
// app/api/sync/eu-feedback/route.js
//
// Trae quién ha contribuido a cada consulta pública: organizaciones,
// tipo, país y su número de registro de transparencia cuando lo
// declaran.
//
// EL CRUCE VA AL REVÉS. No hay forma de saber qué publicationId
// corresponde a cada expediente —lo comprobamos: ninguna ruta de la API
// lo da—. Pero cada contribución trae referenceInitiative en formato
// Ares(2019)7907872, que casa con el campo `reference` de
// eu_initiatives. Así que se recorren los publicationId y ellos dicen a
// qué expediente pertenecen.
//
// OJO CON EL PARÁMETRO language: con él la API devuelve 500. Sin él
// funciona y da las 374 contribuciones de una consulta en 4 páginas.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1           prueba sin escribir
//   ?key=<DEBUG_KEY>&pub=12354       una publicación concreta
//   ?key=<DEBUG_KEY>&desde=12000     barrido desde un id
//   ?key=<DEBUG_KEY>                 continúa donde se quedó
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API = 'https://ec.europa.eu/info/law/better-regulation/api';
const PRESUPUESTO_MS = 45000;
const PARALELO = 4;
const PAUSA_MS = 150;

// Cuántos publicationId se revisan por pasada. El barrido completo son
// unos 15.000, así que se hace en varias.
const POR_PASADA = 120;

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

function mapear(f, pub) {
  return {
    id: f.id,
    publication_id: pub,
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
    // --- Qué publicationId revisar ------------------------------------
    let pubs = [];
    if (sp.get('pub')) {
      pubs = [parseInt(sp.get('pub'), 10)];
    } else {
      const desde = sp.get('desde') ? parseInt(sp.get('desde'), 10) : null;
      if (desde) {
        pubs = Array.from({ length: POR_PASADA }, (_, i) => desde + i);
      } else {
        // Continúa donde se quedó el barrido anterior
        const { data: ultimo } = await supabase
          .from('eu_feedback_scan')
          .select('publication_id')
          .order('publication_id', { ascending: false })
          .limit(1)
          .maybeSingle();
        const inicio = ultimo?.publication_id ? ultimo.publication_id + 1 : 10000;
        pubs = Array.from({ length: POR_PASADA }, (_, i) => inicio + i);
      }
    }

    informe.rango = { desde: pubs[0], hasta: pubs[pubs.length - 1], n: pubs.length };

    // Los ya revisados, para no repetirlos
    const { data: hechos } = await supabase
      .from('eu_feedback_scan')
      .select('publication_id')
      .in('publication_id', pubs);
    const yaHechos = new Set((hechos || []).map((h) => h.publication_id));
    const pendientes = sp.get('pub') ? pubs : pubs.filter((p) => !yaHechos.has(p));

    informe.ya_revisados = pubs.length - pendientes.length;

    // --- Recorrer -----------------------------------------------------
    const todas = [];
    const registros = [];
    let conContenido = 0;

    for (let i = 0; i < pendientes.length; i += PARALELO) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }
      const grupo = pendientes.slice(i, i + PARALELO);
      const res = await Promise.all(grupo.map((p) => contribuciones(p, 8000)));

      res.forEach((r, k) => {
        const pub = grupo[k];
        if (r.error) {
          registros.push({ publication_id: pub, estado: 'error', n_contribuciones: 0 });
          return;
        }
        if (r.vacio || (r.items || []).length === 0) {
          registros.push({ publication_id: pub, estado: 'vacio', n_contribuciones: 0 });
          return;
        }
        conContenido += 1;
        const mapeadas = r.items.map((f) => mapear(f, pub));
        todas.push(...mapeadas);
        registros.push({
          publication_id: pub,
          reference: mapeadas[0]?.reference || null,
          estado: 'ok',
          n_contribuciones: r.total,
        });
      });

      await espera(PAUSA_MS);
    }

    informe.con_contribuciones = conContenido;
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

    // --- Cruzar con los expedientes -----------------------------------
    // Se hace en SQL sobre las que acaban de entrar: cada contribución
    // trae su referencia Ares y eu_initiatives la tiene en `reference`.
    if (todas.length > 0) {
      const { error } = await supabase.rpc('cruzar_feedback_iniciativas');
      if (error) informe.error_cruce = error.message;
    }

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
