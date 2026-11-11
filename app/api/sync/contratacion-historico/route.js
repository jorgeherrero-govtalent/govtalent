// =====================================================================
// SYNC — Carga histórica de la Plataforma de Contratación
// app/api/sync/contratacion-historico/route.js
//
// Recorre la cola contratacion_historico (sql/127): un trabajo por feed y
// periodo (un año, AAAA, o un mes, AAAAMM), cada uno con su ZIP de datos
// abiertos. De cada ZIP se lee el índice y luego los ficheros ATOM de uno
// en uno con descargas parciales (lib/contratacion/zipRemoto.js), y se
// guardan con la misma función que el sync diario, que nunca pisa una
// versión más reciente. El cursor (siguiente) avanza fichero a fichero:
// si se acaba el tiempo, la pasada siguiente sigue por ahí.
//
// Uso:
//   cron (CRON_SECRET)                          avanza la cola
//   ?probar=1&feed=perfiles&periodo=202601      índice del ZIP, sin guardar
//   ?muestra=1&feed=perfiles&periodo=202601     XML de la primera entrada
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { leerEntradas, leerBajas } from '@/lib/contratacion/placsp';
import { guardar, aplicarBajas } from '@/lib/contratacion/guardar';
import { indice, leerFichero } from '@/lib/contratacion/zipRemoto';
import { fetchGob } from '@/lib/fetchGob';
import { HEADERS_BOT } from '@/lib/govtalentBot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 800;

const PRESUPUESTO_MS = 680000;
const MARGEN_MS = 90000;

// Nombre del ZIP de cada feed. El sufijo es _AAAA (año) o _AAAAMM (mes).
const BASES = {
  perfiles: 'sindicacion_643/licitacionesPerfilesContratanteCompleto3',
  agregacion: 'sindicacion_1044/PlataformasAgregadasSinMenores',
  menores: 'sindicacion_1143/contratosMenoresPerfilesContratantes',
};
const DOMINIOS = ['https://contrataciondelsectorpublico.gob.es/sindicacion/', 'https://contrataciondelestado.es/sindicacion/'];

function urlsDe(feed, periodo) {
  return DOMINIOS.map((d) => `${d}${BASES[feed]}_${periodo}.zip`);
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

/** El índice del ZIP, probando los dominios conocidos. */
async function abrir(feed, periodo, urlGuardada) {
  const urls = urlGuardada ? [urlGuardada] : urlsDe(feed, periodo);
  let ultimo;
  for (const url of urls) {
    try {
      const idx = await indice(url);
      return { url, ...idx };
    } catch (e) {
      ultimo = e;
      if (e.status !== 404) break;
    }
  }
  throw ultimo;
}

export const GET = conRegistro('/api/sync/contratacion-historico', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && String(sp.get('key') || '').toLowerCase() === process.env.DEBUG_KEY.toLowerCase();
  if (!isCron && !isManual) return Response.json({ error: 'no autorizado' }, { status: 401 });

  // ---- Tamaños: HEAD de cada ZIP de una lista de periodos ----
  if (sp.get('tamanos') === '1') {
    const feeds = (sp.get('feeds') || 'perfiles,agregacion,menores').split(',');
    const periodos = (sp.get('periodos') || '2022,2023,2024,2025,202601,202610').split(',');
    const out = [];
    for (const feed of feeds) {
      for (const periodo of periodos) {
        for (const url of urlsDe(feed, periodo)) {
          try {
            const r = await fetchGob(url, { method: 'HEAD', headers: HEADERS_BOT, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(30000) });
            out.push({ feed, periodo, url, status: r.status, mb: Math.round(Number(r.headers.get('content-length') || 0) / 1e5) / 10, ranges: r.headers.get('accept-ranges') });
            if (r.status === 200) break;
          } catch (e) {
            out.push({ feed, periodo, url, error: String(e.message || e) });
          }
        }
      }
    }
    return Response.json({ out, ms: Date.now() - t0 });
  }

  // ---- Pruebas, sin guardar nada ----
  if (sp.get('probar') === '1' || sp.get('muestra') === '1') {
    const feed = sp.get('feed') || 'perfiles';
    const periodo = sp.get('periodo') || '202601';
    try {
      const z = await abrir(feed, periodo);
      const out = { url: z.url, bytes: z.total, ficheros: z.entradas.length, primeros: z.entradas.slice(0, 3), ms: 0 };
      if (sp.get('muestra') === '1' && z.entradas.length) {
        const xml = await leerFichero(z.url, z.entradas[0]);
        const i = xml.indexOf('<entry');
        const j = xml.indexOf('</entry>', i);
        out.entradas_en_fichero = (xml.match(/<entry[\s>]/g) || []).length;
        const n = Math.max(0, Number(sp.get('n') || 0));
        // La n-ésima entrada, para ver una con adjudicación o con lotes.
        let a = i;
        let b = j;
        for (let k = 0; k < n && a >= 0; k++) {
          a = xml.indexOf('<entry', b);
          b = xml.indexOf('</entry>', a);
        }
        out.entrada = a >= 0 ? xml.slice(a, Math.min(b + 8, a + 30000)) : null;
      }
      out.ms = Date.now() - t0;
      return Response.json(out);
    } catch (e) {
      return Response.json({ ok: false, error: String(e.message || e), status: e.status || null }, { status: 200 });
    }
  }

  // ---- La cola ----
  const db = admin();
  const res = { ok: true, trabajos: [] };
  while (Date.now() - t0 < PRESUPUESTO_MS - MARGEN_MS) {
    const { data: t } = await db
      .from('contratacion_historico')
      .select('*')
      .in('estado', ['pendiente', 'en_curso'])
      .order('prioridad', { ascending: true })
      .order('periodo', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!t) break;

    const salida = { feed: t.feed, periodo: t.periodo, ficheros: 0, entradas: 0, guardadas: 0, omitidas: 0, bajas: 0 };
    res.trabajos.push(salida);
    let z;
    try {
      z = await abrir(t.feed, t.periodo, t.url);
    } catch (e) {
      const noExiste = e.status === 404;
      await db
        .from('contratacion_historico')
        .update({ estado: noExiste ? 'no_existe' : 'error', error: String(e.message || e).slice(0, 500), actualizado_en: new Date().toISOString() })
        .eq('id', t.id);
      salida.error = String(e.message || e);
      if (!noExiste) {
        res.ok = false;
        break;
      }
      continue;
    }

    const ficheros = z.entradas.filter((e) => /\.atom$/i.test(e.nombre));
    let i = t.siguiente || 0;
    await db
      .from('contratacion_historico')
      .update({ estado: 'en_curso', url: z.url, ficheros: ficheros.length, bytes: z.total, actualizado_en: new Date().toISOString() })
      .eq('id', t.id);

    try {
      while (i < ficheros.length && Date.now() - t0 < PRESUPUESTO_MS - MARGEN_MS) {
        const xml = await leerFichero(z.url, ficheros[i]);
        const entradas = leerEntradas(xml);
        const g = await guardar(db, t.feed, entradas);
        const bajas = await aplicarBajas(db, t.feed, leerBajas(xml));
        i += 1;
        salida.ficheros += 1;
        salida.entradas += entradas.length;
        salida.guardadas += g.guardadas;
        salida.omitidas += g.omitidas;
        salida.bajas += bajas;
        await db
          .from('contratacion_historico')
          .update({
            siguiente: i,
            entradas: (t.entradas || 0) + salida.entradas,
            guardadas: (t.guardadas || 0) + salida.guardadas,
            estado: i >= ficheros.length ? 'hecho' : 'en_curso',
            error: null,
            actualizado_en: new Date().toISOString(),
          })
          .eq('id', t.id);
      }
    } catch (e) {
      res.ok = false;
      salida.error = String(e.message || e).slice(0, 500);
      await db.from('contratacion_historico').update({ error: salida.error, actualizado_en: new Date().toISOString() }).eq('id', t.id);
      break;
    }
    if (i < ficheros.length) break; // sin tiempo: sigue en la próxima pasada
  }
  res.ms = Date.now() - t0;
  return Response.json(res);
}
