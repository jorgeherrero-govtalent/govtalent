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

// Una dirección dentro del texto: con https://, con www. o un dominio
// suelto con una terminación habitual (telefonica.com, iberdrolaespana.com).
const URL_EN_TEXTO =
  /(https?:\/\/[^\s]+|www\.[^\s]+\.[a-z]{2,}[^\s]*|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|es|org|eu|net|cat|gal|eus|info|io|app|gob\.es)\b[^\s]*)/i;

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
  let texto = String(cuerpo?.texto || '').trim().slice(0, 3000);
  let url = String(cuerpo?.web || '').trim();

  // Mucha gente pega la dirección en la caja de texto y no en el campo de
  // la web. Si hay una, se trata como web y se quita del texto.
  const enTexto = texto.match(URL_EN_TEXTO);
  if (enTexto) {
    if (!url) url = enTexto[1];
    texto = texto.replace(enTexto[1], ' ').replace(/\s+/g, ' ').trim();
  }

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

  // A partir de aquí la respuesta es un FLUJO: una línea JSON por paso
  // (NDJSON), que la pantalla va pintando según llega. Es lo que hacía el
  // análisis de sector y lo que hace que la espera se vea como trabajo:
  // «leyendo telefonica.com», «buscando "autoconsumo" (3 de 12)»,
  // «evaluando 84 asuntos». Todo es real, nada de barras inventadas.
  //
  // Fases: web · web_ok · web_fallo · criterios · criterios_ok · buscando ·
  // candidatos · evaluando · fin · error
  const encoder = new TextEncoder();
  const flujo = new ReadableStream({
    async start(controller) {
      const emitir = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        // --- La web, si la hay -----------------------------------------
        // Las portadas corporativas grandes pesan varios MB y muchas
        // bloquean a los bots: se lee como un navegador y solo el
        // principio, que es donde están el título, la descripción y el
        // primer texto.
        let web = '';
        let dominio = '';
        let avisoWeb = null;
        if (url) {
          const normalizada = /^https?:\/\//i.test(url) ? url.replace(/^http:/i, 'https:') : `https://${url}`;
          try {
            dominio = new URL(normalizada).hostname.replace(/^www\./, '');
          } catch {
            dominio = '';
          }
          emitir({ fase: 'web', dominio });
          try {
            web = textoDeHtml(
              await safeFetchText(normalizada, { maxBytes: 1536 * 1024, truncar: true, navegador: true, timeoutMs: 12000 })
            );
          } catch (e) {
            console.warn('[alarmas/proponer] web no leída', normalizada, e.message);
            web = '';
          }
          // Una web hecha solo con JavaScript devuelve casi nada: eso
          // tampoco cuenta como leída.
          if (web.length < 150) web = '';
          if (web) {
            emitir({ fase: 'web_ok', dominio, titulo: web.split('\n')[0].slice(0, 120) });
          } else if (dominio) {
            avisoWeb = `No he podido leer ${dominio}. He usado lo que se sabe públicamente de esa organización: revisa los criterios.`;
            emitir({ fase: 'web_fallo', dominio });
          }
        }
        if (!texto && !web && !dominio) {
          emitir({ fase: 'error', error: 'No he podido leer esa web. Escribe en una frase a qué os dedicáis.' });
          return;
        }

        // --- 1. Criterios ------------------------------------------------
        emitir({ fase: 'criterios' });
        const propuesta = await proponer(texto, web, dominio);
        if (propuesta.keywords.length === 0) {
          emitir({
            fase: 'error',
            error: texto
              ? 'No he sabido sacar criterios de eso. Prueba a describirlo con otras palabras.'
              : `No tengo datos suficientes sobre ${dominio || 'esa organización'}. Escribe en una o dos frases a qué os dedicáis.`,
          });
          return;
        }
        emitir({
          fase: 'criterios_ok',
          nombre: propuesta.nombre,
          temas: propuesta.criterios.temas,
          keywords: propuesta.keywords,
        });

        // --- 2. Lo que ya está abierto -----------------------------------
        const filas = await candidatos(db, propuesta.keywords, {
          alBuscar: (p) => emitir({ fase: 'buscando', ...p }),
        });
        emitir({ fase: 'candidatos', n: filas.length });

        // --- 3. Lo que encaja de verdad ----------------------------------
        // Lo que manda en la alarma es lo que escribió el usuario. Si solo
        // dio la web, se guarda el resumen del agente con el dominio, para
        // que al editar la alarma se entienda de dónde salió.
        const descripcion =
          texto || [dominio ? `Organización: ${dominio}.` : '', propuesta.criterios.resumen].filter(Boolean).join(' ');
        emitir({ fase: 'evaluando', n: filas.length });
        const encaja = await evaluar({ descripcion, criterios: propuesta.criterios }, filas);

        emitir({
          fase: 'fin',
          propuesta: { ...propuesta, descripcion },
          encaja,
          revisados: filas.length,
          aviso_web: avisoWeb,
          nivel,
          propuestas_restantes: Math.max(0, limites.propuestas_mes - usadas - 1),
        });
      } catch (e) {
        console.error('[alarmas/proponer]', e);
        emitir({ fase: 'error', error: 'El agente no ha podido preparar la alarma. Inténtalo de nuevo en un momento.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(flujo, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Sin esto, algunos proxies acumulan la respuesta y la entregan de
      // golpe al final, que es justo lo que se quiere evitar.
      'X-Accel-Buffering': 'no',
    },
  });
}
