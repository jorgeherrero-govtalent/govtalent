'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

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
 *   ley / actividad  → es_initiative_timeline  (fase, organo, es_actual)
 *   expediente       → eu_initiative_recorrido (fase, momento, es_actual)
 *   procedimiento    → ep_procedure_timeline   (activity_type, activity_date)
 *   boe              → no tiene: es una publicación, no una tramitación
 *
 * Se normalizan a { etiqueta, cuando, estado } y se pintan igual. No se
 * copia nada: el dato sigue viviendo en Regulatorio.
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

function legible(codigo) {
  if (!codigo) return 'Fase';
  const t = codigo.toLowerCase().replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function AsuntosProyecto({ projectId, userId, abrirBuscador, onCerrarBuscador }) {
  const supabase = createClient();
  const [asuntos, setAsuntos] = useState([]);
  const [notas, setNotas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [buscador, setBuscador] = useState(false);
  const [comentando, setComentando] = useState(null);
  const [texto, setTexto] = useState('');
  const deshacer = useRef(null);
  const [hayDeshacer, setHayDeshacer] = useState(false);
  const [confirmar, setConfirmar] = useState(null);

  const cargar = useCallback(async () => {
    const [{ data: items }, { data: ns }] = await Promise.all([
      supabase
        .from('project_items')
        .select('id, kind, ref_id, etiqueta')
        .eq('project_id', projectId)
        .order('created_at'),
      supabase
        .from('project_notes')
        .select('id, item_id, cuerpo, created_at')
        .eq('project_id', projectId)
        .not('item_id', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

    const porItem = {};
    for (const n of ns || []) (porItem[n.item_id] ||= []).push(n);
    setNotas(porItem);

    if (!items || items.length === 0) {
      setAsuntos([]);
      setCargando(false);
      return;
    }

    // Una consulta por tipo, no una por asunto.
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
        // La etiqueta es la FASE, no el órgano: dos fases seguidas
        // pueden pasar por la misma comisión, y usar el órgano las
        // dejaba con el mismo nombre y sin distinguir.
        fases = (esp.data || [])
          .filter((e) => String(e.num_expediente) === String(it.ref_id))
          .map((e) => ({
            etiqueta: e.fase || e.organo,
            detalle: e.fase ? e.organo : null,
            cuando: fechaCorta(e.fecha_inicio),
            estado: e.es_actual ? 'actual' : e.fecha_inicio ? 'hecha' : 'futura',
            dias: null,
          }));
      } else if (it.kind === 'expediente') {
        const todas = (eu.data || []).filter((e) => String(e.initiative_id) === String(it.ref_id));
        // La Comisión repite el mismo nombre de fase en momentos
        // distintos: se numeran para poder distinguirlas.
        const cuenta = {};
        for (const e of todas) cuenta[e.fase] = (cuenta[e.fase] || 0) + 1;
        const vistas = {};
        fases = todas.map((e) => {
          vistas[e.fase] = (vistas[e.fase] || 0) + 1;
          return {
            etiqueta: cuenta[e.fase] > 1 ? `${e.fase} ${vistas[e.fase]}` : e.fase,
            detalle: null,
            cuando: fechaCorta(e.fecha_fin),
            estado: e.es_actual ? 'actual' : e.momento === 'proxima' ? 'futura' : 'hecha',
            dias: e.es_actual ? e.dias_restantes : null,
          };
        });
      } else if (it.kind === 'procedimiento') {
        const eventos = (pe.data || []).filter((e) => String(e.process_id) === String(it.ref_id));
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

  // Los botones "+ Actor" y "+ Asunto" de la cabecera del proyecto
  // abren el buscador de la sección que corresponde.
  useEffect(() => {
    if (abrirBuscador) setBuscador(true);
  }, [abrirBuscador]);

  // Aquí sí se pregunta, a diferencia del resto del módulo: al quitar
  // un asunto se van encadenados sus comentarios, y eso es trabajo
  // escrito que no se recupera con un deshacer de unos segundos.
  async function quitar(item) {
    setConfirmar(null);
    setAsuntos((prev) => prev.filter((a) => a.id !== item.id));
    const { error } = await supabase.from('project_items').delete().eq('id', item.id);
    if (error) {
      setAsuntos((prev) => [...prev, item]);
      toast('No se ha podido quitar');
      return;
    }
    toast('Asunto quitado del proyecto');
  }

  // Los comentarios sí se borran sin preguntar y con deshacer: son
  // pequeños y se recuperan enteros.
  async function borrarComentario(itemId, n) {
    setNotas((prev) => ({ ...prev, [itemId]: (prev[itemId] || []).filter((x) => x.id !== n.id) }));
    deshacer.current = { itemId, nota: n };
    setHayDeshacer(true);
    const { error } = await supabase.from('project_notes').delete().eq('id', n.id);
    if (error) {
      setNotas((prev) => ({ ...prev, [itemId]: [n, ...(prev[itemId] || [])] }));
      deshacer.current = null;
      setHayDeshacer(false);
      toast('No se ha podido borrar');
    }
  }

  async function restaurarComentario() {
    const guardado = deshacer.current;
    if (!guardado) return;
    deshacer.current = null;
    setHayDeshacer(false);
    const { data, error } = await supabase
      .from('project_notes')
      .insert({ project_id: projectId, item_id: guardado.itemId, author_id: userId, cuerpo: guardado.nota.cuerpo })
      .select('id, item_id, cuerpo, created_at')
      .single();
    if (error) {
      toast('No se ha podido recuperar');
      return;
    }
    setNotas((prev) => ({ ...prev, [guardado.itemId]: [data, ...(prev[guardado.itemId] || [])] }));
  }

  async function comentar(item) {
    const cuerpo = texto.trim();
    if (!cuerpo) {
      setComentando(null);
      return;
    }
    const { data, error } = await supabase
      .from('project_notes')
      .insert({ project_id: projectId, item_id: item.id, author_id: userId, cuerpo })
      .select('id, item_id, cuerpo, created_at')
      .single();
    if (error) {
      toast('No se ha podido guardar el comentario');
      return;
    }
    setNotas((prev) => ({ ...prev, [item.id]: [data, ...(prev[item.id] || [])] }));
    setTexto('');
    setComentando(null);
  }

  if (cargando) return <div className="spinner"></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#888' }}>
          {asuntos.length === 0
            ? 'Ningún asunto todavía'
            : `${asuntos.length} ${asuntos.length === 1 ? 'asunto' : 'asuntos'} en seguimiento`}
        </div>
        <button className="btn-ai-o" onClick={() => setBuscador(true)}>
          <i className="ti ti-plus"></i> Añadir asunto
        </button>
      </div>

      {asuntos.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.65, maxWidth: 470 }}>
          Añade una ley, un expediente o un procedimiento y traerá su tramitación y sus plazos. También
          puedes mandarlos desde su ficha en Regulatorio.
        </div>
      )}

      {asuntos.map((a) => {
        const actual = a.fases.find((f) => f.estado === 'actual');
        const misNotas = notas[a.id] || [];
        return (
          <div key={a.id} style={{ background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 10, padding: '15px 18px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{a.etiqueta || a.ref_id}</div>
                <div style={{ fontSize: 11.5, color: '#888', marginTop: 3 }}>{ORIGEN[a.kind] || 'Seguimiento'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {actual?.dias > 0 && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>Quedan {actual.dias} días</div>
                    <div style={{ fontSize: 10.5, color: '#888' }}>{actual.etiqueta}</div>
                  </div>
                )}
                <button
                  onClick={() => {
                    setComentando(comentando === a.id ? null : a.id);
                    setTexto('');
                  }}
                  aria-label="Comentar este asunto"
                  title="Comentar"
                  style={{ background: 'none', border: 'none', color: '#a8a49c', padding: 2 }}
                >
                  <i className="ti ti-message-plus" style={{ fontSize: 16 }}></i>
                </button>
                <button
                  onClick={() => setConfirmar(a)}
                  aria-label="Quitar del proyecto"
                  title="Quitar del proyecto"
                  style={{ background: 'none', border: 'none', color: '#c4c0b8', padding: 2 }}
                >
                  <i className="ti ti-x" style={{ fontSize: 15 }}></i>
                </button>
              </div>
            </div>

            {a.fases.length === 0 ? (
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 11, lineHeight: 1.6 }}>
                {a.kind === 'boe'
                  ? 'Publicado en el BOE: no tiene tramitación que seguir.'
                  : 'Sin recorrido registrado todavía.'}
              </div>
            ) : (
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

            {(misNotas.length > 0 || comentando === a.id) && (
              <div style={{ borderTop: `.5px solid ${BORDE}`, marginTop: 14, paddingTop: 12 }}>
                {misNotas.slice(0, 3).map((n) => (
                  <div key={n.id} style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#f0f0eb',
                        color: '#a8a49c',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      <i className="ti ti-note" style={{ fontSize: 11 }}></i>
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#555', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                        {n.cuerpo}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>{fechaCorta(n.created_at)}</div>
                    </div>
                    <button
                      onClick={() => borrarComentario(a.id, n)}
                      aria-label="Borrar comentario"
                      style={{ background: 'none', border: 'none', color: '#c4c0b8', padding: 2, flexShrink: 0 }}
                    >
                      <i className="ti ti-x" style={{ fontSize: 13 }}></i>
                    </button>
                  </div>
                ))}
                {misNotas.length > 3 && (
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 9 }}>
                    y {misNotas.length - 3} comentarios más
                  </div>
                )}

                {comentando === a.id && (
                  <div>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <input
                        autoFocus
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') comentar(a);
                          if (e.key === 'Escape') {
                            setTexto('');
                            setComentando(null);
                          }
                        }}
                        placeholder="Comenta esta ley…"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '8px 11px',
                          border: `1px solid ${MORADO}`,
                          borderRadius: 9,
                          fontSize: 12,
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                      {/* Cierre visible: sin él no se sabía cómo salir. */}
                      <button
                        onClick={() => {
                          setTexto('');
                          setComentando(null);
                        }}
                        aria-label="Cerrar sin comentar"
                        style={{ background: 'none', border: 'none', color: '#a8a49c', padding: 4, flexShrink: 0 }}
                      >
                        <i className="ti ti-x" style={{ fontSize: 15 }}></i>
                      </button>
                    </div>
                    <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 5 }}>
                      Enter para guardar · Esc para cancelar
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {hayDeshacer && (
        <button
          onClick={restaurarComentario}
          style={{ background: 'none', border: 'none', color: MORADO, fontSize: 12, padding: '4px 0 0' }}
        >
          Deshacer el comentario borrado
        </button>
      )}

      {confirmar && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setConfirmar(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h2>Quitar el asunto</h2>
              <div className="modal-x" onClick={() => setConfirmar(null)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.65 }}>
              «{confirmar.etiqueta || confirmar.ref_id}» sale de este proyecto
              {(notas[confirmar.id] || []).length > 0 && (
                <> y se borran sus {(notas[confirmar.id] || []).length} comentarios</>
              )}
              . El asunto sigue en Regulatorio y tu seguimiento no cambia.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-o" onClick={() => setConfirmar(null)}>
                Cancelar
              </button>
              <button className="btn-ai" onClick={() => quitar(confirmar)}>
                Quitar del proyecto
              </button>
            </div>
          </div>
        </div>
      )}

      {buscador && (
        <BuscadorAsuntos
          projectId={projectId}
          yaEn={asuntos}
          onClose={() => {
            setBuscador(false);
            onCerrarBuscador?.();
          }}
          onAdded={() => {
            setBuscador(false);
            onCerrarBuscador?.();
            cargar();
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// Buscador: reutiliza regulatorio_search, la misma vista que alimenta
// el buscador de Regulatorio, con el mismo par kind + ref_id.
// =====================================================================

function BuscadorAsuntos({ projectId, yaEn, onClose, onAdded }) {
  const supabase = createClient();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const puestos = new Set(yaEn.map((a) => `${a.kind}|${a.ref_id}`));

  useEffect(() => {
    const t = setTimeout(async () => {
      const texto = q.trim();
      if (texto.length < 3) {
        setResultados([]);
        return;
      }
      setBuscando(true);
      const { data } = await supabase
        .from('regulatorio_search')
        .select('kind, ref_id, titulo, contexto, fuente, plazo, fecha')
        .ilike('titulo', `%${texto}%`)
        .order('fecha', { ascending: false })
        .limit(15);
      setResultados((data || []).filter((r) => !puestos.has(`${r.kind}|${r.ref_id}`)));
      setBuscando(false);
    }, 280);
    return () => clearTimeout(t);
  }, [q, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  async function anadir(r) {
    if (guardando) return;
    setGuardando(true);
    const { error } = await supabase
      .from('project_items')
      .insert({ project_id: projectId, kind: r.kind, ref_id: String(r.ref_id), etiqueta: r.titulo });
    setGuardando(false);
    if (error) {
      toast(error.code === '23505' ? 'Ya estaba en el proyecto' : 'No se ha podido añadir');
      return;
    }
    onAdded();
  }

  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h2>Añadir un asunto</h2>
          <div className="modal-x" onClick={onClose}>
            <i className="ti ti-x"></i>
          </div>
        </div>

        <div className="field">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca una ley, un expediente o un procedimiento…"
          />
        </div>

        {q.trim().length > 0 && q.trim().length < 3 && (
          <div style={{ fontSize: 12, color: '#999', padding: '6px 0' }}>Escribe al menos tres letras.</div>
        )}

        {buscando && <div style={{ fontSize: 12.5, color: '#999', padding: '8px 0' }}>Buscando…</div>}

        {!buscando && q.trim().length >= 3 && resultados.length === 0 && (
          <div style={{ fontSize: 12.5, color: '#999', padding: '8px 0' }}>
            Nada con ese título. Prueba con menos palabras.
          </div>
        )}

        {resultados.map((r) => (
          <div
            key={`${r.kind}|${r.ref_id}`}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '10px 0', borderBottom: `.5px solid ${BORDE}` }}
          >
            <i className="ti ti-file-text" style={{ fontSize: 15, color: '#a8a49c', flexShrink: 0, marginTop: 2 }}></i>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{r.titulo}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                {[ORIGEN[r.kind] || r.fuente, r.contexto].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button className="btn-g" onClick={() => anadir(r)} disabled={guardando} style={{ flexShrink: 0 }}>
              Añadir
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
