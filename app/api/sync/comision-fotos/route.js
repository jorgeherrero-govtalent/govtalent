// =====================================================================
// MIGRACIÓN DE FOTOS — Comisarios de la Comisión Europea
// app/api/sync/comision-fotos/route.js
//
// Las URLs de commission.europa.eu llevan parámetros ?h= e ?itok= que son
// tokens de la caché de imágenes de Drupal. Pueden caducar sin aviso y
// dejar el directorio con 27 fotos rotas. Este endpoint las descarga una
// vez y las guarda en Supabase Storage.
//
// Se lanza a mano; no tiene cron. Los comisarios cambian con la
// legislatura, no cada noche.
//
// Uso:
//   ?key=<DEBUG_KEY>            sube las que falten
//   ?key=...&force=1            vuelve a subirlas todas
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'ec-photos';
const TIMEOUT_MS = 15000;
// Margen sobre el límite de Vercel: si se agota, devuelve por dónde seguir.
const PRESUPUESTO_MS = 45000;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Solo se descarga de dominios de la UE: la URL viene de base de datos,
// así que conviene no fiarse sin comprobar.
function origenPermitido(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)europa\.eu$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function extension(url, contentType) {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return 'jpg';
  if (contentType?.includes('webp')) return 'webp';
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
    if (buf.length < 1000) return { ok: false, motivo: `imagen sospechosamente pequeña (${buf.length} bytes)` };
    return { ok: true, buffer: buf, contentType: ct };
  } catch (e) {
    return { ok: false, motivo: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const force = sp.get('force') === '1';
  const supabase = admin();

  let query = supabase
    .from('ec_commissioners')
    .select('id, slug, full_name, photo_url, photo_source_url')
    .eq('active', true)
    .order('order_index');
  if (!force) query = query.is('photo_url', null);

  const { data: comisarios, error } = await query;
  if (error) {
    return NextResponse.json({ error: `no se pudo leer ec_commissioners: ${error.message}` }, { status: 500 });
  }

  const informe = {
    inicio: new Date().toISOString(),
    force,
    a_procesar: comisarios.length,
    subidas: 0,
    fallidas: [],
    detalle: [],
  };

  for (const c of comisarios) {
    if (Date.now() - t0 > PRESUPUESTO_MS) {
      informe.cortado_por_tiempo = true;
      informe.nota = 'Vuelve a lanzarlo para continuar con las que falten.';
      break;
    }

    if (!c.photo_source_url || !origenPermitido(c.photo_source_url)) {
      informe.fallidas.push({ slug: c.slug, motivo: 'sin URL de origen válida' });
      continue;
    }

    const d = await descargar(c.photo_source_url);
    if (!d.ok) {
      informe.fallidas.push({ slug: c.slug, motivo: d.motivo });
      continue;
    }

    const ruta = `${c.slug}.${extension(c.photo_source_url, d.contentType)}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(ruta, d.buffer, {
      contentType: d.contentType,
      upsert: true,
    });
    if (upErr) {
      informe.fallidas.push({ slug: c.slug, motivo: `subida: ${upErr.message}` });
      continue;
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(ruta);

    // Solo se escribe photo_url si la subida ha ido bien: si falla, se
    // conserva la que hubiera en lugar de dejar el campo vacío.
    const { error: dbErr } = await supabase
      .from('ec_commissioners')
      .update({ photo_url: pub.publicUrl, updated_at: new Date().toISOString() })
      .eq('id', c.id);

    if (dbErr) {
      informe.fallidas.push({ slug: c.slug, motivo: `guardado: ${dbErr.message}` });
      continue;
    }

    informe.subidas += 1;
    informe.detalle.push({ slug: c.slug, kb: Math.round(d.buffer.length / 1024), url: pub.publicUrl });
  }

  informe.ms_total = Date.now() - t0;
  return NextResponse.json(informe);
}
