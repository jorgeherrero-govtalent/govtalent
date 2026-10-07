import { NextResponse } from 'next/server';
import { usuarioConDirectorio, listaAccesible } from '@/lib/listas';

// GET    /api/contactos/listas/:id  → la lista, sus miembros con el dato
//                                     actual y el cambio, e incorporaciones
// PATCH  /api/contactos/listas/:id  body: { nombre }
// DELETE /api/contactos/listas/:id

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

async function guardian(params) {
  const u = await usuarioConDirectorio();
  if (u.error) return { res: NextResponse.json({ error: u.error }, { status: u.status }) };
  if (!(await listaAccesible(u.admin, params.id, u.userId))) {
    return { res: NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 }) };
  }
  return u;
}

export async function GET(_request, { params }) {
  const u = await guardian(params);
  if (u.res) return u.res;
  const { data, error } = await u.admin.rpc('lista_estado', { p_lista: params.id, p_max_incorporaciones: 100 });
  if (error || !data) {
    console.error('[contactos/listas/id]', error?.message);
    return NextResponse.json({ error: 'No se pudo cargar la lista' }, { status: 500 });
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request, { params }) {
  const u = await guardian(params);
  if (u.res) return u.res;
  const body = await request.json().catch(() => ({}));
  const nombre = String(body.nombre || '').trim().slice(0, 120);
  if (!nombre) return NextResponse.json({ error: 'Ponle un nombre a la lista' }, { status: 400 });
  const { error } = await u.admin
    .from('contactos_listas')
    .update({ nombre, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: 'No se pudo renombrar' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  const u = await guardian(params);
  if (u.res) return u.res;
  const { error } = await u.admin.from('contactos_listas').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: 'No se pudo borrar' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
