import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';

// POST /api/contactos/enriquecidos  body: { ids: [...] }  (ids de directorio_pro)
//
// Los correos que ya se encontraron con «Buscar correo» (caché compartida,
// sql/76) para enseñarlos en las fichas en vez del botón. Gratis y solo con
// el Directorio, igual que el resto de contactos.

export const dynamic = 'force-dynamic';

const VIGENCIA_DIAS = 180;

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return NextResponse.json({ resultados: {} }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((x) => String(x).slice(0, 120)).filter(Boolean))].slice(0, 2000);
  if (ids.length === 0) return NextResponse.json({ resultados: {} });

  const desde = new Date(Date.now() - VIGENCIA_DIAS * 86400000).toISOString();
  const resultados = {};
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await admin
      .from('contactos_enriquecidos')
      .select('persona_id, estado, email, telefono, tipo, fuente_url, verificado, created_at')
      .in('persona_id', ids.slice(i, i + 500))
      .eq('estado', 'encontrado')
      .gte('created_at', desde);
    if (error) {
      console.error('[contactos/enriquecidos]', error.message);
      return NextResponse.json({ error: 'No se pudieron cargar' }, { status: 500 });
    }
    for (const f of data || []) {
      const { persona_id, ...resto } = f;
      resultados[persona_id] = resto;
    }
  }
  return NextResponse.json({ resultados });
}
