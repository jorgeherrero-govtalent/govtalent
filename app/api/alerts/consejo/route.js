// =====================================================================
// CORREO — Consejo de Ministros
// app/api/alerts/consejo/route.js
//
// Un correo por Consejo a TODOS los usuarios, en cuanto se publica la
// Referencia:
//   · Free: el resumen general, por tipo de norma.
//   · Pro y Teams: el mismo resumen y, arriba, «Te afecta»: lo que sus
//     alarmas han encontrado en ese Consejo y lo que cita una norma que
//     siguen. Para ellos sustituye al aviso urgente del Consejo, que el
//     sync ya no envía: un correo por Consejo, no dos.
//
// CADA PASADA (vercel.json, cada 15 minutos en laborables, 5 minutos
// después del sync del Consejo):
//   1. Busca Referencias de hoy o de ayer que no se hayan enviado.
//   2. Espera a que esté lista: que las alarmas la hayan evaluado
//      (consejo_referencias.evaluada_at) y que tenga la «Ampliación de
//      contenidos». Si algo de eso no llega, sale igual pasados 45 y 60
//      minutos desde que se detectó.
//   3. Genera el resumen UNA vez (lib/resumenConsejo.js) y lo guarda.
//   4. Envía por lotes a quien no lo haya recibido (consejo_correos). Si
//      se acaba el tiempo, la pasada siguiente sigue donde lo dejó.
//   5. Marca como avisado lo que iba en «Te afecta», para que el resumen
//      de las alarmas no lo repita.
//
// No lo reciben: quien ha apagado todos los correos (alert_preferences.
// email = false), quien se ha dado de baja de este (consejo = false) y
// quien ha pedido borrar su cuenta.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1                         genera y cuenta, sin enviar
//   ?key=<DEBUG_KEY>&fecha=2026-09-29&user=<uuid>   prueba: solo a ese usuario,
//                                                  aunque ya se haya enviado
//                                                  u omitido, y sin registrarlo
//   ?key=<DEBUG_KEY>&fecha=2026-09-29&regenerar=1   vuelve a pedir el resumen a la IA
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { nivelesAvisos } from '@/lib/nivelAvisos';
import { generarResumen, conteos, seguimientosQueCitan, tituloOficialCorto } from '@/lib/resumenConsejo';
import { nombreCita } from '@/lib/consejo';
import { consejoEmail } from '@/lib/email/templates';
import { signAlertToken } from '@/lib/unsubscribeToken';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';
const PRESUPUESTO_MS = 240000;
// Lo que se espera a las alarmas y a la ampliación antes de enviar igual
const ESPERA_ALARMAS_MS = 45 * 60 * 1000;
const ESPERA_AMPLIACION_MS = 60 * 60 * 1000;
// Una ampliación más corta que esto es que aún no está publicada
const AMPLIACION_MINIMA = 500;
// Correos por llamada a Resend (su tope es 100)
const LOTE = 50;
const MAX_TUYOS = 5;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

async function enviarLote(correos) {
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(correos),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const DIA_MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const hoyMadrid = () => DIA_MADRID.format(new Date());
const restarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function diaTexto(fecha) {
  const [y, m, d] = String(fecha).split('-').map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export const GET = conRegistro('/api/alerts/consejo', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const soloUsuario = sp.get('user');
  const fechaForzada = sp.get('fecha');
  const regenerar = sp.get('regenerar') === '1';
  const prueba = !!soloUsuario;

  if (fechaForzada && !/^\d{4}-\d{2}-\d{2}$/.test(fechaForzada)) {
    return NextResponse.json({ error: 'fecha debe ser AAAA-MM-DD' }, { status: 400 });
  }

  const db = admin();
  const hoy = hoyMadrid();
  const informe = { inicio: new Date().toISOString(), dry_run: dry, prueba, hoy };

  try {
    // --- 1. Qué Referencias ------------------------------------------------
    let q = db.from('consejo_referencias').select('url, fecha, detectada_at, evaluada_at, ampliacion').order('fecha', { ascending: true });
    q = fechaForzada ? q.eq('fecha', fechaForzada) : q.gte('fecha', restarDias(hoy, 1));
    const { data: refs, error: eR } = await q;
    if (eR) throw new Error(`No se pudieron leer las Referencias: ${eR.message}`);

    const { data: estados } = await db
      .from('consejo_resumenes')
      .select('referencia_url, estado, resumen, modelo')
      .in(
        'referencia_url',
        (refs || []).map((r) => r.url)
      );
    const estadoDe = new Map((estados || []).map((e) => [e.referencia_url, e]));

    const pendientes = (refs || []).filter((r) => prueba || fechaForzada || !['enviado', 'omitido'].includes(estadoDe.get(r.url)?.estado));
    informe.referencias = pendientes.length;
    const resultados = [];

    for (const ref of pendientes) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }
      const r = { fecha: ref.fecha };
      resultados.push(r);

      // --- 2. ¿Lista? ------------------------------------------------------
      const desde = Date.now() - new Date(ref.detectada_at).getTime();
      const conAmpliacion = (ref.ampliacion || '').length >= AMPLIACION_MINIMA;
      if (!prueba && !fechaForzada) {
        if (!ref.evaluada_at && desde < ESPERA_ALARMAS_MS) {
          r.esperando = 'alarmas';
          continue;
        }
        if (!conAmpliacion && desde < ESPERA_AMPLIACION_MS) {
          r.esperando = 'ampliacion';
          continue;
        }
      }

      const { data: acuerdos, error: eA } = await db
        .from('consejo_acuerdos')
        .select('id, tipo, ministerio, seccion, titulo, citas, orden')
        .eq('referencia_url', ref.url)
        .order('orden', { ascending: true });
      if (eA) throw new Error(eA.message);
      if (!acuerdos?.length) {
        r.error = 'La Referencia no tiene acuerdos guardados';
        continue;
      }

      // --- 3. El resumen, una vez ---------------------------------------------
      const guardado = estadoDe.get(ref.url);
      let resumen = guardado?.resumen;
      // Si el resumen guardado es el de reserva (la IA falló), se vuelve a
      // intentar con la IA mientras no haya empezado el envío: así un fallo
      // pasajero no deja el correo con los títulos a secas.
      const reintentar = guardado?.modelo === 'sin_ia' && guardado?.estado !== 'enviando';
      if (!resumen || regenerar || reintentar) {
        const g = await generarResumen({ acuerdos, ampliacion: ref.ampliacion, fecha: ref.fecha });
        resumen = g.resumen;
        r.modelo = g.modelo;
        if (g.error) r.aviso_ia = g.error;
        if (!dry) {
          const { error: eG } = await db.from('consejo_resumenes').upsert(
            {
              referencia_url: ref.url,
              fecha: ref.fecha,
              resumen,
              modelo: g.modelo,
              generado_at: new Date().toISOString(),
              // Una prueba no cambia el estado de envío
              ...(prueba ? {} : { estado: guardado?.estado === 'omitido' && fechaForzada ? 'omitido' : 'enviando' }),
            },
            { onConflict: 'referencia_url' }
          );
          if (eG) throw new Error(eG.message);
        }
      }
      if (dry || prueba) r.resumen = resumen;

      // --- 4. Destinatarios -----------------------------------------------------
      // Enviar de verdad a todos solo si la Referencia no está omitida.
      if (!prueba && guardado?.estado === 'omitido') {
        r.omitida = true;
        continue;
      }

      let qU = db.from('users').select('id, email, first_name').is('deletion_requested_at', null).not('email', 'is', null);
      if (prueba) qU = qU.eq('id', soloUsuario);
      const { data: usuarios, error: eU } = await qU;
      if (eU) throw new Error(eU.message);

      const ids = (usuarios || []).map((u) => u.id);
      const [{ data: prefs }, { data: yaEnviados }] = await Promise.all([
        db.from('alert_preferences').select('user_id, email, consejo').in('user_id', ids),
        prueba ? Promise.resolve({ data: [] }) : db.from('consejo_correos').select('user_id').eq('referencia_url', ref.url),
      ]);
      const fuera = new Set([
        ...(prefs || []).filter((p) => !prueba && (p.email === false || p.consejo === false)).map((p) => p.user_id),
        ...(yaEnviados || []).map((e) => e.user_id),
      ]);
      const destinatarios = (usuarios || []).filter((u) => !fuera.has(u.id));
      r.destinatarios = destinatarios.length;

      const niveles = await nivelesAvisos(
        db,
        destinatarios.map((u) => u.id)
      );
      const pro = destinatarios.filter((u) => niveles.get(u.id) === 'pro').map((u) => u.id);

      // «Te afecta»: alarmas y seguimientos de los Pro
      const tuyos = await queTeAfecta(db, acuerdos, resumen, pro);

      // --- 5. Enviar por lotes ------------------------------------------------
      const conteo = conteos(acuerdos);
      const dia = diaTexto(ref.fecha);
      let enviados = 0;
      const fallos = [];
      for (let i = 0; i < destinatarios.length; i += LOTE) {
        if (Date.now() - t0 > PRESUPUESTO_MS) {
          informe.cortado_por_tiempo = true;
          break;
        }
        const lote = destinatarios.slice(i, i + LOTE);
        const correos = lote.map((u) => {
          const esPro = niveles.get(u.id) === 'pro';
          const suyos = esPro ? (tuyos.get(u.id) || []).slice(0, MAX_TUYOS) : [];
          const bajaUrl = `${SITE_URL}/api/alerts/unsubscribe?type=consejo&user=${u.id}&token=${signAlertToken(`consejo:${u.id}`)}`;
          const { subject, html } = consejoEmail({
            firstName: u.first_name || '',
            diaTexto: dia,
            resumen,
            conteo,
            tuyos: suyos,
            esFree: !esPro,
            referenciaUrl: ref.url,
            bajaUrl,
          });
          return {
            usuario: u.id,
            esPro,
            suyos,
            correo: {
              from: process.env.RESEND_FROM || 'GovTalent <hola@govtalent.app>',
              to: u.email,
              subject: prueba ? `[Prueba] ${subject}` : subject,
              html,
              headers: { 'List-Unsubscribe': `<${bajaUrl}>` },
            },
          };
        });
        if (dry) {
          enviados += correos.length;
          continue;
        }
        try {
          await enviarLote(correos.map((c) => c.correo));
          enviados += correos.length;
          if (!prueba) {
            await db.from('consejo_correos').upsert(
              correos.map((c) => ({ user_id: c.usuario, referencia_url: ref.url, pro: c.esPro, n_tuyos: c.suyos.length })),
              { onConflict: 'user_id,referencia_url', ignoreDuplicates: true }
            );
            // Lo que iba en «Te afecta» ya está avisado: el resumen de las
            // alarmas no lo repite.
            const idsMatch = correos.flatMap((c) => c.suyos.map((s) => s.match_id).filter(Boolean));
            if (idsMatch.length) {
              await db
                .from('sector_alert_matches')
                .update({ avisado_at: new Date().toISOString(), canal: 'email' })
                .in('id', idsMatch)
                .is('avisado_at', null);
            }
          }
        } catch (e) {
          fallos.push(e.message);
        }
      }
      r.enviados = enviados;
      r.pro = pro.length;
      r.con_tuyos = [...tuyos.values()].filter((l) => l.length > 0).length;
      if (fallos.length) r.fallos = fallos.slice(0, 3);

      // ¿Terminado?
      if (!dry && !prueba && !informe.cortado_por_tiempo && fallos.length === 0) {
        const { count } = await db
          .from('consejo_correos')
          .select('user_id', { count: 'exact', head: true })
          .eq('referencia_url', ref.url);
        await db
          .from('consejo_resumenes')
          .update({ estado: 'enviado', enviado_at: new Date().toISOString(), n_enviados: count || 0 })
          .eq('referencia_url', ref.url);
        r.terminado = true;
      }
    }

    informe.resultados = resultados;
    const errores = resultados.filter((x) => x.error || x.fallos);
    if (errores.length && !resultados.some((x) => x.enviados > 0)) {
      informe.error = errores[0].error || errores[0].fallos[0];
    }
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}

/**
 * Por usuario Pro, lo que le afecta de este Consejo:
 *   · lo que han encontrado sus alarmas (sector_alert_matches), con el
 *     motivo que dio la IA o la normativa de referencia;
 *   · lo que cita una norma que sigue.
 * Sin repetir un acuerdo, lo más relevante primero.
 *
 * El titular es el de la IA si el acuerdo está en el resumen; si no, el
 * título oficial acortado.
 */
async function queTeAfecta(db, acuerdos, resumen, pro) {
  const out = new Map();
  if (pro.length === 0) return out;

  const titular = new Map();
  for (const x of [...(resumen.reales_decretos_ley || []), ...(resumen.reales_decretos || []), ...(resumen.destacados || [])]) {
    for (const id of x.ids) if (!titular.has(id)) titular.set(id, x.titulo);
  }
  const tituloDe = (a) => titular.get(a.id) || tituloOficialCorto(a.titulo);
  const porId = new Map(acuerdos.map((a) => [a.id, a]));

  // Alarmas
  const idsAcuerdos = acuerdos.map((a) => a.id);
  const matches = [];
  for (let i = 0; i < pro.length; i += 100) {
    const { data } = await db
      .from('sector_alert_matches')
      .select('id, alert_id, user_id, ref_id, motivo, relevancia')
      .eq('kind', 'consejo')
      .eq('descartado', false)
      // Relevancia 1 no entra en los correos (se ve en Novedades).
      .gte('relevancia', 2)
      .in('ref_id', idsAcuerdos)
      .in('user_id', pro.slice(i, i + 100));
    matches.push(...(data || []));
  }
  const alertIds = [...new Set(matches.map((m) => m.alert_id))];
  const nombres = new Map();
  if (alertIds.length) {
    const { data } = await db.from('sector_alerts').select('id, nombre').in('id', alertIds);
    for (const a of data || []) nombres.set(a.id, a.nombre);
  }
  for (const m of matches.sort((a, b) => (b.relevancia || 0) - (a.relevancia || 0))) {
    const a = porId.get(m.ref_id);
    if (!a) continue;
    if (!out.has(m.user_id)) out.set(m.user_id, []);
    const lista = out.get(m.user_id);
    if (lista.some((x) => x.id === a.id)) continue;
    lista.push({
      id: a.id,
      match_id: m.id,
      titulo: tituloDe(a),
      motivo: m.motivo || '',
      etiqueta: [a.ministerio, nombres.get(m.alert_id) ? `Alarma «${nombres.get(m.alert_id)}»` : 'Tu alarma'].filter(Boolean).join(' · '),
    });
  }

  // Seguimientos
  const seguidos = await seguimientosQueCitan(db, acuerdos, pro);
  for (const [userId, lista] of seguidos) {
    if (!out.has(userId)) out.set(userId, []);
    const suya = out.get(userId);
    for (const x of lista) {
      if (suya.some((y) => y.id === x.acuerdo.id)) continue;
      suya.push({
        id: x.acuerdo.id,
        match_id: null,
        titulo: tituloDe(x.acuerdo),
        motivo: `Cita la norma ${nombreCita(x.cita)}, que aparece en «${String(x.label).slice(0, 120)}», que sigues.`,
        etiqueta: [x.acuerdo.ministerio, 'Seguimiento'].filter(Boolean).join(' · '),
      });
    }
  }
  return out;
}
