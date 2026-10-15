// Plazas de precio fundador (lib/precios.js: PLAZAS_FUNDADOR).
//
// Cuenta los clientes que pagan con precio fundador y siguen suscritos.
// Solo servidor: usa el cliente de servicio. Nunca lanza: si la consulta
// falla, devuelve 0 plazas libres, para no ofrecer un precio que quizá ya
// no está disponible.

import { PLAZAS_FUNDADOR } from '@/lib/precios';

export async function plazasFundadorLibres(admin) {
  const { count, error } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('is_founding_member', true)
    .eq('premium_source', 'paid')
    .in('plan_status', ['active', 'past_due']);
  if (error) {
    console.error('[fundadores] no se pudieron contar las plazas:', error.message);
    return 0;
  }
  return Math.max(0, PLAZAS_FUNDADOR - (count || 0));
}
