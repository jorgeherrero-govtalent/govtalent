// =====================================================================
// RUTA TEMPORAL — Carga de las fuentes de la fase 5 (sql/78)
// app/api/debug/cargar-fuentes/route.js
//
// Importa a fuentes_personas las personas extraídas de:
//   · Lista del Cuerpo Diplomático (MAEC, 30/09/2026)
//   · Embajadores de España (web del MAEC, 07/10/2026)
//   · EU Whoiswho: agencias, CESE, Tribunal de Cuentas, BEI-FEI, Consejo
//     Europeo, personal del Parlamento Europeo y Comisión (sept.-oct. 2026)
// Los datos están en data/fuentes/fase5-2026-10.json (extraídos de los
// PDF y del Excel). Upsert por fuente_clave: se puede lanzar dos veces.
// Después quita lo que ya estaba en ec_people y eu_meps.
//
// Uso: ?key=<DEBUG_KEY>
// BORRAR esta ruta y el JSON tras la carga.
// =====================================================================

import { createAdminClient } from '@/lib/supabase/admin';
import filas from '@/data/fuentes/fase5-2026-10.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }
  const admin = createAdminClient();
  let cargadas = 0;
  const errores = [];
  for (let i = 0; i < filas.length; i += 500) {
    const tanda = filas.slice(i, i + 500).map((f) => ({ extra: {}, ...f }));
    const { error } = await admin.from('fuentes_personas').upsert(tanda, { onConflict: 'fuente_clave' });
    if (error) errores.push(`${i}: ${error.message}`);
    else cargadas += tanda.length;
  }
  const { data: dedupe, error: errDedupe } = await admin.rpc('fuentes_personas_deduplicar');
  const { data: resumen } = await admin.from('fuentes_personas').select('fuente').limit(20000);
  const porFuente = {};
  for (const r of resumen || []) porFuente[r.fuente] = (porFuente[r.fuente] || 0) + 1;
  return Response.json({ total_json: filas.length, cargadas, errores, deduplicado: dedupe || errDedupe?.message, por_fuente: porFuente });
}
