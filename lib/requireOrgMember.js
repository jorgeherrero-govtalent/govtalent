import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Comprueba explícitamente si un usuario pertenece a una organización,
 * en vez de confiar en que una consulta falle silenciosamente por RLS.
 * Se usa en endpoints donde solo un miembro de la organización dueña de
 * la oferta/candidatura debe poder actuar.
 */
export async function isOrganizationMember(userId, organizationId) {
  if (!userId || !organizationId) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  return !!data;
}
