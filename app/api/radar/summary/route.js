import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SECTOR_LABELS = {
  energia_clima: 'Energía y clima',
  telecomunicaciones: 'Telecomunicaciones',
  tecnologia_digital: 'Tecnología y digital',
  audiovisual_medios: 'Audiovisual y medios de comunicación',
  transporte_movilidad: 'Transporte y movilidad',
  logistica_postal: 'Logística y sector postal',
  farmaceutico_salud: 'Farmacéutico y salud',
  financiero_banca_seguros: 'Financiero, banca y seguros',
  alimentacion_bebidas: 'Alimentación y bebidas',
  turismo_hosteleria: 'Turismo y hostelería',
  multisectorial: 'Multisectorial',
  otro: 'Otro',
};

export async function GET() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const userId = authData.user.id;
  const treintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sieteDias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [eventsRes, workAreasRes, followsRes, jobsRes] = await Promise.all([
    supabase.from('radar_events').select('*').eq('is_published', true).gte('occurred_at', treintaDias).order('occurred_at', { ascending: false }),
    supabase.from('user_work_areas').select('area').eq('user_id', userId),
    supabase.from('organization_follows').select('organization_id, organizations(name)').eq('user_id', userId),
    supabase.from('jobs').select('id, title, area, organization_id, created_at, organizations(name, sector)').eq('status', 'activa'),
  ]);

  const events = eventsRes.data || [];
  const misAreas = (workAreasRes.data || []).map((a) => a.area);
  const orgsSeguidas = followsRes.data || [];
  const orgsSeguidasIds = new Set(orgsSeguidas.map((f) => f.organization_id));

  // --- 1) Desglose de "movimientos este mes" ---
  const desglose = {
    perfiles_actualizados: events.filter((e) => e.event_type === 'profile_updated').length,
    nuevas_vacantes: events.filter((e) => e.event_type === 'new_job_posting').length,
    nuevas_organizaciones: events.filter((e) => e.event_type === 'new_organization').length,
    cambios_cargo: events.filter((e) => e.event_type === 'appointment' || e.event_type === 'departure').length,
    organizaciones_verificadas: events.filter((e) => e.event_type === 'organization_verified').length,
    actividad_transparencia: events.filter((e) => e.event_type === 'transparency_activity').length,
  };
  const movimientosMes = Object.values(desglose).reduce((a, b) => a + b, 0);

  // --- 2) Vacantes para tu perfil ---
  const vacantesParaTi = misAreas.length
    ? (jobsRes.data || []).filter((j) => misAreas.includes(j.area))
    : [];

  // --- 3) Perfiles actualizados en la última semana ---
  const perfilesActualizadosSemana = events.filter(
    (e) => e.event_type === 'profile_updated' && e.occurred_at >= sieteDias
  ).length;

  // --- 4) "Qué está pasando ahora" — hasta 5 titulares recientes, priorizando variedad de tipo ---
  const queEstaPasando = [];
  const tiposVistos = new Set();
  for (const e of events) {
    if (queEstaPasando.length >= 5) break;
    if (tiposVistos.has(e.event_type)) continue;
    tiposVistos.add(e.event_type);
    queEstaPasando.push(e.title);
  }

  // --- 5) Perfil destacado (último nombramiento confirmado y publicado) ---
  const perfilDestacado = events.find((e) => e.event_type === 'appointment') || null;

  // --- 6) Para tu perfil: agrupar vacantes por sector para dar una pista concreta ---
  const sectorConMasVacantes = vacantesParaTi.reduce((acc, j) => {
    const s = j.organizations?.sector;
    if (s) acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const topSectorVacantes = Object.entries(sectorConMasVacantes).sort((a, b) => b[1] - a[1])[0];

  // --- 7) Radar de organización: la organización con más eventos en 14 días (que no sea la del perfil destacado) ---
  const catorceDias = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const conteoOrgEventos = {};
  for (const e of events) {
    if (!e.organization_id || e.occurred_at < catorceDias) continue;
    if (perfilDestacado && e.organization_id === perfilDestacado.organization_id) continue;
    conteoOrgEventos[e.organization_id] = (conteoOrgEventos[e.organization_id] || 0) + 1;
  }
  const topOrgRadarId = Object.entries(conteoOrgEventos).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  let radarOrganizacion = null;
  if (topOrgRadarId) {
    const orgEvents = events.filter((e) => e.organization_id === topOrgRadarId);
    const { data: org } = await supabase.from('organizations').select('name').eq('id', topOrgRadarId).single();
    radarOrganizacion = {
      organization_name: org?.name || 'Organización',
      total_señales: orgEvents.length,
      tipos: [...new Set(orgEvents.map((e) => e.event_type))],
    };
  }

  // --- 8) Organización seguida con actividad reciente ---
  let organizacionSeguidaEvento = null;
  if (orgsSeguidasIds.size > 0) {
    organizacionSeguidaEvento = events.find((e) => e.organization_id && orgsSeguidasIds.has(e.organization_id)) || null;
  }

  // --- 9) Tendencia: sector con más eventos este mes ---
  const conteoSector = events.reduce((acc, e) => {
    if (e.sector) acc[e.sector] = (acc[e.sector] || 0) + 1;
    return acc;
  }, {});
  const topSectorEntry = Object.entries(conteoSector).sort((a, b) => b[1] - a[1])[0];
  const tendencia = topSectorEntry
    ? {
        sector_label: SECTOR_LABELS[topSectorEntry[0]] || topSectorEntry[0],
        sector_code: topSectorEntry[0],
        porcentaje: movimientosMes > 0 ? Math.round((topSectorEntry[1] / movimientosMes) * 100) : 0,
      }
    : null;

  // --- 10) Organización más activa (por nº total de eventos en 30 días) ---
  const conteoOrgTotal = {};
  for (const e of events) {
    if (!e.organization_id) continue;
    conteoOrgTotal[e.organization_id] = (conteoOrgTotal[e.organization_id] || 0) + 1;
  }
  const topOrgActivaId = Object.entries(conteoOrgTotal).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  let organizacionMasActiva = null;
  if (topOrgActivaId) {
    const { data: org } = await supabase.from('organizations').select('name').eq('id', topOrgActivaId).single();
    const { count: seguidoresCount } = await supabase
      .from('organization_follows')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', topOrgActivaId);
    const vacantesOrg = events.filter((e) => e.organization_id === topOrgActivaId && e.event_type === 'new_job_posting').length;
    organizacionMasActiva = {
      organization_name: org?.name || 'Organización',
      seguidores: seguidoresCount || 0,
      vacantes: vacantesOrg,
    };
  }

  return NextResponse.json({
    stats: {
      movimientos_mes: movimientosMes,
      desglose,
      vacantes_para_ti: vacantesParaTi.length,
      organizaciones_seguidas: orgsSeguidas.length,
      perfiles_actualizados_semana: perfilesActualizadosSemana,
    },
    que_esta_pasando: queEstaPasando,
    perfil_destacado: perfilDestacado
      ? { title: perfilDestacado.title, event_id: perfilDestacado.id, organization_id: perfilDestacado.organization_id }
      : null,
    para_tu_perfil: topSectorVacantes
      ? { count: vacantesParaTi.length, sector_label: SECTOR_LABELS[topSectorVacantes[0]] || topSectorVacantes[0] }
      : vacantesParaTi.length > 0
        ? { count: vacantesParaTi.length, sector_label: null }
        : null,
    radar_organizacion: radarOrganizacion,
    organizacion_seguida: organizacionSeguidaEvento
      ? { title: organizacionSeguidaEvento.title, event_id: organizacionSeguidaEvento.id }
      : null,
    tendencia,
    organizacion_mas_activa: organizacionMasActiva,
  });
}
