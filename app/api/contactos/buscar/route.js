import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { puedeVerContactos } from '@/lib/accesoContactos';
import { normalizarFiltros, filtrosVacios } from '@/lib/contactosFiltros';

// POST /api/contactos/buscar  body: { filtros, desde?, cuantos? }
// Ejecuta los filtros sobre directorio_pro (sql/75, buscar_contactos).
// Gratis. Solo con el Directorio: los contactos son lo que se vende.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const COLUMNAS = [
  'id', 'nombre', 'cargo', 'unidad', 'institucion', 'jurisdiccion', 'tipo_institucion', 'pais', 'banda',
  'es_titular', 'area', 'email', 'email_unidad', 'telefono', 'direccion_postal', 'localidad', 'provincia',
  'slug', 'fuente', 'fuente_fecha', 'contactabilidad',
];

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
  if (filtrosVacios(filtros)) return NextResponse.json({ total: 0, filas: [] });

  const desde = Math.max(0, Math.floor(Number(body.desde) || 0));
  const cuantos = Math.min(2000, Math.max(1, Math.floor(Number(body.cuantos) || 50)));

  const { data, error } = await admin.rpc('buscar_contactos', { p_filtros: filtros, p_desde: desde, p_cuantos: cuantos });
  if (error) {
    console.error('[contactos/buscar]', error.message);
    return NextResponse.json({ error: 'No se pudo hacer la búsqueda' }, { status: 500 });
  }

  const filas = (data?.filas || []).map((f) => Object.fromEntries(COLUMNAS.map((c) => [c, f[c] ?? null])));
  return NextResponse.json({ total: Number(data?.total) || 0, filas }, { headers: { 'Cache-Control': 'no-store' } });
}
