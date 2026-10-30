// =====================================================================
// Plazos de las leyes autonómicas y su escalera de avisos (entrega C)
// lib/ccaa/plazos.js
//
// Una ley tiene varios plazos a la vez (totalidad, articulado,
// alegaciones ciudadanas, comparecencias), cada uno con sus prórrogas.
// Antes se mezclaban en ccaa_expedientes.plazo_enmiendas (el más tardío
// de todos, comparecencias incluidas).
//
// 1. PLAZOS (ccaa_plazos, sql/109). Se reconstruyen desde ccaa_tramites:
//    cada trámite con plazo_hasta abre un plazo de su clase o, si es una
//    ampliación (o el mismo plazo repetido), alarga el plazo abierto de
//    esa clase. La clase sale del texto, en castellano o en catalán.
//
// 2. ESCALERA (decisiones de Jorge, avisos-tiempo-real.md y 30-10-2026):
//      30, 14, 7 → solo si caben (el plazo dura más que el hito + 2 días);
//                  una vez por plazo, aunque se amplíe.
//      3, 1, 0   → siempre; se repiten para la fecha nueva si se amplía.
//    Días naturales en hora de Madrid. Desde la 3.ª prórroga el plazo está
//    BLOQUEADO: sin escalera, y sus prórrogas solo en el resumen.
//    La apertura y cada ampliación se avisan como trámites (entrega A).
//    Los días hábiles que quedan se muestran como aproximados, con el
//    calendario laboral de la comunidad (lib/festivosLaborales.js).
// =====================================================================

import { PARLAMENTOS } from '@/lib/parlamentosAutonomicos';
import { habilesEntre, COMUNIDAD } from '@/lib/festivosLaborales';

export const PRORROGAS_BLOQUEADO = 3;
// Interruptor de los recordatorios (alarmas y seguimiento). Encendido el
// 30-10-2026 tras la prueba en seco. Con false se detienen; los plazos se
// reconstruyen y las prórrogas bloqueadas van al resumen igualmente.
export const RECORDATORIOS_ACTIVOS = true;
const LEJANOS = [30, 14, 7];
const CERCANOS = [3, 1, 0];
const MARGEN_APERTURA = 2;
// Una prórroga se publica a veces después del cierre que amplía (el BOPC
// lo hace al día siguiente): se cuelga del plazo si llega a ≤ estos días.
const MARGEN_PRORROGA = 5;
const LOTE = 100;

export const CLASE_TEXTO = {
  totalidad: 'enmiendas a la totalidad',
  articulado: 'enmiendas al articulado',
  enmiendas: 'enmiendas',
  alegaciones: 'alegaciones ciudadanas',
  comparecencias: 'propuesta de comparecencias',
};
const ENMIENDAS = new Set(['totalidad', 'articulado', 'enmiendas']);

const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const DIA_MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
export const diaMadrid = (iso) => DIA_MADRID.format(new Date(iso));
const HORA_MADRID = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const fechaTexto = (dia) => dia.split('-').reverse().join('/');

/** Clase del plazo a partir del trámite. */
export function claseDe(t) {
  const d = sinTildes(t.descripcion);
  if (t.tipo === 'comparecencias' || /comparecen|compareix/.test(d)) return 'comparecencias';
  if (/consideracion|ciudadan|alegacion|observacions|participacio|ciutadan/.test(d)) return 'alegaciones';
  // «a la totalidad hasta el 27 y al articulado hasta el 12»: los dos a la vez.
  if (/totalidad|totalitat/.test(d) && /articulado|articulat/.test(d)) return 'enmiendas';
  if (/totalidad|totalitat/.test(d)) return 'totalidad';
  if (/articulado|articulat|parcial/.test(d)) return 'articulado';
  return 'enmiendas';
}

/** ¿Este trámite habla de un plazo? */
const esDePlazo = (t) => !!t.plazo_hasta && ['plazo_enmiendas', 'ampliacion_plazo', 'comparecencias', 'otro', 'enmiendas_totalidad', 'enmiendas_parciales'].includes(t.tipo);

/**
 * Plazos de un expediente a partir de sus trámites (ordenados o no).
 * Devuelve [{ id, expediente_id, clase, abierto_desde, hasta, n_prorrogas,
 * tramite_apertura_id, ultimo_tramite_id }].
 */
export function construirPlazos(expedienteId, tramites) {
  const lista = (tramites || []).filter(esDePlazo)
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const plazos = [];
  for (const t of lista) {
    const clase = claseDe(t);
    const desde = t.fecha || diaMadrid(t.created_at || t.plazo_hasta);
    // El plazo de esa clase que estaba abierto cuando se publicó el trámite.
    // Una ampliación sin clase clara alarga el último de enmiendas.
    const margen = t.tipo === 'ampliacion_plazo' ? MARGEN_PRORROGA : 0;
    const vigentes = [...plazos].reverse().filter((p) => diasEntre(diaMadrid(p.hasta), desde) <= margen);
    const abierto = vigentes.find((p) => p.clase === clase)
      || (t.tipo === 'ampliacion_plazo' && ENMIENDAS.has(clase) && vigentes.find((p) => ENMIENDAS.has(p.clase) && (clase === 'enmiendas' || p.clase === 'enmiendas')));
    if (abierto) {
      if (t.plazo_hasta > abierto.hasta) {
        abierto.hasta = t.plazo_hasta;
        if (t.tipo === 'ampliacion_plazo') abierto.n_prorrogas += 1;
      }
      abierto.ultimo_tramite_id = t.id;
      continue;
    }
    plazos.push({
      id: `${expedienteId}|${clase}|${desde}`,
      expediente_id: expedienteId,
      clase,
      abierto_desde: desde,
      hasta: t.plazo_hasta,
      n_prorrogas: t.tipo === 'ampliacion_plazo' ? 1 : 0,
      tramite_apertura_id: t.id,
      ultimo_tramite_id: t.id,
    });
  }
  return plazos;
}

/**
 * Reconstruye y guarda los plazos de unos expedientes (todos si
 * `expedienteIds` es null) y corrige plazo_enmiendas de la ley: el cierre
 * más tardío de sus plazos de enmiendas, nunca el de comparecencias.
 * Con `dry`, no escribe y devuelve lo que cambiaría.
 */
export async function sincronizarPlazos(db, { expedienteIds = null, dry = false } = {}) {
  const tramites = [];
  if (expedienteIds) {
    const ids = [...new Set(expedienteIds)];
    for (let i = 0; i < ids.length; i += LOTE) {
      const { data, error } = await db.from('ccaa_tramites').select('id, expediente_id, tipo, fecha, plazo_hasta, descripcion, created_at').in('expediente_id', ids.slice(i, i + LOTE)).not('plazo_hasta', 'is', null);
      if (error) throw new Error(error.message);
      tramites.push(...(data || []));
    }
  } else {
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db.from('ccaa_tramites').select('id, expediente_id, tipo, fecha, plazo_hasta, descripcion, created_at').not('plazo_hasta', 'is', null).range(desde, desde + 999);
      if (error) throw new Error(error.message);
      tramites.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  const porExp = new Map();
  for (const t of tramites) {
    if (!porExp.has(t.expediente_id)) porExp.set(t.expediente_id, []);
    porExp.get(t.expediente_id).push(t);
  }
  const plazos = [];
  for (const [id, lista] of porExp) plazos.push(...construirPlazos(id, lista));

  // plazo_enmiendas de cada ley: el más tardío de sus plazos de enmiendas.
  const nuevoPlazo = new Map();
  for (const p of plazos) {
    if (!ENMIENDAS.has(p.clase)) continue;
    const prev = nuevoPlazo.get(p.expediente_id);
    if (!prev || p.hasta > prev) nuevoPlazo.set(p.expediente_id, p.hasta);
  }
  const exps = [];
  const ids = [...porExp.keys()];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data } = await db.from('ccaa_expedientes').select('id, plazo_enmiendas').in('id', ids.slice(i, i + LOTE));
    exps.push(...(data || []));
  }
  const cambiosLey = exps
    .map((e) => ({ id: e.id, antes: e.plazo_enmiendas, despues: nuevoPlazo.get(e.id) || null }))
    .filter((c) => (c.antes ? new Date(c.antes).getTime() : null) !== (c.despues ? new Date(c.despues).getTime() : null));

  const informe = { plazos: plazos.length, abiertos: plazos.filter((p) => p.hasta >= new Date().toISOString()).length, leyes_corregidas: cambiosLey.length };
  if (dry) return { ...informe, muestra_correcciones: cambiosLey.slice(0, 15), muestra_plazos: plazos.filter((p) => p.hasta >= new Date().toISOString()).slice(0, 15) };

  const ahora = new Date().toISOString();
  for (let i = 0; i < plazos.length; i += 500) {
    const { error } = await db.from('ccaa_plazos').upsert(plazos.slice(i, i + 500).map((p) => ({ ...p, updated_at: ahora })), { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
  for (const c of cambiosLey) {
    await db.from('ccaa_expedientes').update({ plazo_enmiendas: c.despues }).eq('id', c.id);
  }
  return informe;
}

/**
 * El hito de la escalera que toca hoy a un plazo, o null.
 * Devuelve { hito, dias, hitoClave } donde hitoClave es la clave para no
 * repetirlo: los lejanos una vez por plazo (hasta = null), los cercanos
 * una vez por fecha de cierre.
 */
export function hitoDeHoy(plazo, ahora = new Date()) {
  if (!plazo?.hasta || new Date(plazo.hasta) <= ahora) return null;
  if ((plazo.n_prorrogas || 0) >= PRORROGAS_BLOQUEADO) return null;
  const hoy = diaMadrid(ahora);
  const cierre = diaMadrid(plazo.hasta);
  const dias = diasEntre(hoy, cierre);
  const duracion = diasEntre(plazo.abierto_desde, cierre);
  const escalera = [...LEJANOS.filter((h) => duracion > h + MARGEN_APERTURA), ...CERCANOS];
  const k = escalera.findIndex((h, i) => dias <= h && dias > (escalera[i + 1] ?? -1));
  if (k < 0) return null;
  const hito = escalera[k];
  // Un lejano solo el día que se cruza o poco después (no «quedan 30» con 9).
  if (LEJANOS.includes(hito) && hito - dias > 2) return null;
  return { hito, dias, lejano: LEJANOS.includes(hito), hasta: LEJANOS.includes(hito) ? null : plazo.hasta };
}

/** Hora de cierre en Madrid, o null si no se conoce (23:59 = sin hora). */
export function horaCierre(iso) {
  const h = HORA_MADRID.format(new Date(iso));
  return h === '23:59' ? null : h;
}

/**
 * Textos del recordatorio: título («Quedan 3 días: enmiendas a la
 * totalidad»), cierre («Cierra el 13/11/2026 a las 10:30») y días hábiles
 * aproximados.
 */
export function textosRecordatorio(plazo, { dias }, parlamento, ahora = new Date()) {
  const que = CLASE_TEXTO[plazo.clase] || 'plazo';
  const hora = horaCierre(plazo.hasta);
  const cierre = dias === 0 ? null : `Cierra el ${fechaTexto(diaMadrid(plazo.hasta))}${hora ? ` a las ${hora}` : ''}`;
  const titulo = dias === 0 ? `Cierra hoy${hora ? ` a las ${hora}` : ''}: ${que}` : dias === 1 ? `Queda 1 día: ${que}` : `Quedan ${dias} días: ${que}`;
  let habiles = null;
  if (dias > 1) {
    const n = habilesEntre(diaMadrid(ahora), diaMadrid(plazo.hasta), parlamento);
    if (n !== null) habiles = `Unos ${n} ${n === 1 ? 'día hábil' : 'días hábiles'} (aproximado, según el calendario laboral de ${COMUNIDAD[parlamento] || PARLAMENTOS[parlamento]?.ccaa || 'la comunidad'})`;
  }
  return { titulo, cierre, habiles };
}

/** Los plazos abiertos de unas leyes. */
export async function plazosAbiertos(db, expedienteIds) {
  const ids = [...new Set(expedienteIds || [])];
  const salida = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await db.from('ccaa_plazos').select('*').in('expediente_id', ids.slice(i, i + LOTE)).gt('hasta', new Date().toISOString());
    if (error) throw new Error(error.message);
    salida.push(...(data || []));
  }
  return salida;
}

/** ¿Este trámite es una prórroga de un plazo ya bloqueado? (solo resumen) */
export async function prorrogasBloqueadas(db, tramites) {
  const amp = (tramites || []).filter((t) => t.tipo === 'ampliacion_plazo');
  const salida = new Set();
  if (!amp.length) return salida;
  const ids = [...new Set(amp.map((t) => t.expediente_id))];
  const plazos = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data } = await db.from('ccaa_plazos').select('expediente_id, ultimo_tramite_id, n_prorrogas').in('expediente_id', ids.slice(i, i + LOTE));
    plazos.push(...(data || []));
  }
  for (const t of amp) {
    const p = plazos.find((x) => x.ultimo_tramite_id === t.id);
    if (p && p.n_prorrogas >= PRORROGAS_BLOQUEADO) salida.add(t.id);
  }
  return salida;
}

/** Hitos ya avisados de unos plazos: Set de «destino|plazo|hito|hasta». */
export async function hitosAvisados(db, plazoIds) {
  const ids = [...new Set(plazoIds || [])];
  const hechos = new Set();
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await db.from('ccaa_plazo_avisos').select('destino, plazo_id, hito, hasta').in('plazo_id', ids.slice(i, i + LOTE));
    if (error) throw new Error(error.message);
    for (const h of data || []) hechos.add(`${h.destino}|${h.plazo_id}|${h.hito}|${h.hasta ? new Date(h.hasta).getTime() : ''}`);
  }
  return hechos;
}
export const claveHito = (destino, plazoId, h) => `${destino}|${plazoId}|${h.hito}|${h.hasta ? new Date(h.hasta).getTime() : ''}`;

/** Apunta hitos avisados: [{ destino, plazo_id, hito, hasta }]. */
export async function marcarHitos(db, filas) {
  for (let i = 0; i < (filas || []).length; i += 500) {
    const { error } = await db.from('ccaa_plazo_avisos').upsert(filas.slice(i, i + 500), { onConflict: 'destino,plazo_id,hito,hasta', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
}

/**
 * Recordatorios de plazos autonómicos para las alarmas: las que ya
 * encontraron la ley (relevancia ≥2). Mismo formato que los de
 * /api/alarmas/vigilar, más plazoId y hito para apuntarlos.
 */
export async function recordatoriosAlarmas(db, alarmas, ahora = new Date()) {
  const porId = new Map((alarmas || []).map((a) => [a.id, a]));
  if (!porId.size) return [];
  const ids = [...porId.keys()];
  const leyes = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await db.from('sector_alert_matches').select('alert_id, user_id, ref_id, created_at')
      .eq('kind', 'ccaa').in('alert_id', ids.slice(i, i + LOTE)).eq('descartado', false).gte('relevancia', 2);
    if (error) throw new Error(error.message);
    leyes.push(...(data || []));
  }
  if (!leyes.length) return [];
  const plazos = await plazosAbiertos(db, leyes.map((m) => m.ref_id));
  if (!plazos.length) return [];
  const exps = [];
  const expIds = [...new Set(plazos.map((p) => p.expediente_id))];
  for (let i = 0; i < expIds.length; i += LOTE) {
    const { data } = await db.from('ccaa_expedientes').select('id, parlamento, num_expediente, titulo, titulo_es, slug').in('id', expIds.slice(i, i + LOTE));
    exps.push(...(data || []));
  }
  const expDe = new Map(exps.map((e) => [e.id, e]));
  const hechos = await hitosAvisados(db, plazos.map((p) => p.id));
  const salida = [];
  for (const m of leyes) {
    const e = expDe.get(m.ref_id);
    if (!e?.slug) continue;
    for (const p of plazos.filter((x) => x.expediente_id === m.ref_id)) {
      const h = hitoDeHoy(p, ahora);
      if (!h) continue;
      const destino = `alarma:${m.alert_id}`;
      if (hechos.has(claveHito(destino, p.id, h))) continue;
      const t = textosRecordatorio(p, h, e.parlamento, ahora);
      salida.push({
        alert_id: m.alert_id,
        user_id: m.user_id,
        kind: 'ccaa',
        ref_id: m.ref_id,
        titulo: t.titulo,
        fuente: PARLAMENTOS[e.parlamento]?.nombre || 'Parlamentos autonómicos',
        ruta: `/parlamentos-autonomicos/${e.slug}`,
        plazo: p.hasta,
        dias: h.dias,
        umbral: h.hito,
        motivo: [`${e.titulo_es || e.titulo} (${e.num_expediente}).`, t.cierre ? `${t.cierre}.` : null, t.habiles ? `${t.habiles}.` : null].filter(Boolean).join(' '),
        plazoId: p.id,
        hito: { destino, plazo_id: p.id, hito: h.hito, hasta: h.hasta },
      });
    }
  }
  return salida;
}
