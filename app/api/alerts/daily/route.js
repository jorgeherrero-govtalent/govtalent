// =====================================================================
// ALERTAS POR CRITERIO
// app/api/alerts/daily/route.js
//
// Cada mañana, tras los syncs, evalúa lo nuevo contra las palabras clave
// de cada usuario y avisa de lo que encaja.
//
// POR QUÉ HACE FALTA: el correo semanal solo cubre lo que el usuario
// sigue una a una, y nadie sigue disposiciones del BOE de esa forma. Con
// esto llega lo que le afecta aunque no lo haya buscado.
//
// POR QUÉ DIARIO Y NO SEMANAL: un cambio de fase abre una ventana de
// días. Enterarse el lunes de que una ley entró en enmiendas el martes
// anterior puede dejar fuera.
//
// NO SATURA: el motor corre una vez al día, así que todo lo detectado
// llega junto en un solo correo. Si no hay nada, no se manda.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin enviar
//   ?key=<DEBUG_KEY>&user=<id>    solo a un usuario
//   ?key=<DEBUG_KEY>              envío real
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dailyAlertEmail } from '@/lib/email/templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';
const PRESUPUESTO_MS = 45000;

// Cuántas coincidencias se envían por correo. Más allá de esto la lista
// deja de leerse y conviene que entre a verlas.
const MAX_POR_CORREO = 8;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

function normalizar(t) {
  return (t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function enviar({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'GovTalent <hola@govtalent.app>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const dry = sp.get('dry') === '1';
  const soloUsuario = sp.get('user');
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry };

  try {
    // --- Las alertas activas ------------------------------------------
    let q = supabase.from('sector_alerts').select('*').eq('activa', true);
    if (soloUsuario) q = q.eq('user_id', soloUsuario);
    const { data: alertas, error: errA } = await q;
    if (errA) throw new Error(`No se pudieron leer las alertas: ${errA.message}`);

    informe.alertas = (alertas || []).length;
    if (informe.alertas === 0) {
      return NextResponse.json({ ...informe, nota: 'Nadie tiene alertas configuradas.', ms_total: Date.now() - t0 });
    }

    // --- Lo nuevo de los últimos días ---------------------------------
    const { data: reciente, error: errR } = await supabase
      .from('regulatorio_reciente')
      .select('kind, ref_id, titulo, contexto, fuente, ruta, plazo, fecha')
      .limit(3000);
    if (errR) throw new Error(`No se pudo leer lo reciente: ${errR.message}`);

    informe.candidatos = (reciente || []).length;

    // --- Evaluar cada alerta ------------------------------------------
    // Se compara por texto normalizado: las palabras clave vienen de la
    // IA y son términos que aparecerían en el título de una norma.
    const nuevos = [];
    for (const a of alertas || []) {
      const claves = (a.keywords || []).map(normalizar).filter((k) => k.length >= 4);
      if (claves.length === 0) continue;

      for (const r of reciente || []) {
        const titulo = normalizar(r.titulo);
        const coincide = claves.find((k) => titulo.includes(k));
        if (!coincide) continue;

        // El filtro de fuente, si la alerta lo tiene
        if ((a.fuentes || []).length > 0) {
          const mapa = {
            ley: 'congreso',
            actividad: 'congreso',
            boe: 'boe',
            expediente: 'comision',
            procedimiento: 'parlamento',
          };
          if (!a.fuentes.includes(mapa[r.kind])) continue;
        }

        nuevos.push({
          alert_id: a.id,
          user_id: a.user_id,
          kind: r.kind,
          ref_id: r.ref_id,
          titulo: r.titulo,
          fuente: r.fuente,
          ruta: r.ruta,
          // El motivo explica por qué llega: sin esto el aviso parece
          // arbitrario.
          motivo: coincide,
          plazo: r.plazo,
        });
      }
    }

    // Se escriben ignorando duplicados: si ya se detectó antes, la
    // restricción única lo descarta y no se vuelve a avisar.
    let insertados = [];
    if (!dry && nuevos.length > 0) {
      const { data } = await supabase
        .from('sector_alert_matches')
        .upsert(nuevos, { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true })
        .select('*');
      insertados = data || [];
    }

    informe.coincidencias = nuevos.length;
    informe.nuevas = dry ? '(no se escriben en prueba)' : insertados.length;

    // --- Enviar lo pendiente ------------------------------------------
    const { data: pendientes } = await supabase
      .from('sector_alert_matches')
      .select('*')
      .is('avisado_at', null)
      .order('created_at', { ascending: false });

    const porUsuario = new Map();
    for (const m of pendientes || []) {
      if (soloUsuario && m.user_id !== soloUsuario) continue;
      if (!porUsuario.has(m.user_id)) porUsuario.set(m.user_id, []);
      porUsuario.get(m.user_id).push(m);
    }

    informe.usuarios_con_novedades = porUsuario.size;
    if (porUsuario.size === 0) {
      return NextResponse.json({ ...informe, nota: 'Nada nuevo que avisar.', ms_total: Date.now() - t0 });
    }

    // Quién quiere avisos diarios
    const { data: prefs } = await supabase.from('alert_preferences').select('*');
    const prefDe = new Map((prefs || []).map((p) => [p.user_id, p]));

    const { data: usuarios } = await supabase
      .from('users')
      .select('id, email, first_name')
      .in('id', [...porUsuario.keys()]);
    const datosDe = new Map((usuarios || []).map((u) => [u.id, u]));

    const resultados = [];
    let enviadosOk = 0;
    const marcados = [];

    for (const [userId, matches] of porUsuario) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }

      const pref = prefDe.get(userId);
      // Por defecto sí: quien no ha tocado nada quiere enterarse.
      if (pref && (pref.diario === false || pref.email === false)) continue;

      const u = datosDe.get(userId);
      if (!u?.email) continue;

      // Lo que tiene plazo primero, que es lo accionable
      const ordenados = [...matches].sort((a, b) => {
        if (!!a.plazo !== !!b.plazo) return a.plazo ? -1 : 1;
        return String(b.created_at).localeCompare(String(a.created_at));
      });

      const { subject, html } = dailyAlertEmail({
        firstName: u.first_name || '',
        matches: ordenados.slice(0, MAX_POR_CORREO).map((m) => ({
          title: m.titulo,
          fuente: m.fuente,
          ruta: m.ruta,
          motivo: m.motivo,
          plazo: m.plazo,
        })),
        total: matches.length,
        unsubscribeUrl: `${SITE_URL}/seguimiento?ajustes=1`,
      });

      resultados.push({ user_id: userId, email: u.email, subject, n: matches.length });

      if (!dry) {
        try {
          await enviar({ to: u.email, subject, html });
          enviadosOk += 1;
          for (const m of matches) marcados.push(m.id);
        } catch (err) {
          resultados[resultados.length - 1].error = err.message;
        }
      }
    }

    if (dry) {
      informe.muestra = resultados.slice(0, 5);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // Se marca después de enviar: si el envío falla, quedan pendientes y
    // se reintentan mañana.
    if (marcados.length > 0) {
      await supabase
        .from('sector_alert_matches')
        .update({ avisado_at: new Date().toISOString(), canal: 'email' })
        .in('id', marcados);
    }

    informe.enviados = enviadosOk;
    informe.marcados = marcados.length;
    informe.fallidos = resultados.filter((r) => r.error).length;
    informe.detalle_fallos = resultados.filter((r) => r.error).slice(0, 3);
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
