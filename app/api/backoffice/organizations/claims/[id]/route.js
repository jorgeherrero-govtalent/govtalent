import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resend, EMAIL_FROM } from '@/lib/resend';
import { claimApprovedEmail, claimRejectedEmail } from '@/lib/email/templates';

async function requireSuperadmin() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
  if (profile?.role !== 'platform_admin') return null;
  return authData.user;
}

export async function PATCH(request, { params }) {
  const admin_ = await requireSuperadmin();
  if (!admin_) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { action, rejectionReason } = await request.json();
  if (!['approve', 'reject', 'revoke'].includes(action)) {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: claim } = await admin
    .from('organization_claims')
    .select('id, status, organization_id, user_id, organizations(name, claimed), users:user_id(first_name, email)')
    .eq('id', params.id)
    .single();

  if (!claim) {
    return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
  }
  if (action === 'revoke' && claim.status !== 'approved') {
    return NextResponse.json({ error: 'Solo se puede revocar una solicitud ya aprobada' }, { status: 409 });
  }
  if (action === 'reject' && claim.status !== 'pending') {
    return NextResponse.json({ error: 'Esta solicitud ya ha sido revisada' }, { status: 409 });
  }
  if (action === 'approve' && !['pending', 'rejected'].includes(claim.status)) {
    return NextResponse.json({ error: 'Esta solicitud ya ha sido revisada' }, { status: 409 });
  }

  if (action === 'approve') {
    if (claim.organizations?.claimed) {
      return NextResponse.json(
        { error: 'Esta organización ya ha sido reclamada por otra persona mientras tanto. Revisa el resto de solicitudes para esta organización antes de continuar.' },
        { status: 409 }
      );
    }
    const { data: alreadyMember } = await admin
      .from('organization_members')
      .select('organization_id, organizations(name)')
      .eq('user_id', claim.user_id)
      .limit(1)
      .maybeSingle();
    if (alreadyMember) {
      return NextResponse.json(
        { error: `Este usuario ya administra la organización "${alreadyMember.organizations?.name}". No se puede aprobar esta reclamación adicional.` },
        { status: 409 }
      );
    }
  }

  const orgName = claim.organizations?.name || 'la organización';
  const firstName = claim.users?.first_name || '';
  const requesterEmail = claim.users?.email;

  if (action === 'approve') {
    const { error: orgErr } = await admin.from('organizations').update({ claimed: true }).eq('id', claim.organization_id);
    if (orgErr) return NextResponse.json({ error: 'No se pudo marcar la organización como reclamada' }, { status: 500 });

    await admin.from('organization_members').insert({
      organization_id: claim.organization_id,
      user_id: claim.user_id,
      role: 'admin',
    });

    await admin.from('users').update({ role: 'org_admin', onboarding_completed: true }).eq('id', claim.user_id);

    await admin
      .from('organization_claims')
      .update({ status: 'approved', reviewed_by: admin_.id, reviewed_at: new Date().toISOString() })
      .eq('id', params.id);

    if (requesterEmail) {
      try {
        const { subject, html } = claimApprovedEmail({ firstName, orgName });
        await resend.emails.send({ from: EMAIL_FROM, to: requesterEmail, subject, html });
      } catch (err) {
        console.error('Error enviando email de reclamación aprobada:', err);
      }
    }
  } else if (action === 'reject') {
    await admin
      .from('organization_claims')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason || null,
        reviewed_by: admin_.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (requesterEmail) {
      try {
        const { subject, html } = claimRejectedEmail({ firstName, orgName, reason: rejectionReason });
        await resend.emails.send({ from: EMAIL_FROM, to: requesterEmail, subject, html });
      } catch (err) {
        console.error('Error enviando email de reclamación rechazada:', err);
      }
    }
  } else {
    // action === 'revoke': deshace una aprobación previa (ej. una aprobación
    // hecha por error o de prueba). Quita el acceso y desmarca la organización.
    await admin
      .from('organization_members')
      .delete()
      .eq('organization_id', claim.organization_id)
      .eq('user_id', claim.user_id);

    await admin.from('organizations').update({ claimed: false }).eq('id', claim.organization_id);

    // Si esta era la única organización del usuario, le devolvemos el rol de candidato.
    const { data: otherMemberships } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', claim.user_id)
      .limit(1)
      .maybeSingle();
    if (!otherMemberships) {
      await admin.from('users').update({ role: 'candidate' }).eq('id', claim.user_id);
    }

    await admin
      .from('organization_claims')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason || 'Aprobación revocada por el equipo de GovTalent.',
        reviewed_by: admin_.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', params.id);
  }

  return NextResponse.json({ ok: true });
}
