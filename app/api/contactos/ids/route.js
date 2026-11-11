import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { normalizarFiltros, filtrosVacios } from '@/lib/contactosFiltros';

// POST /api/contactos/ids  body: { filtros, registrar?, consulta?, origen? }
// Los ids de las personas que cumplen unos filtros (sql/130). Lo usa la
// Base de datos, que ya tiene las filas: con los ids se queda con las que
// tocan. Gratis. Solo con el Directorio.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const ORIGENES = ['frase', 'idea', 'filtros'];

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const admin = createAdminClient();
  if (!(await puedeVerContactos(admin, authData.user.id))) {
    return NextResponse.json({ error: 'El buscador de contactos es del Directorio, que se contrata aparte' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const filtros = normalizarFiltros(body.filtros || {});
  if (filtrosVacios(filtros)) return NextResponse.json({ ids: null });

  const { data, error } = await admin.rpc('contactos_ids', { p_filtros: filtros });
  if (error) {
    console.error('[contactos/ids]', error.message);
    return NextResponse.json({ error: 'No se pudo hacer la búsqueda' }, { status: 500 });
  }
  const ids = Array.isArray(data) ? data : [];

  // Registro de la búsqueda (sql/114), como hacía el Buscador: solo cuando
  // la página lo pide, al aplicar una búsqueda nueva. Si falla, no se nota.
  if (body.registrar === true) {
    try {
      await admin.from('contactos_busquedas').insert({
        user_id: authData.user.id,
        consulta: body.consulta ? String(body.consulta).trim().slice(0, 500) : null,
        origen: ORIGENES.includes(body.origen) ? body.origen : 'filtros',
        filtros,
        persona: body.persona ? String(body.persona).trim().slice(0, 200) : null,
        total: ids.length,
      });
    } catch (e) {
      console.error('[contactos/ids] registrar:', e.message);
    }
  }

  return NextResponse.json({ ids }, { headers: { 'Cache-Control': 'no-store' } });
}
