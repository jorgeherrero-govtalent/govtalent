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

  const [orgsRes, jobCountsRes, memberCountsRes] = await Promise.all([
    admin
      .from('organizations')
      .select(
        'id, name, slug, org_type, location, size_range, website_url, linkedin_url, contact_email, notification_email, claimed, verified, source, created_at'
      )
      .order('created_at', { ascending: false }),
    admin.from('jobs').select('organization_id'),
    admin.from('organization_members').select('organization_id'),
  ]);

  if (orgsRes.error) {
    console.error('Error backoffice/organizations:', orgsRes.error);
    return NextResponse.json({ error: orgsRes.error.message }, { status: 500 });
  }

  const orgs = orgsRes.data;
  const jobCounts = jobCountsRes.data;
  const memberCounts = memberCountsRes.data;

  const jobCountByOrg = {};
  for (const j of jobCounts || []) jobCountByOrg[j.organization_id] = (jobCountByOrg[j.organization_id] || 0) + 1;

  const memberCountByOrg = {};
  for (const m of memberCounts || []) memberCountByOrg[m.organization_id] = (memberCountByOrg[m.organization_id] || 0) + 1;

  const merged = (orgs || []).map((o) => ({
    ...o,
    job_count: jobCountByOrg[o.id] || 0,
    member_count: memberCountByOrg[o.id] || 0,
  }));

  return NextResponse.json({ organizations: merged });
}
