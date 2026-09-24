// =====================================================================
// NIVEL DE AVISOS EN EL SERVIDOR
// lib/nivelAvisos.js
//
// Una sola regla: tiene nivel 'pro' quien tiene Pro propio activo o es
// miembro de una organización Teams activa. Recruiter no incluye
// vigilancia normativa, así que cuenta como 'free'.
//
// La regla vive en SQL (public.nivel_avisos_de, sql/59) y aquí solo se
// llama. Si la función aún no existe —el código desplegado antes que la
// migración—, se cae al plan propio del usuario, que es lo que se hacía
// hasta ahora. Así nadie de pago pierde nada por el orden de despliegue.
//
// Para cron y rutas con service_role. En el navegador, usePlanPro.
// =====================================================================

const SIRVIENDO = new Set(['active', 'trialing', 'past_due']);

export async function nivelAvisos(admin, userId) {
  if (!userId) return 'free';
  const { data, error } = await admin.rpc('nivel_avisos_de', { p_user: userId });
  if (!error && (data === 'pro' || data === 'free')) return data;

  const { data: u } = await admin.from('users').select('plan, plan_status').eq('id', userId).maybeSingle();
  return u?.plan === 'pro' && SIRVIENDO.has(u?.plan_status || 'active') ? 'pro' : 'free';
}

/**
 * El nivel de muchos usuarios a la vez, para los cron. Una llamada por
 * usuario, pero en paralelo y de cien en cien: son pocos usuarios y la
 * función es una consulta indexada.
 */
export async function nivelesAvisos(admin, userIds) {
  const unicos = [...new Set(userIds.filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < unicos.length; i += 100) {
    const grupo = unicos.slice(i, i + 100);
    const niveles = await Promise.all(grupo.map((id) => nivelAvisos(admin, id)));
    grupo.forEach((id, k) => out.set(id, niveles[k]));
  }
  return out;
}
