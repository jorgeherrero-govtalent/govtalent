import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// Diccionarios (ver documento de diseño, secciones 4, 5 y 9)
// ============================================================================

const GRADO_TOP3 = ['ciencias polít', 'derecho', 'periodismo', 'relaciones internacionales'];

const POSGRADO_KEYWORDS = ['máster', 'master', 'posgrado', 'postgrado', 'doctorado', 'phd'];

const FORMACION_ESPECIFICA_KEYWORDS = [
  'asuntos públicos', 'public affairs',
  'relaciones institucionales', 'government affairs', 'government relations', 'institutional relations',
  'gabinetes institucionales',
  'comunicación corporativa', 'corporate communications',
  'lobby', 'lobbying', 'cabildeo',
  'política pública', 'public policy', 'mpp',
  'administración pública', 'mpa',
  'asuntos regulatorios', 'regulatory affairs',
  'corporate affairs',
];

// Categoría más común del informe APRI/UNAV (36,7%) — único "acierto" del criterio 4
const ORG_TYPE_MAS_COMUN = 'empresa_privada';

// Tabla 14 del informe: nivel de puesto más común, por tipo de organización.
// Solo se rellenan los tipos donde tenemos el dato real confirmado; el resto
// se deja fuera del cálculo del criterio 5 (no se adivina).
const NIVEL_MAS_COMUN_POR_ORG = {
  consultora: 'consultor',
  empresa_privada: 'directivo',
};

// Palabras clave por rol — extraídas del listado real de ~150 cargos del
// anexo del informe APRI/UNAV (ver documento de diseño, sección 9 y el
// hallazgo del anexo "Listado de cargos")
const ROLE_KEYWORDS = {
  consultor: ['consultor', 'consultora', 'ejecutivo de cuentas', 'account executive', 'analista junior', 'analyst', 'associate', 'consultant'],
  responsable_ap: ['asuntos públicos', 'director de aapp', 'asuntos regulatorio', 'corporate affairs', 'government affairs', 'public affairs', 'aapp'],
  responsable_ri: ['relaciones institucionales', 'rrii', 'institutional affairs', 'institutional relations', 'government relations'],
  especialista_regulacion: ['política pública', 'regulación', 'oficina ante la ue', 'oficina de bruselas', 'policy', 'eu affairs', 'eu policy', 'regulatory'],
  incidencia_advocacy: ['secretario general', 'secretaria general', 'asociación empresarial', 'advocacy', 'incidencia'],
};

const ROLE_LABELS = {
  consultor: 'Consultor de asuntos públicos',
  responsable_ap: 'Responsable de asuntos públicos (Corporate Public Affairs)',
  responsable_ri: 'Responsable de relaciones institucionales',
  especialista_regulacion: 'Especialista en regulación y public policy',
  incidencia_advocacy: 'Incidencia y advocacy',
};

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos
}

function contieneAlguna(texto, palabras) {
  const t = normalizar(texto);
  return palabras.some((p) => t.includes(normalizar(p)));
}

export async function GET() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const userId = authData.user.id;

  const [profileRes, educationRes, experiencesRes, skillsRes, languagesRes, followsRes, userRes] = await Promise.all([
    supabase.from('candidate_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('education').select('degree, institution').eq('user_id', userId),
    supabase.from('experiences').select('title, organization_name').eq('user_id', userId),
    supabase.from('skills').select('id').eq('user_id', userId),
    supabase.from('languages').select('id').eq('user_id', userId),
    supabase.from('organization_follows').select('id').eq('user_id', userId),
    supabase.from('users').select('professional_title, avatar_url').eq('id', userId).single(),
  ]);

  const profile = profileRes.data;
  const education = educationRes.data || [];
  const experiences = experiencesRes.data || [];
  const professionalTitle = userRes.data?.professional_title || '';

  const educationText = education.map((e) => e.degree || '').join(' | ');
  const experienceText = experiences.map((e) => e.title || '').join(' | ');

  if (!profile) {
    return NextResponse.json({
      error: 'perfil_incompleto',
      message: 'Completa tu perfil para ver tu Radiografía Profesional.',
    });
  }

  // ==========================================================================
  // BLOQUE 1 — Benchmark profesional (estadístico, fuente: APRI/UNAV)
  // ==========================================================================

  const tieneDatosDeSector = profile.career_situation === 'trabajo_sector' || profile.career_situation === 'area_afin';

  const criterios = [];

  criterios.push({
    id: 'grado',
    peso: 20,
    cumplido: contieneAlguna(educationText, GRADO_TOP3),
    label: 'Tu formación de grado está entre las más comunes del sector',
    detalle: 'Ciencias Políticas y Derecho son las dos titulaciones más citadas por el estudio APRI/UNAV',
  });

  criterios.push({
    id: 'posgrado',
    peso: 20,
    cumplido: contieneAlguna(educationText, POSGRADO_KEYWORDS),
    label: 'Tienes formación de posgrado',
    detalle: 'El 66,4% de los profesionales del sector tiene formación de máster',
  });

  const tieneFormacionEspecifica = contieneAlguna(educationText, FORMACION_ESPECIFICA_KEYWORDS);
  criterios.push({
    id: 'formacion_especifica',
    peso: 30,
    cumplido: tieneFormacionEspecifica,
    label: 'Tienes formación específica en asuntos públicos o lobby',
    detalle: 'El 51,2% de los profesionales del sector no tiene formación específica en este ámbito',
  });

  // Criterios 4 y 5 solo aplican si hay datos de tipo de organización / nivel de puesto
  if (tieneDatosDeSector && profile.org_type) {
    criterios.push({
      id: 'tipo_organizacion',
      peso: 15,
      cumplido: profile.org_type === ORG_TYPE_MAS_COMUN,
      label: 'Tu tipo de organización coincide con la más habitual',
      detalle: 'La empresa privada es el entorno más común del sector (36,7%)',
    });
  }

  const nivelEsperado = profile.org_type ? NIVEL_MAS_COMUN_POR_ORG[profile.org_type] : null;
  if (tieneDatosDeSector && profile.level_type && nivelEsperado) {
    criterios.push({
      id: 'nivel_puesto',
      peso: 15,
      cumplido: profile.level_type === nivelEsperado,
      label: 'Tu nivel de puesto coincide con el más habitual en tu tipo de organización',
      detalle: null,
    });
  }

  const pesoTotal = criterios.reduce((a, c) => a + c.peso, 0);
  const pesoLogrado = criterios.filter((c) => c.cumplido).reduce((a, c) => a + c.peso, 0);
  const scoreBase = pesoTotal > 0 ? (pesoLogrado / pesoTotal) * 100 : 0;

  const AJUSTES = { trabajo_sector: 0, area_afin: 10, area_no_relacionada: 20, primera_experiencia: 0 };
  const ajustePct = AJUSTES[profile.career_situation] ?? 0;
  const scoreFinal = Math.round(scoreBase * (1 - ajustePct / 100));

  const benchmark = {
    porcentaje: scoreFinal,
    criterios_evaluados: criterios.length,
    criterios: criterios.map((c) => ({ label: c.label, detalle: c.detalle, cumplido: c.cumplido })),
    ajuste_aplicado: ajustePct > 0,
    mensaje_ajuste:
      ajustePct > 0
        ? 'Tu formación encaja bien con el sector; hemos ajustado el resultado para reflejar tu situación profesional actual.'
        : null,
    fuente: 'Basado en el estudio "Radiografía de la Profesión en España", del Observatorio de Asuntos Públicos (Universidad de Navarra y APRI).',
  };

  // ==========================================================================
  // BLOQUE 2 — Trayectoria profesional (clasificación propia de GovTalent)
  // ==========================================================================

  const textoCompleto = `${professionalTitle} | ${educationText} | ${experienceText}`;
  const puntuacionPorRol = {};
  let señalesEncontradas = 0;

  for (const [rol, palabras] of Object.entries(ROLE_KEYWORDS)) {
    let puntos = 0;
    for (const palabra of palabras) {
      if (contieneAlguna(textoCompleto, [palabra])) {
        puntos += 1;
        señalesEncontradas += 1;
      }
    }
    puntuacionPorRol[rol] = puntos;
  }

  const rolCalculado = Object.entries(puntuacionPorRol).sort((a, b) => b[1] - a[1])[0];
  const hayClasificacion = rolCalculado && rolCalculado[1] > 0;

  // Confianza según cuántas señales propias del perfil se han encontrado
  // (no según volumen de la plataforma — todavía no tenemos ese dato agregado)
  let confianza = 'baja';
  if (señalesEncontradas >= 4) confianza = 'alta';
  else if (señalesEncontradas >= 2) confianza = 'media';

  let mensajeComparacion = null;
  if (hayClasificacion && profile.role_type) {
    mensajeComparacion =
      profile.role_type === rolCalculado[0]
        ? 'Tu trayectoria calculada coincide con el rol que has indicado.'
        : `También podría interesarte explorar: ${ROLE_LABELS[profile.role_type] || ''}.`;
  }

  const trayectoria = {
    rol: hayClasificacion ? ROLE_LABELS[rolCalculado[0]] : null,
    confianza,
    mensaje_comparacion: mensajeComparacion,
    fuente: 'Clasificación elaborada por GovTalent a partir de la información de tu perfil.',
  };

  // ==========================================================================
  // BLOQUE 3 — Recomendaciones (lógica de producto, sin fuente externa)
  // ==========================================================================

  const recomendaciones = [];

  if (!tieneFormacionEspecifica) {
    recomendaciones.push({
      icon: 'ti-school',
      titulo: 'Añade formación especializada en asuntos públicos',
      detalle: 'El 61% de los profesionales del sector cree que necesita más formación especializada.',
    });
  }
  if (experiences.length === 0) {
    recomendaciones.push({ icon: 'ti-briefcase', titulo: 'Completa tu experiencia profesional', detalle: null });
  }
  if ((skillsRes.data || []).length === 0) {
    recomendaciones.push({ icon: 'ti-bulb', titulo: 'Añade tus habilidades', detalle: null });
  }
  if ((languagesRes.data || []).length === 0) {
    recomendaciones.push({ icon: 'ti-language', titulo: 'Añade los idiomas que hablas', detalle: null });
  }
  if ((followsRes.data || []).length === 0) {
    recomendaciones.push({ icon: 'ti-eye', titulo: 'Sigue organizaciones relevantes para tu sector', detalle: null });
  }
  recomendaciones.push({ icon: 'ti-search', titulo: 'Descubre vacantes relacionadas con tu perfil', detalle: null });

  // ==========================================================================
  // Conclusión personalizada
  // ==========================================================================

  let conclusion;
  if (hayClasificacion && scoreFinal >= 60) {
    conclusion = `Tu perfil está alineado con profesionales de ${ROLE_LABELS[rolCalculado[0]]}. Tu formación y especialización coinciden con los patrones predominantes del sector. Completar tu experiencia y tus competencias permitirá ofrecer recomendaciones todavía más precisas.`;
  } else if (hayClasificacion) {
    conclusion = `Tu perfil muestra afinidad con ${ROLE_LABELS[rolCalculado[0]]}, aunque todavía hay margen para acercarte más al perfil característico del sector. Revisa las recomendaciones para mejorar tu posición.`;
  } else {
    conclusion = 'Todavía no tenemos suficiente información en tu perfil para ofrecerte una clasificación completa. Completa tu formación y experiencia para desbloquear un resultado más preciso.';
  }

  // Mismo checklist de 5 puntos que ya usa /radar — se recalcula aquí para
  // que este endpoint sea autosuficiente y no dependa de otro
  const checklistPerfil = {
    cv: !!profile.cv_url,
    experiencia: experiences.length > 0,
    foto: !!userRes.data?.avatar_url,
    educacion: education.length > 0,
    web_linkedin: !!(profile.website_url || profile.linkedin_url),
  };
  const perfilCompletadoPct = Math.round(
    (Object.values(checklistPerfil).filter(Boolean).length / Object.keys(checklistPerfil).length) * 100
  );

  return NextResponse.json({
    perfil_completado_pct: perfilCompletadoPct,
    benchmark,
    trayectoria,
    recomendaciones,
    conclusion,
  });
}
