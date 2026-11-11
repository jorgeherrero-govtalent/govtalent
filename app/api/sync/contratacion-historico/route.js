// =====================================================================
// SYNC — Carga histórica de la Plataforma de Contratación
// app/api/sync/contratacion-historico/route.js
//
// Recorre la cola contratacion_historico (sql/127): un trabajo por feed y
// periodo (un año, AAAA, o un mes, AAAAMM), cada uno con su ZIP de datos
// abiertos. La Plataforma no admite descargas parciales, así que cada ZIP
// se descarga en flujo y se descomprime al vuelo
// (lib/contratacion/zipRemoto.js): cada fichero ATOM se guarda en cuanto
// termina, con la misma función que el sync diario, que nunca pisa una
// versión más reciente. El cursor (siguiente) avanza fichero a fichero:
// si se acaba el tiempo, la pasada siguiente vuelve a descargar el ZIP y
// atraviesa sin descomprimir lo que ya se hizo.
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
import { recorrerZip } from '@/lib/contratacion/zipRemoto';
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

/** Recorre el ZIP del trabajo, probando los dominios conocidos. */
async function recorrer(feed, periodo, urlGuardada, opciones) {
  const urls = urlGuardada ? [urlGuardada] : urlsDe(feed, periodo);
  let ultimo;
  for (const url of urls) {
    try {
      return { url, ...(await recorrerZip(url, opciones)) };
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

  // ---- Muestra: la n-ésima entrada del primer fichero, sin guardar ----
  if (sp.get('muestra') === '1') {
    const feed = sp.get('feed') || 'perfiles';
    const periodo = sp.get('periodo') || '202601';
    let out = {};
    try {
      let visto = false;
      const r = await recorrer(feed, periodo, null, {
        desde: 0,
        debeParar: () => visto || Date.now() - t0 > 200000,
        onFichero: async ({ nombre, texto }) => {
          visto = true;
          const entradas = texto.split('<entry').slice(1);
          const n = Math.min(Math.max(0, Number(sp.get('n') || 0)), entradas.length - 1);
          out = { nombre, entradas_en_fichero: entradas.length, entrada: entradas.length ? `<entry${entradas[n].split('</entry>')[0].slice(0, 30000)}</entry>` : null };
        },
      });
      return Response.json({ url: r.url, mb_leidos: Math.round(r.bytes / 1e5) / 10, ...out, ms: Date.now() - t0 });
    } catch (e) {
      return Response.json({ ok: false, error: String(e.message || e), status: e.status || null });
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
    await db.from('contratacion_historico').update({ estado: 'en_curso', actualizado_en: new Date().toISOString() }).eq('id', t.id);
    let r;
    try {
      r = await recorrer(t.feed, t.periodo, t.url, {
        desde: t.siguiente || 0,
        debeParar: () => Date.now() - t0 > PRESUPUESTO_MS - MARGEN_MS,
        onFichero: async ({ indice, texto }) => {
          const entradas = leerEntradas(texto);
          const g = await guardar(db, t.feed, entradas);
          const bajas = await aplicarBajas(db, t.feed, leerBajas(texto));
          salida.ficheros += 1;
          salida.entradas += entradas.length;
          salida.guardadas += g.guardadas;
          salida.omitidas += g.omitidas;
          salida.bajas += bajas;
          await db
            .from('contratacion_historico')
            .update({
              siguiente: indice + 1,
              entradas: (t.entradas || 0) + salida.entradas,
              guardadas: (t.guardadas || 0) + salida.guardadas,
              error: null,
              actualizado_en: new Date().toISOString(),
            })
            .eq('id', t.id);
        },
      });
    } catch (e) {
      const noExiste = e.status === 404;
      salida.error = String(e.message || e).slice(0, 500);
      await db
        .from('contratacion_historico')
        .update({ estado: noExiste ? 'no_existe' : 'en_curso', error: salida.error, actualizado_en: new Date().toISOString() })
        .eq('id', t.id);
      if (noExiste) continue;
      res.ok = false;
      break;
    }
    salida.mb = Math.round(r.bytes / 1e5) / 10;
    await db
      .from('contratacion_historico')
      .update({
        url: r.url,
        ...(r.terminado ? { estado: 'hecho', ficheros: r.ficheros_vistos } : {}),
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', t.id);
    if (!r.terminado) break; // sin tiempo: sigue en la próxima pasada
  }
  res.ms = Date.now() - t0;
  return Response.json(res);
}
