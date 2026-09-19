// =====================================================================
// SYNC — Actividad parlamentaria del Congreso, un tipo por ruta
// app/api/sync/congreso-actividad/[tipo]/route.js
//
//   /api/sync/congreso-actividad/pnl
//   /api/sync/congreso-actividad/comparecencia
//   /api/sync/congreso-actividad/decreto
//
// Cada una tiene su propio cron en vercel.json y descarga su tipo
// entero en una sola invocación, sin relanzarse. La lógica está en
// lib/congresoActividad.js; aquí solo se autoriza y se llama.
//
// POR QUÉ UNA RUTA POR TIPO Y NO UNA PARA TODO. Aislamiento y
// visibilidad: si las comparecencias fallan, las PNL siguen; y en la
// pantalla de syncs cada tipo tiene su propia fila. Si esto hubiera sido
// así en agosto, habríamos visto desde el primer día una fila de
// comparecencias sin actualizar.
//
// Vercel documenta los crones sobre rutas dinámicas; los parámetros en
// la ruta del cron (?tipo=) no lo están. Por eso el tipo va en la ruta.
//
// Uso a mano:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin escribir
//   ?key=<DEBUG_KEY>&pagina=120   retomar desde una página
//   ?key=<DEBUG_KEY>              carga real
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { TIPOS_ACTIVIDAD, sincronizarActividad } from '@/lib/congresoActividad';

export const dynamic = 'force-dynamic';

// 800 s es el máximo de Pro con Fluid compute. Las PNL de madrugada,
// medidas, rondan los 7-8 minutos entre descarga y escritura.
export const maxDuration = 800;

// A partir de aquí no se pide otra página. Quedan ~110 s para guardar la
// última tanda —como mucho 20 páginas— y contestar.
const PRESUPUESTO_MS = 690_000;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js cachea los GET del cliente de Supabase y el sync acaba
      // leyendo siempre lo mismo.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}

// Sin ruta fija: el registro usa la de la petición, que ya lleva el
// tipo. Así cada tipo queda en su fila de la pantalla de syncs.
export const GET = conRegistro(null, handler);

async function handler(request, context) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const params = await context?.params;
  const clave = params?.tipo;
  if (!TIPOS_ACTIVIDAD[clave]) {
    return NextResponse.json(
      { error: `Tipo desconocido: ${clave}`, validos: Object.keys(TIPOS_ACTIVIDAD) },
      { status: 404 }
    );
  }

  const informe = await sincronizarActividad({
    supabase: admin(),
    clave,
    dry: sp.get('dry') === '1',
    desdePagina: Math.max(parseInt(sp.get('pagina') || '1', 10), 1),
    t0,
    presupuestoMs: PRESUPUESTO_MS,
  });

  return NextResponse.json(informe, { status: informe.error ? 500 : 200 });
}
