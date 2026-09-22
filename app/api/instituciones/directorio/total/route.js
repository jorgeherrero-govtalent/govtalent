import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Cuántas personas hay en el directorio institucional. Solo el número.
 *
 * POR QUÉ UNA RUTA APARTE Y NO LA DE DATOS. `/data` está cerrada al plan
 * que incluye el directorio, y con razón: devuelve correos y teléfonos.
 * Pero el total es el argumento de venta, así que quien todavía no paga
 * es precisamente quien tiene que verlo, y hasta ahora estaba escrito a
 * mano en tres sitios distintos —el demo del directorio, la home y los
 * correos— con la garantía de que tarde o temprano dejarían de coincidir
 * entre ellos y con la realidad. Ya pasó: el panel del login decía
 * "+12.000" mientras el demo decía "11.843".
 *
 * NO DEVUELVE NI UNA FILA. `head: true` con `count: 'exact'` pide a
 * PostgREST el recuento por cabecera; no viaja ningún dato personal, así
 * que esto no abre nada que el muro de pago estuviera protegiendo.
 *
 * MISMO FILTRO QUE LA RUTA DE DATOS, `objecion = false`. Si contara las
 * filas con objeción, el número prometido sería mayor que el que luego
 * ve quien paga, y quien ejerció su derecho de oposición seguiría
 * sumando en un reclamo comercial.
 *
 * Pide sesión pero no plan: es para usuarios dentro de la aplicación,
 * no para cualquiera que encuentre la URL.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { count, error } = await admin
    .from('directorio_pro')
    .select('id', { count: 'exact', head: true })
    .eq('objecion', false);

  if (error) {
    console.error('[directorio/total]', error.message);
    return NextResponse.json({ error: 'No se pudo contar el directorio' }, { status: 500 });
  }

  return NextResponse.json({ total: count ?? null });
}
