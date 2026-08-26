// Constantes compartidas entre el paso 4 del OnboardingModal y la sección
// "Situación profesional" editable en /profile. Alimentan el Bloque 1 y 2
// de la Radiografía Profesional (comparación con el estudio APRI/UNAV y
// clasificación de trayectoria propia de GovTalent).
//
// Única fuente de verdad: si se ajustan etiquetas o categorías, tocar solo
// este archivo.

export const CAREER_SITUATIONS = [
  { value: 'trabajo_sector', label: 'Ya trabajo en asuntos públicos / relaciones institucionales' },
  { value: 'area_afin', label: 'Trabajo en un área afín (comunicación, derecho, política, periodismo...)' },
  { value: 'area_no_relacionada', label: 'Trabajo en un área no relacionada' },
  { value: 'primera_experiencia', label: 'Busco mi primera experiencia laboral / soy estudiante' },
];

export const ORG_TYPES = [
  { value: 'consultora', label: 'Consultora de asuntos públicos' },
  { value: 'empresa_privada', label: 'Empresa privada' },
  { value: 'institucion_publica', label: 'Institución pública' },
  { value: 'asociacion_sectorial', label: 'Asociación sectorial' },
  { value: 'tercer_sector', label: 'Tercer sector / ONG' },
];

export const ROLE_TYPES = [
  { value: 'consultor', label: 'Consultor de asuntos públicos' },
  { value: 'responsable_ap', label: 'Responsable de asuntos públicos (Corporate Affairs)' },
  { value: 'responsable_ri', label: 'Responsable de relaciones institucionales' },
  { value: 'especialista_regulacion', label: 'Especialista en regulación y public policy' },
  { value: 'incidencia_advocacy', label: 'Incidencia y advocacy' },
];

export const LEVEL_TYPES = [
  { value: 'tecnico_responsable_area', label: 'Técnico / Responsable de área' },
  { value: 'directivo', label: 'Directivo' },
  { value: 'consultor', label: 'Consultor' },
  { value: 'otro', label: 'Otro' },
];

// Las preguntas B (entorno), C (rol) y D (nivel) solo aplican quien está
// en el sector o en un área afín. El resto (área no relacionada, primera
// experiencia) las salta.
export const SHOWS_DETAIL_QUESTIONS = ['trabajo_sector', 'area_afin'];
