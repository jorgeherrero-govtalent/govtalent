import { NextResponse } from 'next/server';
import { usuarioConDirectorio, organizacionDe, anadirMiembros, MAX_MIEMBROS } from '@/lib/listas';
import { normalizarFiltros, filtrosVacios } from '@/lib/contactosFiltros';

// GET  /api/contactos/listas  → las listas que ve el usuario, con cifras y cambios
// POST /api/contactos/listas  body: { nombre, ids?, filtros?, consulta?, todos? }
//   · ids: crea la lista con esas personas (sin búsqueda guardada).
//   · todos + filtros: guarda la búsqueda entera (hasta 2.000) y la
//     recuerda: lo nuevo que cumpla los filtros saldrá como incorporación.

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

export async function GET() {
  const u = await usuarioConDirectorio();
  if (u.error) return NextResponse.json({ error: u.error }, { status: u.status });
  const { data, error } = await u.admin.rpc('listas_resumen', { p_user: u.userId });
  if (error) {
    console.error('[contactos/listas]', error.message);
    return NextResponse.json({ error: 'No se pudieron cargar las listas' }, { status: 500 });
  }
  return NextResponse.json({ listas: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const u = await usuarioConDirectorio();
  if (u.error) return NextResponse.json({ error: u.error }, { status: u.status });
  const { admin, userId } = u;

  const body = await request.json().catch(() => ({}));
  const nombre = String(body.nombre || '').trim().slice(0, 120);
  if (!nombre) return NextResponse.json({ error: 'Ponle un nombre a la lista' }, { status: 400 });

  let ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, MAX_MIEMBROS) : [];
  let filtros = null;
  if (body.todos) {
    filtros = normalizarFiltros(body.filtros || {});
    if (filtrosVacios(filtros)) return NextResponse.json({ error: 'La búsqueda no tiene filtros' }, { status: 400 });
    const { data, error } = await admin.rpc('buscar_contactos', { p_filtros: filtros, p_desde: 0, p_cuantos: MAX_MIEMBROS });
    if (error) return NextResponse.json({ error: 'No se pudo guardar la búsqueda' }, { status: 500 });
    ids = (data?.filas || []).map((f) => f.id);
  }

  const organizationId = await organizacionDe(admin, userId);
  const { data: lista, error } = await admin
    .from('contactos_listas')
    .insert({
      owner_id: userId,
      organization_id: organizationId,
      nombre,
      consulta: body.consulta ? String(body.consulta).slice(0, 500) : null,
      filtros,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[contactos/listas] crear:', error.message);
    return NextResponse.json({ error: 'No se pudo crear la lista' }, { status: 500 });
  }

  let anadidas = 0;
  try {
    if (ids.length) anadidas = await anadirMiembros(admin, lista.id, ids);
  } catch (e) {
    console.error('[contactos/listas] miembros:', e.message);
  }
  return NextResponse.json({ id: lista.id, anadidas });
}
