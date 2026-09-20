// =====================================================================
// SYNC — Parlamento Europeo: FICHAS de procedimientos
// app/api/sync/parlamento-procedimientos/route.js
//
// Descubre los COD nuevos y refresca la ficha de cada procedimiento vivo
// —fase, cierre, actos y ponentes—. La lógica está en
// lib/parlamentoEuropeo.js.
//
// La cronología va aparte, en /eventos, con su propio cron veinte
// minutos después: juntas no cabían en una ejecución al ritmo que da la
// API del PE. Ver la cabecera de la librería.
//
// Uso a mano:
//   ?key=<DEBUG_KEY>&dry=1                  prueba sin escribir
//   ?key=<DEBUG_KEY>&desde=2024&hasta=2026  solo esos años al descubrir
//   ?key=<DEBUG_KEY>                        carga real
// =====================================================================

import { NextResponse } from 'next/server';
import { conRegistro } from '@/lib/syncLog';
import { clienteSupabase, sincronizarFichas } from '@/lib/parlamentoEuropeo';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

export const GET = conRegistro('/api/sync/parlamento-procedimientos', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const informe = await sincronizarFichas({
    supabase: clienteSupabase(),
    dry: sp.get('dry') === '1',
    desde: parseInt(sp.get('desde') || '2014', 10),
    hasta: sp.get('hasta') ? parseInt(sp.get('hasta'), 10) : undefined,
    t0,
  });
  return NextResponse.json(informe, { status: informe.error ? 500 : 200 });
}
