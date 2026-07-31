import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { newClaimRequestEmail } from '@/lib/email/templates';

export async function POST(request) {
  const { organizationId, documentPath, roleTitle, note } = await request.json();
  if (!organizationId || !documentPath) {
    return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const uid = authData.user.id;

  if (!documentPath.startsWith(`${uid}/`)) {
    return NextResponse.json({ error: 'Documento no válido' }, { status: 400 });
  }

  const admin = createAdminClient();

  // A diferencia de reclamar, aquí SÍ debe ser ya miembro — justo de esta organización.
  const { data: membership } = await admin
    .from('organization_members')
    .select('organization_id, organizations(name)')
    .eq('user_id', uid)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'No administras esta organización' }, { status: 403 });
  }

  const orgName = membership.organizations?.name || 'tu organización';
  const { data: requester } = await admin.from('users').select('first_name, last_name, email').eq('id', uid).single();

  const { error: insertErr } = await admin.from('organization_claims').insert({
    organization_id: organizationId,
    user_id: uid,
    claim_type: 'verification',
    role_title: roleTitle || null,
    note: note || null,
    document_path: documentPath,
    status: 'pending',
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ error: 'Ya tienes una solicitud pendiente para esta organización' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se pudo enviar la solicitud' }, { status: 500 });
  }

  try {
    const { data: admins } = await admin.from('users').select('email').eq('role', 'platform_admin');
    const adminEmails = (admins || []).map((a) => a.email).filter(Boolean);
    if (adminEmails.length > 0) {
      const requesterName = `${requester?.first_name || ''} ${requester?.last_name || ''}`.trim() || 'Un usuario';
      const { subject, html } = newClaimRequestEmail({
        orgName,
        requesterName,
        requesterEmail: requester?.email || '',
      });
      await resend.emails.send({ from: EMAIL_FROM, to: adminEmails, subject, html });
    }
  } catch (err) {
    console.error('Error enviando email de aviso de verificación:', err);
  }

  return NextResponse.json({ ok: true });
}
