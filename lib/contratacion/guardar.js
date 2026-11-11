// =====================================================================
// Guardar entradas de la Plataforma (ATOM CODICE) en la base de datos.
// lib/contratacion/guardar.js
//
// Lo usan el sync diario (/api/sync/contratacion) y la carga histórica
// (/api/sync/contratacion-historico). Una entrada nunca pisa una versión
// más reciente del mismo expediente: así la carga histórica puede pasar
// por encima de lo que ya hay sin estropearlo.
// =====================================================================

import { aFilas, idFuente } from '@/lib/contratacion/placsp';

/** Guarda las entradas de una página. Una entrada no pisa una versión más reciente. */
export async function guardar(db, feed, entradas) {
  const out = { guardadas: 0, omitidas: 0, eventos: 0, adjudicaciones: 0 };
  // Dentro de la página, una sola versión por expediente: la más reciente.
  const porId = new Map();
  for (const e of entradas) {
    const f = aFilas(e, feed);
    if (!f) continue;
    const previa = porId.get(f.expediente.id);
    if (!previa || new Date(f.expediente.actualizado_fuente) > new Date(previa.expediente.actualizado_fuente)) porId.set(f.expediente.id, f);
  }
  const todas = [...porId.values()];
  const eventos = entradas.map((e) => aFilas(e, feed)?.evento).filter(Boolean);
  if (!todas.length) return out;

  for (let i = 0; i < todas.length; i += 200) {
    const lote = todas.slice(i, i + 200);
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

    const { error: e1 } = await db.from('contratacion_expedientes').upsert(aGuardar.map((f) => f.expediente), { onConflict: 'id' });
    if (e1) throw new Error(`guardar expedientes: ${e1.message}`);
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

  for (let i = 0; i < eventos.length; i += 500) {
    const lote = eventos.slice(i, i + 500).filter((ev) => porId.has(ev.expediente_id));
    if (!lote.length) continue;
    const { error, count } = await db.from('contratacion_eventos')
      .upsert(lote, { onConflict: 'expediente_id,actualizado_fuente', ignoreDuplicates: true, count: 'exact' });
    if (error) throw new Error(`guardar eventos: ${error.message}`);
    out.eventos += count ?? lote.length;
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
