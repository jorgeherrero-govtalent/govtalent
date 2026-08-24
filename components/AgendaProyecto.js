'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import SelectorFecha from '@/components/SelectorFecha';

/**
 * La agenda del proyecto.
 *
 * Mezcla dos cosas que en el oficio van juntas: los plazos oficiales que
 * vienen del calendario de la norma, y las gestiones propias. Los
 * primeros no se pueden editar ni borrar — son fechas de fuera — y por
 * eso se marcan distinto.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function parteFecha(iso) {
  if (!iso) return { dia: '—', mes: '' };
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { dia: '—', mes: '' };
  return { dia: String(d.getDate()).padStart(2, '0'), mes: MESES[d.getMonth()] };
}

function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((d - hoy) / 86400000);
}

// Lo que se hace en casi cualquier asunto, en el orden en que se hace.
// No son acciones de mentira pintadas en gris: se pulsan y se crean de
// verdad, sin fecha, para que el usuario la ponga. Una plantilla que
// solo decora se acaba leyendo como si fueran tus acciones.
const SUGERENCIAS = [
  'Fijar la posición interna',
  'Preparar el argumentario',
  'Solicitar reunión con el órgano competente',
  'Enviar la aportación antes del cierre de plazo',
];

// Atajos que cubren casi todo sin abrir el calendario.
function atajosFecha() {
  const iso = (d) => {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
  };
  const hoy = new Date();
  const mas = (n) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  return [
    { label: 'Hoy', iso: iso(hoy) },
    { label: 'Mañana', iso: mas(1) },
    { label: 'En una semana', iso: mas(7) },
  ];
}

export default function AgendaProyecto({ projectId }) {
  const supabase = createClient();
  const [acciones, setAcciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState('');
  const [recordatorio, setRecordatorio] = useState('');
  const [verHechas, setVerHechas] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_actions')
      .select('id, titulo, detalle, fecha, recordatorio_dias, estado, actor_id')
      .eq('project_id', projectId)
      .order('fecha', { ascending: true, nullsFirst: false });
    if (error) toast('No se ha podido cargar la agenda');
    setAcciones(data || []);
    setCargando(false);
  }, [supabase, projectId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crear() {
    const t = titulo.trim();
    if (!t) return;
    const { data, error } = await supabase
      .from('project_actions')
      .insert({
        project_id: projectId,
        titulo: t,
        fecha: fecha || null,
        recordatorio_dias: recordatorio === '' ? null : Number(recordatorio),
      })
      .select('id, titulo, detalle, fecha, recordatorio_dias, estado, actor_id')
      .single();
    if (error) {
      toast('No se ha podido guardar la acción');
      return;
    }
    setAcciones((prev) =>
      [...prev, data].sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999'))
    );
    setTitulo('');
    setFecha('');
    setRecordatorio('');
    setCreando(false);
  }

  async function crearSugerida(titulo) {
    const { data, error } = await supabase
      .from('project_actions')
      .insert({ project_id: projectId, titulo })
      .select('id, titulo, detalle, fecha, recordatorio_dias, estado, actor_id')
      .single();
    if (error) {
      toast('No se ha podido crear la acción');
      return;
    }
    setAcciones((prev) => [...prev, data]);
  }

  async function cambiarEstado(a) {
    const nuevo = a.estado === 'hecha' ? 'pendiente' : 'hecha';
    setAcciones((prev) => prev.map((x) => (x.id === a.id ? { ...x, estado: nuevo } : x)));
    const { error } = await supabase.from('project_actions').update({ estado: nuevo }).eq('id', a.id);
    if (error) toast('No se ha podido actualizar');
  }

  async function borrar(id) {
    setAcciones((prev) => prev.filter((x) => x.id !== id));
    const { error } = await supabase.from('project_actions').delete().eq('id', id);
    if (error) toast('No se ha podido borrar');
  }

  if (cargando) return <div className="spinner"></div>;

  const pendientes = acciones.filter((a) => a.estado === 'pendiente');
  const hechas = acciones.filter((a) => a.estado === 'hecha');
  const lista = verHechas ? hechas : pendientes;

  return (
    <div style={{ maxWidth: 620 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setVerHechas(false)}
            style={{
              fontSize: 11.5,
              padding: '4px 11px',
              borderRadius: 20,
              border: verHechas ? `.5px solid ${BORDE}` : 'none',
              background: verHechas ? '#fff' : MORADO,
              color: verHechas ? '#555' : '#fff',
            }}
          >
            Pendientes {pendientes.length}
          </button>
          <button
            onClick={() => setVerHechas(true)}
            style={{
              fontSize: 11.5,
              padding: '4px 11px',
              borderRadius: 20,
              border: verHechas ? 'none' : `.5px solid ${BORDE}`,
              background: verHechas ? MORADO : '#fff',
              color: verHechas ? '#fff' : '#555',
            }}
          >
            Hechas {hechas.length}
          </button>
        </div>
        {!creando && (
          <button className="btn-ai-o" onClick={() => setCreando(true)}>
            <i className="ti ti-plus"></i> Acción
          </button>
        )}
      </div>

      {creando && (
        <div style={{ border: `.5px solid ${BORDE}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <input
            autoFocus
            value={titulo}
            maxLength={200}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') crear();
              if (e.key === 'Escape') setCreando(false);
            }}
            placeholder="Enviar posición técnica a la Secretaría"
            style={{
              width: '100%',
              padding: '9px 12px',
              border: `.5px solid ${BORDE}`,
              borderRadius: 9,
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
              marginBottom: 10,
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <SelectorFecha
              value={fecha}
              onChange={(v) => setFecha(v || '')}
              placeholder="Sin fecha"
              ancho={168}
              desdeAno={new Date().getFullYear() - 1}
              atajos={atajosFecha()}
            />
            <select
              className="fsel"
              value={recordatorio}
              onChange={(e) => setRecordatorio(e.target.value)}
              disabled={!fecha}
              title={fecha ? 'Recordatorio' : 'Primero elige una fecha'}
            >
              <option value="">Sin recordatorio</option>
              <option value="0">El mismo día</option>
              <option value="1">1 día antes</option>
              <option value="2">2 días antes</option>
              <option value="7">1 semana antes</option>
            </select>
            <button className="btn-ai" onClick={crear} disabled={!titulo.trim()} style={{ marginLeft: 'auto' }}>
              Añadir
            </button>
            <button className="btn-o" onClick={() => setCreando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* La plantilla solo mientras la agenda esté vacía del todo: en
          cuanto hay una acción propia, sobra. */}
      {acciones.length === 0 && !creando && !verHechas && (
        <div>
          <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.6, marginBottom: 14, maxWidth: 460 }}>
            Anota lo que hay que hacer y cuándo. Los plazos de las normas que sigues aparecerán aquí solos.
          </div>
          <div style={{ fontSize: 11, color: '#888', letterSpacing: '.3px', marginBottom: 9 }}>
            EMPIEZA POR AQUÍ
          </div>
          {SUGERENCIAS.map((t) => (
            <button
              key={t}
              onClick={() => crearSugerida(t)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '9px 12px',
                marginBottom: 6,
                border: `.5px dashed #c4c0b8`,
                borderRadius: 9,
                background: 'transparent',
                color: '#555',
                fontSize: 12.5,
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: 14, color: '#a8a49c', flexShrink: 0 }}></i>
              {t}
            </button>
          ))}
        </div>
      )}

      {lista.length === 0 && !creando && (acciones.length > 0 || verHechas) && (
        <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.6, padding: '8px 0' }}>
          {verHechas ? 'Todavía no has cerrado ninguna acción.' : 'No queda nada pendiente.'}
        </div>
      )}

      {lista.map((a, i) => {
        const { dia, mes } = parteFecha(a.fecha);
        const dias = diasHasta(a.fecha);
        return (
          <div
            key={a.id}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: '11px 0',
              borderBottom: i < lista.length - 1 ? `.5px solid ${BORDE}` : 'none',
            }}
          >
            <button
              onClick={() => cambiarEstado(a)}
              aria-label={a.estado === 'hecha' ? 'Marcar como pendiente' : 'Marcar como hecha'}
              style={{
                width: 17,
                height: 17,
                borderRadius: '50%',
                border: a.estado === 'hecha' ? 'none' : `1px solid #b8b4ac`,
                background: a.estado === 'hecha' ? MORADO : 'transparent',
                color: '#fff',
                fontSize: 10,
                flexShrink: 0,
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {a.estado === 'hecha' && <i className="ti ti-check" style={{ fontSize: 11 }}></i>}
            </button>

            <div style={{ textAlign: 'center', flexShrink: 0, width: 34 }}>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.1, color: a.fecha ? '#1a1a18' : '#c4c0b8' }}>
                {dia}
              </div>
              <div style={{ fontSize: 10, color: '#888' }}>{mes}</div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: a.estado === 'hecha' ? '#888' : '#1a1a18',
                  textDecoration: a.estado === 'hecha' ? 'line-through' : 'none',
                }}
              >
                {a.titulo}
              </div>
              <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>
                {/* La urgencia se dice con la frase, no con color. */}
                {a.estado === 'pendiente' && dias !== null && dias >= 0 && (
                  <span style={{ color: dias <= 7 ? '#1a1a18' : '#888', fontWeight: dias <= 7 ? 600 : 400 }}>
                    {dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `Quedan ${dias} días`}
                  </span>
                )}
                {a.estado === 'pendiente' && dias !== null && dias < 0 && (
                  <span style={{ color: '#1a1a18', fontWeight: 600 }}>Ya ha pasado</span>
                )}
                {a.recordatorio_dias !== null && a.recordatorio_dias !== undefined && (
                  <>
                    {dias !== null && ' · '}
                    Recordatorio {a.recordatorio_dias === 0 ? 'el mismo día' : `${a.recordatorio_dias} d antes`}
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => borrar(a.id)}
              aria-label="Borrar acción"
              style={{ background: 'none', border: 'none', color: '#c4c0b8', padding: 2, flexShrink: 0 }}
            >
              <i className="ti ti-x" style={{ fontSize: 14 }}></i>
            </button>
          </div>
        );
      })}

      <div style={{ fontSize: 11.5, color: '#999', marginTop: 16, lineHeight: 1.6 }}>
        Los plazos de las normas que sigue el proyecto se mostrarán aquí junto a tus acciones en cuanto
        conectemos el calendario.
      </div>
    </div>
  );
}
