// =====================================================================
// SYNC — Verificar correos probables (sql/87, paso 2)
// app/api/sync/verificar-correos/route.js
//
// A cada persona sin correo cuyo organismo tiene patrón (paso 1) se le
// prueban, por orden, el patrón principal y sus alternativas contra el
// servidor de correo (MillionVerifier) hasta dar con una que exista.
//
//   ?dry=1           cuántas quedan y cuántos créditos costaría, sin gastar
//   ?probar=<email>  comprueba un solo correo y devuelve la respuesta
//   ?limite=300      personas por pasada (el cron sigue al día siguiente)
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { aplicarPatron, DOMINIOS_GENERICOS, MIN_MUESTRAS } from '@/lib/patronesCorreo';
import { verificarCorreo, creditosVerificador, hayVerificador } from '@/lib/verificarCorreo';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Con verificación se prueban también patrones que solos no bastarían.
const MIN_FIABILIDAD_VERIFICAR = 0.3;
const MIN_ALTERNATIVA = 0.08;
const MAX_VARIANTES = 3;
const VIGENCIA_DIAS = 180;
const PRESUPUESTO_MS = 240000;
const EN_PARALELO = 6;

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const secreto = process.env.CRON_SECRET;
  const debugKey = process.env.DEBUG_KEY;
  const auth = request.headers.get('authorization');
  const autorizado =
    (!secreto && !debugKey) || (secreto && auth === `Bearer ${secreto}`) || (debugKey && sp.get('key') === debugKey);
  if (!autorizado) return Response.json({ error: 'no autorizado' }, { status: 401 });
  if (!hayVerificador()) return Response.json({ error: 'Falta MILLIONVERIFIER_API_KEY en Vercel' }, { status: 500 });

  const probar = sp.get('probar');
  if (probar) {
    const [v, c] = await Promise.all([verificarCorreo(probar.trim().toLowerCase()), creditosVerificador()]);
    return Response.json({ email: probar, ...v, cuenta: c });
  }
  const dry = sp.get('dry') === '1';
  const limite = Math.min(Math.max(parseInt(sp.get('limite') || '300', 10) || 300, 1), 2000);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Patrones y dominios (paso 1).
  const { data: pats, error: ePat } = await supabase
    .from('email_patrones')
    .select('dominio, patron, fiabilidad, muestras, alternativas, catch_all')
    .gte('fiabilidad', MIN_FIABILIDAD_VERIFICAR)
    .gte('muestras', MIN_MUESTRAS)
    .not('patron', 'is', null);
  if (ePat) return Response.json({ error: ePat.message }, { status: 500 });
  const patPorDom = new Map((pats || []).filter((p) => !DOMINIOS_GENERICOS.has(p.dominio)).map((p) => [p.dominio, p]));

  const doms = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('email_dominios_institucion')
      .select('institucion, dominio')
      .gte('cuota', 0.6)
      .gte('n', 3)
      .range(desde, desde + 999);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    doms.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const domPorInst = new Map(doms.map((d) => [d.institucion, d.dominio]));

  // Personas sin correo.
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('directorio_pro')
      .select('id, nombre, institucion, email')
      .is('email', null)
      .range(desde, desde + 999);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  // Ya verificadas (vigentes).
  const hechas = new Set();
  const desdeFecha = new Date(Date.now() - VIGENCIA_DIAS * 86400000).toISOString();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('correos_verificados')
      .select('persona_id')
      .gte('actualizado', desdeFecha)
      .range(desde, desde + 999);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    for (const r of data || []) hechas.add(r.persona_id);
    if (!data || data.length < 1000) break;
  }

  // Candidatas: persona → variantes a probar, por orden.
  const candidatas = [];
  const vistas = new Set();
  for (const f of filas) {
    if (hechas.has(f.id) || !f.institucion || !f.nombre) continue;
    const dom = domPorInst.get(f.institucion);
    const p = dom && patPorDom.get(dom);
    if (!p || p.catch_all) continue;
    const patrones = [p.patron, ...(p.alternativas || []).filter((a) => a.fiabilidad >= MIN_ALTERNATIVA).map((a) => a.patron)];
    const variantes = [];
    for (const pt of patrones) {
      const e = aplicarPatron(f.nombre, pt, dom);
      if (e && !variantes.some((v) => v.email === e)) variantes.push({ email: e, patron: pt });
      if (variantes.length >= MAX_VARIANTES) break;
    }
    if (!variantes.length) continue;
    // La misma persona en dos fuentes: se verifica una vez.
    const clave = variantes[0].email;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    candidatas.push({ id: f.id, dominio: dom, fiabilidad: Number(p.fiabilidad), variantes });
  }
  candidatas.sort((a, b) => b.fiabilidad - a.fiabilidad);

  const resumen = {
    dry_run: dry,
    pendientes: candidatas.length,
    variantes_max: candidatas.reduce((a, c) => a + c.variantes.length, 0),
    dominios: new Set(candidatas.map((c) => c.dominio)).size,
  };
  if (dry) {
    return Response.json({ ...resumen, creditos_minimos: candidatas.length, cuenta: await creditosVerificador() });
  }

  let gastados = 0;
  let ultimoError = null;
  let erroresSeguidos = 0;

  // Caché de verificaciones.
  const cache = new Map();
  async function comprobar(email) {
    if (cache.has(email)) return cache.get(email);
    const { data } = await supabase.from('email_verificaciones').select('resultado').eq('email', email).maybeSingle();
    if (data) {
      cache.set(email, data.resultado);
      return data.resultado;
    }
    const v = await verificarCorreo(email);
    if (v.resultado !== 'error') {
      await supabase
        .from('email_verificaciones')
        .upsert({ email, resultado: v.resultado, subresultado: v.subresultado, calidad: v.calidad, verificado_at: new Date().toISOString() });
      cache.set(email, v.resultado);
      gastados++;
    } else {
      ultimoError = v.subresultado;
    }
    return v.resultado;
  }

  const catchAll = new Set();
  const cuenta = { ok: 0, catch_all: 0, no_existe: 0, desconocido: 0 };
  const ejemplos = [];
  const cola = candidatas.slice(0, limite);
  let parado = null;

  async function procesar(c) {
    if (catchAll.has(c.dominio)) return;
    const probados = [];
    let final = null;
    for (const v of c.variantes) {
      const r = await comprobar(v.email);
      probados.push({ email: v.email, patron: v.patron, resultado: r });
      if (r === 'error') {
        erroresSeguidos++;
        return; // no se guarda: se reintentará
      }
      erroresSeguidos = 0;
      if (r === 'ok') {
        final = { resultado: 'ok', email: v.email, patron: v.patron };
        break;
      }
      if (r === 'catch_all') {
        catchAll.add(c.dominio);
        final = { resultado: 'catch_all', email: null, patron: null };
        break;
      }
      if (r === 'unknown') {
        final = { resultado: 'desconocido', email: null, patron: null };
        break;
      }
      // invalid / disposable: siguiente variante
    }
    if (!final) final = { resultado: 'no_existe', email: null, patron: null };
    cuenta[final.resultado]++;
    if (final.resultado === 'ok' && ejemplos.length < 15) ejemplos.push({ email: final.email, patron: final.patron, intento: probados.length });
    await supabase.from('correos_verificados').upsert({
      persona_id: c.id,
      email: final.email,
      resultado: final.resultado,
      dominio: c.dominio,
      patron: final.patron,
      probados,
      actualizado: new Date().toISOString(),
    });
  }

  let i = 0;
  async function trabajador() {
    while (i < cola.length) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        parado = parado || 'tiempo';
        return;
      }
      if (erroresSeguidos >= 5) {
        parado = parado || `errores: ${ultimoError}`;
        return;
      }
      const c = cola[i++];
      await procesar(c);
    }
  }
  await Promise.all(Array.from({ length: EN_PARALELO }, trabajador));

  // Dominios que aceptan cualquier dirección: no se vuelven a probar.
  for (const d of catchAll) await supabase.from('email_patrones').update({ catch_all: true }).eq('dominio', d);

  return Response.json({
    ...resumen,
    procesadas: Object.values(cuenta).reduce((a, b) => a + b, 0),
    resultados: cuenta,
    creditos_gastados: gastados,
    dominios_catch_all: [...catchAll],
    parado,
    ejemplos,
    cuenta: await creditosVerificador(),
  });
}

export const GET = conRegistro('/api/sync/verificar-correos', handler);
