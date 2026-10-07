// =====================================================================
// RUTA TEMPORAL — Prueba de cobertura de enriquecimiento externo (Prospeo)
// app/api/debug/enriquecimiento-prueba/route.js
//
// Mide cuántos emails encuentra Prospeo para una muestra de 48 personas
// (33 diplomáticos sin email nominativo + 15 de la Comisión cuyo email ya
// conocemos, como control). La muestra está en la tabla temporal
// `prueba_enriquecimiento`; esta ruta procesa las filas pendientes, llama a
// la API de Prospeo y guarda el resultado en la misma fila.
//
// Variables de entorno: PROSPEO_API_KEY y DEBUG_KEY.
// Límites del plan gratuito de Prospeo: 1 petición/s, 20/min, 50/día,
// así que se espera 3,2 s entre llamadas.
//
// Uso:
//   ?key=<DEBUG_KEY>          procesa hasta 50 pendientes
//   ?key=<DEBUG_KEY>&n=5      procesa solo 5 (para probar)
//   ?key=<DEBUG_KEY>&ver=1    solo muestra el resumen, sin llamar a Prospeo
//
// BORRAR esta ruta y la tabla `prueba_enriquecimiento` al terminar la prueba.
// =====================================================================

import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ENDPOINT = 'https://api.prospeo.io/enrich-person';
const PAUSA_MS = 3200;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function resumen(supabase) {
  const { data } = await supabase
    .from('prueba_enriquecimiento')
    .select('grupo, estado, email_status');
  const out = {};
  for (const f of data || []) {
    const k = `${f.grupo} · ${f.estado}${f.email_status ? ' · ' + f.email_status : ''}`;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }
  const supabase = createAdminClient();

  if (sp.get('ver')) {
    return Response.json({ resumen: await resumen(supabase) });
  }

  const apiKey = process.env.PROSPEO_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Falta PROSPEO_API_KEY en Vercel' }, { status: 500 });
  }

  const n = Math.min(Math.max(parseInt(sp.get('n') || '50', 10) || 50, 1), 50);
  const { data: filas, error } = await supabase
    .from('prueba_enriquecimiento')
    .select('id, first_name, last_name, company, domain')
    .eq('estado', 'pendiente')
    .order('id')
    .limit(n);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const procesadas = [];
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    let estado = 'error';
    let email = null;
    let emailStatus = null;
    let errorCode = null;
    let respuesta = null;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'X-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          only_verified_email: false,
          data: {
            first_name: f.first_name,
            last_name: f.last_name,
            company_name: f.company,
            company_website: f.domain,
          },
        }),
      });
      respuesta = await res.json().catch(() => null);
      if (res.status === 429) {
        errorCode = 'RATE_LIMIT';
      } else if (respuesta && respuesta.error === false) {
        const e = respuesta.person?.email || null;
        email = e?.email || null;
        emailStatus = e?.status || null;
        estado = email ? 'encontrado' : 'no_encontrado';
      } else {
        errorCode = respuesta?.error_code || `HTTP_${res.status}`;
        if (errorCode === 'NO_MATCH') estado = 'no_encontrado';
      }
    } catch (e) {
      errorCode = String(e?.message || e).slice(0, 200);
    }

    // Un límite de cuota deja la fila pendiente para reintentar otro día.
    const cortar = errorCode === 'RATE_LIMIT' || errorCode === 'INSUFFICIENT_CREDITS';
    await supabase
      .from('prueba_enriquecimiento')
      .update({
        estado: cortar ? 'pendiente' : estado,
        email,
        email_status: emailStatus,
        error_code: errorCode,
        respuesta,
        procesado_at: new Date().toISOString(),
      })
      .eq('id', f.id);
    procesadas.push({ id: f.id, estado, email_status: emailStatus, error_code: errorCode });
    if (cortar) break;
    if (i < filas.length - 1) await dormir(PAUSA_MS);
  }

  return Response.json({ procesadas: procesadas.length, detalle: procesadas, resumen: await resumen(supabase) });
}
