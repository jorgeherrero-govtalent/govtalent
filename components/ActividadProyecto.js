'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import SelectorFecha from '@/components/SelectorFecha';
import Desplegable from '@/components/Desplegable';
import AgendaProyecto from '@/components/AgendaProyecto';

/**
 * Actividad del proyecto: lo pendiente y lo ocurrido, en el mismo sitio.
 *
 * Antes eran dos bloques. La agenda mira hacia adelante —"hay que llamar
 * a X"— y el registro hacia atrás —"se llamó a X el día 12"—, pero son la
 * misma pregunta en dos tiempos y separarlas obligaba a decidir en qué
 * bloque mirar.
 *
 * La agenda se reutiliza tal cual dentro de la pestaña Pendiente: sus
 * acciones siguen viviendo en project_actions y no se ha tocado nada.
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

// Una llamada no es presencial y un email es escrito. Ahorra un toque en
// el caso normal y se puede cambiar.
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

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ayerISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const etiquetaTipo = (v) => TIPOS.find((t) => t.v === v)?.label || v;
const iconoTipo = (v) => TIPOS.find((t) => t.v === v)?.icono || 'point';

/**
 * Qué le falta a una actividad para poder cerrarse. En lenguaje llano y
 * no con nombres de campo: es lo que verá el usuario.
 */
export function faltantes(a, participantes) {
  const falta = [];
  if (!participantes || participantes.length === 0) falta.push('con quién fue');
  if (!a.asunto || !a.asunto.trim()) falta.push('qué se trató');
  if (a.es_influencia === null || a.es_influencia === undefined) falta.push('si es actividad de influencia');
  if (a.modalidad === 'presencial' && !(a.lugar || '').trim()) falta.push('el lugar');
  return falta;
}

export default function ActividadProyecto({ projectId, userId }) {
  const supabase = createClient();

  const [pestana, setPestana] = useState('registrado');
  const [actividades, setActividades] = useState([]);
  const [participantes, setParticipantes] = useState({});
  const [actores, setActores] = useState([]);
  const [asuntos, setAsuntos] = useState([]);
  const [orgId, setOrgId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    const [{ data: acts, error }, { data: acs }, { data: its }, { data: proy }] = await Promise.all([
      supabase
        .from('activities')
        .select('id, tipo, estado, fecha, modalidad, lugar, asunto, es_influencia, cliente_nombre, item_id, closed_at')
        .eq('project_id', projectId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('project_actors').select('id, nombre, kind, ref_id, es_propio').eq('project_id', projectId),
      // Los asuntos anclados al proyecto: son las normas sobre las que
      // se intenta influir, y el artículo 6.1.e pide precisarlas.
      supabase.from('project_items').select('id, etiqueta, kind, ref_id').eq('project_id', projectId),
      supabase.from('projects').select('organization_id').eq('id', projectId).single(),
    ]);

    if (error) toast('No se ha podido cargar la actividad');
    const lista = acts || [];
    setActividades(lista);
    setActores(acs || []);
    setAsuntos(its || []);
    setOrgId(proy?.organization_id || null);

    if (lista.length > 0) {
      const { data: parts } = await supabase
        .from('activity_participants')
        .select('id, activity_id, nombre, cargo, es_propio, kind, ref_id')
        .in('activity_id', lista.map((a) => a.id));
      const porActividad = {};
      for (const p of parts || []) {
        (porActividad[p.activity_id] ||= []).push(p);
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

  const borradores = useMemo(() => actividades.filter((a) => a.estado === 'borrador'), [actividades]);

  async function cerrar(a) {
    const { error } = await supabase
      .from('activities')
      .update({ estado: 'cerrada', closed_at: new Date().toISOString(), closed_by: userId })
      .eq('id', a.id);
    if (error) return toast('No se ha podido cerrar la actividad');
    toast('Actividad registrada');
    cargar();
  }

  const pestanaEstilo = (activa) => ({
    fontSize: 11.5,
    padding: '4px 12px',
    borderRadius: 14,
    cursor: 'pointer',
    background: activa ? '#efedff' : '#f5f4f1',
    color: activa ? MORADO : '#777',
    fontWeight: activa ? 600 : 400,
  });

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={pestanaEstilo(pestana === 'registrado')} onClick={() => setPestana('registrado')}>
          Registrado {actividades.length > 0 ? actividades.length : ''}
        </span>
        <span style={pestanaEstilo(pestana === 'pendiente')} onClick={() => setPestana('pendiente')}>
          Pendiente
        </span>
        <div style={{ flex: 1 }} />
        {pestana === 'registrado' && (
          <button className="btn-ai" onClick={() => setAbierto('nueva')}>
            + Registrar
          </button>
        )}
      </div>

      {pestana === 'pendiente' ? (
        <AgendaProyecto projectId={projectId} />
      ) : cargando ? (
        <div className="spinner"></div>
      ) : actividades.length === 0 ? (
        <div style={{ fontSize: 12, color: '#999', padding: '6px 0' }}>
          Nada registrado todavía. Cada reunión, llamada o correo con una institución se anota aquí.
        </div>
      ) : (
        actividades.map((a, i) => {
          const parts = participantes[a.id] || [];
          const falta = faltantes(a, parts);
          const contraparte = parts.filter((p) => !p.es_propio);
          const asunto = asuntos.find((x) => x.id === a.item_id);
          return (
            <div
              key={a.id}
              style={{
                display: 'flex',
                gap: 11,
                padding: '11px 0',
                borderBottom: i === actividades.length - 1 ? 'none' : '.5px solid #f0f0eb',
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
                {a.asunto && <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>{a.asunto}</div>}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, color: '#aaa' }}>{fechaCorta(a.fecha)}</span>
                  {asunto && <span style={{ fontSize: 10.5, color: '#aaa' }}>· {asunto.etiqueta}</span>}
                  {a.es_influencia && (
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#f0efe9', color: '#666' }}>
                      Influencia
                    </span>
                  )}
                </div>
              </div>

              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                {a.estado === 'cerrada' ? (
                  <span style={{ fontSize: 10.5, color: '#aaa' }}>Registrada</span>
                ) : falta.length === 0 ? (
                  <>
                    <div
                      onClick={() => cerrar(a)}
                      style={{ fontSize: 11, color: MORADO, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Registrar
                    </div>
                    <div
                      onClick={() => setAbierto(a)}
                      style={{ fontSize: 10.5, color: '#aaa', cursor: 'pointer', marginTop: 2 }}
                    >
                      Editar
                    </div>
                  </>
                ) : (
                  <div
                    onClick={() => setAbierto(a)}
                    style={{ fontSize: 10.5, color: '#B8791F', cursor: 'pointer', maxWidth: 150 }}
                  >
                    Falta {falta.join(', ')}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {abierto && (
        <FormularioActividad
          projectId={projectId}
          userId={userId}
          orgId={orgId}
          actores={actores}
          asuntos={asuntos}
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
  asuntos,
  inicial,
  participantesIniciales,
  onCerrar,
  onGuardado,
}) {
  const supabase = createClient();
  const esNueva = !inicial;

  const [tipo, setTipo] = useState(inicial?.tipo || 'reunion');
  const [fecha, setFecha] = useState(inicial?.fecha || hoyISO());
  const [modalidad, setModalidad] = useState(inicial?.modalidad || MODALIDAD_POR_TIPO.reunion);
  const [lugar, setLugar] = useState(inicial?.lugar || '');
  const [asunto, setAsunto] = useState(inicial?.asunto || '');
  // Un solo asunto anclado por defecto se preselecciona: en la mayoría de
  // proyectos solo hay uno y elegirlo a mano sería un toque de más.
  const [itemId, setItemId] = useState(inicial?.item_id || (asuntos.length === 1 ? asuntos[0].id : ''));
  const [influencia, setInfluencia] = useState(
    inicial?.es_influencia === null || inicial?.es_influencia === undefined ? null : inicial.es_influencia
  );
  const [cliente, setCliente] = useState(inicial?.cliente_nombre || '');
  const [guardando, setGuardando] = useState(false);

  const [parts, setParts] = useState(() =>
    esNueva
      ? [{ nombre: 'Yo', es_propio: true, kind: 'usuario', ref_id: userId, user_id: userId }]
      : participantesIniciales.map((p) => ({ ...p }))
  );
  const [nuevoNombre, setNuevoNombre] = useState('');

  function cambiarTipo(v) {
    setTipo(v);
    if (esNueva) setModalidad(MODALIDAD_POR_TIPO[v] || null);
  }

  function anadirActor(a) {
    if (parts.some((p) => p.kind === 'project_actor' && p.ref_id === a.id)) return;
    setParts((prev) => [...prev, { nombre: a.nombre, es_propio: !!a.es_propio, kind: 'project_actor', ref_id: a.id }]);
  }

  function anadirLibre() {
    const n = nuevoNombre.trim();
    if (!n) return;
    setParts((prev) => [...prev, { nombre: n, es_propio: false, kind: 'libre', ref_id: null }]);
    setNuevoNombre('');
  }

  const disponibles = actores.filter((a) => !parts.some((p) => p.kind === 'project_actor' && p.ref_id === a.id));
  const falta = faltantes({ asunto, es_influencia: influencia, modalidad, lugar }, parts);

  async function guardar() {
    setGuardando(true);
    const fila = {
      project_id: projectId,
      // Explícito y no por DEFAULT auth.uid(): el valor por defecto no
      // llega a tiempo para el WITH CHECK de la política y la inserción
      // se rechaza sin error visible.
      created_by: userId,
      organization_id: orgId,
      tipo,
      fecha,
      modalidad: modalidad || null,
      lugar: lugar.trim() || null,
      asunto: asunto.trim() || null,
      es_influencia: influencia,
      cliente_nombre: cliente.trim() || null,
      item_id: itemId || null,
    };

    let id = inicial?.id;
    if (esNueva) {
      const { data, error } = await supabase.from('activities').insert(fila).select('id').single();
      if (error) {
        setGuardando(false);
        return toast('No se ha podido guardar la actividad');
      }
      id = data.id;
    } else {
      const { error } = await supabase.from('activities').update(fila).eq('id', id);
      if (error) {
        setGuardando(false);
        return toast('No se ha podido guardar la actividad');
      }
      await supabase.from('activity_participants').delete().eq('activity_id', id);
    }

    if (parts.length > 0) {
      const { error } = await supabase.from('activity_participants').insert(
        parts.map((p) => ({
          activity_id: id,
          // El nombre se copia y no se referencia: el acta debe reflejar
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
    toast('Guardado');
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
  const etiqueta = { fontSize: 10.5, color: '#999', marginBottom: 4 };

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
        style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, padding: 20, position: 'relative' }}
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
          {esNueva ? 'Registrar actividad' : 'Editar actividad'}
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
          <div style={etiqueta}>Con quién</div>
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

        {/* Sobre qué norma se intenta influir. Sale de los asuntos ya
            anclados al proyecto, así que no hay que escribirlo. */}
        {asuntos.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={etiqueta}>Sobre qué asunto</div>
            <Desplegable
              value={itemId}
              onChange={(v) => setItemId(v || '')}
              vacio="Sin asunto concreto"
              opciones={asuntos.map((a) => ({ v: a.id, label: a.etiqueta }))}
            />
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <div style={etiqueta}>Qué se trató</div>
          <textarea
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            rows={2}
            placeholder="Sobre qué se habló, qué se propuso…"
            style={{ ...campo, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 10 }}>
          <div>
            <div style={etiqueta}>Cuándo</div>
            <SelectorFecha
              value={fecha}
              onChange={setFecha}
              atajos={[
                { label: 'Hoy', iso: hoyISO() },
                { label: 'Ayer', iso: ayerISO() },
              ]}
            />
          </div>
          <div>
            <div style={etiqueta}>Cómo</div>
            <Desplegable
              value={modalidad || ''}
              onChange={setModalidad}
              vacio="Sin especificar"
              opciones={MODALIDADES.map((m) => ({ v: m.v, label: m.label }))}
            />
          </div>
        </div>

        {/* El lugar solo aparece si hay sitio físico. En videoconferencia
            el campo sobra y solo añade fricción. */}
        {modalidad === 'presencial' && (
          <div style={{ marginBottom: 10 }}>
            <div style={etiqueta}>Dónde</div>
            <input
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
              placeholder="Sede, dirección o ciudad"
              style={campo}
            />
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <div style={etiqueta}>Por cuenta de (opcional)</div>
          <input
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            placeholder="Cliente para el que se actúa"
            style={campo}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ ...etiqueta, marginBottom: 5 }}>¿Es actividad de influencia?</div>
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

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn-ai" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          {falta.length > 0 && (
            <span style={{ fontSize: 10.5, color: '#999' }}>
              Se guarda igual. Para darla por registrada falta {falta.join(', ')}.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
