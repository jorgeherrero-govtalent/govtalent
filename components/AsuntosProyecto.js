'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Los asuntos del proyecto, con su tramitación.
 *
 * Esto es lo que separa un proyecto de GovTalent de una hoja de cálculo:
 * el proyecto sabe en qué fase está cada asunto y cuánto queda, sin que
 * nadie lo actualice a mano.
 *
 * CUATRO FUENTES, UNA FORMA. Cada tipo guarda su recorrido en una tabla
 * distinta y con nombres distintos de columna:
 *
 *   ley / actividad  → es_initiative_timeline  (organo, fase, es_actual)
 *   expediente       → eu_initiative_recorrido (fase, momento, es_actual)
 *   procedimiento    → ep_procedure_timeline   (activity_type, activity_date)
 *   boe              → no tiene: es una publicación, no una tramitación
 *
 * Aquí se normalizan a { etiqueta, cuando, estado } y se pintan igual.
 * No se copia nada: el dato sigue viviendo en Regulatorio.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const ORIGEN = {
  ley: 'Congreso · proyecto de ley',
  actividad: 'Congreso · actividad parlamentaria',
  expediente: 'Comisión Europea · expediente',
  procedimiento: 'Parlamento Europeo · procedimiento',
  boe: 'BOE',
};

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((d - hoy) / 86400000);
}

function legible(codigo) {
  if (!codigo) return 'Fase';
  return codigo.charAt(0).toUpperCase() + codigo.slice(1).toLowerCase().replace(/_/g, ' ');
}

export default function AsuntosProyecto({ projectId }) {
  const supabase = createClient();
  const [asuntos, setAsuntos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data: items } = await supabase
      .from('project_items')
      .select('id, kind, ref_id, etiqueta')
      .eq('project_id', projectId)
      .order('created_at');

    if (!items || items.length === 0) {
      setAsuntos([]);
      setCargando(false);
      return;
    }

    // Una consulta por tipo, no una por asunto: con ocho asuntos de tres
    // tipos son tres llamadas, no ocho.
    const porTipo = {};
    for (const it of items) (porTipo[it.kind] ||= []).push(it.ref_id);

    const [esp, eu, pe] = await Promise.all([
      porTipo.ley || porTipo.actividad
        ? supabase
            .from('es_initiative_timeline')
            .select('num_expediente, organo, fase, fecha_inicio, fecha_fin, es_actual, ord')
            .in('num_expediente', [...(porTipo.ley || []), ...(porTipo.actividad || [])])
            .order('ord')
        : { data: [] },
      porTipo.expediente
        ? supabase
            .from('eu_initiative_recorrido')
            .select('initiative_id, fase, momento, es_actual, dias_restantes, fecha_fin, orden')
            .in('initiative_id', porTipo.expediente)
            .order('orden')
        : { data: [] },
      porTipo.procedimiento
        ? supabase
            .from('ep_procedure_timeline')
            .select('process_id, activity_type, activity_date')
            .in('process_id', porTipo.procedimiento)
            .order('activity_date', { ascending: true })
        : { data: [] },
    ]);

    const salida = items.map((it) => {
      let fases = [];

      if (it.kind === 'ley' || it.kind === 'actividad') {
        fases = (esp.data || [])
          .filter((e) => String(e.num_expediente) === String(it.ref_id))
          .map((e) => ({
            etiqueta: e.organo,
            detalle: e.fase,
            cuando: fechaCorta(e.fecha_inicio),
            estado: e.es_actual ? 'actual' : e.fecha_inicio ? 'hecha' : 'futura',
            dias: null,
          }));
      } else if (it.kind === 'expediente') {
        fases = (eu.data || [])
          .filter((e) => String(e.initiative_id) === String(it.ref_id))
          .map((e) => ({
            etiqueta: e.fase,
            detalle: null,
            cuando: fechaCorta(e.fecha_fin),
            estado: e.es_actual ? 'actual' : e.momento === 'proxima' ? 'futura' : 'hecha',
            dias: e.es_actual ? e.dias_restantes : null,
          }));
      } else if (it.kind === 'procedimiento') {
        const eventos = (pe.data || []).filter((e) => String(e.process_id) === String(it.ref_id));
        // El PE registra muchos eventos del mismo tipo el mismo día: se
        // colapsan, o el recorrido se vuelve ilegible.
        const vistos = new Set();
        fases = eventos
          .filter((e) => {
            const k = `${e.activity_type}|${e.activity_date}`;
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
          })
          .slice(-6)
          .map((e, i, arr) => ({
            etiqueta: legible(e.activity_type),
            detalle: null,
            cuando: fechaCorta(e.activity_date),
            estado: i === arr.length - 1 ? 'actual' : 'hecha',
            dias: null,
          }));
      }

      return { ...it, fases };
    });

    setAsuntos(salida);
    setCargando(false);
  }, [supabase, projectId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) return <div className="spinner"></div>;

  if (asuntos.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.65, maxWidth: 470 }}>
        Todavía ninguno. Desde la ficha de una ley, un expediente o un procedimiento podrás mandarla a
        este proyecto, y traerá su tramitación y sus plazos.
      </div>
    );
  }

  return (
    <div>
      {asuntos.map((a) => {
        const actual = a.fases.find((f) => f.estado === 'actual');
        return (
          <div key={a.id} style={{ background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 10, padding: '15px 18px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{a.etiqueta || a.ref_id}</div>
                <div style={{ fontSize: 11.5, color: '#888', marginTop: 3 }}>{ORIGEN[a.kind] || 'Seguimiento'}</div>
              </div>
              {actual?.dias > 0 && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>Quedan {actual.dias} días</div>
                  <div style={{ fontSize: 10.5, color: '#888' }}>{actual.etiqueta}</div>
                </div>
              )}
            </div>

            {a.fases.length === 0 ? (
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 11, lineHeight: 1.6 }}>
                {a.kind === 'boe'
                  ? 'Publicado en el BOE: no tiene tramitación que seguir.'
                  : 'Sin recorrido registrado todavía.'}
              </div>
            ) : (
              // Barras en fila: se lee de un vistazo por dónde va, que es
              // la única pregunta que se hace quien abre el proyecto.
              <div style={{ display: 'flex', gap: 6, marginTop: 15 }}>
                {a.fases.map((f, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                    <div
                      style={{
                        height: 3,
                        borderRadius: 2,
                        marginBottom: 7,
                        background: f.estado === 'futura' ? BORDE : MORADO,
                      }}
                    ></div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: f.estado === 'futura' ? 400 : 600,
                        color: f.estado === 'futura' ? '#a8a49c' : f.estado === 'actual' ? MORADO : '#1a1a18',
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={f.detalle || f.etiqueta}
                    >
                      {f.etiqueta}
                    </div>
                    <div style={{ fontSize: 10.5, color: f.estado === 'futura' ? '#a8a49c' : '#888', marginTop: 2 }}>
                      {f.cuando || '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
