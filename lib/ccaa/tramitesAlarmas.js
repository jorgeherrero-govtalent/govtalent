// =====================================================================
// Avisos de cada paso de la tramitación autonómica en las alarmas
// lib/ccaa/tramitesAlarmas.js
//
// Entrega A de «seguimiento-leyes-autonomicas.md» (30-10-2026).
//
// Una ley autonómica es una fila de regulatorio_search (kind 'ccaa') y
// sector_alert_matches es UNIQUE(alert_id, kind, ref_id): una vez que una
// alarma la encuentra, sus trámites siguientes no podían volver a avisar.
// Desde sql/107 cada trámite es además una fila propia (kind
// 'ccaa_tramite', ref_id = id del trámite), y aquí se decide SIN IA cuáles
// van a cada alarma:
//
//   · la alarma ya encontró la ley con relevancia 2 o 3 y no la ha
//     descartado (la relevancia 1, «contexto útil», no avisa: decisión
//     del 06-10-2026);
//   · el trámite entró en GovTalent DESPUÉS de esa coincidencia (lo
//     anterior ya iba en el aviso de la ley);
//   · la ley sigue abierta, o el trámite es el que la cierra;
//   · no repite un acto que ya llega por la otra fuente (ficha o boletín,
//     lib/ccaa/duplicados.js).
//
// Cada trámite entra como coincidencia de relevancia 3 y se envía según
// la frecuencia de la alarma. La clave única de sector_alert_matches
// evita avisarlo dos veces.
//
// Los seguimientos (follows kind 'ccaa') no pasan por aquí: los avisa el
// sync con follow_events (lib/ccaa/eventos.js, entrega B).
// =====================================================================

import { PARLAMENTOS } from '@/lib/parlamentosAutonomicos';
import { separarDuplicados } from '@/lib/ccaa/duplicados';
import { prorrogasBloqueadas, PRORROGAS_BLOQUEADO } from '@/lib/ccaa/plazos';

const CIERRE = new Set(['aprobacion', 'rechazo', 'retirada', 'caducidad']);
const LOTE = 100;

const fechaTexto = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : null);

async function enLotes(ids, fn) {
  const salida = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await fn(ids.slice(i, i + LOTE));
    if (error) throw new Error(error.message);
    salida.push(...(data || []));
  }
  return salida;
}

/** Texto del motivo: qué ley es, quién y cuándo, y la cita al boletín. */
export function motivoTramite({ t, e, boletin }) {
  const p = PARLAMENTOS[e.parlamento];
  const ley = e.titulo_es || e.titulo;
  const quien = [t.organo, fechaTexto(t.fecha)].filter(Boolean).join(', ');
  const fuente = boletin?.numero
    ? `Fuente: ${p?.boletin || 'boletín'} n.º ${boletin.numero}${t.pagina ? `, pág. ${t.pagina}` : ''}.`
    : `Fuente: ficha del expediente en la web del ${p?.nombre || 'parlamento'}.`;
  return `Nuevo paso en la tramitación de «${ley}» (${e.num_expediente}), que esta alarma vigila.${quien ? ` ${quien}.` : ''} ${fuente}`.slice(0, 1000);
}

/**
 * `alarmas`: las vigentes de la pasada [{ id, user_id, nombre }].
 * `recientes`: filas kind 'ccaa_tramite' de regulatorio_reciente.
 * `desde` (solo pruebas en seco): toma los trámites entrados desde esa
 *   fecha y no exige que sean posteriores a la coincidencia de la ley,
 *   para ver qué se habría avisado.
 * Devuelve { candidatos, filas } con las filas listas para
 * sector_alert_matches.
 */
export async function avisosDeTramites(db, { alarmas, recientes = [], desde = null }) {
  const vigentes = new Map((alarmas || []).map((a) => [a.id, a]));
  if (!vigentes.size) return { candidatos: 0, filas: [] };

  const columnas = 'id, expediente_id, tipo, fecha, plazo_hasta, descripcion, organo, boletin_id, pagina, origen, created_at';
  let tramites;
  if (desde) {
    const { data, error } = await db.from('ccaa_tramites').select(columnas).gte('created_at', `${desde}T00:00:00+01:00`).limit(3000);
    if (error) throw new Error(error.message);
    tramites = data || [];
  } else {
    const ids = [...new Set(recientes.filter((r) => r.kind === 'ccaa_tramite').map((r) => r.ref_id))];
    if (!ids.length) return { candidatos: 0, filas: [] };
    tramites = await enLotes(ids, (lote) => db.from('ccaa_tramites').select(columnas).in('id', lote));
  }
  if (!tramites.length) return { candidatos: 0, filas: [] };
  // El mismo acto por la ficha y por el boletín: solo uno (lib/ccaa/duplicados.js).
  // Lo que espera vuelve en la pasada siguiente (sigue en lo reciente 7 días).
  tramites = (await separarDuplicados(db, tramites)).avisar;
  if (!tramites.length) return { candidatos: 0, filas: [] };

  const expIds = [...new Set(tramites.map((t) => t.expediente_id))];
  const leyes = (await enLotes(expIds, (lote) => db
    .from('sector_alert_matches')
    .select('alert_id, user_id, ref_id, created_at')
    .eq('kind', 'ccaa')
    .in('ref_id', lote)
    .eq('descartado', false)
    .gte('relevancia', 2)))
    .filter((m) => vigentes.has(m.alert_id));
  if (!leyes.length) return { candidatos: tramites.length, filas: [] };

  const conAlarma = [...new Set(leyes.map((m) => m.ref_id))];
  const exps = await enLotes(conAlarma, (lote) => db
    .from('ccaa_expedientes')
    .select('id, parlamento, num_expediente, titulo, titulo_es, slug, is_closed')
    .in('id', lote));
  const expDe = new Map(exps.map((e) => [e.id, e]));
  const bolIds = [...new Set(tramites.map((t) => t.boletin_id).filter(Boolean))];
  const bols = bolIds.length ? await enLotes(bolIds, (lote) => db.from('ccaa_boletines').select('id, numero').in('id', lote)) : [];
  const bolDe = new Map(bols.map((b) => [b.id, b]));

  // Prórroga de un plazo bloqueado (3.ª o siguientes): al resumen de primera
  // hora, no al aviso al momento (entrega C).
  const bloqueadas = await prorrogasBloqueadas(db, tramites);
  const porExp = new Map();
  for (const t of tramites) {
    if (!porExp.has(t.expediente_id)) porExp.set(t.expediente_id, []);
    porExp.get(t.expediente_id).push(t);
  }

  const filas = [];
  for (const m of leyes) {
    const e = expDe.get(m.ref_id);
    if (!e?.slug) continue;
    for (const t of porExp.get(m.ref_id) || []) {
      if (!desde && !(new Date(t.created_at) > new Date(m.created_at))) continue;
      if (e.is_closed && !CIERRE.has(t.tipo)) continue;
      filas.push({
        alert_id: m.alert_id,
        user_id: m.user_id,
        kind: 'ccaa_tramite',
        ref_id: t.id,
        titulo: String(t.descripcion || t.tipo).replace(/\s+/g, ' ').trim().slice(0, 500),
        fuente: 'Parlamentos autonómicos',
        ruta: `/parlamentos-autonomicos/${e.slug}`,
        motivo: `${bloqueadas.has(t.id) ? `Plazo ampliado de nuevo (lleva ${PRORROGAS_BLOQUEADO} prórrogas o más). ` : ''}${motivoTramite({ t, e, boletin: bolDe.get(t.boletin_id) })}`.slice(0, 1000),
        plazo: t.plazo_hasta || null,
        relevancia: 3,
        solo_resumen: bloqueadas.has(t.id),
      });
    }
  }
  return { candidatos: tramites.length, filas };
}

/**
 * ¿Hay alguna alarma que ya haya encontrado alguna de estas leyes? Lo usa
 * el sync para lanzar la pasada urgente solo cuando sirve.
 */
export async function hayAlarmasDeLeyes(db, expedienteIds) {
  const ids = [...new Set((expedienteIds || []).filter(Boolean))];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await db
      .from('sector_alert_matches')
      .select('id')
      .eq('kind', 'ccaa')
      .in('ref_id', ids.slice(i, i + LOTE))
      .eq('descartado', false)
      .gte('relevancia', 2)
      .limit(1);
    if (error) throw new Error(error.message);
    if (data?.length) return true;
  }
  return false;
}
