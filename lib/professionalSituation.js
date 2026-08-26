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

// Las seis categorías de la pregunta Q8 del estudio ("¿Cuál es tu perfil
// profesional actual?"), literales. Es lo que permite decirle a alguien
// que el 37,3% del sector ocupa cargos de dirección con la fuente
// delante; cualquier escala propia dejaría el porcentaje sin significado.
//
// Que "consultor" aparezca dos veces no es un descuido: en este sector la
// consultoría tiene su propia escalera, y el estudio la trata así. Por eso
// esto es un perfil y no un nivel jerárquico — de ahí que la pregunta se
// titule "Rol".
//
// Reparto en el estudio (N = 331): director 37,3% · consultor senior 18,8%
// · responsable de área 18,2% · consultor junior 10,9% · técnico 7,6% ·
// otro 7,3%.
export const LEVEL_TYPES = [
  { value: 'director', label: 'Director/a' },
  { value: 'consultor_senior', label: 'Consultor/a senior' },
  { value: 'responsable_area', label: 'Responsable de área' },
  { value: 'consultor_junior', label: 'Consultor/a junior' },
  { value: 'tecnico', label: 'Técnico/a' },
  { value: 'otro', label: 'Otro' },
];

// Las preguntas B (entorno), C (rol) y D (nivel) solo aplican quien está
// en el sector o en un área afín. El resto (área no relacionada, primera
// experiencia) las salta.
export const SHOWS_DETAIL_QUESTIONS = ['trabajo_sector', 'area_afin'];
