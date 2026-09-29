// =====================================================================
// SYNC — AGENDA DEL GOBIERNO
// app/api/sync/agenda-gobierno/route.js
//
// Lee la agenda diaria de La Moncloa (presidente, vicepresidentes y
// ministros) y avisa de lo que importa.
//
// CADA PASADA:
//   1. Lee la agenda de hoy y la de mañana (hora de Madrid). La de
//      mañana suele salir la tarde anterior; mientras no sale, la página
//      dice «No se han encontrado eventos» y no es un error.
//   2. Si la página ha cambiado (huella), guarda los actos en
//      agenda_actos. Lo que desaparece de la agenda se marca «retirado»
//      y no se borra; si vuelve, vuelve a «vigente».
//   3. Actos NUEVOS de hoy en adelante:
//        a. De un ministro que alguien sigue → evento en su seguimiento
//           (se ve en Alarmas › Seguimiento y en el resumen del lunes).
//        b. Lanza /api/alarmas/vigilar?urgente=agenda: la IA evalúa los
//           actos nuevos contra cada alarma Pro y los que afecten salen
//           ya para las alarmas «Al momento». Las de «Cada mañana» y
//           «Los lunes» los reciben en su resumen.
//   4. Desde las 07:00 de Madrid, un correo por persona con la agenda
//      de hoy de los miembros del Gobierno que sigue. Solo Pro y Teams,
//      uno al día como mucho (agenda_avisos). En Free se ve dentro.
//
// HORARIO (vercel.json): cada 30 minutos, todos los días, de 04:00 a
// 20:30 UTC (de 06:00 a 22:30 en Madrid en verano). La agenda también
// tiene actos en fin de semana.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1                   lee y cuenta, sin escribir ni avisar
//   ?key=<DEBUG_KEY>&dry=1&debug=1           además, lo que ve el parser
//   ?key=<DEBUG_KEY>&fecha=2026-09-25        un día concreto
//   ?key=<DEBUG_KEY>&dias=14&sinaviso=1      carga inicial: los últimos 14 días
//   ?key=<DEBUG_KEY>&sinaviso=1              guarda, pero no avisa
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { conRegistro } from '@/lib/syncLog';
import { fetchGob } from '@/lib/fetchGob';
import { urlAgenda, actosDeAgenda, diaTexto } from '@/lib/agenda';
import { nivelesAvisos } from '@/lib/nivelAvisos';
import { agendaEmail } from '@/lib/email/templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

// Lo que se espera a /api/alarmas/vigilar antes de seguir.
const ESPERA_VIGILAR_MS = 240000;
// A partir de qué hora de Madrid sale el correo de la agenda del día.
const HORA_CORREO = 7;
// Tope de días en una carga inicial.
const MAX_DIAS = 31;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-ES,es;q=0.9',
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

async function pedir(url) {
  const res = await fetchGob(url, { headers: HEADERS, cache: 'no-store' });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  return texto;
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

// "Hoy" y la hora en Madrid
const DIA_MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const HORA_MADRID = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' });
const hoyMadrid = () => DIA_MADRID.format(new Date());
const horaMadrid = () => parseInt(HORA_MADRID.format(new Date()), 10);
const sumarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// La huella incluye las notas: si cambia la cobertura, la fila se
// actualiza aunque el acto sea el mismo.
const huellaDe = (actos) =>
  createHash('sha1')
    .update(actos.map((a) => `${a.id}:${a.notas.join('|')}`).join(','))
    .digest('hex')
    .slice(0, 16);

const rutaMiembro = (slug) => `/institutions/ministries/${slug}`;

export const GET = conRegistro('/api/sync/agenda-gobierno', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const debug = sp.get('debug') === '1';
  const sinAviso = dry || sp.get('sinaviso') === '1';

  const db = admin();
  const hoy = hoyMadrid();
  const informe = { inicio: new Date().toISOString(), dry_run: dry, hoy };

  // --- Qué días leer --------------------------------------------------
  let dias;
  const fechaForzada = sp.get('fecha');
  if (fechaForzada) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaForzada) || Number.isNaN(Date.parse(fechaForzada))) {
      return NextResponse.json({ ...informe, error: 'fecha debe ser AAAA-MM-DD' }, { status: 400 });
    }
    dias = [fechaForzada];
  } else if (sp.get('dias')) {
    const n = Math.min(MAX_DIAS, Math.max(1, parseInt(sp.get('dias'), 10) || 1));
    dias = Array.from({ length: n + 2 }, (_, k) => sumarDias(hoy, k - n)); // de hoy-n a mañana
  } else {
    dias = [hoy, sumarDias(hoy, 1)];
  }
  informe.dias = dias.length;

  try {
    // Los miembros del Gobierno, para enlazar cada acto con su ficha
    const { data: miembros, error: errM } = await db
      .from('government_members')
      .select('slug, full_name, role')
      .eq('active', true);
    if (errM) throw new Error(`No se pudieron leer los miembros del Gobierno: ${errM.message}`);

    const { data: guardados } = await db.from('agenda_dias').select('fecha, huella, n_actos, publicada_at').in('fecha', dias);
    const previo = new Map((guardados || []).map((g) => [g.fecha, g]));

    // --- 1 y 2. Leer y guardar ---------------------------------------
    const nuevos = [];
    const errores = [];
    const muestras = [];
    let escritos = 0;
    let retirados = 0;
    let vacios = 0;

    for (const fecha of dias) {
      const url = urlAgenda(fecha);
      try {
        const html = await pedir(url);
        const { actos, vacio, diagnostico } = actosDeAgenda(html, { fecha, url }, miembros || []);
        if (debug) muestras.push({ fecha, n: actos.length, vacio, diagnostico, actos: actos.slice(0, 60) });

        if (actos.length === 0) {
          if (!vacio) {
            // Ni actos ni «No se han encontrado eventos»: ha cambiado el
            // marcado. No se da por leída.
            errores.push(`${fecha}: 0 actos y la página no dice que esté vacía (${diagnostico.lineas} líneas)`);
            continue;
          }
          vacios += 1;
          // Un día que tenía actos y ahora sale vacío es casi siempre un
          // fallo pasajero de la web: no se retira nada.
          if (!dry && !(previo.get(fecha)?.n_actos > 0)) {
            await db
              .from('agenda_dias')
              .upsert({ fecha, url, huella: null, n_actos: 0, leida_at: new Date().toISOString() }, { onConflict: 'fecha' });
          }
          continue;
        }

        const huella = huellaDe(actos);
        const antes = previo.get(fecha);
        if (antes?.huella === huella) {
          if (!dry) await db.from('agenda_dias').update({ leida_at: new Date().toISOString() }).eq('fecha', fecha);
          continue;
        }

        const { data: existentes, error: eE } = await db.from('agenda_actos').select('id, estado').eq('fecha', fecha);
        if (eE) throw new Error(eE.message);
        const ya = new Map((existentes || []).map((e) => [e.id, e.estado]));
        const hoyIds = new Set(actos.map((a) => a.id));
        const altas = actos.filter((a) => !ya.has(a.id));
        const bajas = (existentes || []).filter((e) => e.estado === 'vigente' && !hoyIds.has(e.id)).map((e) => e.id);

        if (dry) {
          escritos += altas.length;
          retirados += bajas.length;
          nuevos.push(...altas);
          continue;
        }

        const ahora = new Date().toISOString();
        // Todos: los nuevos entran y los que ya estaban se actualizan
        // (notas, orden) y vuelven a «vigente» si se habían retirado.
        // detectado_en no va en el payload: en los que ya estaban se
        // conserva el de la primera vez.
        const filas = actos.map((a) => ({ ...a, estado: 'vigente', retirado_at: null, updated_at: ahora }));
        const { error: eA } = await db.from('agenda_actos').upsert(filas, { onConflict: 'id' });
        if (eA) throw new Error(eA.message);

        if (bajas.length > 0) {
          const { error: eB } = await db
            .from('agenda_actos')
            .update({ estado: 'retirado', retirado_at: ahora, updated_at: ahora })
            .in('id', bajas);
          if (eB) throw new Error(eB.message);
        }

        const { error: eD } = await db.from('agenda_dias').upsert(
          {
            fecha,
            url,
            huella,
            n_actos: actos.length,
            publicada_at: antes?.publicada_at || ahora,
            leida_at: ahora,
          },
          { onConflict: 'fecha' }
        );
        if (eD) throw new Error(eD.message);

        escritos += altas.length;
        retirados += bajas.length;
        nuevos.push(...altas);
      } catch (e) {
        errores.push(`${fecha}: ${e.message}`);
      }
    }

    informe.escritos = escritos;
    informe.retirados = retirados;
    informe.vacios = vacios;
    if (errores.length) informe.errores = errores.slice(0, 5);
    if (debug) informe.muestra = muestras;

    // --- 3. Avisos de lo nuevo -----------------------------------------
    const frescos = nuevos.filter((a) => a.fecha >= hoy);
    informe.frescos = frescos.length;

    if (!sinAviso && frescos.length > 0) {
      informe.seguimientos = await eventosDeSeguimiento(db, frescos);
      informe.vigilar = await lanzarVigilancia();
    }

    // --- 4. Correo de la agenda de hoy -----------------------------------
    if (!sinAviso && horaMadrid() >= HORA_CORREO && dias.includes(hoy)) {
      informe.correo_del_dia = await correoDelDia(db, hoy);
    }

    // Si todo falló y no se escribió nada, la pasada es un error; si algo
    // se escribió, los fallos quedan en `errores`.
    if (errores.length && escritos === 0 && errores.length === dias.length) informe.error = errores[0];

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}

// ---------------------------------------------------------------------
// 3a. Ministros que alguien sigue
// ---------------------------------------------------------------------

/**
 * Un evento por acto nuevo de cada miembro del Gobierno que alguien
 * sigue (kind 'cargo', ref_id = slug de government_members). El evento
 * es del ministro, no del usuario: lo ven todos sus seguidores.
 *
 * occurred_at es el momento en que se detecta y no la hora del acto: un
 * evento con fecha futura seguiría contando como novedad hasta que
 * pasara esa fecha.
 */
async function eventosDeSeguimiento(db, actos) {
  const conMiembro = actos.filter((a) => a.miembro_slug);
  if (conMiembro.length === 0) return { eventos: 0 };

  const slugs = [...new Set(conMiembro.map((a) => a.miembro_slug))];
  const { data: follows, error } = await db.from('follows').select('ref_id').eq('kind', 'cargo').in('ref_id', slugs);
  if (error) return { error: error.message };
  const seguidos = new Set((follows || []).map((f) => f.ref_id));
  const suyos = conMiembro.filter((a) => seguidos.has(a.miembro_slug));
  if (suyos.length === 0) return { eventos: 0 };

  // Separados por milisegundos: occurred_at forma parte de la clave única
  // y dos actos del mismo ministro no deben chocar.
  const base = Date.now();
  const filas = suyos.map((a, k) => ({
    kind: 'cargo',
    ref_id: a.miembro_slug,
    event_type: 'agenda',
    title: `${a.persona}${a.cargo ? ` · ${a.cargo}` : ''}`.slice(0, 300),
    detail: `Agenda del ${diaTexto(a.fecha)}${a.hora ? `, ${a.hora} h` : ''}: ${a.texto}`.slice(0, 600),
    occurred_at: new Date(base + k).toISOString(),
  }));
  const { error: eEv } = await db
    .from('follow_events')
    .upsert(filas, { onConflict: 'kind,ref_id,event_type,occurred_at', ignoreDuplicates: true });
  if (eEv) return { error: eEv.message };
  return { eventos: filas.length, ministros: new Set(suyos.map((a) => a.miembro_slug)).size };
}

// ---------------------------------------------------------------------
// 3b. La vigilancia de las alarmas, ya
// ---------------------------------------------------------------------

/**
 * Como en el Consejo de Ministros: se llama a la ruta, que tiene su
 * propio tiempo máximo y su fila en sync_log, y se espera la respuesta.
 */
async function lanzarVigilancia() {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), ESPERA_VIGILAR_MS);
  try {
    const res = await fetch(`${SITE_URL}/api/alarmas/vigilar?urgente=agenda`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    const r = await res.json().catch(() => ({}));
    return {
      status: res.status,
      llamadas_ia: r.llamadas_ia ?? null,
      coincidencias: r.coincidencias_nuevas ?? null,
      enviados: r.enviados ?? 0,
      error: r.error || null,
    };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'La vigilancia tardó demasiado; la recogerá la próxima pasada' : e.message };
  } finally {
    clearTimeout(reloj);
  }
}

// ---------------------------------------------------------------------
// 4. El correo de la agenda de hoy
// ---------------------------------------------------------------------

/**
 * A cada usuario Pro que sigue a algún miembro del Gobierno con actos
 * hoy, un correo con esos actos. Uno al día como mucho: lo que se añada
 * a la agenda después se ve dentro, como evento del seguimiento.
 *
 * Se intenta en cada pasada desde las 07:00, así que si La Moncloa
 * publica tarde, el correo sale en cuanto hay agenda.
 */
async function correoDelDia(db, hoy) {
  const { data: actos, error } = await db
    .from('agenda_actos')
    .select('id, hora, persona, cargo, miembro_slug, texto, notas, orden')
    .eq('fecha', hoy)
    .eq('estado', 'vigente')
    .not('miembro_slug', 'is', null);
  if (error) return { error: error.message };
  if (!actos?.length) return { actos: 0 };

  const slugs = [...new Set(actos.map((a) => a.miembro_slug))];
  const { data: follows, error: eF } = await db
    .from('follows')
    .select('user_id, ref_id')
    .eq('kind', 'cargo')
    .in('ref_id', slugs);
  if (eF) return { error: eF.message };
  if (!follows?.length) return { actos: actos.length, destinatarios: 0 };

  const porUsuario = new Map();
  for (const f of follows) {
    if (!porUsuario.has(f.user_id)) porUsuario.set(f.user_id, new Set());
    porUsuario.get(f.user_id).add(f.ref_id);
  }

  const ids = [...porUsuario.keys()];
  const niveles = await nivelesAvisos(db, ids);
  const pro = ids.filter((id) => niveles.get(id) === 'pro');
  if (pro.length === 0) return { actos: actos.length, destinatarios: 0 };

  const [{ data: enviados }, { data: usuarios }, { data: prefs }] = await Promise.all([
    db.from('agenda_avisos').select('user_id').eq('fecha', hoy).in('user_id', pro),
    db.from('users').select('id, email, first_name').in('id', pro),
    db.from('alert_preferences').select('user_id, email').in('user_id', pro),
  ]);
  const yaEnviado = new Set((enviados || []).map((e) => e.user_id));
  const datos = new Map((usuarios || []).map((u) => [u.id, u]));
  const sinCorreo = new Set((prefs || []).filter((p) => p.email === false).map((p) => p.user_id));

  // Los actos de cada miembro, en orden: primero los que no tienen hora
  // («Viaja a…»), que describen el día, y luego por hora.
  const porMiembro = new Map();
  for (const a of actos) {
    if (!porMiembro.has(a.miembro_slug)) porMiembro.set(a.miembro_slug, []);
    porMiembro.get(a.miembro_slug).push(a);
  }
  for (const lista of porMiembro.values()) {
    lista.sort((x, y) => (x.hora || '').localeCompare(y.hora || '') || (x.orden || 0) - (y.orden || 0));
  }

  let correos = 0;
  const fallos = [];
  for (const userId of pro) {
    if (yaEnviado.has(userId) || sinCorreo.has(userId)) continue;
    const u = datos.get(userId);
    if (!u?.email) continue;
    const personas = [...porUsuario.get(userId)]
      .filter((slug) => porMiembro.has(slug))
      .map((slug) => {
        const suyos = porMiembro.get(slug);
        return {
          nombre: suyos[0].persona,
          cargo: suyos[0].cargo,
          ruta: rutaMiembro(slug),
          actos: suyos.map((a) => ({ hora: a.hora, texto: a.texto, notas: a.notas || [] })),
        };
      });
    if (personas.length === 0) continue;
    const n = personas.reduce((s, p) => s + p.actos.length, 0);
    const { subject, html } = agendaEmail({
      firstName: u.first_name || '',
      fecha: hoy,
      diaTexto: diaTexto(hoy),
      personas,
      ajustesUrl: `${SITE_URL}/seguimiento`,
    });
    try {
      await enviar({ to: u.email, subject, html });
      correos += 1;
      await db.from('agenda_avisos').upsert({ user_id: userId, fecha: hoy, n_actos: n }, { onConflict: 'user_id,fecha', ignoreDuplicates: true });
    } catch (e) {
      fallos.push(`${userId}: ${e.message}`);
    }
  }
  return { actos: actos.length, correos, ...(fallos.length ? { fallos: fallos.slice(0, 3) } : {}) };
}
