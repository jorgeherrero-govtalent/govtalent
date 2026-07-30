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

  // El documento debe estar en la carpeta del propio usuario dentro del
  // bucket privado -- comprobación explícita, no nos fiamos solo de RLS.
  if (!documentPath.startsWith(`${uid}/`)) {
    return NextResponse.json({ error: 'Documento no válido' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: org } = await admin.from('organizations').select('id, name, claimed').eq('id', organizationId).single();
  if (!org) {
    return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 });
  }
  if (org.claimed) {
    return NextResponse.json({ error: 'Esta organización ya ha sido reclamada' }, { status: 409 });
  }

  const { data: requester } = await admin.from('users').select('first_name, last_name, email').eq('id', uid).single();

  const { error: insertErr } = await admin.from('organization_claims').insert({
    organization_id: organizationId,
    user_id: uid,
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

  // Avisamos a los superadmins de la plataforma para que revisen la solicitud.
  try {
    const { data: admins } = await admin.from('users').select('email').eq('role', 'platform_admin');
    const adminEmails = (admins || []).map((a) => a.email).filter(Boolean);
    if (adminEmails.length > 0) {
      const requesterName = `${requester?.first_name || ''} ${requester?.last_name || ''}`.trim() || 'Un usuario';
      const { subject, html } = newClaimRequestEmail({
        orgName: org.name,
        requesterName,
        requesterEmail: requester?.email || '',
      });
      await resend.emails.send({ from: EMAIL_FROM, to: adminEmails, subject, html });
    }
  } catch (err) {
    console.error('Error enviando email de aviso de reclamación:', err);
  }

  return NextResponse.json({ ok: true });
}
