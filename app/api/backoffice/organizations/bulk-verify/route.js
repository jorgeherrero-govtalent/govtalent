import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireSuperadmin() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
  if (profile?.role !== 'platform_admin') return null;
  return authData.user;
}

// Verifica varias organizaciones de una sola vez. A diferencia del PATCH
// individual, esta ruta desactiva temporalmente trg_radar_on_organization_verified
// mientras dura la operación: una verificación en bloque hecha por un admin
// en el backoffice es limpieza de datos, no una señal real de que la
// organización se ha activado en la plataforma — no debe generar N eventos
// públicos idénticos que además saturarían el bloque "Qué está pasando
// ahora" de la home (que solo muestra los últimos 5).
export async function POST(request) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await request.json();
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No hay organizaciones seleccionadas' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error: disableErr } = await admin.rpc('radar_events_toggle_trigger', {
    p_trigger_name: 'trg_radar_on_organization_verified',
    p_enable: false,
  });
  if (disableErr) {
    return NextResponse.json({ error: disableErr.message }, { status: 500 });
  }

  try {
    const { error: updateErr } = await admin.from('organizations').update({ verified: true }).in('id', ids);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  } finally {
    // Siempre se reactiva, incluso si la actualización falla — para que un
    // error a mitad de camino no deje el trigger apagado permanentemente.
    await admin.rpc('radar_events_toggle_trigger', {
      p_trigger_name: 'trg_radar_on_organization_verified',
      p_enable: true,
    });
  }

  return NextResponse.json({ ok: true, verified: ids.length });
}
