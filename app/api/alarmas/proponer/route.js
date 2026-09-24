// =====================================================================
// ALARMAS — el agente propone una alarma
// app/api/alarmas/proponer/route.js
//
// Recibe lo que escribe el usuario (y, si la pega, la web de su
// organización) y devuelve un BORRADOR: nombre, criterios y lo que ya
// está abierto y encaja, con su motivo. No guarda nada: guardar es
// /api/alarmas/guardar, cuando el usuario pulsa «Activar».
//
// Sustituye al análisis de sector (/api/sector/analyze), que hacía lo
// mismo pero sin límite de uso ni registro de coste.
//
// LÍMITE DE USO. Cada propuesta cuesta unos 0,05 $ de IA, lo mismo que
// crear una alarma. Se cuentan en ai_usage_log con el endpoint
// 'alarma-propuesta' y el tope es mensual y depende del plan
// (lib/alarmas.js): 3 en Free y 10 en Pro.
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient as crearClienteSesion } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { safeFetchText } from '@/lib/safeFetch';
import { proponer, candidatos, evaluar, textoDeHtml } from '@/lib/agenteAlarmas';
import { nivelAvisos } from '@/lib/nivelAvisos';
import { limitesDe, LIMITES } from '@/lib/alarmas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENDPOINT = 'alarma-propuesta';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

function inicioDeMes() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function POST(request) {
  const sesion = crearClienteSesion();
  const {
    data: { user },
  } = await sesion.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para crear una alarma.' }, { status: 401 });

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición no válida.' }, { status: 400 });
  }
  const texto = String(cuerpo?.texto || '').trim().slice(0, 3000);
  const url = String(cuerpo?.web || '').trim();

  if (texto.length < 20 && !url) {
    return NextResponse.json(
      { error: 'Cuéntame algo más: a qué se dedica tu organización o qué te preocupa, en una o dos frases.' },
      { status: 400 }
    );
  }

  const db = admin();
  const nivel = await nivelAvisos(db, user.id);
  const limites = limitesDe(nivel);

  // --- Tope mensual de propuestas ------------------------------------
  const { count } = await db
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('endpoint', ENDPOINT)
    .gte('created_at', inicioDeMes());
  const usadas = count || 0;
  if (usadas >= limites.propuestas_mes) {
    return NextResponse.json(
      {
        error:
          nivel === 'pro'
            ? `Has usado las ${limites.propuestas_mes} propuestas de este mes. Puedes seguir editando tus alarmas a mano.`
            : `Has usado las ${limites.propuestas_mes} propuestas de este mes del plan Free. Con Pro tienes ${LIMITES.pro.propuestas_mes} al mes.`,
        limite: true,
      },
      { status: 429 }
    );
  }
  // Se registra antes de llamar a la IA: si la llamada falla a medias, el
  // coste ya se ha producido.
  await db.from('ai_usage_log').insert({ user_id: user.id, endpoint: ENDPOINT });

  try {
    // --- La web, si la hay ---------------------------------------------
    let web = '';
    let avisoWeb = null;
    if (url) {
      try {
        const normalizada = /^https?:\/\//i.test(url) ? url.replace(/^http:/i, 'https:') : `https://${url}`;
        web = textoDeHtml(await safeFetchText(normalizada, { maxBytes: 2 * 1024 * 1024 }));
      } catch (e) {
        // Sin web se sigue con el texto: no merece la pena fallar entero.
        avisoWeb = `No he podido leer la web (${e.message}). He usado solo lo que has escrito.`;
      }
    }
    if (!texto && !web) {
      return NextResponse.json({ error: 'No he podido leer esa web. Escribe en una frase a qué os dedicáis.' }, { status: 400 });
    }

    // --- 1. Criterios ----------------------------------------------------
    const propuesta = await proponer(texto || `Organización cuya web dice: ${web.slice(0, 1500)}`, web);
    if (propuesta.keywords.length === 0) {
      return NextResponse.json({ error: 'No he sabido sacar criterios de eso. Prueba a describirlo con otras palabras.' }, { status: 422 });
    }

    // --- 2 y 3. Lo que ya está abierto y encaja --------------------------
    const filas = await candidatos(db, propuesta.keywords);
    const descripcion = texto || propuesta.criterios.resumen;
    const encaja = await evaluar({ descripcion, criterios: propuesta.criterios }, filas);

    return NextResponse.json({
      propuesta: { ...propuesta, descripcion },
      encaja,
      revisados: filas.length,
      aviso_web: avisoWeb,
      nivel,
      propuestas_restantes: Math.max(0, limites.propuestas_mes - usadas - 1),
    });
  } catch (e) {
    console.error('[alarmas/proponer]', e);
    return NextResponse.json({ error: 'El agente no ha podido preparar la alarma. Inténtalo de nuevo en un momento.' }, { status: 500 });
  }
}
