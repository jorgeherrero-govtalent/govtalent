import { createAdminClient } from '@/lib/supabase/admin';

// Límites por usuario y por endpoint concreto, dentro de una ventana de
// tiempo (en horas). Pensados para dejar margen a un uso normal e intenso
// del producto, pero cortar el paso a un abuso automatizado o accidental.
const ENDPOINT_LIMITS = {
  'extract-cv': { max: 10, windowHours: 24 },
  'candidate-bio': { max: 20, windowHours: 24 },
  'org-description': { max: 10, windowHours: 24 },
  'job-description': { max: 20, windowHours: 24 },
  'cover-letter': { max: 15, windowHours: 24 },
  summary: { max: 60, windowHours: 24 },
  rank: { max: 20, windowHours: 24 },
  'candidate-message': { max: 30, windowHours: 24 },
  'directory-search': { max: 40, windowHours: 24 },
};
const DEFAULT_LIMIT = { max: 20, windowHours: 24 };

// Límite global de seguridad: la suma de todas las funciones de IA que use
// un mismo usuario, independientemente de cuál sea, para cubrir el caso de
// que se combinen varios endpoints para agotar cuota o generar coste.
const GLOBAL_LIMIT = { max: 150, windowHours: 24 };

/**
 * Comprueba si el usuario puede hacer una llamada más a este endpoint de IA
 * y, si puede, registra el uso. Debe llamarse justo después de comprobar
 * que el usuario está autenticado, y antes de invocar a la API de Anthropic.
 *
 * Devuelve { allowed: true } o { allowed: false, reason: '...mensaje...' }.
 */
export async function checkAndLogAiUsage(userId, endpoint) {
  const admin = createAdminClient();
  const limit = ENDPOINT_LIMITS[endpoint] || DEFAULT_LIMIT;

  const since = new Date(Date.now() - limit.windowHours * 3600 * 1000).toISOString();
  const globalSince = new Date(Date.now() - GLOBAL_LIMIT.windowHours * 3600 * 1000).toISOString();

  const [endpointRes, globalRes] = await Promise.all([
    admin
      .from('ai_usage_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('created_at', since),
    admin
      .from('ai_usage_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', globalSince),
  ]);

  const endpointCount = endpointRes.count || 0;
  const globalCount = globalRes.count || 0;

  if (endpointCount >= limit.max) {
    return {
      allowed: false,
      reason: `Has alcanzado el límite de uso de esta función de IA (${limit.max} veces cada ${limit.windowHours}h). Vuelve a intentarlo más tarde.`,
    };
  }
  if (globalCount >= GLOBAL_LIMIT.max) {
    return {
      allowed: false,
      reason: `Has alcanzado el límite general de uso de funciones de IA (${GLOBAL_LIMIT.max} veces cada ${GLOBAL_LIMIT.windowHours}h). Vuelve a intentarlo más tarde.`,
    };
  }

  await admin.from('ai_usage_log').insert({ user_id: userId, endpoint });
  return { allowed: true };
}
