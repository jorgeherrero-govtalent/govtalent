import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { normalizarFiltros, filtrosVacios } from '@/lib/contactosFiltros';

// POST /api/contactos/facetas  body: { filtros, campo: 'cargo' | 'grupo' | 'institucion' }
// Los valores de una columna con su recuento, para los filtros de las
// cabeceras de la tabla (sql/82).

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return NextResponse.json({ error: 'Disponible con el Directorio' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const campo = ['cargo', 'grupo', 'institucion'].includes(body.campo) ? body.campo : null;
  if (!campo) return NextResponse.json({ valores: [] });
  const filtros = normalizarFiltros(body.filtros || {});
  if (filtrosVacios(filtros)) return NextResponse.json({ valores: [] });

  const { data, error } = await admin.rpc('facetas_contactos', { p_filtros: filtros, p_campo: campo });
  if (error) {
    console.error('[contactos/facetas]', error.message);
    return NextResponse.json({ error: 'No se pudieron cargar' }, { status: 500 });
  }
  return NextResponse.json({ valores: Array.isArray(data) ? data : [] });
}
