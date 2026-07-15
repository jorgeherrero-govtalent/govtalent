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

  const [{ data: users }, { data: profiles }, { data: experiences }] = await Promise.all([
    admin
      .from('users')
      .select('id, first_name, last_name, email, professional_title, location, phone, linkedin_url, created_at')
      .eq('role', 'candidate')
      .order('created_at', { ascending: false }),
    admin.from('candidate_profiles').select('user_id, cv_url'),
    admin
      .from('experiences')
      .select('user_id, organization_name, area_tag, end_date')
      .is('end_date', null),
  ]);

  const profileByUser = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
  const expByUser = {};
  for (const e of experiences || []) {
    // Si hay varias experiencias "actuales", nos quedamos con la primera que encontremos.
    if (!expByUser[e.user_id]) expByUser[e.user_id] = e;
  }

  const merged = (users || []).map((u) => ({
    ...u,
    cv_url: profileByUser[u.id]?.cv_url || null,
    company: expByUser[u.id]?.organization_name || null,
    sector: expByUser[u.id]?.area_tag || null,
  }));

  return NextResponse.json({ users: merged });
}
