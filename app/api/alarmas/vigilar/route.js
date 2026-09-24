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
//   2. ENVÍA según la frecuencia de cada alarma:
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
      .select('id, user_id, nombre, descripcion, criterios, keywords, frecuencia, created_at')
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

    if (sinEnvio) {
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // --- 2. Enviar -------------------------------------------------------
    const tocaEnviar = (a) =>
      a.frecuencia === 'inmediato' || (a.frecuencia === 'diario' && esManana) || (a.frecuencia === 'semanal' && esManana && esLunes);
    const aEnviar = vigentes.filter(tocaEnviar);
    const porId = new Map(aEnviar.map((a) => [a.id, a]));

    let pendientes = [];
    if (aEnviar.length > 0) {
      const ids = aEnviar.map((a) => a.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await db
          .from('sector_alert_matches')
          .select('id, alert_id, user_id, titulo, fuente, ruta, motivo, plazo, relevancia')
          .in('alert_id', ids.slice(i, i + 100))
          .is('avisado_at', null)
          .eq('descartado', false);
        pendientes.push(...(data || []));
      }
    }

    const porUsuario = new Map();
    for (const m of pendientes) {
      if (!porUsuario.has(m.user_id)) porUsuario.set(m.user_id, []);
      porUsuario.get(m.user_id).push(m);
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
      const fallos = [];
      for (const [userId, matches] of porUsuario) {
        const u = datosDe.get(userId);
        if (!u?.email || sinCorreo.has(userId)) continue;
        const suyas = matches.map((m) => porId.get(m.alert_id)).filter(Boolean);
        const tipo = suyas.some((a) => a.frecuencia === 'inmediato') && !esManana
          ? 'inmediato'
          : suyas.every((a) => a.frecuencia === 'semanal')
            ? 'semanal'
            : 'diario';
        const ordenados = [...matches].sort((a, b) => {
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
          total: matches.length,
          tipo,
          esFree: (niveles.get(userId) || 'free') !== 'pro',
          ajustesUrl: `${SITE_URL}/seguimiento?alarmas=1`,
        });
        try {
          await enviar({ to: u.email, subject, html });
          enviados += 1;
          marcados.push(...matches.map((m) => m.id));
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
      informe.enviados = enviados;
      informe.marcados = marcados.length;
      if (fallos.length) informe.fallos_envio = fallos.slice(0, 3);
    }

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
