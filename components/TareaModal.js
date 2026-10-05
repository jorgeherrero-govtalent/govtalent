'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Desplegable from '@/components/Desplegable';
import { toast } from '@/lib/toast';

/**
 * Crear o editar una tarea.
 *
 * Diseño del 04-10-2026, calcado de Enginy en blanco y gris con el morado
 * de la marca donde Enginy usa negro. Campos: título, asignada a,
 * vinculada a, tipo, fecha límite con hora, prioridad y notas.
 *
 * La fecha y la hora van en un solo campo, como en Enginy: el desplegable
 * lleva el calendario y debajo la hora.
 *
 * «Vinculada a» es el «Contacto» de Enginy, ampliado: un único buscador
 * sobre lo mismo que el buscador de arriba (buscar_global: personas,
 * instituciones, leyes) más los proyectos propios.
 *
 * Solo edita tareas sueltas (tabla tareas). Las acciones de Proyectos se
 * editan en su proyecto.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const GRIS = '#6f6b64';

export const TIPOS = [
  { v: 'llamada', label: 'Llamada' },
  { v: 'email', label: 'Email' },
  { v: 'reunion', label: 'Reunión' },
  { v: 'enmienda', label: 'Enmienda o alegación' },
  { v: 'seguimiento', label: 'Seguimiento' },
  { v: 'otra', label: 'Otra' },
];

export const NOMBRE_TIPO = Object.fromEntries(TIPOS.map((t) => [t.v, t.label]));

const NIVEL = { alta: 3, media: 2, baja: 1 };

/** Las tres barras de prioridad: en morado las que cuentan, el resto en gris. */
export function Barras({ prioridad, tam = 14 }) {
  const n = NIVEL[prioridad] || 0;
  const c = (i) => (i < n ? MORADO : '#d6d4cd');
  return (
    <svg width={tam + 2} height={tam} viewBox="0 0 16 14" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1" y="9" width="3" height="5" rx="1" fill={c(0)} />
      <rect x="6.5" y="5" width="3" height="9" rx="1" fill={c(1)} />
      <rect x="12" y="1" width="3" height="13" rx="1" fill={c(2)} />
    </svg>
  );
}

const PRIORIDADES = [
  { v: 'alta', label: <Etiq p="alta" texto="Alta" /> },
  { v: 'media', label: <Etiq p="media" texto="Media" /> },
  { v: 'baja', label: <Etiq p="baja" texto="Baja" /> },
];

function Etiq({ p, texto }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Barras prioridad={p} />
      {texto}
    </span>
  );
}

// Cómo se llama cada cosa que devuelve el buscador, para la línea de
// contexto del resultado.
const PERSONA = new Set(['diputado', 'miembro-gobierno', 'alto-cargo', 'eurodiputado', 'comisario', 'persona-comision-ue', 'asesor-parlamentario']);
const INSTITUCION = new Set(['organismo', 'direccion-general-ue', 'comision', 'comision-ue', 'grupo-parlamentario']);
const OCULTOS = new Set(['organizacion', 'oferta']);

export function grupoVinculo(kind) {
  if (!kind) return null;
  if (kind === 'proyecto') return 'Proyecto';
  if (PERSONA.has(kind)) return 'Persona';
  if (INSTITUCION.has(kind)) return 'Institución';
  return 'Normativa';
}

function manana() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function partes(iso) {
  if (!iso) return { fecha: null, hora: '09:00' };
  const d = new Date(iso);
  return {
    fecha: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

const ETIQUETA = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, color: '#1a1a18' };
const CAMPO = {
  height: 40,
  borderRadius: 9,
  border: `.5px solid ${BORDE}`,
  background: '#fafaf7',
  padding: '0 12px',
  font: 'inherit',
  fontSize: 13.5,
  fontWeight: 400,
  color: '#1a1a18',
  boxSizing: 'border-box',
  width: '100%',
  outline: 'none',
};

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function isoDia(a, m, d) {
  return `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Fecha y hora en un solo campo: «5 oct 2026, 09:00». Al pulsarlo se
 * abre el calendario del mes (la semana empieza en lunes) y, debajo, la
 * hora.
 */
function FechaHora({ fecha, hora, onFecha, onHora, sinHora = false }) {
  const [abierto, setAbierto] = useState(false);
  const base = fecha ? new Date(`${fecha}T00:00`) : new Date();
  const [mes, setMes] = useState(base.getMonth());
  const [anio, setAnio] = useState(base.getFullYear());
  const caja = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e) {
      if (!caja.current?.contains(e.target)) setAbierto(false);
    }
    function tecla(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    const t = setTimeout(() => window.addEventListener('mousedown', fuera), 0);
    window.addEventListener('keydown', tecla);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', fuera);
      window.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  const hoy = new Date();
  const hoyIso = isoDia(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  // Huecos antes del día 1: getDay() da 0 al domingo, y aquí va al final.
  const hueco = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  const celdas = [...Array(hueco).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)];

  function mover(n) {
    const d = new Date(anio, mes + n, 1);
    setMes(d.getMonth());
    setAnio(d.getFullYear());
  }

  let texto = 'Sin fecha';
  if (fecha) {
    const d = new Date(`${fecha}T00:00`);
    texto = `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}${sinHora ? '' : `, ${hora || '09:00'}`}`;
  }

  const flecha = { width: 30, height: 30, borderRadius: 7, border: 'none', background: '#f4f3ee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3a36' };

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        style={{ ...CAMPO, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', borderColor: abierto ? MORADO : BORDE, color: fecha ? '#1a1a18' : '#a8a49c', cursor: 'pointer' }}
      >
        <i className="ti ti-calendar" style={{ fontSize: 15, color: GRIS }} aria-hidden="true"></i>
        <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span>
        <i className="ti ti-selector" style={{ fontSize: 14, color: '#a8a49c' }} aria-hidden="true"></i>
      </button>

      {abierto && (
        <div
          data-popover
          role="dialog"
          aria-label="Elegir fecha y hora"
          style={{ position: 'absolute', left: 0, top: 46, width: 272, background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,.14)', zIndex: 10 }}
        >
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <button type="button" onClick={() => mover(-1)} aria-label="Mes anterior" style={flecha}>
                <i className="ti ti-chevron-left" aria-hidden="true"></i>
              </button>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                {MESES_LARGOS[mes].replace(/^./, (c) => c.toUpperCase())} {anio}
              </span>
              <button type="button" onClick={() => mover(1)} aria-label="Mes siguiente" style={flecha}>
                <i className="ti ti-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, textAlign: 'center' }}>
              {DIAS.map((d) => (
                <span key={d} style={{ fontSize: 11.5, color: GRIS, padding: '4px 0' }}>
                  {d}
                </span>
              ))}
              {celdas.map((d, i) => {
                if (!d) return <span key={`h${i}`}></span>;
                const iso = isoDia(anio, mes, d);
                const elegido = iso === fecha;
                const esHoy = iso === hoyIso;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => onFecha(iso)}
                    aria-pressed={elegido}
                    aria-label={`${d} de ${MESES_LARGOS[mes]}`}
                    style={{
                      height: 32,
                      borderRadius: 7,
                      border: esHoy && !elegido ? `.5px solid ${BORDE}` : 'none',
                      background: elegido ? MORADO : 'transparent',
                      color: elegido ? '#fff' : '#1a1a18',
                      font: 'inherit',
                      fontSize: 12.5,
                      fontWeight: elegido ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ borderTop: '1px solid #efeee8', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {!sinHora && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500 }}>
                Hora
                <input type="time" value={hora} onChange={(e) => onHora(e.target.value)} style={{ ...CAMPO, height: 36 }} />
              </label>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  onFecha(null);
                  setAbierto(false);
                }}
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12.5, color: GRIS }}
              >
                Quitar fecha
              </button>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12.5, fontWeight: 600, color: MORADO }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TareaModal({ tarea, miembros = [], yo, orgId, onClose, onGuardada }) {
  const supabase = createClient();
  const editando = !!tarea?.id;
  // Las acciones de Proyectos también se editan aquí, sin ir al proyecto
  // (05-10-2026). Viven en project_actions, que solo tiene título, notas
  // (detalle), fecha sin hora y responsable: tipo, prioridad y hora no se
  // enseñan, y el vínculo es su proyecto, que no se cambia desde aquí.
  const esAccion = tarea?.origen === 'proyecto';
  const inicio = partes(tarea?.vence_at);

  const [titulo, setTitulo] = useState(tarea?.titulo || '');
  const [asignada, setAsignada] = useState(tarea?.asignada_a || yo || null);
  const [tipo, setTipo] = useState(tarea?.tipo || null);
  const [prioridad, setPrioridad] = useState(tarea?.prioridad || null);
  const [fecha, setFecha] = useState(editando ? inicio.fecha : manana());
  const [hora, setHora] = useState(editando ? inicio.hora : '09:00');
  const [notas, setNotas] = useState(tarea?.notas || '');
  const [vinculo, setVinculo] = useState(
    tarea?.vinculo_titulo
      ? {
          kind: tarea.vinculo_kind,
          ref_id: tarea.vinculo_ref,
          titulo: tarea.vinculo_titulo,
          contexto: tarea.vinculo_contexto,
          ruta: tarea.vinculo_ruta,
        }
      : null
  );
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Confirmación de borrado con el modal de la plataforma (el mismo que al
  // eliminar un proyecto), no con window.confirm.
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const tituloRef = useRef(null);

  useEffect(() => {
    tituloRef.current?.focus();
    function tecla(e) {
      // Escape cierra, salvo que esté abierto un desplegable: esos se
      // cierran con su propio Escape y se quedan dentro del formulario.
      if (e.key === 'Escape' && !document.querySelector('[role="listbox"], [data-popover], .modal-ov')) onClose();
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Buscador de «Vinculada a»: espera a que pares de escribir.
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      const [{ data: global }, { data: proyectos }] = await Promise.all([
        supabase.rpc('buscar_global', { q, limite: 8 }),
        supabase.from('projects').select('id, name').eq('archived', false).ilike('name', `%${q}%`).limit(4),
      ]);
      setResultados([
        ...(proyectos || []).map((p) => ({ kind: 'proyecto', ref_id: p.id, titulo: p.name, contexto: 'Proyecto', ruta: `/projects?p=${p.id}` })),
        ...(global || []).filter((r) => !OCULTOS.has(r.kind)),
      ]);
    }, 220);
    return () => clearTimeout(t);
  }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  // Una persona puede estar en varias organizaciones: se lista una vez.
  const opcionesMiembros = [];
  const vistos = new Set();
  for (const m of miembros) {
    if (vistos.has(m.user_id)) continue;
    vistos.add(m.user_id);
    opcionesMiembros.push({ v: m.user_id, label: m.user_id === yo ? `${m.nombre} (tú)` : m.nombre });
  }

  async function guardar(e) {
    e.preventDefault();
    if (!titulo.trim()) {
      setError('Escribe el título de la tarea.');
      return;
    }
    setError('');
    setGuardando(true);
    if (esAccion) {
      // Solo el dueño del proyecto puede cambiar sus acciones (RLS de
      // project_actions). Si no lo es, la base no da error: no actualiza
      // ninguna fila. Por eso se pide la fila de vuelta y se comprueba.
      const { data: cambiadas, error: errAccion } = await supabase
        .from('project_actions')
        .update({
          titulo: titulo.trim(),
          detalle: notas.trim() || null,
          fecha: fecha || null,
          responsable_id: asignada || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tarea.id)
        .select('id');
      setGuardando(false);
      if (errAccion) {
        setError('No se pudo guardar la acción. Inténtalo de nuevo.');
        return;
      }
      if (!cambiadas || cambiadas.length === 0) {
        setError('Solo quien creó el proyecto puede editar sus acciones.');
        return;
      }
      toast('Acción guardada');
      onGuardada();
      return;
    }
    const fila = {
      titulo: titulo.trim(),
      asignada_a: asignada || null,
      tipo: tipo || null,
      prioridad: prioridad || null,
      vence_at: fecha ? new Date(`${fecha}T${hora || '09:00'}`).toISOString() : null,
      notas: notas.trim() || null,
      vinculo_kind: vinculo?.kind || null,
      vinculo_ref: vinculo?.ref_id != null ? String(vinculo.ref_id) : null,
      vinculo_titulo: vinculo?.titulo || null,
      vinculo_contexto: vinculo?.contexto || null,
      vinculo_ruta: vinculo?.ruta || null,
    };
    const { error: err } = editando
      ? await supabase.from('tareas').update(fila).eq('id', tarea.id)
      : await supabase.from('tareas').insert({ ...fila, organization_id: orgId || null });
    setGuardando(false);
    if (err) {
      setError('No se pudo guardar la tarea. Inténtalo de nuevo.');
      return;
    }
    toast(editando ? 'Tarea guardada' : 'Tarea creada');
    onGuardada();
  }

  async function borrar() {
    setConfirmarBorrado(false);
    const { error: err } = await supabase.from(esAccion ? 'project_actions' : 'tareas').delete().eq('id', tarea.id);
    if (err) {
      setError('No se pudo borrar la tarea.');
      return;
    }
    toast(esAccion ? 'Acción borrada' : 'Tarea borrada');
    onGuardada();
  }

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(21,20,15,.45)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '6vh 16px',
        overflowY: 'auto',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={esAccion ? 'Editar acción de proyecto' : editando ? 'Editar tarea' : 'Crear tarea'}
        style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #efeee8' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{esAccion ? 'Editar acción de proyecto' : editando ? 'Editar tarea' : 'Crear tarea'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: '#f4f3ee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <i className="ti ti-x" style={{ fontSize: 15, color: '#3a3a36' }} aria-hidden="true"></i>
          </button>
        </div>

        <form onSubmit={guardar}>
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && (
              <div className="err-msg" style={{ margin: 0 }}>
                {error}
              </div>
            )}

            <label style={ETIQUETA}>
              Título
              <input
                ref={tituloRef}
                type="text"
                value={titulo}
                maxLength={300}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Escribe el título de la tarea"
                style={CAMPO}
              />
            </label>

            <div style={ETIQUETA}>
              Asignada a
              <Desplegable value={asignada} onChange={setAsignada} opciones={opcionesMiembros} placeholder="Asignar a" />
            </div>

            <div style={ETIQUETA}>
              Vinculada a
              {esAccion && vinculo ? (
                <div style={{ ...CAMPO, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {vinculo.titulo}
                    {vinculo.contexto && <span style={{ color: GRIS }}> · {vinculo.contexto}</span>}
                  </span>
                  {vinculo.ruta && (
                    <a href={vinculo.ruta} style={{ fontSize: 12.5, color: GRIS, whiteSpace: 'nowrap', textDecoration: 'none' }}>
                      Abrir proyecto
                    </a>
                  )}
                </div>
              ) : vinculo ? (
                <div style={{ ...CAMPO, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {vinculo.titulo}
                    {vinculo.contexto && <span style={{ color: GRIS }}> · {vinculo.contexto}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVinculo(null)}
                    aria-label="Quitar vínculo"
                    style={{ background: 'none', border: 'none', padding: 4, display: 'flex', color: GRIS }}
                  >
                    <i className="ti ti-x" style={{ fontSize: 14 }} aria-hidden="true"></i>
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Busca una persona, institución, ley o proyecto"
                    aria-label="Vinculada a"
                    style={CAMPO}
                  />
                  {resultados.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 44,
                        background: '#fff',
                        border: `.5px solid ${BORDE}`,
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,.10)',
                        padding: 5,
                        zIndex: 5,
                        maxHeight: 260,
                        overflowY: 'auto',
                      }}
                    >
                      {resultados.map((r) => (
                        <button
                          key={`${r.kind}-${r.ref_id}`}
                          type="button"
                          onClick={() => {
                            setVinculo(r);
                            setBusca('');
                            setResultados([]);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            borderRadius: 7,
                            padding: '7px 10px',
                            font: 'inherit',
                            fontSize: 13,
                            color: '#1a1a18',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f4f1')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</div>
                          <div style={{ fontSize: 11.5, color: GRIS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {grupoVinculo(r.kind)}
                            {r.contexto && r.contexto !== 'Proyecto' ? ` · ${r.contexto}` : ''}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!esAccion && (
              <div style={ETIQUETA}>
                Tipo
                <Desplegable value={tipo} onChange={setTipo} opciones={TIPOS} placeholder="Seleccionar tipo" vacio="Sin tipo" />
              </div>
            )}

            <div className="tarea-dos" style={{ display: 'grid', gridTemplateColumns: esAccion ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              <div style={ETIQUETA}>
                Fecha límite
                <FechaHora fecha={fecha} hora={hora} onFecha={setFecha} onHora={setHora} sinHora={esAccion} />
              </div>
              {!esAccion && (
              <div style={ETIQUETA}>
                Prioridad
                <Desplegable
                  value={prioridad}
                  onChange={setPrioridad}
                  opciones={PRIORIDADES}
                  vacio={<Etiq p={null} texto="Sin prioridad" />}
                  placeholder={<Etiq p={null} texto="Sin prioridad" />}
                />
              </div>
              )}
            </div>

            <label style={ETIQUETA}>
              Notas
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Añade una nota…"
                style={{ ...CAMPO, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderTop: '1px solid #efeee8' }}>
            {editando && tarea.created_by === yo && (
              <button
                type="button"
                onClick={() => setConfirmarBorrado(true)}
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 13, color: '#3a3a36' }}
              >
                Borrar
              </button>
            )}
            <span style={{ flexGrow: 1 }}></span>
            <button type="button" onClick={onClose} style={{ height: 38, padding: '0 16px', borderRadius: 9, border: 'none', background: 'transparent', font: 'inherit', fontSize: 13.5, color: '#3a3a36' }}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              style={{ height: 38, padding: '0 18px', borderRadius: 9, border: 'none', background: MORADO, color: '#fff', font: 'inherit', fontSize: 13.5, fontWeight: 600, opacity: guardando ? 0.7 : 1 }}
            >
              {guardando ? 'Guardando…' : editando ? 'Guardar' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
      {confirmarBorrado && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setConfirmarBorrado(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h2>{esAccion ? 'Borrar la acción' : 'Borrar la tarea'}</h2>
              <div className="modal-x" onClick={() => setConfirmarBorrado(false)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.65 }}>
              Se borra «{tarea?.titulo}»
              {esAccion ? ' del proyecto' : ''}. No se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn-o" onClick={() => setConfirmarBorrado(false)}>
                Cancelar
              </button>
              <button type="button" className="btn-ai" onClick={borrar}>
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@media (max-width: 560px) { .tarea-dos { grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
    </div>
  );
}
