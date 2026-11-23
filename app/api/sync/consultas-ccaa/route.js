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
// Comunidades (?c=, o todas):
//   cataluna  API de Participa gencat (lib/ccaa/consultasCataluna.js):
//             una petición trae todo, ficha incluida.
//   madrid    exportaciones del Portal de Transparencia
//             (lib/ccaa/consultasMadrid.js). Una ejecución:
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
//   ?key=<DEBUG_KEY>&c=cataluna     solo una comunidad
//   ?key=<DEBUG_KEY>&fichas=todas   reabre también las fichas de lo cerrado
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { FUENTES, leerExportacion, leerFicha, textoDelProyecto, pedir } from '@/lib/ccaa/consultasMadrid';
import { leerConsultas as leerCataluna } from '@/lib/ccaa/consultasCataluna';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 300;

const PRESUPUESTO_MS = 240_000;
const COMUNIDADES = ['cataluna', 'madrid'];

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
  const pedidas = sp.get('c') ? sp.get('c').split(',').filter((c) => COMUNIDADES.includes(c)) : COMUNIDADES;

  const resultados = {};
  for (const c of pedidas) {
    try {
      resultados[c] =
        c === 'cataluna'
          ? await syncCataluna({ supabase, dry, hoy })
          : await syncMadrid({ supabase, dry, hoy, t0, todasLasFichas });
    } catch (e) {
      resultados[c] = { ok: false, errores: [e.message], n_leidos: 0, n_escritos: 0 };
    }
  }
  const vals = Object.values(resultados);
  const leidos = vals.reduce((n, r) => n + (r.n_leidos || 0), 0);
  const escritos = vals.reduce((n, r) => n + (r.n_escritos || 0), 0);
  return Response.json({
    ok: vals.every((r) => r.ok),
    estado: vals.some((r) => !r.ok) && !escritos ? 'error' : 'ok',
    dry,
    n_leidos: leidos,
    n_escritos: escritos,
    duracion_ms: Date.now() - t0,
    ...resultados,
  });
}

/** Lo ya guardado de una comunidad, por tipo y ficha. */
async function guardadasDe(supabase, ccaa) {
  const { data, error } = await supabase
    .from('consultas_publicas')
    .select('id, url_origen, tipo, titulo, fecha_fin, resumen')
    .eq('ambito', 'ccaa')
    .eq('ccaa', ccaa);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((g) => [`${g.tipo}|${g.url_origen}`, g]));
}

/** Inserta o actualiza una consulta autonómica. Devuelve 'nueva', 'actualizada' o un error. */
async function guardar(supabase, ccaa, g, url, cambios) {
  if (g) {
    const { error } = await supabase.from('consultas_publicas').update(cambios).eq('id', g.id);
    return error ? error.message : 'actualizada';
  }
  if (!cambios.titulo) return `sin título: ${url}`;
  const { error } = await supabase.from('consultas_publicas').insert({
    ...cambios,
    ambito: 'ccaa',
    ccaa,
    url_origen: url,
    url_ficha: url,
    detalle_pendiente: false,
  });
  return error ? error.message : 'nueva';
}

// ---------------------------------------------------------------------
// Cataluña: la API trae todo en una petición.
// ---------------------------------------------------------------------
async function syncCataluna({ supabase, dry, hoy }) {
  // Un proceso puede cambiar de tipo si la Generalitat retoca el
  // subtítulo: se busca por la ficha, sea cual sea el tipo guardado.
  const porUrl = new Map([...(await guardadasDe(supabase, 'cataluna')).values()].map((g) => [g.url_origen, g]));
  const filas = await leerCataluna({ conocidas: new Set(porUrl.keys()), hoy });
  if (dry) return { ok: true, n_leidos: filas.length, n_escritos: 0, muestra: filas.slice(0, 40) };
  let nuevas = 0;
  let actualizadas = 0;
  const errores = [];
  for (const f of filas) {
    const { url, ...resto } = f;
    const g = porUrl.get(url);
    const cambios = { ...resto, fecha_captura: new Date().toISOString() };
    if (f.resumen && f.resumen !== g?.resumen) cambios.resumen_generado_at = new Date().toISOString();
    const r = await guardar(supabase, 'cataluna', g, url, cambios);
    if (r === 'nueva') nuevas += 1;
    else if (r === 'actualizada') actualizadas += 1;
    else errores.push(`${r} (${url.split('/').pop()})`);
  }
  return { ok: !errores.length, n_leidos: filas.length, n_escritos: nuevas + actualizadas, nuevas, actualizadas, errores: errores.slice(0, 20) };
}

// ---------------------------------------------------------------------
// Madrid: exportaciones y fichas.
// ---------------------------------------------------------------------
async function syncMadrid({ supabase, dry, hoy, t0, todasLasFichas }) {
  const CCAA = 'madrid';

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
  if (!filas.length) return { ok: false, n_leidos: 0, n_escritos: 0, errores };

  const porClave = await guardadasDe(supabase, CCAA);

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

    const r = await guardar(supabase, CCAA, g, fila.url, cambios);
    if (r === 'nueva') nuevas += 1;
    else if (r === 'actualizada') actualizadas += 1;
    else errores.push(`${r} (${fila.url.split('/').pop()})`);
  }

  return {
    ok: errores.length === 0,
    n_leidos: filas.length,
    n_escritos: nuevas + actualizadas,
    nuevas,
    actualizadas,
    fichas_leidas: fichasLeidas,
    pendientes_por_tiempo: pendientes,
    abiertas: filas.filter((f) => f.fecha_fin && f.fecha_fin >= hoy).length,
    errores: errores.slice(0, 20),
    ...(dry ? { muestra } : {}),
  };
}
