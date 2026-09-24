// =====================================================================
// ALARMAS — vigilancia y envío
// app/api/alarmas/vigilar/route.js
//
// Sustituye a /api/alerts/daily. Aquel comparaba palabras clave con el
// título, sin IA, una vez al día. Este:
//
//   1. EVALÚA. Para cada alarma activa, toma lo que ha entrado en el
//      regulatorio en los últimos siete días y que esa alarma aún no ha
//      visto, y se lo pasa a Claude con la descripción de la alarma.
//      Claude decide qué afecta y por qué. Cada asunto se evalúa UNA
//      sola vez por alarma (sector_alert_seen): da igual cuántas pasadas
//      haya al día, el coste no se multiplica.
//
//   2. RECUERDA PLAZOS (Pro, pasada de la mañana): de lo que ya encontró
//      cada alarma, lo que cruza hoy 30, 14, 7, 3, 1 o 0 días del cierre.
//      Se puede apagar por alarma («Recordarme los plazos»).
//
//   3. ENVÍA según la frecuencia de cada alarma:
//        inmediato → en cada pasada, en cuanto hay algo.
//        diario    → en la primera pasada del día.
//        semanal   → en la primera pasada del lunes.
//      Un solo correo por persona y pasada, con todas sus alarmas.
//
// PLAN. Free: 1 alarma, evaluada solo los lunes y avisada solo los
// lunes. Pro y Teams: hasta 3. Si alguien baja de plan y le sobran
// alarmas activas, aquí solo se atienden las más antiguas hasta su
// límite: el resto espera sin coste hasta que las ajuste.
//
// Se ejecuta tres veces al día (vercel.json): 06:30, 11:30 y 16:30 UTC.
// La primera es «la de la mañana».
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1          evalúa y cuenta, sin escribir ni enviar
//   ?key=<DEBUG_KEY>&user=<uuid>    solo un usuario
//   ?key=<DEBUG_KEY>&manana=1       fuerza que cuente como pasada de la mañana
//   ?key=<DEBUG_KEY>&lunes=1        fuerza que cuente como lunes
//   ?key=<DEBUG_KEY>&sinenvio=1     evalúa y guarda, pero no envía
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { evaluar, ordenar, MAX_CANDIDATOS } from '@/lib/agenteAlarmas';
import { nivelesAvisos } from '@/lib/nivelAvisos';
import { limitesDe } from '@/lib/alarmas';
import { alarmasEmail } from '@/lib/email/templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';
const PRESUPUESTO_MS = 240000;
const EN_PARALELO = 4;
const MAX_POR_CORREO = 8;

// Recordatorios de plazo de lo que encuentran las alarmas: la misma
// escalera que lo que se sigue a mano (detectar-cambios). El 0 es «cierra
// hoy».
const ESCALERA = [30, 14, 7, 3, 1, 0];
// Los recordatorios lejanos (30, 14, 7) no salen si ya hubo otro del
// mismo plazo hace menos de esto, ni si el asunto se acaba de encontrar:
// el aviso de que ha aparecido ya dice cuántos días quedan.
const DIAS_ENTRE_LEJANOS = 3;

// Días naturales hasta el cierre, en hora de Madrid. Lo ya cerrado, null.
const DIA_MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
function diasHasta(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  const ahora = new Date();
  if (d.getTime() < ahora.getTime()) return null;
  return Math.round((Date.parse(DIA_MADRID.format(d)) - Date.parse(DIA_MADRID.format(ahora))) / 86400000);
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

async function enviar({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'GovTalent <hola@govtalent.app>', to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const normalizar = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Reparte trabajo en N hilos a la vez. */
async function enParalelo(items, n, fn) {
  let i = 0;
  async function hilo() {
    while (i < items.length) {
      const k = i++;
      await fn(items[k]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, n) }, hilo));
}

export const GET = conRegistro('/api/alarmas/vigilar', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const sinEnvio = dry || sp.get('sinenvio') === '1';
  const soloUsuario = sp.get('user');
  const ahora = new Date();
  // La primera pasada del día es la de las 06:30 UTC. Con margen: si el
  // cron se retrasa, sigue contando como la de la mañana.
  const esManana = sp.get('manana') === '1' || ahora.getUTCHours() < 9;
  const esLunes = sp.get('lunes') === '1' || ahora.getUTCDay() === 1;

  const db = admin();
  const informe = { inicio: ahora.toISOString(), dry_run: dry, manana: esManana, lunes: esLunes };

  try {
    // --- Alarmas activas y el plan de cada usuario ---------------------
    let q = db
      .from('sector_alerts')
      .select('id, user_id, nombre, descripcion, criterios, keywords, frecuencia, recordar_plazos, created_at')
      .eq('activa', true)
      .order('created_at', { ascending: true });
    if (soloUsuario) q = q.eq('user_id', soloUsuario);
    const { data: alarmas, error: errA } = await q;
    if (errA) throw new Error(`No se pudieron leer las alarmas: ${errA.message}`);

    const niveles = await nivelesAvisos(db, (alarmas || []).map((a) => a.user_id));

    // Solo las que caben en el plan, las más antiguas primero. Y en Free,
    // semanal siempre, aunque la fila diga otra cosa.
    const usadas = new Map();
    const vigentes = [];
    for (const a of alarmas || []) {
      const nivel = niveles.get(a.user_id) || 'free';
      const n = usadas.get(a.user_id) || 0;
      if (n >= limitesDe(nivel).alarmas) continue;
      usadas.set(a.user_id, n + 1);
      vigentes.push({ ...a, nivel, frecuencia: nivel === 'pro' ? a.frecuencia : 'semanal' });
    }
    informe.alarmas_activas = (alarmas || []).length;
    informe.alarmas_vigentes = vigentes.length;

    // --- 1. Evaluar ------------------------------------------------------
    // Free se evalúa solo los lunes: le llega un único resumen semanal y
    // evaluarlo a diario costaría lo mismo sin darle nada antes.
    const aEvaluar = vigentes.filter((a) => a.nivel === 'pro' || esLunes);

    const { data: reciente, error: errR } = await db
      .from('regulatorio_reciente')
      .select('kind, ref_id, titulo, contexto, fuente, ruta, plazo, fecha')
      .limit(3000);
    if (errR) throw new Error(`No se pudo leer lo reciente: ${errR.message}`);
    informe.recientes = (reciente || []).length;

    let evaluadas = 0;
    let llamadas = 0;
    let nuevas = 0;
    const errores = [];

    await enParalelo(aEvaluar, EN_PARALELO, async (a) => {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        return;
      }
      try {
        const { data: vistos } = await db.from('sector_alert_seen').select('kind, ref_id').eq('alert_id', a.id);
        const yaVisto = new Set((vistos || []).map((v) => `${v.kind}|${v.ref_id}`));
        let pendientes = (reciente || []).filter((r) => !yaVisto.has(`${r.kind}|${r.ref_id}`));
        evaluadas += 1;
        if (pendientes.length === 0) return;

        // Con el volumen de hoy (~30 asuntos al día) todo pasa por la IA.
        // Si un día entra mucho más, primero lo que toca las palabras
        // clave y luego lo más reciente, hasta el tope.
        if (pendientes.length > MAX_CANDIDATOS) {
          const claves = (a.keywords || []).map(normalizar).filter((k) => k.length >= 3);
          const toca = (r) => claves.some((k) => normalizar(r.titulo).includes(k));
          pendientes = [...ordenar(pendientes.filter(toca)), ...ordenar(pendientes.filter((r) => !toca(r)))].slice(
            0,
            MAX_CANDIDATOS
          );
        }

        const encaja = await evaluar({ descripcion: a.descripcion || (a.keywords || []).join(', '), criterios: a.criterios || {} }, pendientes);
        llamadas += 1;
        nuevas += encaja.length;
        if (dry) return;

        if (encaja.length > 0) {
          const { error } = await db.from('sector_alert_matches').upsert(
            encaja.map((m) => ({ ...m, alert_id: a.id, user_id: a.user_id })),
            { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true }
          );
          if (error) throw new Error(error.message);
        }
        await db
          .from('sector_alert_seen')
          .upsert(
            pendientes.map((r) => ({ alert_id: a.id, kind: r.kind, ref_id: r.ref_id })),
            { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true }
          );
        await db.from('sector_alerts').update({ evaluada_at: new Date().toISOString() }).eq('id', a.id);
      } catch (e) {
        errores.push(`${a.id}: ${e.message}`);
      }
    });

    informe.evaluadas = evaluadas;
    informe.llamadas_ia = llamadas;
    informe.coincidencias_nuevas = nuevas;
    if (errores.length) informe.errores_evaluacion = errores.slice(0, 5);


    // --- 2. Recordatorios de plazo ----------------------------------------
    // Solo en la pasada de la mañana y solo en Pro: a primera hora, que es
    // cuando sirve saber que algo cierra en tres días.
    const recordatorios = [];
    if (esManana) {
      const conRecordatorio = vigentes.filter((a) => a.nivel === 'pro' && a.recordar_plazos !== false);
      const idsR = conRecordatorio.map((a) => a.id);
      const encontrados = [];
      for (let i = 0; i < idsR.length; i += 100) {
        const { data } = await db
          .from('sector_alert_matches')
          .select('id, alert_id, user_id, kind, ref_id, titulo, fuente, ruta, plazo, created_at, avisado_at')
          .in('alert_id', idsR.slice(i, i + 100))
          .eq('descartado', false)
          .not('plazo', 'is', null);
        encontrados.push(...(data || []));
      }

      // El plazo guardado puede haberse ampliado: se toma el de la fuente.
      const refs = [...new Set(encontrados.map((m) => m.ref_id))];
      const plazoActual = new Map();
      for (let i = 0; i < refs.length; i += 100) {
        const { data } = await db
          .from('regulatorio_search')
          .select('kind, ref_id, plazo')
          .in('ref_id', refs.slice(i, i + 100));
        for (const r of data || []) if (r.plazo) plazoActual.set(`${r.kind}|${r.ref_id}`, r.plazo);
      }

      const previos = [];
      for (let i = 0; i < idsR.length; i += 100) {
        const { data } = await db
          .from('sector_alert_plazo_avisos')
          .select('alert_id, kind, ref_id, deadline, umbral, created_at')
          .in('alert_id', idsR.slice(i, i + 100));
        previos.push(...(data || []));
      }
      const mismaFecha = (x, y) => new Date(x).getTime() === new Date(y).getTime();
      const hace = Date.now() - DIAS_ENTRE_LEJANOS * 86400000;

      for (const m of encontrados) {
        const plazo = plazoActual.get(`${m.kind}|${m.ref_id}`) || m.plazo;
        if (!mismaFecha(plazo, m.plazo) && !dry) {
          await db.from('sector_alert_matches').update({ plazo }).eq('id', m.id);
        }
        const dias = diasHasta(plazo);
        if (dias === null) continue;
        const umbral = ESCALERA.find((u, k) => dias <= u && dias > (ESCALERA[k + 1] ?? -1));
        if (umbral === undefined) continue;
        const suyos = previos.filter(
          (p) => p.alert_id === m.alert_id && p.kind === m.kind && p.ref_id === m.ref_id && mismaFecha(p.deadline, plazo)
        );
        if (suyos.some((p) => p.umbral === umbral)) continue;
        if (umbral > 3) {
          const reciente = suyos.some((p) => new Date(p.created_at).getTime() > hace);
          const recienEncontrado = new Date(m.avisado_at || m.created_at).getTime() > hace;
          if (reciente || recienEncontrado) continue;
        }
        recordatorios.push({ ...m, plazo, dias, umbral });
      }
    }
    informe.recordatorios = recordatorios.length;

    if (sinEnvio) {
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // --- 3. Enviar -------------------------------------------------------
    const tocaEnviar = (a) =>
      a.frecuencia === 'inmediato' || (a.frecuencia === 'diario' && esManana) || (a.frecuencia === 'semanal' && esManana && esLunes);
    const aEnviar = vigentes.filter(tocaEnviar);
    const porId = new Map(vigentes.map((a) => [a.id, a]));

    let pendientes = [];
    if (aEnviar.length > 0) {
      const ids = aEnviar.map((a) => a.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await db
          .from('sector_alert_matches')
          .select('id, alert_id, user_id, kind, ref_id, titulo, fuente, ruta, motivo, plazo, relevancia')
          .in('alert_id', ids.slice(i, i + 100))
          .is('avisado_at', null)
          .eq('descartado', false);
        pendientes.push(...(data || []));
      }
    }

    const porUsuario = new Map();
    const de = (userId) => {
      if (!porUsuario.has(userId)) porUsuario.set(userId, { novedades: [], plazos: [] });
      return porUsuario.get(userId);
    };
    for (const m of pendientes) de(m.user_id).novedades.push(m);
    for (const r of recordatorios) {
      // Si el mismo asunto va como novedad, no se repite como recordatorio.
      const u = de(r.user_id);
      if (u.novedades.some((n) => n.kind === r.kind && n.ref_id === r.ref_id)) continue;
      if (u.plazos.some((p) => p.kind === r.kind && p.ref_id === r.ref_id)) continue;
      u.plazos.push(r);
    }
    informe.usuarios_con_novedades = porUsuario.size;

    if (porUsuario.size > 0) {
      const ids = [...porUsuario.keys()];
      const [{ data: usuarios }, { data: prefs }] = await Promise.all([
        db.from('users').select('id, email, first_name').in('id', ids),
        db.from('alert_preferences').select('user_id, email').in('user_id', ids),
      ]);
      const datosDe = new Map((usuarios || []).map((u) => [u.id, u]));
      // Quien ha apagado todos los correos no recibe nada, pero lo
      // encontrado sigue visible al entrar.
      const sinCorreo = new Set((prefs || []).filter((p) => p.email === false).map((p) => p.user_id));

      let enviados = 0;
      const marcados = [];
      const avisosPlazo = [];
      const fallos = [];
      for (const [userId, { novedades, plazos }] of porUsuario) {
        if (novedades.length === 0 && plazos.length === 0) continue;
        const u = datosDe.get(userId);
        if (!u?.email || sinCorreo.has(userId)) continue;
        const suyas = novedades.map((m) => porId.get(m.alert_id)).filter(Boolean);
        const tipo =
          suyas.some((a) => a.frecuencia === 'inmediato') && !esManana
            ? 'inmediato'
            : suyas.length > 0 && suyas.every((a) => a.frecuencia === 'semanal')
              ? 'semanal'
              : 'diario';
        const ordenados = [...novedades].sort((a, b) => {
          if (!!a.plazo !== !!b.plazo) return a.plazo ? -1 : 1;
          return (b.relevancia || 0) - (a.relevancia || 0);
        });
        const { subject, html } = alarmasEmail({
          firstName: u.first_name || '',
          matches: ordenados.slice(0, MAX_POR_CORREO).map((m) => ({
            title: m.titulo,
            fuente: m.fuente,
            ruta: m.ruta,
            motivo: m.motivo,
            plazo: m.plazo,
            alarma: porId.get(m.alert_id)?.nombre || null,
          })),
          total: novedades.length,
          recordatorios: [...plazos]
            .sort((a, b) => a.dias - b.dias)
            .map((r) => ({
              title: r.titulo,
              fuente: r.fuente,
              ruta: r.ruta,
              plazo: r.plazo,
              dias: r.dias,
              alarma: porId.get(r.alert_id)?.nombre || null,
            })),
          tipo,
          esFree: (niveles.get(userId) || 'free') !== 'pro',
          ajustesUrl: `${SITE_URL}/seguimiento?alarmas=1`,
        });
        try {
          await enviar({ to: u.email, subject, html });
          enviados += 1;
          marcados.push(...novedades.map((m) => m.id));
          avisosPlazo.push(
            ...plazos.map((r) => ({ alert_id: r.alert_id, kind: r.kind, ref_id: r.ref_id, deadline: r.plazo, umbral: r.umbral }))
          );
        } catch (e) {
          fallos.push(`${userId}: ${e.message}`);
        }
      }

      // Se marca después de enviar: si falla, queda pendiente para la
      // pasada siguiente.
      for (let i = 0; i < marcados.length; i += 200) {
        await db
          .from('sector_alert_matches')
          .update({ avisado_at: new Date().toISOString(), canal: 'email' })
          .in('id', marcados.slice(i, i + 200));
      }
      if (avisosPlazo.length > 0) {
        await db
          .from('sector_alert_plazo_avisos')
          .upsert(avisosPlazo, { onConflict: 'alert_id,kind,ref_id,deadline,umbral', ignoreDuplicates: true });
      }
      informe.enviados = enviados;
      informe.marcados = marcados.length;
      informe.recordatorios_enviados = avisosPlazo.length;
      if (fallos.length) informe.fallos_envio = fallos.slice(0, 3);
    }

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
