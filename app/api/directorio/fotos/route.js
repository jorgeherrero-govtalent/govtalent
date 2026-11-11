import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/directorio/fotos → { fotos: { <persona_id>: <url> } }
//
// Las fotos de las personas del directorio (sql/131). Son pocas frente a
// las filas del directorio, así que se piden todas de una vez y la tabla
// y las fichas las cruzan por id (components/FotoPersona.js).

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin.from('directorio_fotos').select('persona_id, url').limit(20000);
  if (error) {
    console.error('[directorio/fotos]', error.message);
    return NextResponse.json({ fotos: {} });
  }
  const fotos = {};
  for (const f of data || []) fotos[f.persona_id] = f.url;
  return NextResponse.json({ fotos }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
