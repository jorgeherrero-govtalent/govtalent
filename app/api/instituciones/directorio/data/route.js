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
//
// CARGA RÁPIDA (04-10-2026, sql/67): ?bloque=0..4 devuelve hasta 5.000
// filas montadas en la base como JSON compacto ({ c: columnas, f: filas
// como listas }). La página pide los 5 bloques a la vez. Antes eran 13
// viajes seguidos de 1.000 filas y en cada uno la base recalculaba la
// vista entera: el directorio tardaba en abrirse ~20 s.
// Cada bloque pesa ~1,9 MB, por debajo del límite de 4,5 MB de respuesta
// de Vercel. ?desde= se mantiene por si queda abierta una pestaña con la
// página antigua.

export const dynamic = 'force-dynamic';

const CHUNK = 1000;
// 25.000 desde el 05-10-2026 (sql/70: la Agenda de la Comunicación suma
// unas 5.800 personas y la vista queda en unas 18.200). Cinco bloques.
const MAX_FILAS = 25000;
const BLOQUE = 5000;
const MAX_BLOQUES = MAX_FILAS / BLOQUE;
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

  const pBloque = new URL(request.url).searchParams.get('bloque');
  if (pBloque !== null) {
    const n = Math.floor(Number(pBloque));
    if (!(n >= 0 && n < MAX_BLOQUES)) return NextResponse.json({ c: [], f: [] });
    const { data, error } = await admin.rpc('directorio_pro_bloque', { p_desde: n * BLOQUE, p_cuantos: BLOQUE });
    if (error) {
      console.error('[directorio/data]', error.message);
      return NextResponse.json({ error: 'No se pudo cargar el directorio' }, { status: 500 });
    }
    // private: solo en el navegador de quien lo ha pedido, nunca en una
    // caché compartida. 10 minutos: volver al directorio es instantáneo y
    // los datos cambian como mucho una vez al día.
    return NextResponse.json(data || { c: [], f: [] }, { headers: { 'Cache-Control': 'private, max-age=600' } });
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
