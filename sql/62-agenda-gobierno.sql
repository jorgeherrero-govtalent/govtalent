// =====================================================================
// ACTO DE LA AGENDA DEL GOBIERNO — enlace
// app/(app)/institutions/agenda/[id]/route.js
//
// Es la `ruta` del tipo 'agenda' en regulatorio_reciente, así que es a
// donde llevan los correos y la pantalla de las alarmas.
//
// PROVISIONAL, hasta que exista la vista de la agenda en GovTalent
// (pendiente de maquetas). Mientras tanto redirige a la agenda oficial
// de ese día en La Moncloa.
// Cuando exista la vista, este fichero se sustituye por un page.js.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const id = String(params?.id || '');
  const supabase = createClient();

  const volver = new URL('/institutions', request.url);
  if (!/^\d{8}-[0-9a-f]{10}$/.test(id)) return NextResponse.redirect(volver);

  const { data: a } = await supabase.from('agenda_actos').select('agenda_url').eq('id', id).maybeSingle();
  if (!a) return NextResponse.redirect(volver);

  // Solo se redirige a La Moncloa: la URL viene de la base, pero se
  // comprueba el dominio para que esto nunca sea una redirección abierta.
  try {
    const destino = new URL(a.agenda_url);
    if (destino.hostname !== 'www.lamoncloa.gob.es') return NextResponse.redirect(volver);
    return NextResponse.redirect(destino);
  } catch {
    return NextResponse.redirect(volver);
  }
}
