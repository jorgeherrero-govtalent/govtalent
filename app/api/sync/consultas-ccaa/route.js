// =====================================================================
// SYNC — Consultas públicas de los gobiernos autonómicos
// app/api/sync/consultas-ccaa/route.js
//
// Guarda en consultas_publicas (ambito = 'ccaa', ccaa = <clave>) las
// consultas públicas previas y las audiencias e informaciones públicas de
// los gobiernos autonómicos. Así comparten ficha (/regulatorio/consultas/
// [id]), seguimiento, alarmas y buscador con las de los ministerios.
// Se ven en /parlamentos-autonomicos con la fase «Consulta pública».
//
// De momento, la Comunidad de Madrid (lib/ccaa/consultasMadrid.js). Una
// ejecución:
//   1. lee las dos exportaciones (todo el histórico, dos peticiones);
//   2. abre la ficha de lo nuevo y de lo que sigue abierto (título,
//      resumen y documentos), hasta agotar el presupuesto de tiempo; lo
//      que quede se hace en la siguiente;
//   3. de lo ya cerrado y conocido solo actualiza fechas, temas y
//      consejería, sin volver a abrir la ficha.
//
// Uso:
//   cron (CRON_SECRET)
//   ?key=<DEBUG_KEY>&dry=1          lee y devuelve, sin guardar
//   ?key=<DEBUG_KEY>&fichas=todas   reabre también las fichas de lo cerrado
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { FUENTES, leerExportacion, leerFicha, textoDelProyecto, pedir } from '@/lib/ccaa/consultasMadrid';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 300;

const PRESUPUESTO_MS = 240_000;
const CCAA = 'madrid';

// Cliente con fetch sin caché: sin esto las lecturas de Supabase pueden
// quedarse congeladas entre ejecuciones.
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

function hoyMadrid() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

export const GET = conRegistro('/api/sync/consultas-ccaa', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return Response.json({ error: 'no autorizado' }, { status: 401 });

  const dry = isManual && sp.get('dry') === '1';
  const todasLasFichas = isManual && sp.get('fichas') === 'todas';
  const supabase = admin();
  const hoy = hoyMadrid();

  // 1. Exportaciones.
  const filas = [];
  const errores = [];
  for (const f of FUENTES) {
    try {
      filas.push(...leerExportacion(await pedir(f.url), f.tipo));
    } catch (e) {
      errores.push(`${f.tipo}: ${e.message}`);
    }
  }
  if (!filas.length) {
    return Response.json({ ok: false, estado: 'error', n_leidos: 0, errores }, { status: 502 });
  }

  // Lo que ya está guardado de esta comunidad, por ficha y tipo.
  const { data: guardadas, error: eLeer } = await supabase
    .from('consultas_publicas')
    .select('id, url_origen, tipo, titulo, fecha_fin, resumen')
    .eq('ambito', 'ccaa')
    .eq('ccaa', CCAA);
  if (eLeer) return Response.json({ ok: false, error: eLeer.message }, { status: 500 });
  const porClave = new Map((guardadas || []).map((g) => [`${g.tipo}|${g.url_origen}`, g]));

  // Primero lo que cierra antes: si el tiempo no llega, que no se quede
  // fuera lo abierto.
  const vigente = (f) => (f.fecha_fin && f.fecha_fin >= hoy ? 1 : 0);
  filas.sort((a, b) => vigente(b) - vigente(a) || String(b.fecha_publicacion || '').localeCompare(String(a.fecha_publicacion || '')));

  let nuevas = 0;
  let actualizadas = 0;
  let fichasLeidas = 0;
  let pendientes = 0;
  const muestra = [];

  for (const fila of filas) {
    const g = porClave.get(`${fila.tipo}|${fila.url}`);
    const abierta = fila.fecha_fin && fila.fecha_fin >= hoy;
    const hayQueAbrir = !g || abierta || todasLasFichas;

    const base = {
      ministerio: fila.consejeria || 'Comunidad de Madrid',
      tipo: fila.tipo,
      fecha_inicio: fila.fecha_inicio,
      fecha_fin: fila.fecha_fin,
      temas: fila.temas,
      fecha_captura: new Date().toISOString(),
    };

    let ficha = null;
    if (hayQueAbrir) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        pendientes += 1;
        if (!g) continue;
      } else {
        try {
          ficha = leerFicha(await pedir(fila.url));
          fichasLeidas += 1;
        } catch (e) {
          errores.push(`ficha ${fila.url.split('/').pop()}: ${e.message}`);
          if (!g) continue;
        }
      }
    }

    const cambios = { ...base };
    if (ficha) {
      if (ficha.titulo) cambios.titulo = ficha.titulo;
      if (ficha.consejeria && !fila.consejeria) cambios.ministerio = ficha.consejeria;
      // El resumen es el texto que publica la Comunidad, no uno generado.
      if (ficha.resumen) {
        cambios.resumen = ficha.resumen;
        if (ficha.resumen !== g?.resumen) cambios.resumen_generado_at = new Date().toISOString();
      }
      cambios.documentos = ficha.documentos.length ? ficha.documentos : null;
      cambios.url_documento = textoDelProyecto(ficha.documentos);
    }

    if (dry) {
      if (muestra.length < 60) muestra.push({ existe: !!g, ...cambios, url: fila.url });
      continue;
    }

    if (g) {
      const { error } = await supabase.from('consultas_publicas').update(cambios).eq('id', g.id);
      if (error) errores.push(`${error.message} (${fila.url.split('/').pop()})`);
      else actualizadas += 1;
    } else {
      if (!cambios.titulo) {
        errores.push(`sin título en la ficha: ${fila.url}`);
        continue;
      }
      const { error } = await supabase.from('consultas_publicas').insert({
        ...cambios,
        ambito: 'ccaa',
        ccaa: CCAA,
        url_origen: fila.url,
        url_ficha: fila.url,
        detalle_pendiente: false,
      });
      if (error) errores.push(`${error.message} (${fila.url.split('/').pop()})`);
      else nuevas += 1;
    }
  }

  return Response.json({
    ok: errores.length === 0,
    estado: errores.length && !nuevas && !actualizadas ? 'error' : 'ok',
    dry,
    n_leidos: filas.length,
    n_escritos: nuevas + actualizadas,
    nuevas,
    actualizadas,
    fichas_leidas: fichasLeidas,
    pendientes_por_tiempo: pendientes,
    abiertas: filas.filter((f) => f.fecha_fin && f.fecha_fin >= hoy).length,
    errores: errores.slice(0, 20),
    duracion_ms: Date.now() - t0,
    ...(dry ? { muestra } : {}),
  });
}
