import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncGovernment, seedBios, debugBio } from '@/lib/instituciones/syncGovernment';

export const maxDuration = 60;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const authHeader = request.headers.get('authorization');
  const key = sp.get('key');

  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && key === process.env.DEBUG_KEY;

  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // --- Diagnóstico de una ficha, sin escribir -------------------------
  //   ?debug=<slug>&key=<DEBUG_KEY>
  const debugSlug = sp.get('debug');
  if (debugSlug) {
    if (!isManual) return NextResponse.json({ error: 'Requiere ?key=<DEBUG_KEY>' }, { status: 401 });
    return NextResponse.json(await debugBio(debugSlug));
  }

  // --- Carga de biografías, puntual y a mano --------------------------
  //   ?seed-bios=1&key=<DEBUG_KEY>            rellena solo las vacías
  //   ?seed-bios=1&force=1&key=<DEBUG_KEY>    reescribe todas
  //   ?seed-bios=1&only=<slug>&key=<DEBUG_KEY>  una sola persona
  //
  // Deliberadamente NO forma parte del cron: las biografías son texto
  // estable y descargarlas a diario solo añadía riesgo de borrado.
  if (sp.get('seed-bios')) {
    if (!isManual) return NextResponse.json({ error: 'Requiere ?key=<DEBUG_KEY>' }, { status: 401 });
    const result = await seedBios({
      force: sp.get('force') === '1',
      only: sp.get('only') || null,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  // --- Sincronización diaria ------------------------------------------
  const supabase = admin();
  const { data: run } = await supabase
    .from('institutional_sync_runs')
    .insert({ source: 'lamoncloa.gob.es', dataset: 'gobierno', status: 'running' })
    .select()
    .single();

  try {
    const stats = await syncGovernment();
    await supabase
      .from('institutional_sync_runs')
      .update({ status: 'success', finished_at: new Date().toISOString(), ...stats })
      .eq('id', run.id);
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    await supabase
      .from('institutional_sync_runs')
      .update({ status: 'error', finished_at: new Date().toISOString(), error_message: error.message })
      .eq('id', run.id);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
