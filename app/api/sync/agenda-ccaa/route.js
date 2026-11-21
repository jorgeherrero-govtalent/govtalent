// =====================================================================
// SYNC: AGENDAS DE LOS GOBIERNOS AUTONÓMICOS
// app/api/sync/agenda-ccaa/route.js
//
// Lee la agenda de gobierno de Madrid, Cataluña, Andalucía y la
// Comunitat Valenciana (lib/agendaCcaa) y la guarda en agenda_ccaa_actos
// (sql/141). Es el mismo modelo que la agenda de La Moncloa
// (/api/sync/agenda-gobierno), en una tabla aparte:
//
//   1. Cada comunidad, con su lector. Si una falla, las demás siguen.
//   2. Se guardan todos los actos. Lo que desaparece de un día leído
//      entero se marca «retirado» (no se borra); si vuelve, «vigente».
//      Un día que tenía actos y ahora sale sin ninguno no retira nada:
//      casi siempre es un fallo pasajero de la web.
//   3. Si hay actos NUEVOS de hoy en adelante (sin contar los de las
//      delegaciones territoriales), se lanza la vigilancia de las alarmas
//      (/api/alarmas/vigilar?urgente=agenda), como con La Moncloa: la IA
//      los evalúa y los que afecten salen ya para las alarmas «Al
//      momento»; las de «Cada mañana» y «Los lunes» los reciben en su
//      resumen. Entran por la vista regulatorio_reciente (kind
//      'agenda_ccaa').
//
// FASE 1 (decisión de Jorge, 21-11-2026): sync y alarmas. Seguir a un
// consejero autonómico y el correo de su agenda van después, con
// maquetas.
//
// HORARIO (vercel.json): a las :10 y :40, de 05:00 a 20:40 UTC, todos los
// días. Madrid solo publica el día en curso y Valencia el siguiente.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1              lee y cuenta, sin escribir ni avisar
//   ?key=<DEBUG_KEY>&dry=1&debug=1      además, una muestra de lo leído
//   ?key=<DEBUG_KEY>&c=cataluna         una comunidad (madrid, cataluna,
//                                       andalucia, valenciana)
//   ?key=<DEBUG_KEY>&sinaviso=1         guarda, pero no lanza la vigilancia
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { fetchGob } from '@/lib/fetchGob';
import { LECTORES } from '@/lib/agendaCcaa';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';
const ESPERA_VIGILAR_MS = 240000;
const TIEMPO_PETICION_MS = 25000;
// Cataluña publica con varios días de antelación: hoy y los tres siguientes.
const DIAS_ADELANTE = 3;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

async function pedir(url, headers) {
  const res = await fetchGob(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(TIEMPO_PETICION_MS) });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).hostname} respondió ${res.status}`);
  return texto;
}

const DIA_MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const hoyMadrid = () => DIA_MADRID.format(new Date());
const sumarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export const GET = conRegistro('/api/sync/agenda-ccaa', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const debug = sp.get('debug') === '1';
  const sinAviso = dry || sp.get('sinaviso') === '1';
  const soloUna = sp.get('c');
  if (soloUna && !LECTORES[soloUna]) {
    return NextResponse.json({ error: `c debe ser una de: ${Object.keys(LECTORES).join(', ')}` }, { status: 400 });
  }

  const db = admin();
  const hoy = hoyMadrid();
  const dias = Array.from({ length: DIAS_ADELANTE + 1 }, (_, k) => sumarDias(hoy, k));
  const informe = { inicio: new Date().toISOString(), dry_run: dry, hoy, comunidades: {} };
  const frescos = [];

  for (const [ccaa, leer] of Object.entries(LECTORES)) {
    if (soloUna && soloUna !== ccaa) continue;
    const r = { leidos: 0, nuevos: 0, retirados: 0 };
    informe.comunidades[ccaa] = r;
    try {
      // Lo que ya se tiene de ayer en adelante: para no volver a pedir
      // fichas (Andalucía) y para saber qué es nuevo y qué desaparece.
      const { data: previos, error: eP } = await db
        .from('agenda_ccaa_actos')
        .select('id, fecha, estado, texto, hora, lugar, agenda_url')
        .eq('ccaa', ccaa)
        .gte('fecha', sumarDias(hoy, -1));
      if (eP) throw new Error(eP.message);
      const conocidos = new Map((previos || []).map((p) => [p.id, p]));

      const leido = await leer({ pedir, dias, conocidos });
      // Un mismo acto puede salir dos veces en una lectura: vale el primero.
      const vistos = new Set();
      const actos = (leido.actos || []).filter((a) => a.id && a.fecha && !vistos.has(a.id) && vistos.add(a.id));
      r.leidos = actos.length;
      if (leido.errores?.length) r.errores = leido.errores.slice(0, 5);
      if (debug) r.muestra = actos.slice(0, 15);
      if (debug && leido.diagnostico) r.diagnostico = leido.diagnostico;

      const altas = actos.filter((a) => !conocidos.has(a.id));
      r.nuevos = altas.length;

      // Días leídos enteros (con su página, si la hay) y, de cada uno, lo
      // que se tenía vigente y ya no sale. Solo de hoy en adelante y solo
      // si ese día (en esa página) ha salido algún acto.
      const cubiertos = (leido.fechas || []).map((f) => (typeof f === 'string' ? { fecha: f } : f));
      const bajas = [];
      for (const c of cubiertos) {
        if (c.fecha < hoy) continue;
        const enLectura = actos.filter((a) => a.fecha === c.fecha && (!c.agenda_url || a.agenda_url === c.agenda_url));
        if (enLectura.length === 0) continue;
        const ids = new Set(enLectura.map((a) => a.id));
        for (const p of previos || []) {
          if (p.fecha === c.fecha && p.estado === 'vigente' && (!c.agenda_url || p.agenda_url === c.agenda_url) && !ids.has(p.id)) {
            bajas.push(p.id);
          }
        }
      }
      r.retirados = bajas.length;

      if (!dry) {
        const ahora = new Date().toISOString();
        // detectado_en no va en el payload: en los que ya estaban se
        // conserva el de la primera vez.
        const filas = actos.map((a) => ({ ...a, estado: 'vigente', retirado_at: null, updated_at: ahora }));
        for (let i = 0; i < filas.length; i += 200) {
          const { error } = await db.from('agenda_ccaa_actos').upsert(filas.slice(i, i + 200), { onConflict: 'id' });
          if (error) throw new Error(error.message);
        }
        if (bajas.length) {
          const { error } = await db
            .from('agenda_ccaa_actos')
            .update({ estado: 'retirado', retirado_at: ahora, updated_at: ahora })
            .in('id', bajas);
          if (error) throw new Error(error.message);
        }
      }

      frescos.push(...altas.filter((a) => a.fecha >= hoy && a.nivel !== 'delegacion'));
    } catch (e) {
      r.error = e.message;
    }
  }

  informe.frescos = frescos.length;
  if (!sinAviso && frescos.length > 0) informe.vigilar = await lanzarVigilancia();

  const fallidas = Object.values(informe.comunidades).filter((c) => c.error).length;
  const total = Object.keys(informe.comunidades).length;
  if (fallidas && fallidas === total) informe.error = Object.values(informe.comunidades).find((c) => c.error).error;

  informe.ms_total = Date.now() - t0;
  return NextResponse.json(informe, { status: informe.error ? 500 : 200 });
}

/**
 * Como en la agenda de La Moncloa: se llama a la ruta de la vigilancia,
 * que tiene su propio tiempo máximo y su fila en sync_log, y se espera.
 */
async function lanzarVigilancia() {
  try {
    const res = await fetch(`${SITE_URL}/api/alarmas/vigilar?urgente=agenda`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(ESPERA_VIGILAR_MS),
    });
    const r = await res.json().catch(() => ({}));
    return {
      status: res.status,
      llamadas_ia: r.llamadas_ia ?? null,
      coincidencias: r.coincidencias_nuevas ?? null,
      enviados: r.enviados ?? 0,
      error: r.error || null,
    };
  } catch (e) {
    return { error: e.name === 'TimeoutError' || e.name === 'AbortError' ? 'La vigilancia tardó demasiado; la recogerá la próxima pasada' : e.message };
  }
}
