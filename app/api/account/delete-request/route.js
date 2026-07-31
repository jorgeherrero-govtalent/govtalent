import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { accountDeletionRequestEmail } from '@/lib/email/templates';

export async function POST() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('users')
    .select('first_name, last_name, email, role')
    .eq('id', authData.user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  await admin
    .from('users')
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq('id', authData.user.id);

  try {
    const { data: admins } = await admin.from('users').select('email').eq('role', 'platform_admin');
    const adminEmails = (admins || []).map((a) => a.email).filter(Boolean);
    if (adminEmails.length > 0) {
      const { subject, html } = accountDeletionRequestEmail({
        userName: `${profile.first_name} ${profile.last_name}`.trim(),
        userEmail: profile.email,
        role: profile.role,
      });
      await resend.emails.send({ from: EMAIL_FROM, to: adminEmails, subject, html });
    }
  } catch (err) {
    console.error('Error enviando aviso de borrado de cuenta:', err);
  }

  return NextResponse.json({ ok: true });
}
