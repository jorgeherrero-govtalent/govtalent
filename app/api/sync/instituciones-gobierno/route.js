import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncGovernment } from '@/lib/instituciones/syncGovernment';

export const maxDuration = 60;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

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
