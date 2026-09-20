// =====================================================================
// SYNC — Parlamento Europeo: CRONOLOGÍA de procedimientos
// app/api/sync/parlamento-procedimientos/eventos/route.js
//
// Refresca los actos de cada procedimiento vivo y de los que nunca los
// tuvieron, empezando por los que más tiempo llevan sin mirarse. Corre
// veinte minutos después de las fichas, con su propio cron y su propio
// tiempo. La lógica está en lib/parlamentoEuropeo.js.
//
// Uso a mano:
//   ?key=<DEBUG_KEY>&dry=1   prueba sin escribir
//   ?key=<DEBUG_KEY>         carga real
// =====================================================================

import { NextResponse } from 'next/server';
import { conRegistro } from '@/lib/syncLog';
import { clienteSupabase, sincronizarEventos } from '@/lib/parlamentoEuropeo';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

export const GET = conRegistro('/api/sync/parlamento-procedimientos/eventos', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const informe = await sincronizarEventos({
    supabase: clienteSupabase(),
    dry: sp.get('dry') === '1',
    t0,
  });
  return NextResponse.json(informe, { status: informe.error ? 500 : 200 });
}
