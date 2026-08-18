import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const userId = authData.user.id;

  const [
    userRes,
    profileRes,
    workAreasRes,
    interestAreasRes,
    experiencesRes,
    educationRes,
    followsRes,
    jobsRes,
    orgsRes,
    activityAreasRes,
    eventsRes,
  ] = await Promise.all([
    supabase.from('users').select('first_name, avatar_url').eq('id', userId).single(),
    supabase.from('candidate_profiles').select('profile_completion_pct, cv_url, website_url, linkedin_url, level_type').eq('user_id', userId).maybeSingle(),
    supabase.from('user_work_areas').select('area').eq('user_id', userId),
    supabase.from('user_interest_areas').select('area').eq('user_id', userId),
    supabase.from('experiences').select('id').eq('user_id', userId).limit(1),
    supabase.from('education').select('id').eq('user_id', userId).limit(1),
    supabase.from('organization_follows').select('organization_id').eq('user_id', userId),
    supabase
      .from('jobs')
      .select('id, title, area, location, modality, published_at, views_count, application_count, organization_id, organizations(name, slug, sector, org_type, logo_url)')
      .eq('status', 'activa')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(50),
    supabase.from('organizations').select('id, name, slug, sector, org_type, logo_url, verified, created_at'),
    supabase.from('organization_activity_areas').select('organization_id, area'),
    supabase
      .from('radar_events')
      .select('title, event_type, occurred_at')
      .eq('is_published', true)
      .order('occurred_at', { ascending: false })
      .limit(5),
  ]);

  const misAreas = new Set([...(workAreasRes.data || []).map((a) => a.area), ...(interestAreasRes.data || []).map((a) => a.area)]);
  const orgsSeguidasIds = new Set((followsRes.data || []).map((f) => f.organization_id));

  // --- Perfil / checklist de activación ---
  const checklist = {
    cv: !!profileRes.data?.cv_url,
    experiencia: (experiencesRes.data || []).length > 0,
    foto: !!userRes.data?.avatar_url,
    educacion: (educationRes.data || []).length > 0,
    web_linkedin: !!(profileRes.data?.website_url || profileRes.data?.linkedin_url),
  };
  const totalPasos = Object.keys(checklist).length;
  const pasosCompletados = Object.values(checklist).filter(Boolean).length;
  const pasosPendientes = totalPasos - pasosCompletados;
  const completionPct = totalPasos > 0 ? Math.round((pasosCompletados / totalPasos) * 100) : 0;

  const perfil = {
    nombre: userRes.data?.first_name || null,
    completion_pct: completionPct,
    checklist,
    pasos_pendientes: pasosPendientes,
    completo: pasosPendientes === 0,
  };

  // --- Oportunidades para ti: 3 vacantes, con relleno si no hay suficiente señal personal ---
  const todasVacantes = jobsRes.data || [];

  // Sin campo estructurado de seniority en `jobs`, se detecta por palabras
  // clave del título — igual que hemos tenido que hacer en otros sitios de
  // la app donde no existe un dato limpio. Solo se usa para DESPRIORIZAR,
  // nunca para eliminar del todo (puede haber gente junior sin nivel
  // relleno para quien sí encajen).
  const PALABRAS_JUNIOR = ['becari', 'práctica', 'practica', 'junior', 'trainee', 'intern'];
  const esVacanteJunior = (titulo) => {
    const t = (titulo || '').toLowerCase();
    return PALABRAS_JUNIOR.some((p) => t.includes(p));
  };
  const candidatoEsDirectivo = profileRes.data?.level_type === 'directivo';

  const vacantesEmparejadas = misAreas.size ? todasVacantes.filter((j) => misAreas.has(j.area)) : [];
  const vacantesRelleno = todasVacantes.filter((j) => !vacantesEmparejadas.includes(j));
  let vacantesOrdenadas = [...vacantesEmparejadas, ...vacantesRelleno];

  if (candidatoEsDirectivo) {
    vacantesOrdenadas = [...vacantesOrdenadas].sort((a, b) => esVacanteJunior(a.title) - esVacanteJunior(b.title));
  }

  const vacantesRecomendadas = vacantesOrdenadas.slice(0, 3).map((j) => ({
    id: j.id,
    title: j.title,
    organization_name: j.organizations?.name || 'Organización',
    organization_slug: j.organizations?.slug,
    organization_logo: j.organizations?.logo_url,
    organization_type: j.organizations?.org_type,
    location: j.location,
    modality: j.modality,
    published_at: j.published_at,
    views_count: j.views_count || 0,
    // Para el contador de interés de la Home: las candidaturas dicen
    // cuánta competencia hay, que es más útil que las visitas.
    application_count: j.application_count || 0,
  }));

  // --- Organizaciones que pueden interesarte: 3, con relleno de destacadas/verificadas ---
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
    .filter((o) => !orgsEmparejadas.includes(o))
    .sort((a, b) => Number(b.verified) - Number(a.verified) || new Date(b.created_at) - new Date(a.created_at));
  const organizacionesRecomendadas = [...orgsEmparejadas, ...orgsRelleno].slice(0, 3).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    logo_url: o.logo_url,
    sector: o.sector,
    org_type: o.org_type,
  }));

  // --- Novedades del ecosistema: hasta 5, se oculta el bloque entero si no hay ninguna ---
  const novedades = (eventsRes.data || []).map((e) => ({
    title: e.title,
    event_type: e.event_type,
    occurred_at: e.occurred_at,
  }));

  return NextResponse.json({
    perfil,
    vacantes_recomendadas: vacantesRecomendadas,
    organizaciones_recomendadas: organizacionesRecomendadas,
    novedades,
  });
}
