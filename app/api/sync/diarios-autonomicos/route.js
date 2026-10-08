// =====================================================================
// SYNC — Diarios oficiales autonómicos (piloto)
// app/api/sync/diarios-autonomicos/route.js
//
// Lee el sumario del día de cada diario (lib/diarios/<ccaa>.js), decide
// qué entra según el alcance aprobado el 08-10-2026 (lib/diarios/comun.js)
// y lo guarda en diarios_ccaa (sql/84). De ahí pasa a regulatorio_search
// como kind 'diario' y lo evalúan las alarmas sin más cambios.
//
// Piloto: Galicia (DOG), Madrid (BOCM), Murcia (BORM, en pruebas),
// País Vasco (BOPV) y Extremadura (DOE).
//
// Una entrada ya guardada no se vuelve a escribir: así detectado_en
// conserva la primera vez que GovTalent la vio, que es lo que mide el
// adelanto de los avisos.
//
// Todo va como GovTalentBot y respetando el robots.txt y el Crawl-delay
// de cada sitio (lib/ccaa/web.js).
//
// Uso:
//   cron (CRON_SECRET)                      todos, guarda
//   ?key=<DEBUG_KEY>&dry=1                  lee y clasifica, sin guardar
//   ?key=<DEBUG_KEY>&dry=1&debug=1          además, muestras de lo que llega
//   ?key=<DEBUG_KEY>&dry=1&p=galicia        un diario (claves: lib/diarios/comun.js)
//   ?key=<DEBUG_KEY>                        guarda (manual)
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { crearWeb } from '@/lib/ccaa/web';
import { DIARIOS, PILOTO, clasificar, idDiario, rangoDe } from '@/lib/diarios/comun';
import * as galicia from '@/lib/diarios/galicia';
import * as madrid from '@/lib/diarios/madrid';
import * as murcia from '@/lib/diarios/murcia';
import * as paisvasco from '@/lib/diarios/paisvasco';
import * as extremadura from '@/lib/diarios/extremadura';
import * as castillayleon from '@/lib/diarios/castillayleon';
import * as navarra from '@/lib/diarios/navarra';
import * as cataluna from '@/lib/diarios/cataluna';
import * as aragon from '@/lib/diarios/aragon';
import * as asturias from '@/lib/diarios/asturias';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LECTORES = { galicia, madrid, murcia, paisvasco, extremadura, castillayleon, navarra, cataluna, aragon, asturias };

// Cliente de servicio sin caché de Next: si no, las lecturas de Supabase
// pueden quedarse congeladas entre ejecuciones.
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export const GET = conRegistro('/api/sync/diarios-autonomicos', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return Response.json({ error: 'no autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const debug = sp.get('debug') === '1';
  const pedidos = sp.get('p') ? sp.get('p').split(',').map((s) => s.trim()).filter((s) => LECTORES[s]) : PILOTO;
  const web = crearWeb();
  const db = dry ? null : admin();

  const resultados = await Promise.all(pedidos.map(async (ccaa) => {
    const ctx = { debug, diagnostico: {}, vistos: dry ? new Set() : await vistosDe(db, ccaa) };
    try {
      const entradas = await LECTORES[ccaa].leer(web, ctx);
      const r = await procesar(db, ccaa, entradas, { dry, debug });
      if (Object.keys(ctx.diagnostico).length) r.diagnostico = ctx.diagnostico[ccaa] ?? ctx.diagnostico;
      return [ccaa, r];
    } catch (e) {
      return [ccaa, { error: String(e.message || e).slice(0, 300), ...(Object.keys(ctx.diagnostico).length ? { diagnostico: ctx.diagnostico } : {}) }];
    }
  }));

  return Response.json({ ok: true, dry, ms: Date.now() - t0, diarios: Object.fromEntries(resultados) });
}

// Lo ya evaluado en los últimos días (entrara o no), para no volver a
// pedirlo.
const DIAS_VISTOS = 15;
async function vistosDe(db, ccaa) {
  const desde = new Date(Date.now() - DIAS_VISTOS * 86400000).toISOString();
  const { data } = await db.from('diarios_ccaa_vistos').select('id').eq('ccaa', ccaa).gte('visto_en', desde).limit(5000);
  return new Set((data || []).map((r) => r.id));
}

// Algunos RSS enlazan por http; los diarios sirven todo por https.
const https = (u) => (u ? String(u).replace(/^http:\/\//i, 'https://') : u);

/** Clasifica y, si no es prueba, guarda lo nuevo. */
async function procesar(db, ccaa, entradas, { dry, debug }) {
  const d = DIARIOS[ccaa];
  const ahora = new Date().toISOString();
  const filas = [];
  const fuera = [];
  const vistas = [];
  for (const e of entradas) {
    const tipo = e.sinTitulo ? null : clasificar({ seccion: e.seccion, titulo: e.titulo });
    const id = idDiario(ccaa, e.ref);
    // Sin título no se da por vista: se reintenta en la siguiente ejecución.
    if (id && !e.sinTitulo) vistas.push({ id, ccaa, fecha: e.fecha || null, incluido: !!(tipo && e.fecha) });
    if (!tipo || !id || !e.fecha) { fuera.push(e); continue; }
    filas.push({
      id,
      ccaa,
      comunidad: d.comunidad,
      diario: d.diario,
      fecha: e.fecha,
      numero: e.numero || null,
      tipo,
      seccion: e.seccion || null,
      rango: e.rango || rangoDe(e.titulo),
      organo: e.organo || null,
      titulo: String(e.titulo).replace(/\s+/g, ' ').trim().slice(0, 1000),
      url: https(e.url),
      url_pdf: https(e.url_pdf) || null,
      publicado_en: e.publicado_en || null,
      raw: { ref: e.ref, ...(e.materia ? { materia: e.materia } : {}), ...(e.npe ? { npe: e.npe } : {}) },
      updated_at: ahora,
    });
  }

  const porTipo = {};
  for (const f of filas) porTipo[f.tipo] = (porTipo[f.tipo] || 0) + 1;
  const res = { leidas: entradas.length, en_alcance: filas.length, por_tipo: porTipo, fuera: fuera.length };

  if (dry) {
    res.muestra = filas.slice(0, debug ? 40 : 8).map(({ tipo, seccion, rango, organo, titulo, url, fecha }) => ({ tipo, fecha, seccion, rango, organo, titulo: titulo.slice(0, 160), url }));
    res.muestra_fuera = fuera.slice(0, debug ? 30 : 6).map(({ seccion, titulo }) => ({ seccion, titulo: String(titulo || '').slice(0, 140) }));
    return res;
  }

  if (filas.length) {
    // Solo las nuevas: una ya guardada conserva su detectado_en.
    const { data: ins, error } = await db.from('diarios_ccaa').upsert(filas, { onConflict: 'id', ignoreDuplicates: true }).select('id');
    if (error) res.error = error.message.slice(0, 200);
    res.nuevas = ins?.length || 0;
  } else {
    res.nuevas = 0;
  }
  if (vistas.length) {
    const { error } = await db.from('diarios_ccaa_vistos').upsert(vistas, { onConflict: 'id', ignoreDuplicates: true });
    if (error) res.error_vistos = error.message.slice(0, 200);
  }
  return res;
}
