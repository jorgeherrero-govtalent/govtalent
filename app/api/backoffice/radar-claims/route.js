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

export async function GET() {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const admin = createAdminClient();

  const [claimsRes, evidenceRes, orgsRes] = await Promise.all([
    admin.from('claims').select('*').order('confidence_score', { ascending: false }),
    admin.from('claim_evidence').select('*').order('created_at', { ascending: false }),
    admin.from('organizations').select('id, name'),
  ]);

  if (claimsRes.error) {
    return NextResponse.json({ error: claimsRes.error.message }, { status: 500 });
  }

  const orgById = new Map((orgsRes.data || []).map((o) => [o.id, o.name]));
  const evidenceByClaimId = {};
  for (const e of evidenceRes.data || []) {
    if (!evidenceByClaimId[e.claim_id]) evidenceByClaimId[e.claim_id] = [];
    evidenceByClaimId[e.claim_id].push(e);
  }

  const claims = (claimsRes.data || []).map((c) => ({
    ...c,
    organization_name: c.organization_id ? orgById.get(c.organization_id) : c.organization_name_raw,
    evidence: evidenceByClaimId[c.id] || [],
  }));

  return NextResponse.json({ claims });
}

export async function POST(request) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { claim_id, action } = await request.json();
  if (!claim_id || !['approve', 'discard'].includes(action)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: claim, error: claimErr } = await admin.from('claims').select('*').eq('id', claim_id).single();
  if (claimErr || !claim) {
    return NextResponse.json({ error: 'Claim no encontrado' }, { status: 404 });
  }

  if (action === 'discard') {
    await admin
      .from('claims')
      .update({ status: 'descartado', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', claim_id);
    return NextResponse.json({ ok: true });
  }

  // Aprobar: marca el claim como confirmado (si no lo estaba ya) y crea el evento público
  await admin
    .from('claims')
    .update({ status: 'confirmado', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', claim_id);

  let orgName = claim.organization_name_raw;
  let sector = null;
  if (claim.organization_id) {
    const { data: org } = await admin.from('organizations').select('name, sector').eq('id', claim.organization_id).single();
    if (org) {
      orgName = org.name;
      sector = org.sector;
    }
  }

  const title =
    claim.claim_type === 'departure'
      ? `${claim.person_name} deja su puesto en ${orgName || 'una organización'}`
      : `${claim.person_name} se incorpora a ${orgName || 'una organización'}${claim.role_title ? ` como ${claim.role_title}` : ''}`;

  const { error: eventErr } = await admin.from('radar_events').insert({
    event_type: claim.claim_type === 'departure' ? 'departure' : 'appointment',
    title,
    description: claim.claim_text,
    organization_id: claim.organization_id,
    claim_id: claim.id,
    sector,
    importance: claim.confidence_score,
    is_published: true,
    occurred_at: new Date().toISOString(),
  });

  if (eventErr) {
    console.error('Error creando radar_event al aprobar claim:', eventErr);
    return NextResponse.json({ error: 'Claim aprobado pero no se pudo crear el evento' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
