// =====================================================================
// MIGRACIÓN DE FOTOS — Diputados del Congreso
// app/api/sync/congreso-diputados-fotos/route.js
//
// La Fase 2 deja en `photo_source_url` la URL de la foto en congreso.es
// (/docu/imgweb/diputados/{cod}_{legislatura}.jpg). Este endpoint la
// descarga y la guarda en Supabase Storage, y escribe en `photo_url` la
// copia propia — que es la que pintan la ficha y el listado.
//
// Mismo reparto que en `ec_commissioners`: el origen se conserva para
// poder rehacer la copia, y lo que se sirve nunca depende de un
// tercero.
//
// QUÉ SE PROCESA. Las que aún no están en Storage, mirando la propia
// `photo_url`: así la primera pasada migra las 350 y las siguientes
// solo tocan a los diputados nuevos, sin necesidad de marcas extra.
//
// Uso:
//   ?key=<DEBUG_KEY>            sube las que falten
//   ?key=...&force=1            vuelve a subirlas todas
//   ?key=...&dry=1              enseña qué haría, sin tocar nada
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUCKET = 'diputados-photos';
// Mismo valor que en la Fase 2. Da nombre a la carpeta dentro del
// bucket, para que una legislatura no pise las fotos de la anterior:
// el codParlamentario se reutiliza.
const LEGISLATURA = 'xv';

const TIMEOUT_MS = 15000;
const PRESUPUESTO_MS = 240000; // margen sobre el tope de 300 s
const PARALELO = 4;
// Un día. Las fotos cambian poco, pero la ruta es estable y se sube con
// upsert: una caché muy larga dejaría la anterior servida semanas.
const CACHE_SEGUNDOS = '86400';
const MARCA_STORAGE = '/storage/v1/object/public/';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

// La URL sale de base de datos, así que no se descarga a ciegas.
function origenPermitido(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)congreso\.es$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function extension(url, contentType) {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return 'jpg';
  const m = String(url).match(/\.(png|jpe?g|webp)(\?|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

async function descargar(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'image/*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, motivo: `HTTP ${res.status}` };
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return { ok: false, motivo: `no es imagen (${ct})` };
    const buf = Buffer.from(await res.arrayBuffer());
    // Cuando falta la foto, el portal devuelve un marcador de pocos
    // bytes en vez de un 404. Guardarlo sería peor que no tener nada.
    if (buf.length < 1000) {
      return { ok: false, motivo: `imagen sospechosamente pequeña (${buf.length} bytes)` };
    }
    return { ok: true, buffer: buf, contentType: ct };
  } catch (e) {
    return { ok: false, motivo: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function migrarUna(supabase, d) {
  if (!d.photo_source_url || !origenPermitido(d.photo_source_url)) {
    return { ok: false, nombre: d.full_name, motivo: 'sin URL de origen válida' };
  }

  const bajada = await descargar(d.photo_source_url);
  if (!bajada.ok) return { ok: false, nombre: d.full_name, motivo: bajada.motivo };

  const ruta = `${LEGISLATURA}/${d.cod_parlamentario}.${extension(d.photo_source_url, bajada.contentType)}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(ruta, bajada.buffer, {
    contentType: bajada.contentType,
    cacheControl: CACHE_SEGUNDOS,
    upsert: true,
  });
  if (upErr) return { ok: false, nombre: d.full_name, motivo: `subida: ${upErr.message}` };

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(ruta);

  // Solo se toca photo_url cuando la subida ha ido bien: si falla, se
  // conserva la de congreso.es en vez de dejar la ficha sin foto.
  const { error: dbErr } = await supabase
    .from('deputies')
    .update({ photo_url: pub.publicUrl })
    .eq('id', d.id);
  if (dbErr) return { ok: false, nombre: d.full_name, motivo: `guardado: ${dbErr.message}` };

  return { ok: true, nombre: d.full_name, kb: Math.round(bajada.buffer.length / 1024), url: pub.publicUrl };
}

// ---------------------------------------------------------------------
export const GET = conRegistro('/api/sync/congreso-diputados-fotos', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const force = sp.get('force') === '1';
  const dry = sp.get('dry') === '1';
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), force, dry_run: dry };

  try {
    const { data: todos, error } = await supabase
      .from('deputies')
      .select('id, full_name, cod_parlamentario, photo_url, photo_source_url')
      .eq('active', true)
      .not('cod_parlamentario', 'is', null)
      .order('id', { ascending: true });
    if (error) throw new Error(`No se pudo leer deputies: ${error.message}`);

    // Pendiente = lo que todavía no se sirve desde Storage.
    const pendientes = force ? todos : todos.filter((d) => !d.photo_url?.includes(MARCA_STORAGE));

    informe.activos = todos.length;
    informe.n_leidos = pendientes.length;

    if (dry) {
      informe.muestra = pendientes.slice(0, 3).map((d) => ({
        nombre: d.full_name,
        origen: d.photo_source_url,
        destino: `${BUCKET}/${LEGISLATURA}/${d.cod_parlamentario}.jpg`,
      }));
      informe.sin_origen = pendientes.filter((d) => !d.photo_source_url).length;
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    const fallidas = [];
    let subidas = 0;
    let i = 0;

    while (i < pendientes.length && Date.now() - t0 < PRESUPUESTO_MS) {
      const lote = pendientes.slice(i, i + PARALELO);
      const res = await Promise.all(lote.map((d) => migrarUna(supabase, d)));
      for (const r of res) {
        if (r.ok) subidas += 1;
        else fallidas.push({ nombre: r.nombre, motivo: r.motivo });
      }
      i += PARALELO;
    }

    const procesadas = Math.min(i, pendientes.length);
    informe.procesadas = procesadas;
    informe.n_escritos = subidas;
    informe.fallidas = fallidas.length;
    informe.detalle_fallos = fallidas.slice(0, 5);

    if (procesadas < pendientes.length) {
      informe.cortado_por_tiempo = true;
      informe.nota = `Quedan ${pendientes.length - procesadas}. Vuelve a lanzarlo para continuar.`;
    } else {
      informe.nota = fallidas.length
        ? `${subidas} fotos en Storage. ${fallidas.length} sin migrar: siguen sirviéndose desde congreso.es.`
        : 'Todas las fotos se sirven ya desde Storage.';
    }

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
