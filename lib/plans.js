/**
 * Fuente de verdad de qué da cada plan.
 *
 * Regla: los permisos viven aquí, no en los metadatos de Stripe. En Stripe solo
 * va lo que cambia por cliente (`plan_key`, `scope`, `seats`). Así, al añadir
 * una feature basta con desplegar: la tienen todos los clientes de ese plan a
 * la vez, sin resincronizar nada.
 *
 * Hay dos ejes independientes:
 *   - Plan personal   (users.plan)         -> free | pro
 *   - Plan de la org  (organizations.plan) -> free | recruiter | teams
 *
 * Las features efectivas de una persona son la UNIÓN de ambos.
 */

// --- Features por bloque ---------------------------------------------------

const PRO_FEATURES = [
  'busqueda_avanzada',
  'seguimiento_normativo',
  'alertas',
  'historico_completo',
  'proyectos',
  'diagrama_proyectos',
  'agenda',
  'registro_actividad',
  'actas',
];

const RECRUITER_FEATURES = [
  'ofertas_ilimitadas',
  'ia_descripcion_oferta',
  'matching_candidatos',
  'resumen_ia_candidatos',
];

const USER_FREE_FEATURES = [
  'directorio',
  'empleos_basico',
  'perfil_profesional',
];

const ORG_FREE_FEATURES = [
  'org_ficha',
  'org_oferta_unica',
  'ats_basico',
];

// --- Mapas por plan --------------------------------------------------------

export const USER_PLAN_FEATURES = {
  free: [...USER_FREE_FEATURES],
  pro: [...USER_FREE_FEATURES, ...PRO_FEATURES],
};

export const ORG_PLAN_FEATURES = {
  free: [...ORG_FREE_FEATURES],
  recruiter: [...ORG_FREE_FEATURES, ...RECRUITER_FEATURES],
  // Teams se compone a partir de las constantes en vez de repetir cadenas:
  // así es imposible que se quede sin una feature que acabas de añadir a Pro.
  teams: [
    ...ORG_FREE_FEATURES,
    ...RECRUITER_FEATURES,
    ...PRO_FEATURES,
    'proyectos_compartidos',
    'agenda_compartida',
    'export_age_ue',
    'dashboard_org',
    'roles',
    'onboarding_personalizado',
  ],
};

// --- Metadatos de plan -----------------------------------------------------

export const PLAN_SCOPE = {
  pro: 'user',
  recruiter: 'org',
  teams: 'org',
};

export const PRICE_LOOKUP_KEYS = {
  pro: 'pro_annual',
  recruiter: 'recruiter_annual',
  teams: 'teams_annual',
};

export const PLAN_SEATS = {
  free: 1,
  recruiter: 1,
  teams: 4,
};

/**
 * Códigos promocionales de la oferta Founding Member, por plan.
 *
 * Vive en el servidor a propósito: el botón del banner solo manda
 * `founding: true` y es la ruta de checkout la que decide qué código
 * corresponde. Si el cliente pudiera enviar el código que quisiera, tendrías
 * un campo de descuento abierto disfrazado de botón.
 *
 * Para rotar un código basta con crear otro en Stripe sobre el mismo cupón,
 * cambiarlo aquí y desactivar el viejo.
 */
export const FOUNDING_PROMO_CODES = {
  pro: 'GOVTALENTPRO',
  teams: 'TEAMS',
};

export const PLAN_LABELS = {
  free: 'Free',
  pro: 'GovTalent Pro',
  recruiter: 'GovTalent Recruiter',
  teams: 'GovTalent Teams',
};

// --- Política de acceso ----------------------------------------------------

// Estados en los que el plan de pago sigue dando servicio.
// `past_due` entra a propósito: Stripe está reintentando el cobro y cortar el
// acceso por una tarjeta caducada es la forma más rápida de perder al cliente.
// Cuando agota los reintentos, Stripe manda `canceled` y ahí sí degradamos.
const SERVING_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Si una organización pierde la verificación teniendo plan de pago, ¿mantiene
 * el acceso hasta el final del periodo que ya pagó?
 *
 * true  = lo mantiene (recomendado: pagó un año por adelantado).
 * false = se le corta en cuanto deja de estar verificada.
 *
 * Esta es la única línea que hay que tocar para cambiar esa política.
 */
export const KEEP_ACCESS_WHEN_UNVERIFIED = true;

export function userHasActivePlan(user) {
  if (!user || user.plan === 'free' || !user.plan) return false;
  return SERVING_STATUSES.has(user.plan_status || 'active');
}

export function orgHasActivePlan(organization) {
  if (!organization) return false;
  if (organization.plan === 'free' || !organization.plan) return false;
  if (!SERVING_STATUSES.has(organization.plan_status || 'active')) return false;
  if (!KEEP_ACCESS_WHEN_UNVERIFIED) {
    if (!organization.claimed || !organization.verified) return false;
  }
  return true;
}

/**
 * Features efectivas de una persona: unión de su plan personal y el de su
 * organización. Devuelve un Set.
 *
 * @param {object|null} user          fila de `users`
 * @param {object|null} organization  fila de `organizations` (o null)
 */
export function resolveFeatures(user, organization) {
  const features = new Set();

  const userPlan = userHasActivePlan(user) ? user.plan : 'free';
  for (const f of USER_PLAN_FEATURES[userPlan] || USER_PLAN_FEATURES.free) {
    features.add(f);
  }

  if (organization) {
    const orgPlan = orgHasActivePlan(organization) ? organization.plan : 'free';
    for (const f of ORG_PLAN_FEATURES[orgPlan] || ORG_PLAN_FEATURES.free) {
      features.add(f);
    }
  }

  return features;
}

/**
 * Comprobación puntual. Úsala siempre en lugar de comparar nombres de plan:
 *   hasFeature(user, org, 'export_age_ue')
 * y nunca:
 *   org.plan === 'teams'
 */
export function hasFeature(user, organization, feature) {
  return resolveFeatures(user, organization).has(feature);
}

/** Plazas incluidas en el plan de la organización. */
export function seatsForOrg(organization) {
  const plan = orgHasActivePlan(organization) ? organization.plan : 'free';
  return PLAN_SEATS[plan] ?? 1;
}

/** ¿Cabe otro miembro? `currentMembers` es el recuento actual. */
export function canAddMember(organization, currentMembers) {
  return currentMembers < seatsForOrg(organization);
}
