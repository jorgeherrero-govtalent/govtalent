import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { welcomeCandidateEmail, welcomeOrganizationEmail } from '@/lib/email/templates';

export async function POST(request) {
  const { type, orgId } = await request.json();
  if (!['candidate', 'organization'].includes(type)) {
    return NextResponse.json({ error: 'type debe ser "candidate" u "organization"' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: user } = await supabase
    .from('users')
    .select('first_name, email')
    .eq('id', authData.user.id)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  try {
    if (type === 'candidate') {
      const { subject, html } = welcomeCandidateEmail({ firstName: user.first_name || 'candidato/a' });
      await resend.emails.send({ from: EMAIL_FROM, to: user.email, subject, html });
    } else {
      if (!orgId) {
        return NextResponse.json({ error: 'Falta orgId' }, { status: 400 });
      }
      const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).single();
      const { subject, html } = welcomeOrganizationEmail({
        orgName: org?.name || 'tu organización',
        firstName: user.first_name || 'equipo',
      });
      await resend.emails.send({ from: EMAIL_FROM, to: user.email, subject, html });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error enviando email de bienvenida:', err);
    // No bloqueamos el flujo del usuario por un fallo de email — solo lo registramos.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
