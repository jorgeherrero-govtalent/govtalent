'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LEGISLATURA } from '@/lib/legislatura';

/**
 * Cortes disueltas (lib/legislatura.js): el bloque de estado del Congreso
 * y quién sigue en funciones. Maqueta «C con el filtro de la B»
 * (07-10-2026).
 *
 * Con las Cortes disueltas solo siguen en funciones los miembros de la
 * Diputación Permanente; el resto de diputados de la XV tiene el mandato
 * concluido. Cuando LEGISLATURA.disuelta vuelva a null, todo esto deja de
 * pintarse solo.
 */

export const DISUELTA = !!LEGISLATURA.disuelta;
export const FECHA_DISOLUCION = LEGISLATURA.disuelta ? LEGISLATURA.disuelta.split('-').reverse().join('/') : null;
const MORADO = '#6d5aef';

let promesa = null;
/** Ids de los diputados de la Diputación Permanente (se pide una vez). */
export function pedirDiputacionPermanente() {
  if (!promesa) {
    const supabase = createClient();
    promesa = supabase
      .from('es_committee_people')
      .select('deputy_id')
      .eq('committee_name', 'Diputación Permanente')
      .not('deputy_id', 'is', null)
      .then(({ data }) => new Set((data || []).map((x) => x.deputy_id)))
      .catch(() => new Set());
  }
  return promesa;
}

export function useDiputacionPermanente() {
  const [ids, setIds] = useState(null);
  useEffect(() => {
    if (!DISUELTA) return;
    let vivo = true;
    pedirDiputacionPermanente().then((s) => vivo && setIds(s));
    return () => {
      vivo = false;
    };
  }, []);
  return ids;
}

/** «En funciones» / «Mandato concluido», en una fila o en la ficha. */
export function EstadoDiputado({ enFunciones, largo = false }) {
  if (!DISUELTA || enFunciones === null || enFunciones === undefined) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: largo ? 12.5 : 11.5, color: enFunciones ? '#3d3a35' : '#8b8780' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: enFunciones ? MORADO : '#c9c6bf', flexShrink: 0 }} aria-hidden="true"></span>
      {largo
        ? enFunciones
          ? 'En funciones en la Diputación Permanente hasta la constitución de las nuevas Cortes'
          : `Mandato concluido con la disolución de las Cortes (${FECHA_DISOLUCION})`
        : enFunciones
          ? 'En funciones'
          : 'Mandato concluido'}
    </span>
  );
}

/** Las tres cifras y la nota, encima de las pestañas del Congreso. */
export default function EstadoLegislatura() {
  const dp = useDiputacionPermanente();
  const [total, setTotal] = useState(null);
  useEffect(() => {
    if (!DISUELTA) return;
    const supabase = createClient();
    supabase
      .from('deputies')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .then(({ count }) => setTotal(count ?? null));
  }, []);
  if (!DISUELTA) return null;

  const cifra = (n, texto) => (
    <div style={{ background: '#faf9f5', borderRadius: 9, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 19, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{n ?? '—'}</div>
      <div style={{ fontSize: 11, color: '#8b8780', marginTop: 2 }}>{texto}</div>
    </div>
  );

  return (
    <div className="card" style={{ padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {cifra(total, `diputados ${LEGISLATURA.romana}`)}
        {cifra(dp ? dp.size : null, 'en la Diputación Permanente')}
        {cifra('29N', 'elecciones generales')}
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: '#8b8780', lineHeight: 1.55 }}>
        Cortes disueltas el {FECHA_DISOLUCION}. Las comisiones y leyes de la {LEGISLATURA.romana} Legislatura quedan como estaban; las nuevas se
        cargarán al constituirse las Cortes.
      </p>
    </div>
  );
}
