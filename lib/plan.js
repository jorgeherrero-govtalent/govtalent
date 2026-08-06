// Lógica central de planes — Sprint 5, Fase B.
//
// Toda comprobación de "¿puede esta organización hacer X?" debe pasar por
// aquí, para no repetir la misma lógica de plan en distintos endpoints y
// páginas. Los límites concretos (1 oferta gratis, 3 usos de IA en trial...)
// viven solo en este archivo.

const FREE_JOB_LIMIT = 1;
const TRIAL_AI_MATCH_LIMIT = 3;
const TRIAL_DURATION_DAYS = 5;

// Determina el nivel de funciones que aplica ahora mismo, calculado a partir
// de la fecha de fin de trial en vez de fiarse solo de plan_status — así la
// comprobación se "autocorrige" aunque todavía no exista un proceso
// automático (cron) que actualice plan_status a trial_expired.
export function getEffectiveTier(org) {
  const trialActive =
    org.plan_status === 'trialing' && org.trial_ends_at && new Date(org.trial_ends_at) > new Date();
  return trialActive ? 'trial' : org.plan;
}

export function isTrialExpired(org) {
  return (
    org.plan_status === 'trialing' && org.trial_ends_at && new Date(org.trial_ends_at) <= new Date()
  );
}

export function trialDaysRemaining(org) {
  if (getEffectiveTier(org) !== 'trial') return 0;
  const ms = new Date(org.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
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

export function canUseAIMatching(org) {
  const tier = getEffectiveTier(org);
  if (tier === 'pro') return true;
  if (tier === 'trial') return (org.trial_ai_matches_used || 0) < TRIAL_AI_MATCH_LIMIT;
  return false;
}

export function aiMatchesRemainingInTrial(org) {
  return Math.max(0, TRIAL_AI_MATCH_LIMIT - (org.trial_ai_matches_used || 0));
}

export function trialAiMatchLimit() {
  return TRIAL_AI_MATCH_LIMIT;
}

// --- Base de datos inteligente ---------------------------------------------

export function canAccessDatabase(org) {
  return getEffectiveTier(org) === 'pro';
}

// --- Equipo (varios usuarios por organización) ------------------------------

export function canAddTeamMember(org, currentMemberCount) {
  const tier = getEffectiveTier(org);
  if (tier === 'pro' || tier === 'trial') return true;
  return currentMemberCount < 1;
}

// --- Utilidades de trial ----------------------------------------------------

// Devuelve los campos a actualizar en `organizations` para arrancar el trial.
// No ejecuta la escritura en base de datos — eso lo hace quien llame a esta función.
export function buildTrialStart() {
  const now = new Date();
  const ends = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
  return {
    plan_status: 'trialing',
    trial_started_at: now.toISOString(),
    trial_ends_at: ends.toISOString(),
    trial_ai_matches_used: 0,
  };
}

export function trialDurationDays() {
  return TRIAL_DURATION_DAYS;
}

// --- Textos del contador de trial (sidebar + tarjeta de Plan) --------------
//
// Especificación de UX (ver conversación de diseño): el estado se comunica
// SOLO con texto y jerarquía tipográfica, nunca con color — así que estas
// funciones son la única fuente de verdad para ambos sitios, para que no se
// puedan desincronizar el texto del sidebar y el de la tarjeta.
//
// Se calcula por día de calendario (comparando fechas locales, no restando
// milisegundos) porque "1 día restante" y "es el último día" son estados
// distintos en el lenguaje ("termina mañana" vs "termina hoy") y restar
// milisegundos + redondear hacia arriba los confunde en las horas finales
// del trial: quedarían menos de 24h en ambos casos y Math.ceil() daría el
// mismo número para los dos.
function calendarDaysUntil(dateIso) {
  const now = new Date();
  const end = new Date(dateIso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEndDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((startOfEndDay - startOfToday) / (24 * 60 * 60 * 1000));
}

// Devuelve null si la organización no está en trial (ni activo ni recién
// expirado) — así ambos consumidores (sidebar y tarjeta) saben cuándo no
// deben mostrar nada de esto.
export function getTrialStatus(org) {
  const onTrial = getEffectiveTier(org) === 'trial';
  const expired = isTrialExpired(org);
  if (!onTrial && !expired) return null;

  const daysRemaining = expired ? 0 : Math.max(0, calendarDaysUntil(org.trial_ends_at));
  const daysUsed = Math.min(TRIAL_DURATION_DAYS, TRIAL_DURATION_DAYS - daysRemaining);

  return { expired, daysRemaining, daysUsed, totalDays: TRIAL_DURATION_DAYS };
}

// Pill compacta del sidebar — recordatorio secundario.
export function sidebarTrialLabel(org) {
  const status = getTrialStatus(org);
  if (!status) return null;
  if (status.expired) return 'Expirado';
  if (status.daysRemaining <= 1) return 'Hoy';
  return `${status.daysRemaining} días`;
}

// Mensaje principal de la tarjeta de Plan — misma información, en lenguaje
// natural y sin repetir literalmente el texto de la pill.
export function planCardTrialMessage(org) {
  const status = getTrialStatus(org);
  if (!status) return null;
  if (status.expired) return 'Tu prueba gratuita ha finalizado';
  if (status.daysRemaining === 0) return 'Tu prueba termina hoy';
  if (status.daysRemaining === 1) return 'Tu prueba termina mañana';
  return `Te quedan ${status.daysRemaining} días de prueba`;
}



export function planLabel(org) {
  const tier = getEffectiveTier(org);
  if (tier === 'trial') {
    const days = trialDaysRemaining(org);
    return `Prueba gratuita · ${days} ${days === 1 ? 'día restante' : 'días restantes'}`;
  }
  if (tier === 'pro') return org.is_founding_member ? 'Pro · Founding Member' : 'Pro';
  if (tier === 'plus') return 'Plus';
  return 'Gratis';
}
