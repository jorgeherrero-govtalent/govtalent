// =====================================================================
// EXPEDIENTE DE LA CNMC — enlace
// app/(app)/regulatorio/cnmc/[slug]/route.js
//
// Es la `ruta` del tipo 'cnmc' en regulatorio_search (sql/102), así que
// es a donde llevan las alarmas, Novedades y el buscador.
//
// PROVISIONAL, hasta que exista la ficha (pendiente de maquetas): redirige
// a la ficha del expediente en cnmc.es. Cuando exista la ficha, este
// fichero se sustituye por un page.js.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { urlFicha } from '@/lib/cnmc';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const slug = String(params?.slug || '').toLowerCase();
  const volver = new URL('/regulatorio', request.url);
  // Solo slugs con la forma de los de la CNMC: así esto nunca es una
  // redirección abierta.
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return NextResponse.redirect(volver);

  const supabase = createClient();
  const { data } = await supabase.from('cnmc_expedientes').select('slug').eq('slug', slug).maybeSingle();
  if (!data) return NextResponse.redirect(volver);
  return NextResponse.redirect(urlFicha(slug));
}
