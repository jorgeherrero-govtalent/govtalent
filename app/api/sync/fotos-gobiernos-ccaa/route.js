// =====================================================================
// SYNC — Fotos oficiales de los gobiernos autonómicos
// app/api/sync/fotos-gobiernos-ccaa/route.js
//
// Lee la página oficial del Consejo de Gobierno de cada comunidad
// (lib/ccaa/fotosGobierno.js, FUENTES_FOTOS) y guarda sus imágenes con el
// texto que las rodea en ccaa_gobierno_fotos (sql/142). El emparejamiento
// con cada consejero se hace al pintar la ficha.
//
// Una comunidad solo se reemplaza si su lectura trae imágenes: si la web
// falla o cambia, se quedan las de la última lectura buena.
//
// Uso:
//   cron (CRON_SECRET)                       todas, una vez por semana
//   ?key=<DEBUG_KEY>[&g=madrid]              a mano, todas o una
//   ?key=<DEBUG_KEY>&dry=1[&debug=1]         lee sin guardar; debug enseña
//                                            las imágenes de cada página
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { HEADERS_BOT } from '@/lib/govtalentBot';
import { FUENTES_FOTOS, extraerImagenes } from '@/lib/ccaa/fotosGobierno';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NAVEGADOR = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

async function leer(url, navegador) {
  const res = await fetch(url, {
    headers: navegador ? NAVEGADOR : HEADERS_BOT,
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { html: await res.text(), final: res.url || url };
}

async function handler(request) {
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const debug = sp.get('debug') === '1';
  const solo = sp.get('g');
  const slugs = Object.keys(FUENTES_FOTOS).filter((s) => !solo || s === solo);
  const db = dry ? null : admin();
  const informe = [];

  for (const slug of slugs) {
    const { urls, navegador } = FUENTES_FOTOS[slug];
    const fila = { gobierno: slug, imagenes: 0, errores: [] };
    const todas = [];
    const vistas = new Set();
    for (const url of urls) {
      try {
        const { html, final } = await leer(url, navegador);
        for (const img of extraerImagenes(html, final)) {
          if (vistas.has(img.foto_url)) continue;
          vistas.add(img.foto_url);
          todas.push({ ...img, orden: todas.length, fuente_url: url });
        }
      } catch (e) {
        fila.errores.push(`${url}: ${e.message}`);
      }
    }
    fila.imagenes = todas.length;
    if (debug) fila.muestra = todas.map((i) => ({ alt: i.alt, despues: i.despues.slice(0, 80), foto_url: i.foto_url }));

    if (!dry && todas.length) {
      const leido_at = new Date().toISOString();
      const { error: e1 } = await db.from('ccaa_gobierno_fotos').delete().eq('gobierno', slug);
      if (e1) fila.errores.push(`borrar: ${e1.message}`);
      else {
        const { error: e2 } = await db
          .from('ccaa_gobierno_fotos')
          .insert(todas.map((i) => ({ gobierno: slug, ...i, leido_at })));
        if (e2) fila.errores.push(`guardar: ${e2.message}`);
        else fila.guardadas = todas.length;
      }
    }
    if (!fila.errores.length) delete fila.errores;
    informe.push(fila);
  }

  return Response.json({ ok: true, dry, gobiernos: informe });
}

export const GET = conRegistro('/api/sync/fotos-gobiernos-ccaa', handler);
