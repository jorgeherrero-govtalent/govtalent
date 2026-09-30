// =====================================================================
// SYNC — CONSEJO DE MINISTROS
// app/api/sync/consejo-ministros/route.js
//
// Lee las Referencias del Consejo de Ministros en cuanto La Moncloa las
// publica y avisa el mismo día, antes que el BOE.
//
// CADA PASADA:
//   1. Pide el índice de Referencias (una página, la barata) y mira si
//      hay alguna que no se haya leído. Las de hoy y ayer se releen como
//      mucho una vez por hora, por si La Moncloa las corrige.
//      El índice va con retraso (el 29-09-2026 la Referencia llevaba
//      horas publicada y el índice no la enlazaba), así que además se
//      prueba la URL prevista de la Referencia de hoy y la de ayer. Si
//      aún no existe, no es un error: se vuelve a probar en la pasada
//      siguiente.
//   2. Si la hay, lee su sumario y guarda TODOS los puntos en
//      consejo_acuerdos. Los nombramientos se guardan pero no avisan:
//      se avisan cuando salen en el BOE.
//   3. Enlaza lo pendiente con el BOE y el Congreso (enlazar_consejo(),
//      sql/61). Barato, así que va en todas las pasadas.
//   4. Si hay acuerdos NUEVOS de un Consejo de hoy o de ayer, avisa ya,
//      sin esperar a la pasada de las alarmas:
//        a. Normativa de referencia de una alarma citada en el acuerdo
//           → coincidencia directa, sin IA.
//        b. Lanza /api/alarmas/vigilar?urgente=consejo: la IA evalúa lo
//           nuevo contra cada alarma Pro y se envía al momento a las
//           alarmas «Al momento» y «Cada mañana».
//        c. Norma que alguien sigue citada en el acuerdo → evento en su
//           seguimiento y, si es Pro, correo al momento.
//      Es «importante» —y por tanto inmediato— lo que toca una norma
//      que sigues o lo que tu alarma considera que afecta a tu sector.
//      El resto queda guardado y visible en Regulatorio, sin aviso.
//
// HORARIO (vercel.json): cada 15 minutos en días laborables, de 07:00 a
// 20:45 UTC (de 09:00 a 22:45 en Madrid en verano). Cubre el Consejo
// ordinario de los martes y los extraordinarios de cualquier otro día.
// Un solo cron y no dos: el vigilante de syncs cruza vercel.json con
// sync_log por la ruta exacta, y una segunda entrada con parámetros
// aparecería siempre como «no ha corrido nunca».
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1                 lee y cuenta, sin escribir ni avisar
//   ?key=<DEBUG_KEY>&dry=1&debug=1         además, lo que ve el parser
//   ?key=<DEBUG_KEY>&url=<referencia>      una Referencia concreta
//   ?key=<DEBUG_KEY>&sinaviso=1            guarda y enlaza, pero no avisa
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { conRegistro } from '@/lib/syncLog';
import { fetchGob } from '@/lib/fetchGob';
import { INDICE, referenciasDelIndice, acuerdosDeReferencia, fechaDeUrl, urlCanonica, urlPrevista, citas, nombreCita, VAN_AL_BOE } from '@/lib/consejo';
import { nivelesAvisos } from '@/lib/nivelAvisos';
import { limitesDe } from '@/lib/alarmas';
import { alarmasEmail } from '@/lib/email/templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

// Referencias que se vuelven a leer aunque ya estén guardadas, por si La
// Moncloa las corrige o completa después de publicarlas: las de hoy y
// ayer, y no más de una vez por hora cada una.
const DIAS_RELECTURA = 1;
const RELECTURA_MS = 60 * 60 * 1000;
// Solo se avisa al momento de lo que es de hoy o de ayer. Lo más
// antiguo (una primera carga, una Referencia que se nos pasó) se guarda
// y lo recogen las pasadas normales de las alarmas.
const DIAS_AVISO = 1;
// Lo que se espera a /api/alarmas/vigilar antes de seguir.
const ESPERA_VIGILAR_MS = 240000;

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

// "Hoy" en Madrid, como AAAA-MM-DD
const DIA_MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const hoyMadrid = () => DIA_MADRID.format(new Date());
const restarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

const huellaDe = (acuerdos) =>
  createHash('sha1')
    .update(acuerdos.map((a) => a.id).join(','))
    .digest('hex')
    .slice(0, 16);

async function enviar({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'GovTalent <hola@govtalent.app>', to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const rutaDe = (a) => `/regulatorio/consejo/${a.id}`;

export const GET = conRegistro('/api/sync/consejo-ministros', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const debug = sp.get('debug') === '1';
  const sinAviso = dry || sp.get('sinaviso') === '1';
  const urlForzada = sp.get('url') ? urlCanonica(sp.get('url')) : null;

  const db = admin();
  const hoy = hoyMadrid();
  const informe = { inicio: new Date().toISOString(), dry_run: dry, hoy };

  try {
    // --- 1. Qué Referencias hay que leer -----------------------------------
    let candidatas;
    if (urlForzada) {
      const fecha = fechaDeUrl(urlForzada);
      if (!fecha) return NextResponse.json({ ...informe, error: 'La URL no parece una Referencia (sin fecha en el nombre)' }, { status: 400 });
      candidatas = [{ url: urlForzada, fecha }];
    } else {
      const indice = await pedir(INDICE);
      candidatas = referenciasDelIndice(indice);
      informe.en_indice = candidatas.length;
      if (candidatas.length === 0) {
        // El índice siempre enseña algo (el mes en curso). Vacío es que ha
        // cambiado el marcado, no que no haya Consejos.
        return NextResponse.json({ ...informe, error: 'El índice no tiene ninguna Referencia: revisar el parser' }, { status: 500 });
      }
      // Hoy y ayer, aunque el índice aún no las enlace
      const enIndice = new Set(candidatas.map((c) => c.url));
      for (const fecha of [hoy, restarDias(hoy, 1)]) {
        const url = urlPrevista(fecha);
        if (!enIndice.has(url)) candidatas.push({ url, fecha, prevista: true });
      }
    }

    const { data: guardadas, error: errG } = await db
      .from('consejo_referencias')
      .select('url, fecha, huella, leida_at')
      .in(
        'url',
        candidatas.map((c) => c.url)
      );
    if (errG) throw new Error(`No se pudieron leer las Referencias guardadas: ${errG.message}`);
    const previa = new Map((guardadas || []).map((g) => [g.url, g]));

    const aLeer = candidatas.filter((c) => {
      if (urlForzada) return true;
      const p = previa.get(c.url);
      if (!p) return true;
      if (c.fecha < restarDias(hoy, DIAS_RELECTURA)) return false;
      return !p.leida_at || Date.now() - new Date(p.leida_at).getTime() > RELECTURA_MS;
    });
    informe.leidos = aLeer.length;

    // --- 2. Leer y guardar -----------------------------------------------
    const nuevos = [];
    const errores = [];
    const muestras = [];
    let escritos = 0;

    for (const ref of aLeer) {
      try {
        let html;
        try {
          html = await pedir(ref.url);
        } catch (e) {
          // Una Referencia prevista que aún no está publicada: normal.
          if (ref.prevista) {
            informe.previstas_sin_publicar = (informe.previstas_sin_publicar || 0) + 1;
            continue;
          }
          throw e;
        }
        const { acuerdos, titulo, diagnostico } = acuerdosDeReferencia(html, ref);
        if (debug) muestras.push({ url: ref.url, n: acuerdos.length, diagnostico, acuerdos: acuerdos.slice(0, 80) });

        // Una Referencia publicada sin puntos es un fallo del parser, no
        // un Consejo vacío: no se da por leída para que se reintente.
        if (acuerdos.length === 0) {
          // SharePoint puede devolver una página de «no encontrado» con
          // estado 200: en una prevista, eso es que aún no existe.
          if (ref.prevista) {
            informe.previstas_sin_publicar = (informe.previstas_sin_publicar || 0) + 1;
            continue;
          }
          errores.push(`${ref.url}: 0 acuerdos (${diagnostico.lineas} líneas, sumario ${diagnostico.sumario_desde ?? 'no encontrado'})`);
          continue;
        }

        const huella = huellaDe(acuerdos);
        const antes = previa.get(ref.url);
        if (antes?.huella === huella && !urlForzada) {
          // Sin cambios: se apunta la lectura para no releerla hasta
          // dentro de una hora.
          if (!dry) await db.from('consejo_referencias').update({ leida_at: new Date().toISOString() }).eq('url', antes.url);
          continue;
        }
        if (dry) {
          escritos += acuerdos.length;
          continue;
        }

        const { error: eR } = await db.from('consejo_referencias').upsert(
          {
            url: ref.url,
            fecha: ref.fecha,
            titulo,
            huella,
            n_acuerdos: acuerdos.length,
            leida_at: new Date().toISOString(),
          },
          { onConflict: 'url' }
        );
        if (eR) throw new Error(eR.message);

        // Los que ya estaban no se tocan: conservan su detectado_en, que es
        // lo que mide el adelanto.
        const { data: existentes } = await db
          .from('consejo_acuerdos')
          .select('id')
          .in(
            'id',
            acuerdos.map((a) => a.id)
          );
        const ya = new Set((existentes || []).map((e) => e.id));
        const filas = acuerdos
          .filter((a) => !ya.has(a.id))
          .map((a) => ({
            ...a,
            estado: VAN_AL_BOE.has(a.tipo) || a.tipo === 'proyecto_ley' ? 'pendiente' : 'aprobado',
          }));
        if (filas.length > 0) {
          const { error: eA } = await db.from('consejo_acuerdos').upsert(filas, { onConflict: 'id', ignoreDuplicates: true });
          if (eA) throw new Error(eA.message);
          escritos += filas.length;
          nuevos.push(...filas);
        }
      } catch (e) {
        errores.push(`${ref.url}: ${e.message}`);
      }
    }

    informe.escritos = escritos;
    if (errores.length) informe.errores = errores.slice(0, 5);
    if (debug) informe.muestra = muestras;

    // --- 3. Enlace con el BOE y el Congreso ------------------------------
    if (!dry) {
      const { data: enlace, error: eE } = await db.rpc('enlazar_consejo');
      informe.enlazados = eE ? `error: ${eE.message}` : enlace;
    }

    // --- 4. Avisos al momento ----------------------------------------------
    const frescos = nuevos.filter((a) => a.fecha_consejo >= restarDias(hoy, DIAS_AVISO) && a.tipo !== 'nombramiento');
    informe.frescos = frescos.length;

    if (!sinAviso && frescos.length > 0) {
      informe.normativa_alarmas = await coincidenciasPorNormativa(db, frescos);
      informe.vigilar = await lanzarVigilancia();
      informe.seguimientos = await avisarSeguimientos(db, frescos);
    }

    // Si alguna Referencia falló y no se escribió nada, la pasada es un
    // error; si otras sí se escribieron, el fallo queda en `errores`.
    if (errores.length && escritos === 0) informe.error = errores[0];

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}

// ---------------------------------------------------------------------
// 4a. Normativa de referencia de las alarmas
// ---------------------------------------------------------------------

/**
 * Si un acuerdo cita una norma que una alarma tiene como normativa de
 * referencia, es una coincidencia segura: no hace falta preguntar a la
 * IA. Se escribe directamente con relevancia 3 y se marca como visto,
 * para que la IA no lo evalúe otra vez.
 *
 * Mismo criterio de plan que la vigilancia: por usuario, solo las
 * alarmas que caben en su plan, las más antiguas primero.
 */
async function coincidenciasPorNormativa(db, acuerdos) {
  const conCitas = acuerdos.filter((a) => a.citas.length > 0);
  if (conCitas.length === 0) return { con_citas: 0 };

  const { data: alarmas, error } = await db
    .from('sector_alerts')
    .select('id, user_id, criterios, created_at')
    .eq('activa', true)
    .order('created_at', { ascending: true });
  if (error) return { error: error.message };

  const niveles = await nivelesAvisos(db, (alarmas || []).map((a) => a.user_id));
  const usadas = new Map();
  const filas = [];
  for (const a of alarmas || []) {
    const n = usadas.get(a.user_id) || 0;
    if (n >= limitesDe(niveles.get(a.user_id) || 'free').alarmas) continue;
    usadas.set(a.user_id, n + 1);

    const normativa = (a.criterios?.normativa || []).map((x) => ({ texto: x, citas: citas(x) }));
    for (const ac of conCitas) {
      const norma = normativa.find((n) => n.citas.some((c) => ac.citas.includes(c)));
      if (!norma) continue;
      filas.push({
        alert_id: a.id,
        user_id: a.user_id,
        kind: 'consejo',
        ref_id: ac.id,
        titulo: ac.titulo,
        fuente: 'Consejo de Ministros',
        ruta: rutaDe(ac),
        motivo: `Aprobado en el Consejo de Ministros del ${ac.fecha_consejo.split('-').reverse().join('/')}. Cita ${norma.texto}, que está en la normativa de referencia de esta alarma.`.slice(0, 300),
        relevancia: 3,
      });
    }
  }
  if (filas.length === 0) return { con_citas: conCitas.length, coincidencias: 0 };

  const { error: eM } = await db
    .from('sector_alert_matches')
    .upsert(filas, { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true });
  if (eM) return { error: eM.message };
  await db.from('sector_alert_seen').upsert(
    filas.map((f) => ({ alert_id: f.alert_id, kind: f.kind, ref_id: f.ref_id })),
    { onConflict: 'alert_id,kind,ref_id', ignoreDuplicates: true }
  );
  return { con_citas: conCitas.length, coincidencias: filas.length };
}

// ---------------------------------------------------------------------
// 4b. La vigilancia de las alarmas, ya
// ---------------------------------------------------------------------

/**
 * Se llama a la ruta y no a una función: tiene su propio tiempo máximo y
 * su propia fila en sync_log, así que se ve igual que las pasadas
 * programadas. Se espera la respuesta: en Vercel, una petición que se
 * deja en el aire puede morir al terminar esta.
 */
async function lanzarVigilancia() {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), ESPERA_VIGILAR_MS);
  try {
    const res = await fetch(`${SITE_URL}/api/alarmas/vigilar?urgente=consejo`, {
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
// 4c. Normas que alguien sigue
// ---------------------------------------------------------------------

/**
 * Cruza las citas de los acuerdos con los títulos de lo que cada usuario
 * sigue (una ley en tramitación que modifica la Ley 24/2013 y un real
 * decreto aprobado hoy que la desarrolla comparten «ley 24/2013»).
 *
 * Todo seguidor recibe el evento en su seguimiento. Los de Pro, además,
 * un correo al momento, salvo que ya les haya llegado ese acuerdo por
 * una alarma.
 */
async function avisarSeguimientos(db, acuerdos) {
  const conCitas = acuerdos.filter((a) => a.citas.length > 0);
  if (conCitas.length === 0) return { con_citas: 0 };

  const { data: follows, error } = await db.from('follows').select('user_id, kind, ref_id, label');
  if (error) return { error: error.message };
  if (!follows?.length) return { con_citas: conCitas.length, seguimientos: 0 };

  // Los títulos de lo seguido, de la vista unificada
  const refs = [...new Set(follows.map((f) => f.ref_id))];
  const titulos = new Map();
  for (let i = 0; i < refs.length; i += 100) {
    const { data } = await db
      .from('regulatorio_search')
      .select('kind, ref_id, titulo')
      .in('ref_id', refs.slice(i, i + 100));
    for (const r of data || []) titulos.set(`${r.kind}|${r.ref_id}`, r.titulo);
  }

  // Qué entidad seguida cita qué acuerdo
  const eventos = new Map(); // `${kind}|${ref_id}|${acuerdo}` → evento
  const porUsuario = new Map(); // user_id → [{ acuerdo, cita, label }]
  for (const f of follows) {
    const titulo = titulos.get(`${f.kind}|${f.ref_id}`) || f.label || '';
    const suyas = citas(titulo);
    if (suyas.length === 0) continue;
    for (const ac of conCitas) {
      const cita = ac.citas.find((c) => suyas.includes(c));
      if (!cita) continue;
      const clave = `${f.kind}|${f.ref_id}|${ac.id}`;
      if (!eventos.has(clave)) {
        eventos.set(clave, {
          kind: f.kind,
          ref_id: f.ref_id,
          event_type: 'consejo_ministros',
          title: ac.titulo.slice(0, 300),
          detail: `Aprobado en el Consejo de Ministros del ${ac.fecha_consejo.split('-').reverse().join('/')}. Cita la norma ${nombreCita(cita)}. Pendiente de publicación oficial.`,
        });
      }
      if (!porUsuario.has(f.user_id)) porUsuario.set(f.user_id, []);
      const lista = porUsuario.get(f.user_id);
      if (!lista.some((x) => x.acuerdo.id === ac.id)) lista.push({ acuerdo: ac, cita, label: f.label || titulo });
    }
  }
  if (eventos.size === 0) return { con_citas: conCitas.length, eventos: 0 };

  // occurred_at forma parte de la clave única de follow_events: se separan
  // por milisegundos para que dos acuerdos del mismo Consejo sobre la
  // misma entidad no choquen.
  const base = Date.now();
  const filasEv = [...eventos.values()].map((e, k) => ({ ...e, occurred_at: new Date(base + k).toISOString() }));
  const { error: eEv } = await db
    .from('follow_events')
    .upsert(filasEv, { onConflict: 'kind,ref_id,event_type,occurred_at', ignoreDuplicates: true });
  if (eEv) return { error: eEv.message };

  // Correo al momento, solo Pro y solo lo que no le haya llegado ya
  const ids = [...porUsuario.keys()];
  const niveles = await nivelesAvisos(db, ids);
  const pro = ids.filter((id) => niveles.get(id) === 'pro');
  if (pro.length === 0) return { eventos: filasEv.length, correos: 0 };

  const idsAcuerdos = conCitas.map((a) => a.id);
  const [{ data: porAlarma }, { data: yaAvisados }, { data: usuarios }, { data: prefs }] = await Promise.all([
    db.from('sector_alert_matches').select('user_id, ref_id').eq('kind', 'consejo').in('ref_id', idsAcuerdos).in('user_id', pro),
    db.from('consejo_avisos').select('user_id, acuerdo_id').in('acuerdo_id', idsAcuerdos).in('user_id', pro),
    db.from('users').select('id, email, first_name').in('id', pro),
    db.from('alert_preferences').select('user_id, email').in('user_id', pro),
  ]);
  const saltar = new Set([
    ...(porAlarma || []).map((m) => `${m.user_id}|${m.ref_id}`),
    ...(yaAvisados || []).map((m) => `${m.user_id}|${m.acuerdo_id}`),
  ]);
  const datos = new Map((usuarios || []).map((u) => [u.id, u]));
  const sinCorreo = new Set((prefs || []).filter((p) => p.email === false).map((p) => p.user_id));

  let correos = 0;
  const fallos = [];
  for (const userId of pro) {
    const u = datos.get(userId);
    if (!u?.email || sinCorreo.has(userId)) continue;
    const suyos = porUsuario.get(userId).filter((x) => !saltar.has(`${userId}|${x.acuerdo.id}`));
    if (suyos.length === 0) continue;
    const { subject, html } = alarmasEmail({
      firstName: u.first_name || '',
      matches: suyos.map((x) => ({
        title: x.acuerdo.titulo,
        fuente: 'Consejo de Ministros',
        ruta: rutaDe(x.acuerdo),
        motivo: `Cita la norma ${nombreCita(x.cita)}, que aparece en «${String(x.label).slice(0, 120)}», que sigues. Pendiente de publicación oficial.`,
        plazo: null,
        alarma: 'Seguimiento',
      })),
      total: suyos.length,
      tipo: 'consejo',
      esFree: false,
      ajustesUrl: `${SITE_URL}/seguimiento`,
    });
    try {
      await enviar({ to: u.email, subject, html });
      correos += 1;
      await db.from('consejo_avisos').upsert(
        suyos.map((x) => ({ user_id: userId, acuerdo_id: x.acuerdo.id, via: 'seguimiento', motivo: x.cita })),
        { onConflict: 'user_id,acuerdo_id', ignoreDuplicates: true }
      );
    } catch (e) {
      fallos.push(`${userId}: ${e.message}`);
    }
  }
  return { eventos: filasEv.length, correos, ...(fallos.length ? { fallos: fallos.slice(0, 3) } : {}) };
}
