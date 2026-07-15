import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const EDITABLE_FIELDS = ['verified', 'notification_email', 'contact_email'];

export async function PATCH(request, { params }) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
  if (profile?.role !== 'platform_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await request.json();
  const updates = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('organizations').update(updates).eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
  if (profile?.role !== 'platform_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const admin = createAdminClient();
  // Solo permitimos borrar organizaciones no reclamadas (sin usuario real detrás),
  // para evitar borrar por error una organización con actividad real.
  const { data: org } = await admin.from('organizations').select('claimed').eq('id', params.id).single();
  if (org?.claimed !== false) {
    return NextResponse.json(
      { error: 'Solo se pueden eliminar organizaciones no reclamadas (claimed = false)' },
      { status: 400 }
    );
  }

  const { error } = await admin.from('organizations').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
