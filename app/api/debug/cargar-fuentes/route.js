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
// Antes de importar quita lo que ya está en ec_people (Comisión) y en
// eu_meps (eurodiputados), por correo.
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

  // Correos que ya tenemos en la Comisión y en el Parlamento Europeo.
  const ya = new Set();
  for (const [tabla, col] of [['ec_people', 'email'], ['eu_meps', 'email']]) {
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await admin.from(tabla).select(col).not(col, 'is', null).range(desde, desde + 999);
      if (error) return Response.json({ error: `${tabla}: ${error.message}` }, { status: 500 });
      for (const r of data || []) ya.add(String(r[col]).toLowerCase());
      if (!data || data.length < 1000) break;
    }
  }
  const nuevas = filas.filter(
    (f) => !(f.email && (f.fuente_clave.startsWith('wiw-com:') || f.fuente_clave.startsWith('wiw-ep:')) && ya.has(f.email.toLowerCase()))
  );

  let cargadas = 0;
  const errores = [];
  for (let i = 0; i < nuevas.length; i += 500) {
    const tanda = nuevas.slice(i, i + 500).map((f) => ({ extra: {}, ...f }));
    const { error } = await admin.from('fuentes_personas').upsert(tanda, { onConflict: 'fuente_clave' });
    if (error) errores.push(`${i}: ${error.message}`);
    else cargadas += tanda.length;
  }
  const { data: resumen } = await admin.from('fuentes_personas').select('fuente').limit(20000);
  const porFuente = {};
  for (const r of resumen || []) porFuente[r.fuente] = (porFuente[r.fuente] || 0) + 1;
  return Response.json({ total_json: filas.length, cargadas, errores, ya_cargadas_antes: filas.length - nuevas.length, por_fuente: porFuente });
}
