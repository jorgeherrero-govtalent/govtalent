import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isOrganizationMember } from '@/lib/requireOrgMember';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { jobAlertEmail } from '@/lib/email/templates';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

export async function POST(request) {
  const { jobId } = await request.json();
  if (!jobId) {
    return NextResponse.json({ error: 'Falta jobId' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: job } = await admin
    .from('jobs')
    .select('id, title, area, location, modality, organization_id, notified_at, organizations(name)')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
  }

  // Solo un miembro de la organización dueña de la oferta puede disparar el envío.
  const allowed = await isOrganizationMember(authData.user.id, job.organization_id);
  if (!allowed) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Idempotencia: si ya se notificó esta oferta, no se vuelve a enviar.
  if (job.notified_at) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const orgName = job.organizations?.name || 'una organización';
  const jobUrl = `${SITE_URL}/empleo/${job.id}`;

  try {
    // 1) Alertas por área/ubicación (o alertas de esa área sin ubicación concreta).
    const { data: areaAlerts } = await admin
      .from('job_alerts')
      .select('user_id, users(email, first_name)')
      .eq('area', job.area)
      .or(`location.eq.${job.location},location.is.null`);

    // 2) Usuarios que siguen a la organización.
    const { data: follows } = await admin
      .from('organization_follows')
      .select('user_id, users(email, first_name)')
      .eq('organization_id', job.organization_id);

    // Deduplicar por usuario: si coincide por las dos vías, se envía un único email.
    const recipients = new Map();

    for (const row of areaAlerts || []) {
      if (!row.users?.email) continue;
      recipients.set(row.user_id, {
        email: row.users.email,
        firstName: row.users.first_name || 'candidato/a',
        reason: `Hay una nueva oferta que coincide con tu alerta de <b>${job.area}</b> en ${job.location}.`,
      });
    }

    for (const row of follows || []) {
      if (!row.users?.email) continue;
      // La razón de "sigues a la organización" es más específica, prevalece si hay solape.
      recipients.set(row.user_id, {
        email: row.users.email,
        firstName: row.users.first_name || 'candidato/a',
        reason: `<b>${orgName}</b>, a quien sigues en GovTalent, ha publicado una nueva oferta.`,
      });
    }

    for (const { email, firstName, reason } of recipients.values()) {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        ...jobAlertEmail({
          firstName,
          jobTitle: job.title,
          orgName,
          location: job.location,
          modality: job.modality,
          reason,
          jobUrl,
        }),
      });
    }

    await admin.from('jobs').update({ notified_at: new Date().toISOString() }).eq('id', job.id);

    return NextResponse.json({ ok: true, sent: recipients.size });
  } catch (err) {
    console.error('Error enviando alertas de empleo:', err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
