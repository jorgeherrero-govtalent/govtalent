import { NextResponse } from 'next/server';
import { usuarioConDirectorio, listaAccesible, anadirMiembros, filasPorIds, tocarLista } from '@/lib/listas';

// POST /api/contactos/listas/:id/cambios  body: { accion, persona_id }
//
//   actualizar  acepta un cambio de cargo o de contacto (la foto pasa a ser el dato actual)
//   quitar      quita a la persona de la lista (p. ej. tras una salida)
//   mantener    ignora la salida y la deja en la lista
//   anadir      añade una incorporación
//   descartar   descarta una incorporación (no vuelve a salir)

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const u = await usuarioConDirectorio();
  if (u.error) return NextResponse.json({ error: u.error }, { status: u.status });
  const { admin, userId } = u;
  if (!(await listaAccesible(admin, params.id, userId))) {
    return NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const accion = String(body.accion || '');
  const personaId = String(body.persona_id || '').slice(0, 120);
  if (!personaId) return NextResponse.json({ error: 'Falta la persona' }, { status: 400 });

  try {
    if (accion === 'actualizar') {
      const [fila] = await filasPorIds(admin, [personaId]);
      if (!fila) return NextResponse.json({ error: 'La persona ya no figura en la fuente' }, { status: 409 });
      const { error } = await admin
        .from('contactos_lista_miembros')
        .update({ snapshot: fila, mantener_salida: false })
        .eq('lista_id', params.id)
        .eq('persona_id', personaId);
      if (error) throw new Error(error.message);
    } else if (accion === 'quitar') {
      const { error } = await admin.from('contactos_lista_miembros').delete().eq('lista_id', params.id).eq('persona_id', personaId);
      if (error) throw new Error(error.message);
    } else if (accion === 'mantener') {
      const { error } = await admin
        .from('contactos_lista_miembros')
        .update({ mantener_salida: true })
        .eq('lista_id', params.id)
        .eq('persona_id', personaId);
      if (error) throw new Error(error.message);
    } else if (accion === 'anadir') {
      await anadirMiembros(admin, params.id, [personaId]);
    } else if (accion === 'descartar') {
      const { data: lista } = await admin.from('contactos_listas').select('descartados').eq('id', params.id).single();
      const descartados = [...new Set([...(lista?.descartados || []), personaId])].slice(-5000);
      const { error } = await admin.from('contactos_listas').update({ descartados }).eq('id', params.id);
      if (error) throw new Error(error.message);
    } else {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }
    await tocarLista(admin, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[listas/cambios]', e.message);
    return NextResponse.json({ error: 'No se pudo aplicar el cambio' }, { status: 500 });
  }
}
