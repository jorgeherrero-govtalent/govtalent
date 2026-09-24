import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { welcomeCandidateEmail, welcomeOrganizationEmail, newSignupAdminEmail } from '@/lib/email/templates';

// Aviso interno de cada alta nueva (usuario que termina el onboarding u
// organización creada desde la app). Se puede cambiar el destinatario con
// la variable AVISO_ALTAS_TO en Vercel sin tocar el código.
const AVISO_ALTAS_TO = process.env.AVISO_ALTAS_TO || 'jorgerafaelherrerovidal@gmail.com';

// Un fallo del aviso nunca afecta al alta ni al correo de bienvenida.
async function avisarAlta(payload) {
  try {
    const { subject, html } = newSignupAdminEmail(payload);
    await resend.emails.send({ from: EMAIL_FROM, to: AVISO_ALTAS_TO, subject, html });
  } catch (err) {
    console.error('Error enviando aviso de alta nueva:', err);
  }
}

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
    .select('first_name, last_name, email, professional_title, auth_provider, role, created_at')
    .eq('id', authData.user.id)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  try {
    if (type === 'candidate') {
      const { subject, html } = welcomeCandidateEmail({ firstName: user.first_name || '' });
      await resend.emails.send({ from: EMAIL_FROM, to: user.email, subject, html });
      if (user.role !== 'platform_admin') {
        await avisarAlta({
          type: 'candidate',
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          professionalTitle: user.professional_title,
          provider: authData.user.app_metadata?.provider || user.auth_provider,
          createdAt: user.created_at,
        });
      }
    } else {
      if (!orgId) {
        return NextResponse.json({ error: 'Falta orgId' }, { status: 400 });
      }
      const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).single();
      const { subject, html } = welcomeOrganizationEmail({
        orgName: org?.name || 'tu organización',
        firstName: user.first_name || '',
      });
      await resend.emails.send({ from: EMAIL_FROM, to: user.email, subject, html });
      if (user.role !== 'platform_admin') {
        await avisarAlta({
          type: 'organization',
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          orgName: org?.name,
          provider: authData.user.app_metadata?.provider || user.auth_provider,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error enviando email de bienvenida:', err);
    // No bloqueamos el flujo del usuario por un fallo de email — solo lo registramos.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
