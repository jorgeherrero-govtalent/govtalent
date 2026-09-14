// Lógica central de planes de ORGANIZACIÓN.
//
// Toda comprobación de "¿puede esta organización hacer X?" pasa por aquí.
// Este archivo ya no define qué incluye cada plan: eso vive en lib/plans.js,
// que es la fuente única y la que usan también el checkout y el webhook.
// Aquí solo quedan las preguntas de negocio, expresadas en términos de
// features. Así, añadir una funcionalidad a un plan es tocar un sitio.
//
// TRES PLANES DE ORGANIZACIÓN: free, recruiter y teams.
//
// Estos son ya los valores reales del enum org_plan en la base de datos. La
// versión anterior de este archivo traducía desde 'free' | 'plus' | 'pro',
// que eran los valores antiguos; al recrear el enum durante la integración
// de Stripe, todas esas comparaciones dejaron de cumplirse y las funciones
// devolvían silenciosamente que no había permiso. Si encuentras 'plus' o
// 'pro' en alguna comparación de planes de organización, es código muerto.
//
// Ojo con una colisión de nombres: GovTalent Pro es el plan PERSONAL, que
// vive en users.plan. Una organización nunca está en 'pro'.

import {
  ORG_PLAN_FEATURES,
  PLAN_SEATS,
  orgHasActivePlan,
} from '@/lib/plans';

const FREE_JOB_LIMIT = 1;

/** El plan que aplica ahora mismo. Sin trial: el plan es el que manda. */
export function getEffectiveTier(org) {
  return org?.plan || 'free';
}

/** ¿Es una organización en Teams? Úsalo en vez de comparar cadenas sueltas. */
export function esPlanTeams(org) {
  return getEffectiveTier(org) === 'teams';
}

/**
 * Features efectivas de la organización.
 *
 * Si la suscripción no está dando servicio (cancelada, incompleta), cae a
 * las de Free aunque la columna `plan` todavía diga otra cosa.
 */
function features(org) {
  const plan = org && orgHasActivePlan(org) ? org.plan : 'free';
  return new Set(ORG_PLAN_FEATURES[plan] || ORG_PLAN_FEATURES.free);
}

/** Comprobación puntual por feature. */
export function orgTiene(org, feature) {
  return features(org).has(feature);
}

// --- Ofertas de empleo ---------------------------------------------------

export function canPostAnotherJob(org, activeJobCount) {
  if (orgTiene(org, 'ofertas_ilimitadas')) return true;
  return activeJobCount < FREE_JOB_LIMIT;
}

export function freeJobLimit() {
  return FREE_JOB_LIMIT;
}

// --- Inteligencia artificial ----------------------------------------------

export function canUseAIJobDescription(org) {
  return orgTiene(org, 'ia_descripcion_oferta');
}

// Recruiter también, no solo Teams: la página de precios vende el matching
// dentro de Recruiter, así que la comprobación tiene que concederlo.
export function canUseAIMatching(org) {
  return orgTiene(org, 'matching_candidatos');
}

// --- Base de datos exportable ----------------------------------------------

export function canAccessDatabase(org) {
  return orgTiene(org, 'export_age_ue');
}

// --- Equipo (varios usuarios por organización) ------------------------------

/** Plazas incluidas en el plan actual de la organización. */
export function teamSeats(org) {
  const plan = org && orgHasActivePlan(org) ? org.plan : 'free';
  return PLAN_SEATS[plan] ?? 1;
}

/**
 * ¿Cabe otro miembro?
 *
 * `currentMemberCount` debe incluir las invitaciones pendientes: una plaza
 * prometida está ocupada, aunque todavía no se haya aceptado.
 */
export function canAddTeamMember(org, currentMemberCount) {
  return currentMemberCount < teamSeats(org);
}

// --- Nombres comerciales ----------------------------------------------------

export function planLabel(org) {
  const tier = getEffectiveTier(org);
  if (tier === 'teams') return org?.is_founding_member ? 'Teams · Founding Member' : 'Teams';
  if (tier === 'recruiter') return 'Recruiter';
  return 'Free';
}

// --- Catálogo de planes -----------------------------------------------------
//
// Los tres planes, con lo que cuestan y lo que incluyen. Vive aquí y no en
// la página para que /precios y el panel no se puedan desincronizar.
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
    clave: 'recruiter',
    nombre: 'Recruiter',
    precio: '149 €',
    periodo: '/ año',
    usuarios: '1 usuario',
    color: 'verde',
  },
  {
    clave: 'teams',
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
//
// Las claves de cada fila son ahora `free`, `recruiter` y `teams`. Si el
// componente que pinta esta tabla lee `fila.plus` o `fila.pro`, hay que
// actualizarlo o las columnas saldrán vacías.
export const COMPARATIVA = [
  {
    grupo: 'Empleo',
    filas: [
      { nombre: 'Ofertas activas', free: '1', recruiter: 'Sin límite', teams: 'Sin límite' },
      { nombre: 'Candidaturas por oferta', free: '15', recruiter: 'Sin límite', teams: 'Sin límite' },
      { nombre: 'Página de organización verificada', free: true, recruiter: true, teams: true },
      { nombre: 'ATS de candidatos', free: true, recruiter: true, teams: true },
    ],
  },
  {
    grupo: 'Inteligencia artificial',
    filas: [
      { nombre: 'Descripción de ofertas', free: false, recruiter: true, teams: true },
      { nombre: 'Matching y scoring de candidatos', free: false, recruiter: true, teams: true },
      { nombre: 'Resumen de candidatos', free: false, recruiter: true, teams: true },
    ],
  },
  {
    grupo: 'Asuntos públicos',
    filas: [
      { nombre: 'Licencia de GovTalent Pro para el equipo', free: false, recruiter: false, teams: true },
      { nombre: 'Proyectos compartidos', free: false, recruiter: false, teams: true },
      { nombre: 'Seguimiento normativo y alertas', free: false, recruiter: false, teams: true },
      { nombre: 'Agenda y notas compartidas', free: false, recruiter: false, teams: true },
      { nombre: 'Registro de actividad y actas', free: false, recruiter: false, teams: true },
      { nombre: 'Directorio institucional con filtros avanzados', free: false, recruiter: false, teams: true },
    ],
  },
  {
    grupo: 'Equipo',
    filas: [
      { nombre: 'Usuarios', free: '1', recruiter: '1', teams: '4' },
      { nombre: 'Dashboard de organización', free: false, recruiter: false, teams: true },
      { nombre: 'Roles diferenciados', free: false, recruiter: false, teams: true },
    ],
  },
];
