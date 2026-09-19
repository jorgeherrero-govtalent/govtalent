// =====================================================================
// SYNC — Actividad parlamentaria del Congreso, entrada manual
// app/api/sync/congreso-actividad/route.js
//
// YA NO TIENE CRON. Los crones apuntan a las rutas por tipo:
//
//   /api/sync/congreso-actividad/pnl
//   /api/sync/congreso-actividad/comparecencia
//   /api/sync/congreso-actividad/decreto
//
// Esta se conserva para que las direcciones de siempre con ?tipo= sigan
// funcionando al lanzarlas a mano. Hace exactamente lo mismo que las de
// cron: llama a lib/congresoActividad.js. Antes esta ruta se relanzaba a
// sí misma por eslabones y moría en el primero cada noche; ya no
// encadena nada.
//
// Uso:
//   ?key=<DEBUG_KEY>&tipo=comparecencia&dry=1   prueba sin escribir
//   ?key=<DEBUG_KEY>&tipo=pnl&pagina=120        retomar desde una página
//   Sin ?tipo= se toman las PNL.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { TIPOS_ACTIVIDAD, sincronizarActividad } from '@/lib/congresoActividad';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const PRESUPUESTO_MS = 690_000;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export const GET = conRegistro('/api/sync/congreso-actividad', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const tipo = sp.get('tipo');
  const clave = tipo && TIPOS_ACTIVIDAD[tipo] ? tipo : 'pnl';

  const informe = await sincronizarActividad({
    supabase: admin(),
    clave,
    dry: sp.get('dry') === '1',
    desdePagina: Math.max(parseInt(sp.get('pagina') || '1', 10), 1),
    t0,
    presupuestoMs: PRESUPUESTO_MS,
  });

  return NextResponse.json(informe, { status: informe.error ? 500 : 200 });
}
