import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// SOLO para uso en rutas API (server-side). Nunca importar desde un componente cliente:
// la SERVICE_ROLE_KEY tiene acceso total a la base de datos, saltándose las políticas RLS.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
