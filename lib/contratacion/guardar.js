// =====================================================================
// Guardar entradas de la Plataforma (ATOM CODICE) en la base de datos.
// lib/contratacion/guardar.js
//
// Lo usan el sync diario (/api/sync/contratacion) y la carga histórica
// (/api/sync/contratacion-historico). Una entrada nunca pisa una versión
// más reciente del mismo expediente: así la carga histórica puede pasar
// por encima de lo que ya hay sin estropearlo.
//
// Solo se guarda lo que la plataforma usa (12-11-2026, tras llenarse el
// disco): la última versión de cada expediente, sin historial de
// versiones, y los expedientes cerrados en formato reducido.
// =====================================================================

import { aFilas, idFuente } from '@/lib/contratacion/placsp';

// Estados de la Plataforma en los que el expediente ya no admite ofertas
// ni se está evaluando: adjudicado, resuelto o anulado.
export const CERRADAS = ['ADJ', 'RES', 'ANUL'];

/** Guarda las entradas de una página. Una entrada no pisa una versión más reciente. */
/**
 * Upsert de expedientes con reintento: con la carga histórica en marcha a
 * la vez que el sync diario, un lote de 200 a veces pasa del tiempo límite
 * de la base de datos. Se reintenta partiéndolo en dos.
 */
async function upsertPorPartes(db, filas, intento = 0) {
  const { error } = await db.from('contratacion_expedientes').upsert(filas, { onConflict: 'id' });
  if (!error) return;
  const tiempo = /statement timeout|canceling statement/i.test(error.message);
  if (!tiempo || filas.length <= 10 || intento >= 4) throw new Error(`guardar expedientes: ${error.message}`);
  const mitad = Math.ceil(filas.length / 2);
  await upsertPorPartes(db, filas.slice(0, mitad), intento + 1);
  await upsertPorPartes(db, filas.slice(mitad), intento + 1);
}

/**
 * Formato reducido: sin documentos ni texto de criterios, lo que más pesa
 * y menos sirve en un contrato ya cerrado. Duración, prórrogas, contacto,
 * lotes y pesos de los criterios se quedan. Se aplica a todo expediente
 * cerrado (CERRADAS) y, con opciones.ligero, a la carga de años anteriores.
 */
export async function guardar(db, feed, entradas, opciones = {}) {
  const out = { guardadas: 0, omitidas: 0, adjudicaciones: 0 };
  // Dentro de la página, una sola versión por expediente: la más reciente.
  const porId = new Map();
  for (const e of entradas) {
    const f = aFilas(e, feed);
    if (!f) continue;
    if ((opciones.ligero || CERRADAS.includes(f.expediente.estado)) && f.expediente.datos) {
      const { documentos, criterios, ...resto } = f.expediente.datos;
      f.expediente.datos = { ...resto, criterios: (criterios || []).map((c) => ({ tipo: c.tipo, peso: c.peso })) };
    }
    const previa = porId.get(f.expediente.id);
    if (!previa || new Date(f.expediente.actualizado_fuente) > new Date(previa.expediente.actualizado_fuente)) porId.set(f.expediente.id, f);
  }
  const todas = [...porId.values()];
  if (!todas.length) return out;

  for (let i = 0; i < todas.length; i += 100) {
    const lote = todas.slice(i, i + 100);
    const ids = lote.map((f) => f.expediente.id);
    const { data: existentes, error: e0 } = await db.from('contratacion_expedientes').select('id, actualizado_fuente, ficha:datos->contacto').in('id', ids);
    if (e0) throw new Error(`leer expedientes: ${e0.message}`);
    const guardado = new Map((existentes || []).map((x) => [x.id, { fecha: x.actualizado_fuente ? new Date(x.actualizado_fuente) : null, ficha: !!x.ficha }]));
    const aGuardar = lote.filter((f) => {
      const g = guardado.get(f.expediente.id);
      if (!g || !g.fecha) return true;
      const nueva = new Date(f.expediente.actualizado_fuente);
      // La misma versión, guardada antes de leer los datos de la ficha
      // (11-11-2026): se vuelve a guardar para completarla.
      return nueva > g.fecha || (nueva.getTime() === g.fecha.getTime() && !g.ficha && !!f.expediente.datos);
    });
    out.omitidas += lote.length - aGuardar.length;
    if (!aGuardar.length) continue;

    await upsertPorPartes(db, aGuardar.map((f) => f.expediente));
    out.guardadas += aGuardar.length;

    const conAdj = aGuardar.filter((f) => f.adjudicaciones.length);
    if (aGuardar.length) {
      const { error: e2 } = await db.from('contratacion_adjudicaciones').delete().in('expediente_id', aGuardar.map((f) => f.expediente.id));
      if (e2) throw new Error(`borrar adjudicaciones: ${e2.message}`);
    }
    const adj = conAdj.flatMap((f) => f.adjudicaciones);
    if (adj.length) {
      const { error: e3 } = await db.from('contratacion_adjudicaciones').insert(adj);
      if (e3) throw new Error(`guardar adjudicaciones: ${e3.message}`);
      out.adjudicaciones += adj.length;
    }
  }
  return out;
}

export async function aplicarBajas(db, feed, bajas) {
  const ids = bajas.map((b) => idFuente(b.ref)).filter(Boolean).map((n) => `${feed}:${n}`);
  if (!ids.length) return 0;
  const { error, count } = await db.from('contratacion_expedientes')
    .update({ eliminado: true, updated_at: new Date().toISOString() }, { count: 'exact' })
    .in('id', ids);
  if (error) throw new Error(`bajas: ${error.message}`);
  return count || 0;
}
