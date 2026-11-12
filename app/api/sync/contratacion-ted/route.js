// =====================================================================
// SYNC — Licitaciones en TED (poderes adjudicadores españoles e
// instituciones de la UE, desde el 11-11-2026)
// app/api/sync/contratacion-ted/route.js
//
// Cada pasada pide a la Search API de TED lo publicado desde el día de la
// marca (incluido: releer el último día no duplica, el upsert es por
// número de publicación) y lo guarda en contratacion_expedientes con
// fuente 'ted'. TED publica de lunes a viernes.
//
// Uso:
//   cron (CRON_SECRET)                   desde la marca
//   ?key=<DEBUG_KEY>&dry=1               una página, sin guardar
//   ?key=<DEBUG_KEY>&desde=2026-11-01    otra fecha de inicio
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { buscarTed, aFilaTed, aTed } from '@/lib/contratacion/ted';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 300;

const PRESUPUESTO_MS = 240000;
const MAX_PAGINAS = 40;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export const GET = conRegistro('/api/sync/contratacion-ted', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && String(sp.get('key') || '').toLowerCase() === process.env.DEBUG_KEY.toLowerCase();
  if (!isCron && !isManual) return Response.json({ error: 'no autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const db = admin();
  const { data: estado } = await db.from('contratacion_lectura').select('*').eq('feed', 'ted').maybeSingle();

  let inicio;
  if (/^\d{4}-\d{2}-\d{2}$/.test(sp.get('desde') || '')) inicio = new Date(`${sp.get('desde')}T12:00:00Z`);
  else if (estado?.marca) inicio = new Date(estado.marca);
  else inicio = new Date(Date.now() - 3 * 86400 * 1000);
  const desde = aTed(inicio);

  const res = { ok: true, dry, desde, paginas: 0, anuncios: 0, guardados: 0, total: null };
  let token = null;
  let ultimaFecha = null;
  try {
    do {
      const r = await buscarTed({ desde, token, limite: dry ? 5 : 250 });
      res.paginas += 1;
      res.total = r.total;
      res.anuncios += r.notices.length;
      const filas = r.notices.map(aFilaTed).filter(Boolean);
      for (const f of filas) {
        if (f.actualizado_fuente && (!ultimaFecha || f.actualizado_fuente > ultimaFecha)) ultimaFecha = f.actualizado_fuente;
      }
      if (dry) {
        res.muestra = filas.slice(0, 3);
        res.crudo = r.notices.slice(0, 1);
        break;
      }
      if (filas.length) {
        const unicas = [...new Map(filas.map((f) => [f.id, f])).values()];
        const { error } = await db.from('contratacion_expedientes').upsert(unicas, { onConflict: 'id' });
        if (error) throw new Error(`guardar: ${error.message}`);
        res.guardados += unicas.length;
      }
      token = r.notices.length ? r.token : null;
    } while (token && res.paginas < MAX_PAGINAS && Date.now() - t0 < PRESUPUESTO_MS);
  } catch (e) {
    res.ok = false;
    res.error = String(e.message || e).slice(0, 700);
  }

  if (!dry) {
    const completa = res.ok && !token;
    await db.from('contratacion_lectura').upsert({
      feed: 'ted',
      ...(completa && ultimaFecha ? { marca: ultimaFecha } : {}),
      ultima_ejecucion: new Date().toISOString(),
      ultimo_resultado: res,
      ultimo_error: res.error || null,
    }, { onConflict: 'feed' });
  }
  res.ms = Date.now() - t0;
  return Response.json(res);
}
