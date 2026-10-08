// =====================================================================
// DISPOSICIÓN DE UN DIARIO OFICIAL AUTONÓMICO — enlace
// app/(app)/regulatorio/diarios/[id]/route.js
//
// Es la `ruta` del tipo 'diario' en regulatorio_search (sql/84), así que
// es a donde llevan las alarmas, Novedades y el buscador.
//
// PROVISIONAL, hasta que exista la ficha (pendiente de maquetas): redirige
// a la disposición en el diario oficial. Cuando exista la ficha, este
// fichero se sustituye por un page.js.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DIARIOS } from '@/lib/diarios/comun';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const id = String(params?.id || '');
  const volver = new URL('/regulatorio', request.url);
  if (!/^[a-z]+-[a-z0-9-]{1,80}$/.test(id)) return NextResponse.redirect(volver);

  const supabase = createClient();
  const { data: d } = await supabase.from('diarios_ccaa').select('ccaa, url').eq('id', id).maybeSingle();
  if (!d?.url) return NextResponse.redirect(volver);

  // Solo se redirige al diario de esa comunidad: la URL viene de la base,
  // pero se comprueba el dominio para que esto nunca sea una redirección
  // abierta.
  try {
    const destino = new URL(d.url);
    if (destino.protocol !== 'https:' || !(DIARIOS[d.ccaa]?.hosts || []).includes(destino.hostname)) return NextResponse.redirect(volver);
    return NextResponse.redirect(destino);
  } catch {
    return NextResponse.redirect(volver);
  }
}
