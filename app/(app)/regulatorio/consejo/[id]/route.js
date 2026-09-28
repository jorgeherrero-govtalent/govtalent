// =====================================================================
// ACUERDO DEL CONSEJO DE MINISTROS — enlace
// app/(app)/regulatorio/consejo/[id]/route.js
//
// Es la `ruta` del tipo 'consejo' en regulatorio_search, así que es a
// donde llevan los correos de aviso, el buscador y las alarmas.
//
// PROVISIONAL, hasta que exista la ficha del acuerdo (pendiente de
// maquetas). Mientras tanto redirige:
//   · si ya se publicó en el BOE → a su ficha del BOE en GovTalent
//   · si ya está en el Congreso  → a su ficha del Congreso
//   · si no                      → a la Referencia oficial de La
//                                  Moncloa, en el punto del acuerdo
//                                  cuando tiene ancla
// Cuando exista la ficha, este fichero se sustituye por un page.js.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const id = String(params?.id || '');
  const supabase = createClient();

  const volver = new URL('/regulatorio', request.url);
  if (!/^\d{8}-[0-9a-f]{10}$/.test(id)) return NextResponse.redirect(volver);

  const { data: a } = await supabase
    .from('consejo_acuerdos')
    .select('referencia_url, ancla, boe_id, congreso_expediente')
    .eq('id', id)
    .maybeSingle();
  if (!a) return NextResponse.redirect(volver);

  if (a.boe_id) {
    const { data: d } = await supabase.from('boe_documents').select('slug').eq('id', a.boe_id).maybeSingle();
    if (d?.slug) return NextResponse.redirect(new URL(`/boe/${d.slug}`, request.url));
  }
  if (a.congreso_expediente) {
    const { data: i } = await supabase
      .from('es_initiatives')
      .select('slug')
      .eq('num_expediente', a.congreso_expediente)
      .limit(1)
      .maybeSingle();
    if (i?.slug) return NextResponse.redirect(new URL(`/congreso/${i.slug}`, request.url));
  }

  // Solo se redirige a La Moncloa: la URL viene de la base, pero se
  // comprueba el dominio para que esto nunca sea una redirección abierta.
  try {
    const destino = new URL(a.referencia_url);
    if (destino.hostname !== 'www.lamoncloa.gob.es') return NextResponse.redirect(volver);
    if (a.ancla) destino.hash = a.ancla;
    return NextResponse.redirect(destino);
  } catch {
    return NextResponse.redirect(volver);
  }
}
