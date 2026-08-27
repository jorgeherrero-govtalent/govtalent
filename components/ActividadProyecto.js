'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

/**
 * La actividad institucional del proyecto.
 *
 * Distinta de las notas y de la agenda: una nota es un comentario y una
 * tarea mira hacia adelante. Una actividad es el registro de lo que ya
 * ocurrió, y una vez cerrada no se toca.
 *
 * El formulario nace plegado —tipo, con quién y asunto— y el resto se
 * despliega. Guardar como borrador con esos tres campos es deliberado:
 * quien sale de una reunión no rellena nueve campos, y un registro
 * incompleto vale más que ninguno. Lo que falta se reclama después.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const TIPOS = [
  { v: 'reunion', label: 'Reunión', icono: 'users' },
  { v: 'llamada', label: 'Llamada', icono: 'phone' },
  { v: 'email', label: 'Email', icono: 'mail' },
  { v: 'mensajeria', label: 'Mensajería', icono: 'message' },
  { v: 'documento', label: 'Documento', icono: 'file-text' },
  { v: 'evento', label: 'Evento', icono: 'calendar-event' },
];

const MODALIDADES = [
  { v: 'presencial', label: 'Presencial' },
  { v: 'videoconferencia', label: 'Videoconferencia' },
  { v: 'telefonica', label: 'Telefónica' },
  { v: 'escrita', label: 'Escrita' },
];

// Por defecto según el tipo: una llamada no es presencial y un email es
// escrito. Ahorra un toque en el caso habitual y se puede cambiar.
const MODALIDAD_POR_TIPO = {
  reunion: 'presencial',
  llamada: 'telefonica',
  email: 'escrita',
  mensajeria: 'escrita',
  documento: 'escrita',
  evento: 'presencial',
};

function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

const etiquetaTipo = (v) => TIPOS.find((t) => t.v === v)?.label || v;
const iconoTipo = (v) => TIPOS.find((t) => t.v === v)?.icono || 'point';

/**
 * Qué le falta a una actividad para poder cerrarse. Devuelve textos en
 * lenguaje llano y no nombres de campo: es la misma lista que verá el
 * usuario en la bandeja, y "documentos: null" no le dice nada.
 */
export function faltantes(a, participantes) {
  const falta = [];
  if (!participantes || participantes.length === 0) falta.push('Con quién fue');
  if (!a.asunto || !a.asunto.trim()) falta.push('Asunto tratado');
  if (a.es_influencia === null || a.es_influencia === undefined) falta.push('Si es actividad de influencia');
  if (a.modalidad === 'presencial' && !(a.lugar || '').trim()) falta.push('Lugar');
  return falta;
}

export default function ActividadProyecto({ projectId, userId }) {
  const supabase = createClient();

  const [actividades, setActividades] = useState([]);
  const [participantes, setParticipantes] = useState({});
  const [actores, setActores] = useState([]);
  const [orgId, setOrgId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null); // actividad en edición, o 'nueva'

  const cargar = useCallback(async () => {
    const [{ data: acts, error }, { data: acs }, { data: proy }] = await Promise.all([
      supabase
        .from('activities')
        .select('id, tipo, estado, fecha, modalidad, lugar, asunto, es_influencia, cliente_nombre, created_by, closed_at')
        .eq('project_id', projectId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      // Los actores ya mapeados del proyecto son el catálogo natural de
      // contrapartes: quien trabaja este asunto ya los tiene puestos.
      supabase.from('project_actors').select('id, nombre, kind, ref_id, es_propio').eq('project_id', projectId),
      supabase.from('projects').select('organization_id').eq('id', projectId).single(),
    ]);

    if (error) toast('No se ha podido cargar la actividad');
    const lista = acts || [];
    setActividades(lista);
    setActores(acs || []);
    setOrgId(proy?.organization_id || null);

    if (lista.length > 0) {
      const { data: parts } = await supabase
        .from('activity_participants')
        .select('id, activity_id, nombre, cargo, es_propio, kind, ref_id')
        .in('activity_id', lista.map((a) => a.id));
      const porActividad = {};
      for (const p of parts || []) {
        if (!porActividad[p.activity_id]) porActividad[p.activity_id] = [];
        porActividad[p.activity_id].push(p);
      }
      setParticipantes(porActividad);
    } else {
      setParticipantes({});
    }
    setCargando(false);
  }, [supabase, projectId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abiertas = useMemo(() => actividades.filter((a) => a.estado === 'borrador'), [actividades]);

  if (cargando) return <div className="spinner"></div>;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: '#888', letterSpacing: '.3px' }}>
          {actividades.length === 0
            ? 'Sin actividad registrada'
            : `${actividades.length} ${actividades.length === 1 ? 'actividad' : 'actividades'}${
                abiertas.length > 0 ? ` · ${abiertas.length} sin completar` : ''
              }`}
        </span>
      </div>

      <div
        onClick={() => setAbierto('nueva')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          border: `.5px dashed ${BORDE}`,
          borderRadius: 9,
          cursor: 'pointer',
          marginBottom: 14,
        }}
      >
        <i className="ti ti-plus" style={{ fontSize: 14, color: MORADO }}></i>
        <span style={{ fontSize: 12.5, color: '#777' }}>Registrar reunión, llamada, email…</span>
      </div>

      {actividades.map((a, i) => {
        const parts = participantes[a.id] || [];
        const falta = faltantes(a, parts);
        const contraparte = parts.filter((p) => !p.es_propio);
        return (
          <div
            key={a.id}
            onClick={() => a.estado === 'borrador' && setAbierto(a)}
            style={{
              display: 'flex',
              gap: 11,
              padding: '11px 0',
              borderBottom: i === actividades.length - 1 ? 'none' : `.5px solid #f0f0eb`,
              cursor: a.estado === 'borrador' ? 'pointer' : 'default',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#f5f4f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className={`ti ti-${iconoTipo(a.tipo)}`} style={{ fontSize: 13, color: '#888' }}></i>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                {etiquetaTipo(a.tipo)}
                {contraparte.length > 0 && ` · ${contraparte.map((p) => p.nombre).join(', ')}`}
              </div>
              {a.asunto && (
                <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>{a.asunto}</div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, color: '#aaa' }}>{fechaCorta(a.fecha)}</span>
                {a.es_influencia && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#f0efe9', color: '#666' }}>
                    Influencia
                  </span>
                )}
                {a.estado === 'borrador' && (
                  <span style={{ fontSize: 10.5, color: '#B8791F' }}>
                    {falta.length > 0 ? `Falta: ${falta.join(', ').toLowerCase()}` : 'Listo para cerrar'}
                  </span>
                )}
              </div>
            </div>

            {a.estado === 'cerrada' && (
              <span style={{ fontSize: 10.5, color: '#aaa', flexShrink: 0 }}>Cerrada</span>
            )}
          </div>
        );
      })}

      {abierto && (
        <FormularioActividad
          projectId={projectId}
          userId={userId}
          orgId={orgId}
          actores={actores}
          inicial={abierto === 'nueva' ? null : abierto}
          participantesIniciales={abierto === 'nueva' ? [] : participantes[abierto.id] || []}
          onCerrar={() => setAbierto(null)}
          onGuardado={() => {
            setAbierto(null);
            cargar();
          }}
        />
      )}
    </>
  );
}

function FormularioActividad({
  projectId,
  userId,
  orgId,
  actores,
  inicial,
  participantesIniciales,
  onCerrar,
  onGuardado,
}) {
  const supabase = createClient();
  const esNueva = !inicial;

  const [tipo, setTipo] = useState(inicial?.tipo || 'reunion');
  const [fecha, setFecha] = useState(inicial?.fecha || new Date().toISOString().slice(0, 10));
  const [modalidad, setModalidad] = useState(inicial?.modalidad || MODALIDAD_POR_TIPO.reunion);
  const [lugar, setLugar] = useState(inicial?.lugar || '');
  const [asunto, setAsunto] = useState(inicial?.asunto || '');
  const [influencia, setInfluencia] = useState(
    inicial?.es_influencia === null || inicial?.es_influencia === undefined ? null : inicial.es_influencia
  );
  const [cliente, setCliente] = useState(inicial?.cliente_nombre || '');
  const [detalles, setDetalles] = useState(!esNueva);
  const [guardando, setGuardando] = useState(false);

  // Quien registra estuvo, salvo excepción: sale marcado y se puede
  // quitar. Registrar y participar no son lo mismo —alguien puede meter
  // una reunión a la que no fue— y meterlo en el acta la falsearía.
  const [parts, setParts] = useState(() =>
    esNueva
      ? [{ nombre: 'Yo', es_propio: true, kind: 'usuario', ref_id: userId, user_id: userId }]
      : participantesIniciales.map((p) => ({ ...p }))
  );
  const [nuevoNombre, setNuevoNombre] = useState('');

  function cambiarTipo(v) {
    setTipo(v);
    if (!inicial) setModalidad(MODALIDAD_POR_TIPO[v] || null);
  }

  function anadirActor(a) {
    if (parts.some((p) => p.kind === 'project_actor' && p.ref_id === a.id)) return;
    setParts((prev) => [
      ...prev,
      { nombre: a.nombre, es_propio: !!a.es_propio, kind: 'project_actor', ref_id: a.id },
    ]);
  }

  function anadirLibre() {
    const n = nuevoNombre.trim();
    if (!n) return;
    setParts((prev) => [...prev, { nombre: n, es_propio: false, kind: 'libre', ref_id: null }]);
    setNuevoNombre('');
  }

  const disponibles = actores.filter(
    (a) => !parts.some((p) => p.kind === 'project_actor' && p.ref_id === a.id)
  );

  const borradorActual = { asunto, es_influencia: influencia, modalidad, lugar };
  const falta = faltantes(borradorActual, parts);
  const puedeCerrar = falta.length === 0;

  async function guardar(cerrar) {
    if (cerrar && !puedeCerrar) return;
    setGuardando(true);

    const fila = {
      project_id: projectId,
      organization_id: orgId,
      tipo,
      fecha,
      modalidad: modalidad || null,
      lugar: lugar.trim() || null,
      asunto: asunto.trim() || null,
      es_influencia: influencia,
      cliente_nombre: cliente.trim() || null,
    };
    if (cerrar) {
      fila.estado = 'cerrada';
      fila.closed_at = new Date().toISOString();
      fila.closed_by = userId;
    }

    let actividadId = inicial?.id;

    if (esNueva) {
      const { data, error } = await supabase.from('activities').insert(fila).select('id').single();
      if (error) {
        setGuardando(false);
        toast('No se ha podido guardar la actividad');
        return;
      }
      actividadId = data.id;
    } else {
      const { error } = await supabase.from('activities').update(fila).eq('id', actividadId);
      if (error) {
        setGuardando(false);
        toast('No se ha podido guardar la actividad');
        return;
      }
      // Se reemplazan por completo: son pocos y así no hay que llevar
      // la cuenta de cuáles se quitaron.
      await supabase.from('activity_participants').delete().eq('activity_id', actividadId);
    }

    if (parts.length > 0) {
      const { error } = await supabase.from('activity_participants').insert(
        parts.map((p) => ({
          activity_id: actividadId,
          // El nombre se copia, no se referencia: el acta debe reflejar
          // el cargo que esa persona ocupaba el día de la reunión.
          nombre: p.nombre,
          cargo: p.cargo || null,
          es_propio: !!p.es_propio,
          kind: p.kind || null,
          ref_id: p.ref_id ? String(p.ref_id) : null,
          user_id: p.user_id || null,
        }))
      );
      if (error) toast('La actividad se ha guardado, pero no los participantes');
    }

    setGuardando(false);
    toast(cerrar ? 'Actividad cerrada' : 'Borrador guardado');
    onGuardado();
  }

  const campo = {
    fontSize: 12.5,
    padding: '8px 10px',
    border: `.5px solid ${BORDE}`,
    borderRadius: 7,
    width: '100%',
    outline: 'none',
    background: '#fff',
  };

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.35)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '5vh 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 520,
          padding: 20,
          position: 'relative',
        }}
      >
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 26,
            height: 26,
            borderRadius: 7,
            border: 'none',
            background: '#f5f4f1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <i className="ti ti-x" style={{ fontSize: 13, color: '#777' }}></i>
        </button>

        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
          {esNueva ? 'Registrar actividad' : 'Completar actividad'}
        </div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
          {TIPOS.map((t) => (
            <span
              key={t.v}
              onClick={() => cambiarTipo(t.v)}
              style={{
                fontSize: 11.5,
                padding: '5px 11px',
                borderRadius: 14,
                cursor: 'pointer',
                background: tipo === t.v ? '#efedff' : '#f5f4f1',
                color: tipo === t.v ? MORADO : '#777',
                fontWeight: tipo === t.v ? 600 : 400,
              }}
            >
              {t.label}
            </span>
          ))}
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, color: '#999', marginBottom: 4 }}>Con quién</div>
          <div
            style={{
              display: 'flex',
              gap: 5,
              flexWrap: 'wrap',
              padding: '7px 8px',
              border: `.5px solid ${BORDE}`,
              borderRadius: 7,
              minHeight: 36,
              alignItems: 'center',
            }}
          >
            {parts.map((p, i) => (
              <span
                key={`${p.kind}-${p.ref_id}-${i}`}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 12,
                  background: p.es_propio ? '#efedff' : '#f0efe9',
                  color: p.es_propio ? MORADO : '#555',
                  display: 'inline-flex',
                  gap: 5,
                  alignItems: 'center',
                }}
              >
                {p.nombre}
                <i
                  className="ti ti-x"
                  onClick={() => setParts((prev) => prev.filter((_, j) => j !== i))}
                  style={{ fontSize: 11, cursor: 'pointer', opacity: 0.6 }}
                ></i>
              </span>
            ))}
            <input
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), anadirLibre())}
              placeholder={parts.length === 0 ? 'Nombre y cargo…' : ''}
              style={{ border: 'none', outline: 'none', fontSize: 11.5, flex: '1 1 90px', minWidth: 70 }}
            />
          </div>
          {disponibles.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
              {disponibles.slice(0, 6).map((a) => (
                <span
                  key={a.id}
                  onClick={() => anadirActor(a)}
                  style={{
                    fontSize: 10.5,
                    padding: '3px 9px',
                    borderRadius: 12,
                    border: `.5px solid ${BORDE}`,
                    color: '#888',
                    cursor: 'pointer',
                  }}
                >
                  + {a.nombre}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, color: '#999', marginBottom: 4 }}>Asunto tratado</div>
          <textarea
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            rows={2}
            placeholder="Sobre qué se habló…"
            style={{ ...campo, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {!detalles ? (
          <div
            onClick={() => setDetalles(true)}
            style={{ fontSize: 11.5, color: MORADO, cursor: 'pointer', marginBottom: 14 }}
          >
            Añadir fecha, lugar y clasificación ↓
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 10.5, color: '#999', marginBottom: 4 }}>Fecha</div>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={campo} />
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: '#999', marginBottom: 4 }}>Modalidad</div>
                <select value={modalidad || ''} onChange={(e) => setModalidad(e.target.value || null)} style={campo}>
                  <option value="">Sin especificar</option>
                  {MODALIDADES.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* El lugar solo se pide cuando hay sitio físico. En
                videoconferencia el campo sobra y solo añade fricción. */}
            {modalidad === 'presencial' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, color: '#999', marginBottom: 4 }}>Lugar</div>
                <input
                  value={lugar}
                  onChange={(e) => setLugar(e.target.value)}
                  placeholder="Sede, dirección o ciudad"
                  style={campo}
                />
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, color: '#999', marginBottom: 4 }}>Por cuenta de (opcional)</div>
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Cliente para el que se actúa"
                style={campo}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, color: '#999', marginBottom: 5 }}>¿Es actividad de influencia?</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { v: true, label: 'Sí' },
                  { v: false, label: 'No' },
                ].map((o) => (
                  <span
                    key={String(o.v)}
                    onClick={() => setInfluencia(influencia === o.v ? null : o.v)}
                    style={{
                      fontSize: 11.5,
                      padding: '5px 16px',
                      borderRadius: 14,
                      cursor: 'pointer',
                      background: influencia === o.v ? '#efedff' : '#f5f4f1',
                      color: influencia === o.v ? MORADO : '#777',
                      fontWeight: influencia === o.v ? 600 : 400,
                    }}
                  >
                    {o.label}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {falta.length > 0 && (
          <div style={{ fontSize: 11, color: '#B8791F', marginBottom: 10 }}>
            Para cerrarla falta: {falta.join(', ').toLowerCase()}.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn-ai"
            disabled={guardando || (!asunto.trim() && parts.length === 0)}
            onClick={() => guardar(false)}
          >
            {guardando ? 'Guardando…' : 'Guardar borrador'}
          </button>
          <button className="btn-o" disabled={guardando || !puedeCerrar} onClick={() => guardar(true)}>
            Guardar y cerrar
          </button>
        </div>

        {/* Cerrar es irreversible: la actividad deja de poder editarse.
            Conviene decirlo antes y no después. */}
        <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 9, lineHeight: 1.5 }}>
          Una actividad cerrada queda registrada y ya no puede modificarse.
        </div>
      </div>
    </div>
  );
}
