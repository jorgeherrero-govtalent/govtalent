import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncDeputiesFase1 } from '@/lib/instituciones/syncDeputies';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Vercel Cron llama a esta ruta una vez al día y añade automáticamente la
// cabecera "Authorization: Bearer <CRON_SECRET>" si la variable de entorno
// CRON_SECRET está configurada en el proyecto — así se evita que cualquiera
// pueda disparar la sincronización llamando a la URL a mano.
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = admin();
  const { data: run } = await supabase
    .from('institutional_sync_runs')
    .insert({ source: 'congreso.es', dataset: 'diputados_activos', status: 'running' })
    .select()
    .single();

  try {
    const stats = await syncDeputiesFase1();
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
