import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncGovernment, debugBio } from '@/lib/instituciones/syncGovernment';

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
  const isDebug = !!process.env.DEBUG_KEY && key === process.env.DEBUG_KEY;

  if (!isCron && !isDebug) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Modo diagnóstico: comprueba la extracción de UNA ficha sin escribir nada.
  //   ?debug=pedro-sanchez-perez-castejon&key=<DEBUG_KEY>
  const debugSlug = sp.get('debug');
  if (debugSlug) {
    if (!isDebug) return NextResponse.json({ error: 'El modo debug requiere ?key=<DEBUG_KEY>' }, { status: 401 });
    const result = await debugBio(debugSlug);
    return NextResponse.json(result);
  }

  const supabase = admin();
  const { data: run } = await supabase
    .from('institutional_sync_runs')
    .insert({ source: 'lamoncloa.gob.es', dataset: 'gobierno', status: 'running' })
    .select()
    .single();

  try {
    // bioFailures no es una columna de institutional_sync_runs: se separa de
    // stats para no romper el update con una clave que no existe.
    const { bioFailures, ...stats } = await syncGovernment();

    const hayFallos = bioFailures.length > 0;
    const resumenFallos = hayFallos
      ? `Sin biografía (${bioFailures.length}): ` + bioFailures.map((f) => `${f.slug} [${f.reason}]`).join('; ')
      : null;

    await supabase
      .from('institutional_sync_runs')
      .update({
        // 'partial' señala que el sync terminó pero no trajo todo. Antes esto
        // se registraba como 'success' aunque no se extrajera ni una biografía.
        status: hayFallos ? 'partial' : 'success',
        finished_at: new Date().toISOString(),
        error_message: resumenFallos,
        ...stats,
      })
      .eq('id', run.id);

    return NextResponse.json({ ok: true, ...stats, bio_failures: bioFailures });
  } catch (error) {
    await supabase
      .from('institutional_sync_runs')
      .update({ status: 'error', finished_at: new Date().toISOString(), error_message: error.message })
      .eq('id', run.id);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
