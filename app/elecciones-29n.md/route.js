// =====================================================================
// Versión en Markdown de /elecciones-29n, para asistentes de IA
// app/elecciones-29n.md/route.js
//
// Todos los datos de la página en texto: resumen, grupos, miembros del
// Gobierno en las listas, candidatos que pueden llegar nuevos y el destino
// de cada uno de los 350 diputados por provincia. Se enlaza desde la
// cabecera de la página (rel="alternate") y desde /llms.txt.
// =====================================================================

import datos from '@/lib/data/elecciones29n.json';
import { markdown } from '@/lib/elecciones29nTexto';

export const dynamic = 'force-static';

export function GET() {
  return new Response(markdown(datos), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
