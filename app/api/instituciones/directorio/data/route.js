import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessDatabase } from '@/lib/plan';

// Datos del directorio institucional (vista directorio_pro), solo para
// organizaciones con el plan que lo incluye.
//
// Antes el navegador leía la vista directamente y el plan se comprobaba en
// la propia página, así que cualquiera con la clave pública podía pedir
// los contactos sin pagar (auditoría, punto 6). Ahora la vista está cerrada
// al cliente y esta ruta comprueba el plan en el servidor, filtra las
// objeciones en origen y devuelve un bloque cada vez.

export const dynamic = 'force-dynamic';

const CHUNK = 1000;
const MAX_FILAS = 20000;
const COLUMNAS =
  'id, jurisdiccion, tipo_institucion, pais, institucion, unidad, nombre, cargo, cargo_canonico, banda, orden, es_titular, area, email, email_unidad, telefono, direccion_postal, slug, contactabilidad';

export async function GET(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('organization_members')
    .select('organizations(id, plan, plan_status, claimed, verified)')
    .eq('user_id', authData.user.id)
    .limit(1)
    .maybeSingle();

  const org = membership?.organizations;
  if (!org || !canAccessDatabase(org)) {
    return NextResponse.json({ error: 'Tu plan no incluye el directorio institucional' }, { status: 403 });
  }

  const desde = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get('desde')) || 0));
  if (desde >= MAX_FILAS) {
    return NextResponse.json({ filas: [] });
  }

  const { data, error } = await admin
    .from('directorio_pro')
    .select(COLUMNAS)
    .eq('objecion', false)
    .order('orden', { ascending: true })
    .range(desde, desde + CHUNK - 1);

  if (error) {
    console.error('[directorio/data]', error.message);
    return NextResponse.json({ error: 'No se pudo cargar el directorio' }, { status: 500 });
  }

  return NextResponse.json({ filas: data || [] });
}
