import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';

// GET /api/instituciones/asistentes-contacto?mep=<id>
// Correos de los asistentes de un eurodiputado (sql/80). Son del
// Directorio: la columna está cerrada al navegador y solo sale de aquí.

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return NextResponse.json({ error: 'Disponible con el Directorio' }, { status: 403 });
  }

  const mep = String(new URL(request.url).searchParams.get('mep') || '').slice(0, 20);
  if (!mep) return NextResponse.json({ correos: {} });

  const { data: v, error } = await admin.from('eu_asistentes_meps').select('asistente_id').eq('mep_id', mep);
  if (error) return NextResponse.json({ error: 'No se pudieron cargar' }, { status: 500 });
  const ids = [...new Set((v || []).map((x) => x.asistente_id))];
  if (ids.length === 0) return NextResponse.json({ correos: {} });

  const { data: a } = await admin.from('eu_asistentes').select('id, email').in('id', ids).not('email', 'is', null);
  const correos = {};
  for (const x of a || []) correos[x.id] = x.email;
  return NextResponse.json({ correos });
}
