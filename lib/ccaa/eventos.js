// =====================================================================
// Avisos de seguimiento de leyes autonómicas
// lib/ccaa/eventos.js
//
// Cuando el sync guarda trámites nuevos de un expediente que alguien
// sigue (follows.kind = 'ccaa'), deja un follow_event por trámite: es lo
// que cuenta Seguimiento como novedad y lo que llega a los avisos.
//
// Como en la agenda del Gobierno, occurred_at es el momento en que se
// detecta, no la fecha del trámite: un trámite de hace diez días que el
// boletín publica hoy es novedad hoy para quien lo sigue. Los
// milisegundos separan eventos del mismo expediente, porque occurred_at
// forma parte de la clave única.
// =====================================================================

import { PARLAMENTOS } from '@/lib/parlamentosAutonomicos';

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

/**
 * `nuevos`: trámites recién insertados [{ expediente_id, tipo, fecha,
 * descripcion, plazo_hasta }]. Devuelve { eventos } o { error }.
 */
export async function eventosDeSeguimiento(db, nuevos) {
  const utiles = (nuevos || []).filter((t) => t && t.expediente_id && t.tipo !== 'otro');
  if (!utiles.length) return { eventos: 0 };
  const ids = [...new Set(utiles.map((t) => t.expediente_id))];
  const { data: follows, error } = await db.from('follows').select('ref_id').eq('kind', 'ccaa').in('ref_id', ids);
  if (error) return { error: error.message };
  const seguidos = new Set((follows || []).map((f) => f.ref_id));
  const suyos = utiles.filter((t) => seguidos.has(t.expediente_id));
  if (!suyos.length) return { eventos: 0 };

  const { data: exps } = await db.from('ccaa_expedientes').select('id, parlamento, titulo').in('id', [...new Set(suyos.map((t) => t.expediente_id))]);
  const porId = new Map((exps || []).map((e) => [e.id, e]));
  const base = Date.now();
  const filas = suyos.map((t, k) => {
    const e = porId.get(t.expediente_id);
    const quien = PARLAMENTOS[e?.parlamento]?.ccaa || '';
    return {
      kind: 'ccaa',
      ref_id: t.expediente_id,
      event_type: t.tipo,
      title: `${ACTO[t.tipo] || 'Nuevo trámite'}${quien ? ` · ${quien}` : ''}`.slice(0, 300),
      detail: [t.fecha, t.descripcion].filter(Boolean).join(': ').slice(0, 600) || null,
      occurred_at: new Date(base + k).toISOString(),
    };
  });
  const { error: eEv } = await db.from('follow_events').upsert(filas, { onConflict: 'kind,ref_id,event_type,occurred_at', ignoreDuplicates: true });
  if (eEv) return { error: eEv.message };
  return { eventos: filas.length };
}
