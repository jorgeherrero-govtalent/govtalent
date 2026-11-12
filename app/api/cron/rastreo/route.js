// =====================================================================
// RUTA TEMPORAL DE DESARROLLO — cola de páginas que leer
// app/api/cron/rastreo/route.js
//
// Para escribir los lectores de composición de Aragón, Canarias,
// Castilla y León y Castilla-La Mancha hace falta ver el HTML real, y
// desde el entorno de desarrollo no se llega a esas webs. Esta ruta lee,
// desde Vercel y como GovTalentBot (lib/ccaa/web.js: robots.txt,
// Crawl-delay y certificados), las URL pendientes de la tabla
// `debug_rastreo` (sql/115) y guarda en ella el HTML (sin <script> ni
// <style>), el código HTTP y los enlaces. Lo que prohíbe el robots.txt
// no se pide: queda en estado «robots».
//
// Las URL se encolan a mano en Supabase. Ya no tiene cron (quitado el
// 12-11-2026): se lanza a mano con ?key=<DEBUG_KEY>. Una URL de la propia GovTalent
// (https://govtalent.app/api/sync/…) se llama con el CRON_SECRET y se
// guarda su respuesta JSON: sirve para probar los lectores en seco.
//
// Uso: cron (CRON_SECRET) o ?key=<DEBUG_KEY>[&n=40]
// BORRAR (ruta, cron y tabla) al terminar los lectores.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { crearWeb, enlacesDe } from '@/lib/ccaa/web';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const FIN_MS = 240000;
const MAX_HTML = 600000;
const PROPIA = 'https://govtalent.app';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

const limpiar = (h) => h.replace(/<(style|svg|noscript)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<script\b(?![^>]*application\/(ld\+)?json)[\s\S]*?<\/script>/gi, ' ');

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && String(sp.get('key') || '').toLowerCase() === process.env.DEBUG_KEY.toLowerCase();
  if (!isCron && !isManual) return Response.json({ error: 'no autorizado' }, { status: 401 });

  const t0 = Date.now();
  const db = admin();
  const n = Math.min(200, Number(sp.get('n')) || 80);
  const { data: pendientes, error } = await db.from('debug_rastreo').select('id, url').eq('estado', 'pendiente').is('leido_en', null).order('id').limit(n);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!pendientes?.length) return Response.json({ pendientes: 0 });

  // Un hilo por sitio (la web ya pone una petición cada vez por sitio y
  // respeta su Crawl-delay); los sitios van en paralelo.
  const porOrigen = new Map();
  for (const p of pendientes) {
    const o = new URL(p.url).origin;
    if (!porOrigen.has(o)) porOrigen.set(o, []);
    porOrigen.get(o).push(p);
  }
  const web = crearWeb();
  const hechos = { hecho: 0, robots: 0, error: 0 };

  // Llamadas a la propia GovTalent: una cada vez, sin pasar por la web.
  const propias = porOrigen.get(PROPIA) || [];
  porOrigen.delete(PROPIA);
  for (const p of propias.slice(0, 1)) {
    const u = new URL(p.url);
    const fila = { leido_en: new Date().toISOString() };
    // Se marca antes de llamar: el cron siguiente no la repite aunque tarde.
    await db.from('debug_rastreo').update({ leido_en: fila.leido_en }).eq('id', p.id);
    if (!u.pathname.startsWith('/api/sync/')) {
      Object.assign(fila, { estado: 'error', error: 'solo /api/sync/' });
    } else {
      try {
        const r = await fetch(p.url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, cache: 'no-store', signal: AbortSignal.timeout(700000) });
        const t = await r.text();
        Object.assign(fila, { estado: 'hecho', status: r.status, tipo: 'json', bytes: t.length, html: t.slice(0, MAX_HTML) });
      } catch (e) {
        Object.assign(fila, { estado: 'error', error: String(e.message || e).slice(0, 500) });
      }
    }
    hechos[fila.estado] += 1;
    await db.from('debug_rastreo').update(fila).eq('id', p.id);
  }
  await Promise.all([...porOrigen.values()].map(async (lista) => {
    for (const p of lista) {
      if (Date.now() - t0 > FIN_MS) return;
      const fila = { leido_en: new Date().toISOString() };
      try {
        const r = await web.binario(p.url);
        const tipo = r.tipo || '';
        fila.status = r.status;
        fila.tipo = tipo.slice(0, 120);
        fila.url_final = r.url;
        fila.bytes = r.buf.length;
        if (/pdf|octet|image/i.test(tipo)) {
          fila.html = null;
        } else {
          const cs = (tipo.match(/charset=([\w-]+)/i) || [])[1]?.toLowerCase()
            || (r.buf.subarray(0, 600).toString('latin1').match(/charset=["']?([\w-]+)/i) || [])[1]?.toLowerCase();
          const texto = new TextDecoder(cs && /iso-8859-1|latin1|windows-1252/.test(cs) ? 'latin1' : 'utf-8').decode(r.buf);
          fila.html = limpiar(texto).slice(0, MAX_HTML);
          fila.enlaces = enlacesDe(texto, r.url).slice(0, 1500).map((a) => [a.texto.replace(/\s+/g, ' ').trim().slice(0, 120), a.href]);
        }
        fila.estado = 'hecho';
      } catch (e) {
        fila.estado = e.robots ? 'robots' : 'error';
        fila.status = e.status || null;
        fila.error = String(e.message || e).slice(0, 500) + (e.cuerpo ? ` | ${e.cuerpo.slice(0, 300)}` : '');
      }
      hechos[fila.estado] += 1;
      await db.from('debug_rastreo').update(fila).eq('id', p.id);
    }
  }));
  return Response.json({ ...hechos, ms: Date.now() - t0 });
}
