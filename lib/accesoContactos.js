import { userHasActivePlan, orgHasActivePlan } from '@/lib/plans';

// ¿Puede este usuario ver los contactos institucionales (email, teléfono y
// web de cada unidad)? Pro personal activo, o miembro de una organización
// con Teams activo (Teams incluye la licencia Pro).
//
// Se usa en el servidor. En el navegador, usePlanPro solo decide qué se
// pinta; lo que protege el dato es que no llegue si no hay derecho.
export async function puedeVerContactos(admin, userId) {
  if (!userId) return false;

  const [{ data: perfil }, { data: membresia }] = await Promise.all([
    admin.from('users').select('plan, plan_status').eq('id', userId).maybeSingle(),
    admin
      .from('organization_members')
      .select('organizations(plan, plan_status, claimed, verified)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (perfil?.plan === 'pro' && userHasActivePlan(perfil)) return true;

  const org = membresia?.organizations;
  return !!org && org.plan === 'teams' && orgHasActivePlan(org);
}
