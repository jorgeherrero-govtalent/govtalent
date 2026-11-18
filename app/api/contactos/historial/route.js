import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/contactos/historial
//
// Las búsquedas de personas que ha hecho el usuario, la más reciente
// primero y sin repetir: lo que enseña el reloj de AI Finder (la home).
// Salen de contactos_busquedas (sql/114), que solo se lee con la clave de
// servicio; aquí se devuelven únicamente las del propio usuario y las que
// tienen frase (origen 'frase' o 'idea'), no los cambios de filtros.

export const dynamic = 'force-dynamic';

const MAX = 60;

export async function GET() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('contactos_busquedas')
    .select('consulta, total, created_at')
    .eq('user_id', authData.user.id)
    .not('consulta', 'is', null)
    .in('origen', ['frase', 'idea'])
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) {
    console.error('[contactos/historial]', error.message);
    return NextResponse.json({ busquedas: [] });
  }

  const vistas = new Set();
  const busquedas = [];
  for (const f of data || []) {
    const consulta = String(f.consulta || '').trim();
    const clave = consulta.toLowerCase();
    if (consulta.length < 3 || vistas.has(clave)) continue;
    vistas.add(clave);
    busquedas.push({ consulta, total: f.total ?? 0, fecha: f.created_at });
    if (busquedas.length >= MAX) break;
  }
  return NextResponse.json({ busquedas });
}
