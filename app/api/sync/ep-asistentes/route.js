// =====================================================================
// SYNC — Asistentes de los eurodiputados (sql/79)
// app/api/sync/ep-asistentes/route.js
//
// Fuente: la pestaña «Asistentes» de la ficha de cada eurodiputado en
// europarl.europa.eu. No hay API ni descarga: se lee la página. Cada
// categoría es un <h4> («Asistentes acreditados», «Asistentes acreditados
// (agrupación)», «Asistentes locales», «Becarios», «Prestadores de
// servicios», «Agentes pagadores»…) seguido de los nombres.
//
// Reglas:
//  · Nunca sobrescribir con vacío: si una ficha falla o no trae ninguna
//    categoría reconocible, se conservan sus vínculos.
//  · Una persona puede estar con varios eurodiputados (agrupación): se
//    guarda una vez (por nombre normalizado) y se vincula a cada uno.
//
// Parámetros:
//   ?pais=ES        eurodiputados de ese país (por defecto ES; «todos» para todos)
//   ?dry=1          no escribe, devuelve lo leído
//   ?debug=<mepId>  devuelve el HTML de la sección y lo que se ha leído
//   ?key=<DEBUG_KEY> para lanzarlo a mano
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TIMEOUT_MS = 20000;
const CONCURRENCIA = 4;

const TIPOS = [
  [/acreditad.*agrupaci|accredited.*group/i, 'acreditado_agrupacion'],
  [/local.*agrupaci|local.*group/i, 'local_agrupacion'],
  [/acreditad|accredited/i, 'acreditado'],
  [/locales?|local/i, 'local'],
  [/becari|trainee/i, 'becario'],
  [/prestador|service provider/i, 'prestador'],
  [/pagador|paying agent/i, 'agente_pagador'],
];

function tipoDe(etiqueta) {
  for (const [re, t] of TIPOS) if (re.test(etiqueta)) return t;
  return null;
}

function entidades(t) {
  return t
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function texto(html) {
  return entidades(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li|span|a|h\d|td|tr|dd|dt)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizar(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Un nombre de persona: letras, sin dos puntos ni cifras, longitud
// razonable y al menos una palabra en mayúsculas (los apellidos del PE).
function pareceNombre(l) {
  if (l.length < 4 || l.length > 90) return false;
  if (/[:@/\d]|http/i.test(l)) return false;
  if (tipoDe(l)) return false;
  return /\p{Lu}{2,}/u.test(l) && /\p{L}/u.test(l);
}

/** HTML de la página → [{ etiqueta, tipo, nombres[] }] */
function leerAsistentes(html) {
  const out = [];
  const re = /<h4[^>]*>([\s\S]*?)<\/h4>/gi;
  const marcas = [];
  let m;
  while ((m = re.exec(html))) {
    const etiqueta = texto(m[1]).join(' ');
    const tipo = tipoDe(etiqueta);
    if (tipo) marcas.push({ etiqueta, tipo, desde: m.index + m[0].length, inicio: m.index });
  }
  for (let i = 0; i < marcas.length; i++) {
    const fin = i + 1 < marcas.length ? marcas[i + 1].inicio : html.length;
    let trozo = html.slice(marcas[i].desde, fin);
    // El último bloque acaba donde empiece otra cosa: otro título, el pie…
    const corte = trozo.search(/<h[1-3][\s>]|<footer|<\/main>|<section/i);
    if (corte >= 0) trozo = trozo.slice(0, corte);
    const nombres = [...new Set(texto(trozo).filter(pareceNombre))];
    if (nombres.length) out.push({ etiqueta: marcas[i].etiqueta, tipo: marcas[i].tipo, nombres });
  }
  return out;
}

function urlFicha(mep) {
  // El tramo del nombre no lo valida el Parlamento, pero se pone igual.
  const nombre = String(mep.full_name || 'x')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
  return `https://www.europarl.europa.eu/meps/es/${mep.id}/${nombre || 'X'}/assistants`;
}

async function pedir(url) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: { 'User-Agent': 'GovTalent/1.0 (+https://govtalent.app)', 'Accept-Language': 'es' },
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, html: await res.text() };
  } catch (e) {
    return { ok: false, status: null, motivo: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(reloj);
  }
}

async function enParalelo(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

async function handler(request) {
  const sp = new URL(request.url).searchParams;
  const secreto = process.env.CRON_SECRET;
  const debugKey = process.env.DEBUG_KEY;
  const auth = request.headers.get('authorization');
  const autorizado =
    (!secreto && !debugKey) || (secreto && auth === `Bearer ${secreto}`) || (debugKey && sp.get('key') === debugKey);
  if (!autorizado) {
    return Response.json({ error: 'no autorizado', pista: 'usa ?key=<DEBUG_KEY> para lanzarlo a mano' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Diagnóstico de una ficha.
  const debug = sp.get('debug');
  if (debug) {
    const { data: mep } = await supabase.from('eu_meps').select('id, full_name').eq('id', debug).maybeSingle();
    const url = urlFicha(mep || { id: debug });
    const r = await pedir(url);
    if (!r.ok) return Response.json({ url, ...r });
    const i = r.html.search(/<h4/i);
    return Response.json({
      url,
      bytes: r.html.length,
      leido: leerAsistentes(r.html),
      html: i >= 0 ? r.html.slice(Math.max(0, i - 500), i + 6000) : r.html.slice(0, 3000),
    });
  }

  const dry = sp.get('dry') === '1';
  const pais = (sp.get('pais') || 'ES').toUpperCase();
  let q = supabase.from('eu_meps').select('id, full_name').eq('active', true);
  if (pais !== 'TODOS') q = q.eq('country_code', pais);
  const { data: meps, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const inicio = new Date().toISOString();
  const leidas = await enParalelo(meps || [], CONCURRENCIA, async (mep) => {
    const r = await pedir(urlFicha(mep));
    if (!r.ok) return { mep, ok: false, motivo: r.status || r.motivo };
    const secciones = leerAsistentes(r.html);
    return { mep, ok: secciones.length > 0, secciones, motivo: secciones.length ? null : 'sin categorías' };
  });

  const informe = {
    pais,
    eurodiputados: leidas.length,
    leidos: leidas.filter((x) => x.ok).length,
    fallidos: leidas.filter((x) => !x.ok).map((x) => ({ id: x.mep.id, nombre: x.mep.full_name, motivo: x.motivo })),
  };

  // Personas únicas y vínculos.
  const personas = new Map(); // norm -> nombre
  const vinculos = [];
  for (const x of leidas) {
    if (!x.ok) continue;
    for (const s of x.secciones) {
      for (const nombre of s.nombres) {
        const norm = normalizar(nombre);
        if (!norm) continue;
        if (!personas.has(norm)) personas.set(norm, nombre);
        vinculos.push({ norm, mep_id: String(x.mep.id), tipo: s.tipo, etiqueta: s.etiqueta });
      }
    }
  }
  informe.personas = personas.size;
  informe.vinculos = vinculos.length;
  informe.por_tipo = vinculos.reduce((a, v) => ((a[v.tipo] = (a[v.tipo] || 0) + 1), a), {});

  if (dry) {
    informe.muestra = leidas.slice(0, 3).map((x) => ({ mep: x.mep.full_name, secciones: x.secciones }));
    return Response.json(informe);
  }

  // 1. Personas (upsert por nombre normalizado).
  const filas = [...personas].map(([nombre_norm, nombre]) => ({ nombre_norm, nombre, activo: true, synced_at: inicio }));
  const ids = new Map();
  for (let i = 0; i < filas.length; i += 500) {
    const { data, error: e } = await supabase
      .from('eu_asistentes')
      .upsert(filas.slice(i, i + 500), { onConflict: 'nombre_norm' })
      .select('id, nombre_norm');
    if (e) return Response.json({ ...informe, error: `personas: ${e.message}` }, { status: 500 });
    for (const f of data || []) ids.set(f.nombre_norm, f.id);
  }

  // 2. Vínculos.
  const vfilas = [];
  const vistos = new Set();
  for (const v of vinculos) {
    const asistente_id = ids.get(v.norm);
    const k = `${asistente_id}|${v.mep_id}|${v.tipo}`;
    if (!asistente_id || vistos.has(k)) continue;
    vistos.add(k);
    vfilas.push({ asistente_id, mep_id: v.mep_id, tipo: v.tipo, etiqueta: v.etiqueta, synced_at: inicio });
  }
  for (let i = 0; i < vfilas.length; i += 1000) {
    const { error: e } = await supabase
      .from('eu_asistentes_meps')
      .upsert(vfilas.slice(i, i + 1000), { onConflict: 'asistente_id,mep_id,tipo' });
    if (e) return Response.json({ ...informe, error: `vínculos: ${e.message}` }, { status: 500 });
  }

  // 3. Lo que ya no figura, solo en las fichas leídas bien.
  const leidosOk = leidas.filter((x) => x.ok).map((x) => String(x.mep.id));
  let retirados = 0;
  for (let i = 0; i < leidosOk.length; i += 100) {
    const { data, error: e } = await supabase
      .from('eu_asistentes_meps')
      .delete()
      .in('mep_id', leidosOk.slice(i, i + 100))
      .lt('synced_at', inicio)
      .select('asistente_id');
    if (!e) retirados += (data || []).length;
  }
  informe.vinculos_retirados = retirados;

  // 4. Personas sin ningún vínculo: inactivas (no se borran).
  const { data: sueltas } = await supabase.rpc('eu_asistentes_desactivar_sueltos');
  informe.desactivados = typeof sueltas === 'number' ? sueltas : null;

  return Response.json(informe);
}

export const GET = conRegistro('/api/sync/ep-asistentes', handler);
