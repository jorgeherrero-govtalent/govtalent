// =====================================================================
// Avisos de seguimiento de leyes autonómicas
// lib/ccaa/eventos.js
//
// 1. EVENTOS. Cuando el sync guarda trámites nuevos de un expediente que
//    alguien sigue (follows.kind = 'ccaa'), deja un follow_event por
//    trámite: es lo que sale en Novedades con «Lo sigues» y en el resumen
//    de los lunes. Desde la entrega B (30-10-2026, opción A de Jorge):
//      title   el trámite («La Mesa admite a trámite la comparecencia…»)
//      detail  la ley y la fecha («Proyecto de Ley de… (PL-10/2026), 16/10/2026»)
//      url     la página del boletín
//      cita    «BOAM 178, pág. 132»
//
//    Como en la agenda del Gobierno, occurred_at es el momento en que se
//    detecta, no la fecha del trámite: un trámite de hace diez días que el
//    boletín publica hoy es novedad hoy para quien lo sigue. Los
//    milisegundos separan eventos del mismo expediente, porque occurred_at
//    forma parte de la clave única.
//
// 2. CORREO AL MOMENTO (solo suscriptores). avisarSeguimientos() junta los
//    eventos de los últimos 7 días que cada usuario aún no tiene avisados
//    (seguimiento_avisos, sql/108) y le manda un correo con todos. No se
//    envía (y se apunta por qué) si tiene los correos apagados o si ya le
//    llega por una alarma que encontró esa ley (lib/ccaa/tramitesAlarmas.js).
//    Lo que falla se reintenta en la ejecución siguiente.
// =====================================================================

import { PARLAMENTOS } from '@/lib/parlamentosAutonomicos';
import { nivelesAvisos } from '@/lib/nivelAvisos';
import { seguimientoEmail } from '@/lib/email/templates';
import { separarDuplicados, MANDA, ESPERA_FICHA_DIAS } from '@/lib/ccaa/duplicados';
import { plazosAbiertos, hitoDeHoy, textosRecordatorio, hitosAvisados, claveHito, marcarHitos, prorrogasBloqueadas } from '@/lib/ccaa/plazos';

// Interruptor del correo. Encendido el 30-10-2026 tras la prueba en seco
// y la regla de duplicados (lib/ccaa/duplicados.js). Ponerlo a false
// detiene los correos; los eventos de Novedades se escriben igual.
const CORREO_ACTIVO = true;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';
const DIAS_REINTENTO = 7;
const LOTE = 100;

const ACTO = {
  registro: 'Registro',
  admision: 'Admisión a trámite',
  publicacion: 'Publicación',
  toma_consideracion: 'Toma en consideración',
  criterio_gobierno: 'Criterio del Gobierno',
  plazo_enmiendas: 'Plazo de enmiendas',
  ampliacion_plazo: 'Ampliación del plazo de enmiendas',
  enmiendas_totalidad: 'Enmiendas a la totalidad',
  enmiendas_parciales: 'Enmiendas',
  comparecencias: 'Comparecencias',
  ponencia: 'Ponencia',
  comision: 'Comisión',
  dictamen: 'Dictamen',
  pleno: 'Pleno',
  aprobacion: 'Aprobada',
  rechazo: 'Rechazada',
  retirada: 'Retirada',
  caducidad: 'Caducada',
};

const fechaTexto = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : null);
const parlamentoDe = (refId) => String(refId || '').split(':')[0];
// La fecha del trámite va al final del detalle («…, 16/10/2026»): la usa el
// correo para hablar en pasado de lo antiguo.
const fechaDeDetalle = (d) => {
  const m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s*$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

async function enLotes(ids, fn) {
  const salida = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await fn(ids.slice(i, i + LOTE));
    if (error) throw new Error(error.message);
    salida.push(...(data || []));
  }
  return salida;
}

/** «BOAM 178, pág. 132», o null si el trámite no viene de un boletín. */
export function citaTramite(parlamento, boletin, pagina) {
  if (!boletin?.numero) return null;
  return `${PARLAMENTOS[parlamento]?.boletin || 'Boletín'} ${boletin.numero}${pagina ? `, pág. ${pagina}` : ''}`;
}

/**
 * Los follow_events (sin escribir) de unos trámites cuyas leyes sigue
 * alguien. `tramites`: [{ expediente_id, tipo, fecha, descripcion,
 * boletin_id, pagina, url }].
 */
async function eventosDe(db, tramites) {
  let utiles = (tramites || []).filter((t) => t && t.expediente_id && t.tipo !== 'otro');
  if (!utiles.length) return [];
  // El mismo acto por la ficha y por el boletín: solo uno. Lo de la ficha
  // que espera al boletín lo recoge eventosDiferidos().
  utiles = (await separarDuplicados(db, utiles)).avisar;
  if (!utiles.length) return [];
  const ids = [...new Set(utiles.map((t) => t.expediente_id))];
  const follows = await enLotes(ids, (lote) => db.from('follows').select('ref_id').eq('kind', 'ccaa').in('ref_id', lote));
  const seguidos = new Set(follows.map((f) => f.ref_id));
  const suyos = utiles.filter((t) => seguidos.has(t.expediente_id));
  if (!suyos.length) return [];

  const exps = await enLotes([...new Set(suyos.map((t) => t.expediente_id))], (lote) => db
    .from('ccaa_expedientes').select('id, parlamento, num_expediente, titulo, titulo_es').in('id', lote));
  const expDe = new Map(exps.map((e) => [e.id, e]));
  const bolIds = [...new Set(suyos.map((t) => t.boletin_id).filter(Boolean))];
  const bols = bolIds.length ? await enLotes(bolIds, (lote) => db.from('ccaa_boletines').select('id, numero').in('id', lote)) : [];
  const bolDe = new Map(bols.map((b) => [b.id, b]));

  // Prórroga de un plazo bloqueado (3.ª o siguientes): se ve en Novedades y
  // en el resumen semanal, pero no manda correo (entrega C).
  const bloqueadas = await prorrogasBloqueadas(db, suyos);
  const base = Date.now();
  return suyos.map((t, k) => {
    const e = expDe.get(t.expediente_id) || {};
    const ley = e.titulo_es || e.titulo || '';
    const tramite = String(t.descripcion || '').replace(/\s+/g, ' ').trim() || ACTO[t.tipo] || 'Nuevo trámite';
    return {
      kind: 'ccaa',
      ref_id: t.expediente_id,
      event_type: bloqueadas.has(t.id) ? 'ampliacion_bloqueada' : t.tipo,
      title: tramite.slice(0, 300),
      detail: [ley && e.num_expediente ? `${ley} (${e.num_expediente})` : ley, fechaTexto(t.fecha)].filter(Boolean).join(', ').slice(0, 600) || null,
      url: t.url || null,
      cita: citaTramite(e.parlamento || parlamentoDe(t.expediente_id), bolDe.get(t.boletin_id), t.pagina),
      occurred_at: new Date(base + k).toISOString(),
    };
  });
}

/**
 * `nuevos`: trámites recién insertados. Escribe sus follow_events.
 * Devuelve { eventos } o { error }.
 */
export async function eventosDeSeguimiento(db, nuevos) {
  try {
    const filas = await eventosDe(db, nuevos);
    if (!filas.length) return { eventos: 0 };
    const { error } = await db.from('follow_events').upsert(filas, { onConflict: 'kind,ref_id,event_type,occurred_at', ignoreDuplicates: true });
    if (error) return { error: error.message };
    return { eventos: filas.length };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Trámites de la ficha que esperaban al boletín (lib/ccaa/duplicados.js):
 * pasados ESPERA_FICHA_DIAS sin que el boletín traiga el mismo acto, se
 * avisan. Corre en cada sync; no repite lo que ya tiene evento.
 */
export async function eventosDiferidos(db) {
  try {
    const parl = Object.keys(MANDA).filter((p) => MANDA[p] === 'boletin');
    const hasta = new Date(Date.now() - ESPERA_FICHA_DIAS * 86400000).toISOString();
    const desde = new Date(Date.now() - DIAS_REINTENTO * 86400000).toISOString();
    const { data, error } = await db.from('ccaa_tramites')
      .select('id, expediente_id, tipo, fecha, descripcion, boletin_id, pagina, url, origen, created_at')
      .eq('origen', 'ficha').gte('created_at', desde).lt('created_at', hasta)
      .or(parl.map((p) => `expediente_id.like.${p}:%`).join(','))
      .limit(1000);
    if (error) return { error: error.message };
    const filas = await eventosDe(db, data || []);
    if (!filas.length) return { eventos: 0 };
    const refs = [...new Set(filas.map((f) => f.ref_id))];
    const previos = await enLotes(refs, (lote) => db.from('follow_events').select('ref_id, title').eq('kind', 'ccaa').in('ref_id', lote));
    const hay = new Set(previos.map((p) => `${p.ref_id}|${p.title}`));
    const nuevos = filas.filter((f) => !hay.has(`${f.ref_id}|${f.title}`));
    if (!nuevos.length) return { eventos: 0 };
    const { error: e2 } = await db.from('follow_events').upsert(nuevos, { onConflict: 'kind,ref_id,event_type,occurred_at', ignoreDuplicates: true });
    if (e2) return { error: e2.message };
    return { eventos: nuevos.length };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Escalera de plazos para lo que se sigue (entrega C): un evento por hito
 * y plazo («Quedan 3 días: enmiendas a la totalidad»), común a quien siga
 * la ley. Solo desde las 7:00 en Madrid, para que salga a primera hora.
 */
export async function recordatoriosSeguimiento(db, { dry = false, ahora = new Date() } = {}) {
  try {
    const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(ahora));
    if (hora < 7) return { eventos: 0, antes_de_las_7: true };
    const { data: follows, error } = await db.from('follows').select('ref_id').eq('kind', 'ccaa').limit(5000);
    if (error) return { error: error.message };
    const leyes = [...new Set((follows || []).map((f) => f.ref_id))];
    if (!leyes.length) return { eventos: 0 };
    const plazos = await plazosAbiertos(db, leyes);
    if (!plazos.length) return { eventos: 0 };
    const exps = await enLotes([...new Set(plazos.map((p) => p.expediente_id))], (lote) => db.from('ccaa_expedientes').select('id, parlamento, num_expediente, titulo, titulo_es').in('id', lote));
    const expDe = new Map(exps.map((e) => [e.id, e]));
    const ultimos = await enLotes([...new Set(plazos.map((p) => p.ultimo_tramite_id).filter(Boolean))], (lote) => db.from('ccaa_tramites').select('id, boletin_id, pagina, url').in('id', lote));
    const tramDe = new Map(ultimos.map((t) => [t.id, t]));
    const bols = await enLotes([...new Set(ultimos.map((t) => t.boletin_id).filter(Boolean))], (lote) => db.from('ccaa_boletines').select('id, numero').in('id', lote));
    const bolDe = new Map(bols.map((b) => [b.id, b]));
    const hechos = await hitosAvisados(db, plazos.map((p) => p.id));

    const eventos = [];
    const hitos = [];
    const base = Date.now();
    for (const p of plazos) {
      const h = hitoDeHoy(p, ahora);
      if (!h || hechos.has(claveHito('seguimiento', p.id, h))) continue;
      const e = expDe.get(p.expediente_id) || {};
      const parl = e.parlamento || parlamentoDe(p.expediente_id);
      const t = textosRecordatorio(p, h, parl, ahora);
      const ult = tramDe.get(p.ultimo_tramite_id);
      eventos.push({
        kind: 'ccaa',
        ref_id: p.expediente_id,
        event_type: 'plazo_proximo',
        title: t.titulo.slice(0, 300),
        detail: [`${e.titulo_es || e.titulo || ''} (${e.num_expediente || ''})`, t.cierre, t.habiles].filter(Boolean).join('. ').slice(0, 600),
        url: ult?.url || null,
        cita: ult ? citaTramite(parl, bolDe.get(ult.boletin_id), ult.pagina) : null,
        occurred_at: new Date(base + eventos.length).toISOString(),
      });
      hitos.push({ destino: 'seguimiento', plazo_id: p.id, hito: h.hito, hasta: h.hasta });
    }
    if (dry) return { eventos: eventos.length, simulacion: eventos.slice(0, 20).map((e) => `${e.ref_id}: ${e.title}. ${e.detail}`) };
    if (!eventos.length) return { eventos: 0 };
    const { error: e2 } = await db.from('follow_events').upsert(eventos, { onConflict: 'kind,ref_id,event_type,occurred_at', ignoreDuplicates: true });
    if (e2) return { error: e2.message };
    await marcarHitos(db, hitos);
    return { eventos: eventos.length };
  } catch (e) {
    return { error: e.message };
  }
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

/**
 * Correo al momento a los suscriptores que siguen leyes con eventos
 * nuevos. Opciones:
 *   dry    no escribe ni envía: devuelve a quién iría y qué.
 *   desde  (solo con dry) simula con los trámites entrados desde esa fecha
 *          (AAAA-MM-DD), como si fueran eventos nuevos y sin exigir que
 *          sean posteriores al seguimiento.
 */
export async function avisarSeguimientos(db, { dry = false, desde = null } = {}) {
  const informe = { activo: CORREO_ACTIVO, eventos: 0, usuarios: 0, enviados: 0, por_alarma: 0, sin_correo: 0, free: 0 };

  // 1. Eventos candidatos.
  let eventos;
  if (dry && desde) {
    const { data, error } = await db.from('ccaa_tramites')
      .select('id, expediente_id, tipo, fecha, descripcion, boletin_id, pagina, url, origen, created_at')
      .gte('created_at', `${desde}T00:00:00+01:00`).limit(3000);
    if (error) throw new Error(error.message);
    eventos = (await eventosDe(db, data || [])).map((e, k) => ({ ...e, id: `simulado-${k}` }));
  } else {
    const hace = new Date(Date.now() - DIAS_REINTENTO * 86400000).toISOString();
    const { data, error } = await db.from('follow_events')
      .select('id, kind, ref_id, event_type, title, detail, url, cita, occurred_at')
      .eq('kind', 'ccaa').gte('occurred_at', hace).limit(3000);
    if (error) throw new Error(error.message);
    eventos = data || [];
  }
  informe.eventos = eventos.length;
  if (!eventos.length) return informe;

  // 2. Quién los sigue (desde antes del evento, salvo en la simulación).
  const leyes = [...new Set(eventos.map((e) => e.ref_id))];
  const follows = await enLotes(leyes, (lote) => db.from('follows').select('user_id, ref_id, created_at').eq('kind', 'ccaa').in('ref_id', lote));
  const pares = [];
  for (const ev of eventos) {
    for (const f of follows) {
      if (f.ref_id !== ev.ref_id) continue;
      if (!(dry && desde) && !(new Date(ev.occurred_at) > new Date(f.created_at))) continue;
      pares.push({ user_id: f.user_id, ev });
    }
  }
  if (!pares.length) return informe;

  // 3. Lo ya avisado.
  const yaAvisado = new Set();
  if (!(dry && desde)) {
    const hechos = await enLotes([...new Set(pares.map((p) => p.ev.id))], (lote) => db.from('seguimiento_avisos').select('user_id, event_id').in('event_id', lote));
    for (const h of hechos) yaAvisado.add(`${h.user_id}|${h.event_id}`);
  }
  const pendientes = pares.filter((p) => !yaAvisado.has(`${p.user_id}|${p.ev.id}`));
  if (!pendientes.length) return informe;

  // 4. Plan, preferencias y alarmas que ya lo cubren.
  const usuarios = [...new Set(pendientes.map((p) => p.user_id))];
  const niveles = await nivelesAvisos(db, usuarios);
  const [datos, prefs, alarmasLey] = await Promise.all([
    enLotes(usuarios, (lote) => db.from('users').select('id, email, first_name').in('id', lote)),
    enLotes(usuarios, (lote) => db.from('alert_preferences').select('user_id, email').in('user_id', lote)),
    enLotes(leyes, (lote) => db.from('sector_alert_matches')
      .select('user_id, ref_id, sector_alerts!inner(activa)')
      .eq('kind', 'ccaa').in('ref_id', lote).eq('descartado', false).gte('relevancia', 2).eq('sector_alerts.activa', true)),
  ]);
  const datosDe = new Map(datos.map((u) => [u.id, u]));
  const sinCorreo = new Set(prefs.filter((p) => p.email === false).map((p) => p.user_id));
  const porAlarma = new Set(alarmasLey.map((m) => `${m.user_id}|${m.ref_id}`));

  const filasAviso = [];
  const correos = new Map(); // user_id → eventos
  for (const p of pendientes) {
    // Prórroga de un plazo bloqueado: solo Novedades y resumen semanal.
    if (p.ev.event_type === 'ampliacion_bloqueada') { informe.bloqueadas = (informe.bloqueadas || 0) + 1; continue; }
    if ((niveles.get(p.user_id) || 'free') !== 'pro') { informe.free += 1; continue; }
    if (porAlarma.has(`${p.user_id}|${p.ev.ref_id}`)) {
      informe.por_alarma += 1;
      filasAviso.push({ user_id: p.user_id, event_id: p.ev.id, canal: 'alarma' });
      continue;
    }
    if (sinCorreo.has(p.user_id) || !datosDe.get(p.user_id)?.email) {
      informe.sin_correo += 1;
      filasAviso.push({ user_id: p.user_id, event_id: p.ev.id, canal: 'sin_correo' });
      continue;
    }
    if (!correos.has(p.user_id)) correos.set(p.user_id, []);
    correos.get(p.user_id).push(p.ev);
  }
  informe.usuarios = correos.size;

  // 5. Un correo por persona.
  const simulacion = [];
  const fallos = [];
  for (const [userId, evs] of correos) {
    const u = datosDe.get(userId);
    const leyesU = await leyesDe(db, evs);
    const slugDe = new Map(leyesU.map((l) => [l.id, l.slug]));
    const { subject, html } = seguimientoEmail({
      firstName: u.first_name || '',
      tramites: evs.map((ev) => ({
        ley: ev.ref_id,
        parlamento: parlamentoDe(ev.ref_id),
        titulo: ev.title,
        detalle: ev.detail,
        cita: ev.cita,
        url: ev.url,
        tipo: ev.event_type,
        fecha: fechaDeDetalle(ev.detail),
        ruta: slugDe.get(ev.ref_id) ? `/parlamentos-autonomicos/${slugDe.get(ev.ref_id)}` : '/novedades',
      })),
      leyes: leyesU,
      ajustesUrl: `${SITE_URL}/alarmas`,
    });
    if (dry || !CORREO_ACTIVO) {
      simulacion.push({ email: u.email, asunto: subject, tramites: evs.map((ev) => `${ev.title.slice(0, 90)} [${ev.cita || 'ficha'}]`) });
      continue;
    }
    try {
      await enviar({ to: u.email, subject, html });
      informe.enviados += 1;
      filasAviso.push(...evs.map((ev) => ({ user_id: userId, event_id: ev.id, canal: 'email' })));
    } catch (e) {
      fallos.push(`${userId}: ${e.message}`);
    }
  }
  if (simulacion.length) informe.simulacion = simulacion.slice(0, 20);
  if (fallos.length) informe.fallos = fallos.slice(0, 3);

  if (!dry && CORREO_ACTIVO && filasAviso.length) {
    for (let i = 0; i < filasAviso.length; i += 500) {
      const { error } = await db.from('seguimiento_avisos').upsert(filasAviso.slice(i, i + 500), { onConflict: 'user_id,event_id', ignoreDuplicates: true });
      if (error) informe.error = error.message;
    }
  }
  return informe;
}

/** Datos de las leyes de unos eventos, para el asunto y la entradilla. */
async function leyesDe(db, evs) {
  const ids = [...new Set(evs.map((e) => e.ref_id))];
  const { data } = await db.from('ccaa_expedientes').select('id, parlamento, num_expediente, titulo, titulo_es, slug').in('id', ids);
  return (data || []).map((e) => ({ id: e.id, parlamento: e.parlamento, num: e.num_expediente, titulo: e.titulo_es || e.titulo, slug: e.slug }));
}
