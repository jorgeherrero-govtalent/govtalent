import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { applicationConfirmationEmail, newCandidacyEmail } from '@/lib/email/templates';

export async function POST(request) {
  const { applicationId } = await request.json();
  if (!applicationId) {
    return NextResponse.json({ error: 'Falta applicationId' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  // La candidatura y la oferta son legibles por el propio candidato bajo RLS.
  const { data: application } = await supabase
    .from('job_applications')
    .select('id, candidate_id, job_id, jobs(title, organization_id, organizations(name, contact_email, notification_email))')
    .eq('id', applicationId)
    .eq('candidate_id', authData.user.id)
    .single();

  if (!application) {
    return NextResponse.json({ error: 'Candidatura no encontrada' }, { status: 404 });
  }

  const { data: candidate } = await supabase
    .from('users')
    .select('first_name, last_name, email')
    .eq('id', authData.user.id)
    .single();

  const jobTitle = application.jobs?.title || 'la oferta';
  const orgName = application.jobs?.organizations?.name || 'la organización';
  const candidateName = `${candidate?.first_name || ''} ${candidate?.last_name || ''}`.trim() || 'Un candidato';

  try {
    // 1) Confirmación al candidato
    if (candidate?.email) {
      const { subject, html } = applicationConfirmationEmail({
        firstName: candidate.first_name || 'candidato/a',
        jobTitle,
        orgName,
      });
      await resend.emails.send({ from: EMAIL_FROM, to: candidate.email, subject, html });
    }

    // 2) Notificación a la organización. Prioridad:
    //    a) notification_email configurado explícitamente por la organización (exclusivo)
    //    b) si no está configurado, emails de los admins vinculados + contact_email (histórico)
    let orgEmails;
    if (application.jobs.organizations?.notification_email) {
      orgEmails = new Set([application.jobs.organizations.notification_email]);
    } else {
      // Requiere service role, ya que el candidato no tiene permisos para leer
      // los emails de otros usuarios.
      const admin = createAdminClient();
      const { data: members } = await admin
        .from('organization_members')
        .select('users(email)')
        .eq('organization_id', application.jobs.organization_id);

      orgEmails = new Set((members || []).map((m) => m.users?.email).filter(Boolean));
      if (application.jobs.organizations?.contact_email) {
        orgEmails.add(application.jobs.organizations.contact_email);
      }
    }

    if (orgEmails.size > 0) {
      const { subject, html } = newCandidacyEmail({ jobTitle, candidateName, orgName });
      await resend.emails.send({ from: EMAIL_FROM, to: [...orgEmails], subject, html });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error enviando emails de candidatura:', err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
