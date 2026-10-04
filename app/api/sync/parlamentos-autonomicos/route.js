// =====================================================================
// SYNC — Parlamentos autonómicos, fase 1 (tramitación legislativa)
// app/api/sync/parlamentos-autonomicos/route.js
//
// Dos pasos en cada ejecución:
//
//   1. LECTURA. Cada lector (lib/ccaa/<parlamento>.js) devuelve los
//      expedientes legislativos con sus trámites y los boletines que hay
//      que leer. Se guardan en ccaa_expedientes, ccaa_tramites y
//      ccaa_boletines (estos, como 'pendiente'). Los expedientes ya
//      cerrados no se vuelven a pedir.
//
//   2. IA. Se leen con IA los boletines pendientes (los más recientes
//      primero), hasta ?ia= por ejecución, y lo que salga se guarda como
//      trámites con su página (lib/lectorBoletines.js). Es lo que da los
//      plazos de enmiendas y sus ampliaciones.
//
// Todo lo que se pide a los parlamentos va como GovTalentBot y respetando
// su robots.txt (lib/ccaa/web.js).
//
// Uso:
//   cron (CRON_SECRET)                          todo, con ia=4
//   ?key=<DEBUG_KEY>&dry=1                      lee y devuelve lo leído, sin guardar ni IA
//   ?key=<DEBUG_KEY>&dry=1&p=rioja              un parlamento
//   ?key=<DEBUG_KEY>&sinia=1                    guarda, sin IA
//   ?key=<DEBUG_KEY>&soloia=1&ia=10             solo la IA, hasta 10 boletines
//   ?key=<DEBUG_KEY>&boletin=<id>               relee con IA un boletín concreto
//   ?key=<DEBUG_KEY>&soloia=1&ia=0              solo clasifica sectores (lib/ccaa/sectores.js)
//   ?key=<DEBUG_KEY>&sectores=0                 sin clasificar sectores
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { crearWeb } from '@/lib/ccaa/web';
import { mismoTitulo } from '@/lib/ccaa/comun';
import { FASE1, PARLAMENTOS, idExpediente, slugExpediente, tipoNorm, claveExpediente } from '@/lib/parlamentosAutonomicos';
import { leerBoletin, guardarActos, MAX_PDF_KB } from '@/lib/lectorBoletines';
import { eventosDeSeguimiento } from '@/lib/ccaa/eventos';
import { clasificarSectores } from '@/lib/ccaa/sectores';
import * as andalucia from '@/lib/ccaa/andalucia';
import * as aragon from '@/lib/ccaa/aragon';
import * as asturias from '@/lib/ccaa/asturias';
import * as cantabria from '@/lib/ccaa/cantabria';
import * as castillayleon from '@/lib/ccaa/castillayleon';
import * as rioja from '@/lib/ccaa/rioja';
import * as valencia from '@/lib/ccaa/valencia';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LECTORES = { andalucia, aragon, asturias, cantabria, castillayleon, rioja, valencia };
const FIN_LECTURA_MS = 150000;
const FIN_TOTAL_MS = 270000;
// La clasificación por sectores tarda hasta ~60 s: solo se lanza si queda
// tiempo; si no, la hace la ejecución siguiente.
const FIN_SECTORES_MS = 200000;
const IA_POR_DEFECTO = 4;

// Cliente de servicio sin caché de Next: si no, las lecturas de Supabase
// pueden quedarse congeladas entre ejecuciones.
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export const GET = conRegistro('/api/sync/parlamentos-autonomicos', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return Response.json({ error: 'no autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const sinIA = dry || sp.get('sinia') === '1';
  const soloIA = sp.get('soloia') === '1' || !!sp.get('boletin');
  const maxIA = Math.min(30, Math.max(0, parseInt(sp.get('ia') || IA_POR_DEFECTO, 10) || 0));
  const pedidos = sp.get('p') ? sp.get('p').split(',').map((s) => s.trim()).filter((s) => LECTORES[s]) : FASE1;
  const db = admin();
  const web = crearWeb();
  const salida = { lectura: {}, ia: [] };
  // Trámites nuevos de esta ejecución, para los avisos de seguimiento.
  const nuevos = [];

  // -------------------------------------------------------------------
  // 1 · Lectura
  // -------------------------------------------------------------------
  if (!soloIA) {
    const { data: conocidos } = await db.from('ccaa_expedientes').select('id, is_closed').in('parlamento', pedidos);
    const cerrados = new Set((conocidos || []).filter((e) => e.is_closed).map((e) => e.id));

    const resultados = await Promise.all(pedidos.map(async (p) => {
      const ctx = {
        saltar: (num) => cerrados.has(idExpediente(p, num)),
        tiempoAgotado: () => Date.now() - t0 > FIN_LECTURA_MS,
        diagnostico: {},
      };
      try {
        const r = await LECTORES[p].leer(web, ctx);
        r.boletines = boletinesUtiles(r);
        if (Object.keys(ctx.diagnostico).length) r.diagnostico = ctx.diagnostico;
        return [p, r];
      } catch (e) {
        return [p, { error: String(e.message || e).slice(0, 300) }];
      }
    }));

    for (const [p, r] of resultados) {
      if (r.error) { salida.lectura[p] = { error: r.error }; continue; }
      if (dry) {
        salida.lectura[p] = {
          expedientes: r.expedientes.length,
          boletines: r.boletines.length,
          ...(sp.get('debug') === '1' ? { detalle: r } : { muestra: r.expedientes.slice(0, 3), boletines_muestra: r.boletines.slice(0, 5) }),
          ...(r.diagnostico ? { diagnostico: r.diagnostico } : {}),
        };
        continue;
      }
      salida.lectura[p] = await guardarLectura(db, p, r, nuevos);
    }
  }

  // -------------------------------------------------------------------
  // 2 · IA sobre los boletines pendientes
  // -------------------------------------------------------------------
  if (!sinIA && maxIA > 0) {
    let q = db.from('ccaa_boletines').select('id, parlamento, numero, fecha, url, url_pdf, kb');
    if (sp.get('boletin')) q = q.eq('id', sp.get('boletin'));
    else q = q.eq('estado', 'pendiente').in('parlamento', pedidos).order('fecha', { ascending: false, nullsFirst: false }).limit(maxIA);
    const { data: pendientes } = await q;
    for (const b of pendientes || []) {
      if (Date.now() - t0 > FIN_TOTAL_MS) break;
      salida.ia.push(await leerUno(db, web, b, nuevos));
    }
  }

  // Complementos de Valencia (comisión y página de participación), una vez
  // que la IA ha creado los expedientes.
  if (!dry && pedidos.includes('valencia') && salida.lectura.valencia?.complementos?.length) {
    salida.lectura.valencia.complementados = await complementar(db, 'valencia', salida.lectura.valencia.complementos);
    delete salida.lectura.valencia.complementos;
  }

  // -------------------------------------------------------------------
  // 3 · Sectores de los expedientes nuevos (una llamada, solo los que no
  //     tienen todavía)
  // -------------------------------------------------------------------
  if (!dry && sp.get('sectores') !== '0' && Date.now() - t0 < FIN_SECTORES_MS) {
    salida.sectores = await clasificarSectores(db);
  }

  if (!dry && nuevos.length) salida.seguimiento = await eventosDeSeguimiento(db, nuevos);

  return Response.json({ ok: true, dry, ms: Date.now() - t0, ...salida });
}

// Qué boletines merece la pena leer con IA: los de expedientes abiertos
// (o sin expediente conocido, como los de Asturias y Valencia) y los
// recientes; de cada expediente, solo los 3 últimos. El historial de los
// expedientes cerrados no da plazos vigentes y dispararía el coste.
const DIAS_BOLETIN_RECIENTE = 45;
const MAX_BOLETINES_POR_EXP = 3;

function boletinesUtiles(r) {
  const limite = new Date(Date.now() - DIAS_BOLETIN_RECIENTE * 86400000).toISOString().slice(0, 10);
  const abiertos = new Set(r.expedientes.filter((e) => !e.is_closed).map((e) => claveExpediente(e.num_expediente)));
  const porExp = new Map();
  for (const b of r.boletines) {
    const k = b.expediente ? claveExpediente(b.expediente) : `·${b.id}`;
    const util = !b.expediente || abiertos.has(k) || (b.fecha && b.fecha >= limite);
    if (!util) continue;
    if (!porExp.has(k)) porExp.set(k, []);
    porExp.get(k).push(b);
  }
  const salida = [];
  for (const lista of porExp.values()) {
    lista.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.id.localeCompare(a.id));
    salida.push(...lista.slice(0, MAX_BOLETINES_POR_EXP));
  }
  return salida;
}

/** Guarda lo leído de un parlamento. */
async function guardarLectura(db, p, r, nuevos = []) {
  const res = { expedientes: r.expedientes.length, nuevos: 0, actualizados: 0, tramites_nuevos: 0, boletines_nuevos: 0, errores: [] };
  const ahora = new Date().toISOString();

  for (const e of r.expedientes) {
    if (!e.num_expediente || !claveExpediente(e.num_expediente) || !e.titulo) continue;
    const id = idExpediente(p, e.num_expediente);
    const fila = {
      id,
      parlamento: p,
      legislatura: PARLAMENTOS[p].legislatura,
      num_expediente: e.num_expediente,
      titulo: e.titulo,
      tipo_norm: tipoNorm(e.tipo, e.titulo),
      slug: slugExpediente(p, e.num_expediente),
      synced_at: ahora,
      updated_at: ahora,
    };
    // Solo lo que se conoce: un null de la web no borra un dato bueno.
    for (const k of ['tipo', 'autor', 'comision', 'fecha_presentacion', 'situacion', 'resultado', 'url', 'raw']) {
      if (e[k] != null && e[k] !== '') fila[k] = e[k];
    }
    if (typeof e.is_closed === 'boolean') fila.is_closed = e.is_closed;

    const { data: previo } = await db.from('ccaa_expedientes').select('id, raw').eq('id', id).maybeSingle();
    if (!previo) fila.fuente = 'ficha';
    // Si el número era provisional y la IA ya puso el impreso, no se pisa.
    if (previo?.raw && previo.raw.num_provisional === false) {
      delete fila.num_expediente;
      delete fila.raw;
    }
    const { error } = await db.from('ccaa_expedientes').upsert(fila, { onConflict: 'id' });
    if (error) { res.errores.push(`${e.num_expediente}: ${error.message}`.slice(0, 200)); continue; }
    if (previo) res.actualizados += 1; else res.nuevos += 1;

    const tram = (e.tramites || [])
      .filter((t) => t.fecha || t.descripcion)
      .map((t) => ({
        expediente_id: id,
        tipo: t.tipo || 'otro',
        fecha: t.fecha || null,
        plazo_hasta: t.plazo_hasta || null,
        descripcion: t.descripcion ? String(t.descripcion).slice(0, 500) : null,
        organo: t.organo || null,
        url: t.url || null,
        origen: 'ficha',
      }));
    if (tram.length) {
      const { data: ins, error: et } = await db.from('ccaa_tramites')
        .upsert(tram, { onConflict: 'expediente_id,tipo,fecha,plazo_hasta', ignoreDuplicates: true })
        .select('expediente_id, tipo, fecha, descripcion, plazo_hasta');
      if (et) res.errores.push(`trámites ${e.num_expediente}: ${et.message}`.slice(0, 200));
      res.tramites_nuevos += ins?.length || 0;
      if (ins?.length && previo) nuevos.push(...ins);
      // Si la ficha ya trae el plazo de enmiendas (Castilla y León), se
      // refleja en el expediente: el más tardío conocido.
      const plazos = tram.filter((t) => ['plazo_enmiendas', 'ampliacion_plazo'].includes(t.tipo) && t.plazo_hasta).map((t) => t.plazo_hasta).sort();
      if (plazos.length) {
        const { data: ex } = await db.from('ccaa_expedientes').select('plazo_enmiendas').eq('id', id).maybeSingle();
        const ultimo = [ex?.plazo_enmiendas, ...plazos].filter(Boolean).sort().pop();
        const n = tram.filter((t) => t.tipo === 'ampliacion_plazo').length;
        await db.from('ccaa_expedientes').update({ plazo_enmiendas: ultimo, ...(n ? { n_ampliaciones: n } : {}) }).eq('id', id);
      }
    }
  }

  if (r.boletines.length) {
    const filas = r.boletines.map((b) => ({ id: b.id, parlamento: p, numero: b.numero, fecha: b.fecha, titulo: b.titulo, url: b.url, url_pdf: b.url_pdf }));
    const { data: ins, error } = await db.from('ccaa_boletines').upsert(filas, { onConflict: 'id', ignoreDuplicates: true }).select('id');
    if (error) res.errores.push(`boletines: ${error.message}`.slice(0, 200));
    res.boletines_nuevos = ins?.length || 0;
  }
  if (r.complementos) res.complementos = r.complementos;
  if (!res.errores.length) delete res.errores;
  return res;
}

/** Descarga un boletín, lo lee con IA y guarda los actos. */
async function leerUno(db, web, b, nuevos = []) {
  const base = { id: b.id };
  try {
    const r = await web.binario(b.url_pdf || b.url);
    const kb = Math.round(r.buf.length / 1024);
    if (r.buf.subarray(0, 4).toString() !== '%PDF') {
      await db.from('ccaa_boletines').update({ estado: 'error', error: `No es un PDF (${r.tipo || 'tipo desconocido'})`, kb }).eq('id', b.id);
      return { ...base, estado: 'error', error: 'no es un PDF' };
    }
    if (kb > MAX_PDF_KB) {
      await db.from('ccaa_boletines').update({ estado: 'omitido', error: `PDF de ${kb} KB, por encima del límite`, kb }).eq('id', b.id);
      return { ...base, estado: 'omitido', kb };
    }
    const { actos, modelo } = await leerBoletin({ parlamento: b.parlamento, numero: b.numero, fecha: b.fecha, pdf: r.buf });
    const g = await guardarActos(db, { parlamento: b.parlamento, boletin: b, actos });
    if (g.nuevos?.length) nuevos.push(...g.nuevos);
    delete g.nuevos;
    await db.from('ccaa_boletines').update({ estado: 'leido', modelo, n_actos: actos.length, kb, error: null, leido_at: new Date().toISOString() }).eq('id', b.id);
    return { ...base, estado: 'leido', kb, actos: actos.length, ...g };
  } catch (e) {
    const msg = String(e.message || e).slice(0, 300);
    await db.from('ccaa_boletines').update({ estado: e.robots ? 'omitido' : 'error', error: msg }).eq('id', b.id);
    return { ...base, estado: 'error', error: msg };
  }
}

/** Aporta comisión y página de la web a expedientes que casan por título. */
async function complementar(db, p, complementos) {
  const { data: exps } = await db.from('ccaa_expedientes').select('id, titulo, titulo_es, comision').eq('parlamento', p);
  let n = 0;
  for (const c of complementos) {
    const e = (exps || []).find((x) => mismoTitulo(x.titulo, c.titulo) || mismoTitulo(x.titulo_es, c.titulo));
    if (!e) continue;
    const cambios = { url: c.url };
    if (c.comision && !e.comision) cambios.comision = c.comision;
    await db.from('ccaa_expedientes').update(cambios).eq('id', e.id);
    n += 1;
  }
  return n;
}
