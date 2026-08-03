import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const userId = authData.user.id;

  const [
    profileRes,
    workAreasRes,
    interestAreasRes,
    followsRes,
    jobsRes,
    orgsRes,
    activityAreasRes,
    eventsRes,
  ] = await Promise.all([
    supabase.from('candidate_profiles').select('profile_completion_pct').eq('user_id', userId).maybeSingle(),
    supabase.from('user_work_areas').select('area').eq('user_id', userId),
    supabase.from('user_interest_areas').select('area').eq('user_id', userId),
    supabase.from('organization_follows').select('organization_id').eq('user_id', userId),
    supabase
      .from('jobs')
      .select('id, title, area, location, organization_id, created_at, organizations(name, slug, logo_url)')
      .eq('status', 'activa')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('organizations').select('id, name, slug, sector, logo_url, verified, org_type, created_at'),
    supabase.from('organization_activity_areas').select('organization_id, area'),
    supabase
      .from('radar_events')
      .select('title, event_type, occurred_at')
      .eq('is_published', true)
      .order('occurred_at', { ascending: false })
      .limit(8),
  ]);

  const misAreas = new Set([...(workAreasRes.data || []).map((a) => a.area), ...(interestAreasRes.data || []).map((a) => a.area)]);
  const orgsSeguidasIds = new Set((followsRes.data || []).map((f) => f.organization_id));

  // --- Perfil / activación ---
  const perfil = {
    completion_pct: profileRes.data?.profile_completion_pct ?? 0,
    sectores_count: interestAreasRes.data?.length || 0,
    organizaciones_seguidas_count: orgsSeguidasIds.size,
  };

  // --- Vacantes recomendadas: primero las que casan con tus áreas, relleno con las más recientes ---
  const todasVacantes = jobsRes.data || [];
  const vacantesEmparejadas = misAreas.size ? todasVacantes.filter((j) => misAreas.has(j.area)) : [];
  const vacantesRelleno = todasVacantes.filter((j) => !vacantesEmparejadas.includes(j));
  const vacantesRecomendadas = [...vacantesEmparejadas, ...vacantesRelleno].slice(0, 6).map((j) => ({
    id: j.id,
    title: j.title,
    organization_name: j.organizations?.name || 'Organización',
    organization_slug: j.organizations?.slug,
    organization_logo: j.organizations?.logo_url,
    location: j.location,
  }));

  // --- Organizaciones recomendadas: por área de interés, sin las que ya sigues, relleno con verificadas recientes ---
  const areaByOrgId = {};
  for (const a of activityAreasRes.data || []) {
    if (!areaByOrgId[a.organization_id]) areaByOrgId[a.organization_id] = [];
    areaByOrgId[a.organization_id].push(a.area);
  }
  const orgsDisponibles = (orgsRes.data || []).filter((o) => !orgsSeguidasIds.has(o.id));
  const orgsEmparejadas = misAreas.size
    ? orgsDisponibles.filter((o) => (areaByOrgId[o.id] || []).some((a) => misAreas.has(a)))
    : [];
  const orgsRelleno = orgsDisponibles
    .filter((o) => !orgsEmparejadas.includes(o) && o.verified)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const organizacionesRecomendadas = [...orgsEmparejadas, ...orgsRelleno].slice(0, 4).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    logo_url: o.logo_url,
    sector: o.sector,
  }));

  // --- Novedades del ecosistema: lista simple, sin cifras agregadas ---
  const novedades = (eventsRes.data || []).map((e) => ({ title: e.title, occurred_at: e.occurred_at }));

  return NextResponse.json({
    perfil,
    vacantes_recomendadas: vacantesRecomendadas,
    organizaciones_recomendadas: organizacionesRecomendadas,
    novedades,
  });
}
