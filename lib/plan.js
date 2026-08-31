// Lógica central de planes.
//
// Toda comprobación de "¿puede esta organización hacer X?" debe pasar por
// aquí, para no repetir la misma lógica de plan en distintos endpoints y
// páginas. Los límites concretos viven solo en este archivo.
//
// TRES PLANES: Free, Recruiter y Teams. En la base de datos siguen siendo
// 'free', 'plus' y 'pro'; renombrarlos allí obligaría a migrar filas y a
// revisar todas las comprobaciones de permisos, así que la traducción a
// los nombres comerciales ocurre solo en planLabel().
//
// SE RETIRÓ EL PERIODO DE PRUEBA. Existía un tier 'trial' de cinco días
// con tres usos de IA, y con él una fecha de fin, un contador de usos y
// un aviso en la barra del panel. Se ha eliminado entero: getEffectiveTier
// devuelve ahora el plan tal cual, sin calcular nada a partir de fechas.
// Las columnas trial_* pueden seguir en la tabla, pero ya no se leen.

const FREE_JOB_LIMIT = 1;

// El plan que aplica ahora mismo. Antes esto calculaba si el trial seguía
// vivo comparando trial_ends_at con la fecha actual; sin trial, el plan de
// la organización es directamente el que manda.
export function getEffectiveTier(org) {
  return org.plan;
}

// --- Ofertas de empleo ---------------------------------------------------

export function canPostAnotherJob(org, activeJobCount) {
  const tier = getEffectiveTier(org);
  if (tier === 'free') return activeJobCount < FREE_JOB_LIMIT;
  return true;
}

export function freeJobLimit() {
  return FREE_JOB_LIMIT;
}

// --- Inteligencia artificial ----------------------------------------------

export function canUseAIJobDescription(org) {
  return getEffectiveTier(org) !== 'free';
}

// Recruiter también, no solo Teams.
//
// La página de precios vende "Matching y scoring de candidatos" dentro de
// Recruiter desde hace tiempo, pero esta comprobación solo lo concedía a
// 'pro'. Es decir: quien pagaba Recruiter no tenía la función que había
// comprado. Se corrige aquí, que es donde vivía el fallo.
export function canUseAIMatching(org) {
  const tier = getEffectiveTier(org);
  return tier === 'plus' || tier === 'pro';
}

// --- Base de datos inteligente ---------------------------------------------

export function canAccessDatabase(org) {
  return getEffectiveTier(org) === 'pro';
}

// --- Equipo (varios usuarios por organización) ------------------------------

export function canAddTeamMember(org, currentMemberCount) {
  if (getEffectiveTier(org) === 'pro') return true;
  return currentMemberCount < 1;
}

// --- Nombres comerciales ----------------------------------------------------

export function planLabel(org) {
  const tier = getEffectiveTier(org);
  if (tier === 'pro') return org.is_founding_member ? 'Teams · Founding Member' : 'Teams';
  if (tier === 'plus') return 'Recruiter';
  return 'Free';
}

// --- Catálogo de planes -----------------------------------------------------
//
// Los tres planes, con lo que cuestan y lo que incluyen. Vive aquí y no en
// la página para que /precios y el panel no se puedan desincronizar: hasta
// ahora el panel decía "Plus" y "Pro" y prometía tres funciones de las
// siete que anuncia la web.
//
// `clave` es el valor de organizations.plan; `nombre` es el comercial.

export const PLANES = [
  {
    clave: 'free',
    nombre: 'Free',
    precio: '0 €',
    periodo: 'para siempre',
    usuarios: '1 usuario',
    color: 'gris',
  },
  {
    clave: 'plus',
    nombre: 'Recruiter',
    precio: '149 €',
    periodo: '/ año',
    usuarios: '1 usuario',
    color: 'verde',
  },
  {
    clave: 'pro',
    nombre: 'Teams',
    precio: '429 €',
    periodo: '/ año',
    usuarios: 'Hasta 4 usuarios',
    color: 'morado',
    distintivo: 'MÁS COMPLETO',
  },
];

// La tabla comparativa, agrupada. Cada fila dice qué da cada plan: `true`
// pinta una marca, `false` un guion, y una cadena se escribe tal cual.
export const COMPARATIVA = [
  {
    grupo: 'Empleo',
    filas: [
      { nombre: 'Ofertas activas', free: '1', plus: 'Sin límite', pro: 'Sin límite' },
      { nombre: 'Candidaturas por oferta', free: '15', plus: 'Sin límite', pro: 'Sin límite' },
      { nombre: 'Página de organización verificada', free: true, plus: true, pro: true },
      { nombre: 'ATS de candidatos', free: true, plus: true, pro: true },
    ],
  },
  {
    grupo: 'Inteligencia artificial',
    filas: [
      { nombre: 'Descripción de ofertas', free: false, plus: true, pro: true },
      { nombre: 'Matching y scoring de candidatos', free: false, plus: true, pro: true },
      { nombre: 'Resumen de candidatos', free: false, plus: true, pro: true },
    ],
  },
  {
    grupo: 'Asuntos públicos',
    filas: [
      { nombre: 'Licencia de GovTalent Pro para el equipo', free: false, plus: false, pro: true },
      { nombre: 'Proyectos compartidos', free: false, plus: false, pro: true },
      { nombre: 'Seguimiento normativo y alertas', free: false, plus: false, pro: true },
      { nombre: 'Agenda y notas compartidas', free: false, plus: false, pro: true },
      { nombre: 'Registro de actividad y actas', free: false, plus: false, pro: true },
      { nombre: 'Directorio institucional con filtros avanzados', free: false, plus: false, pro: true },
    ],
  },
  {
    grupo: 'Equipo',
    filas: [
      { nombre: 'Usuarios', free: '1', plus: '1', pro: '4' },
      { nombre: 'Dashboard de organización', free: false, plus: false, pro: true },
      { nombre: 'Roles diferenciados', free: false, plus: false, pro: true },
    ],
  },
];
