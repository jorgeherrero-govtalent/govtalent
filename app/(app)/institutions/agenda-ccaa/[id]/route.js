// =====================================================================
// ACTO DE LA AGENDA DE UN GOBIERNO AUTONÓMICO: enlace
// app/(app)/institutions/agenda-ccaa/[id]/route.js
//
// Es la `ruta` del tipo 'agenda_ccaa' en regulatorio_reciente (sql/141),
// así que es a donde llevan los correos y la pantalla de las alarmas.
//
// PROVISIONAL, como el de la agenda de La Moncloa: hasta que exista la
// vista de la agenda en GovTalent (fase 2, con maquetas), redirige al
// acto en la web de la comunidad.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DOMINIOS } from '@/lib/agendaCcaa';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const id = String(params?.id || '');
  const supabase = createClient();

  const volver = new URL('/institutions', request.url);
  if (!/^(mad|cat|and|val)-[0-9a-z]{1,40}$/.test(id)) return NextResponse.redirect(volver);

  const { data: a } = await supabase.from('agenda_ccaa_actos').select('url, agenda_url').eq('id', id).maybeSingle();
  if (!a) return NextResponse.redirect(volver);

  // Solo a las webs de las comunidades: la URL viene de la base, pero se
  // comprueba el dominio para que esto nunca sea una redirección abierta.
  try {
    const destino = new URL(a.url || a.agenda_url);
    if (destino.protocol !== 'https:' || !DOMINIOS.includes(destino.hostname)) return NextResponse.redirect(volver);
    return NextResponse.redirect(destino);
  } catch {
    return NextResponse.redirect(volver);
  }
}
