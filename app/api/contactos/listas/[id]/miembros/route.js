import { NextResponse } from 'next/server';
import { usuarioConDirectorio, listaAccesible, anadirMiembros, tocarLista, MAX_MIEMBROS } from '@/lib/listas';

// POST   /api/contactos/listas/:id/miembros  body: { ids }  añade personas
// DELETE /api/contactos/listas/:id/miembros  body: { ids }  las quita

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function guardian(params) {
  const u = await usuarioConDirectorio();
  if (u.error) return { res: NextResponse.json({ error: u.error }, { status: u.status }) };
  if (!(await listaAccesible(u.admin, params.id, u.userId))) {
    return { res: NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 }) };
  }
  return u;
}

function idsDe(body) {
  return Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, MAX_MIEMBROS) : [];
}

export async function POST(request, { params }) {
  const u = await guardian(params);
  if (u.res) return u.res;
  const ids = idsDe(await request.json().catch(() => ({})));
  if (!ids.length) return NextResponse.json({ error: 'No hay personas que añadir' }, { status: 400 });
  try {
    const anadidas = await anadirMiembros(u.admin, params.id, ids);
    return NextResponse.json({ anadidas });
  } catch (e) {
    console.error('[listas/miembros]', e.message);
    return NextResponse.json({ error: 'No se pudieron añadir' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const u = await guardian(params);
  if (u.res) return u.res;
  const ids = idsDe(await request.json().catch(() => ({})));
  if (!ids.length) return NextResponse.json({ error: 'No hay personas que quitar' }, { status: 400 });
  const { error } = await u.admin.from('contactos_lista_miembros').delete().eq('lista_id', params.id).in('persona_id', ids);
  if (error) return NextResponse.json({ error: 'No se pudieron quitar' }, { status: 500 });
  await tocarLista(u.admin, params.id);
  return NextResponse.json({ ok: true });
}
