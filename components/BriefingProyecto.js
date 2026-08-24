'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import ActorAvatar from '@/components/ActorAvatar';
import { enZonaDePrioridad, posicionLabel, relacionLabel } from '@/lib/proyectos';

/**
 * El briefing del proyecto: lista a la izquierda, detalle a la derecha.
 *
 * POR QUÉ ASÍ Y NO UNA COLUMNA DE FICHAS: con doce actores una lista de
 * tarjetas completas crece sin fin y obliga a subir hasta arriba para
 * cambiar de actor. Aquí el bloque mide lo mismo con doce que con
 * cuarenta, y preparar una reunión es mirar a uno, no a todos.
 *
 * POR QUÉ POR ACTOR: lo que le dices a un ministerio no es lo que le
 * dices a una patronal. El briefing se prepara frente a cada
 * interlocutor.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const ETIQUETA = { fontSize: 11, color: '#888', letterSpacing: '.3px' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MAX_BYTES = 20 * 1024 * 1024;

// Los mismos tipos que acepta el bucket. Aquí la comprobación es solo
// comodidad —avisar antes de subir en vez de después—; la que de verdad
// se cumple está en el bucket, porque el navegador se lo salta cualquiera
// llamando a la API. Fuera html, svg y zip: los dos primeros ejecutan
// código al abrirse, el tercero esconde lo que lleva dentro.
const TIPOS_OK = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

// 5 minutos, la misma caducidad que usan los CV. Uno solo no daba para
// descargar un PDF grande con mala conexión.
const URL_SEGUNDOS = 300;


function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

const campo = {
  width: '100%',
  padding: '9px 11px',
  border: `.5px solid ${BORDE}`,
  borderRadius: 9,
  fontSize: 12.5,
  lineHeight: 1.65,
  outline: 'none',
  fontFamily: 'inherit',
  background: '#fafaf7',
  resize: 'vertical',
};

export default function BriefingProyecto({ projectId, userId }) {
  const supabase = createClient();
  const input = useRef(null);
  const [actores, setActores] = useState([]);
  const [notas, setNotas] = useState({});
  const [docs, setDocs] = useState({});
  const [sel, setSel] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState('');
  const [nota, setNota] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [hayDeshacer, setHayDeshacer] = useState(false);
  const borrada = useRef(null);

  const cargar = useCallback(async () => {
    const [{ data: acts }, { data: ns }, { data: fs }] = await Promise.all([
      supabase
        .from('project_actors')
        .select('id, kind, ref_id, nombre, descripcion, posicion, influencia, relacion, posicion_texto, argumentos, posicion_fuente, posicion_fecha')
        .eq('project_id', projectId)
        .order('created_at'),
      supabase
        .from('project_notes')
        .select('id, actor_id, cuerpo, created_at')
        .eq('project_id', projectId)
        .not('actor_id', 'is', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_files')
        .select('id, actor_id, nombre, storage_path, bytes, created_at')
        .eq('project_id', projectId)
        .not('actor_id', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

    const lista = acts || [];
    lista.sort((a, b) => {
      const pa = enZonaDePrioridad(a) ? 0 : 1;
      const pb = enZonaDePrioridad(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (b.influencia ?? 50) - (a.influencia ?? 50);
    });

    const porNota = {};
    for (const n of ns || []) (porNota[n.actor_id] ||= []).push(n);
    const porDoc = {};
    for (const f of fs || []) (porDoc[f.actor_id] ||= []).push(f);

    setActores(lista);
    setNotas(porNota);
    setDocs(porDoc);
    setSel((prev) => (lista.find((a) => a.id === prev) ? prev : lista[0]?.id || null));
    setCargando(false);
  }, [supabase, projectId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const actor = actores.find((a) => a.id === sel) || null;

  async function guardar(nombreCampo, valor) {
    if (!actor) return;
    const v = (valor ?? '').trim() || null;
    if (v === (actor[nombreCampo] || null)) return;
    setActores((prev) => prev.map((a) => (a.id === actor.id ? { ...a, [nombreCampo]: v } : a)));
    setEstado('Guardando…');
    const { error } = await supabase.from('project_actors').update({ [nombreCampo]: v }).eq('id', actor.id);
    setEstado(error ? 'Error al guardar' : 'Guardado');
    if (error) toast('No se ha podido guardar');
    setTimeout(() => setEstado(''), 1600);
  }

  async function anadirNota() {
    const cuerpo = nota.trim();
    if (!cuerpo || !actor) return;
    const { data, error } = await supabase
      .from('project_notes')
      .insert({ project_id: projectId, actor_id: actor.id, author_id: userId, cuerpo })
      .select('id, actor_id, cuerpo, created_at')
      .single();
    if (error) {
      toast('No se ha podido guardar la nota');
      return;
    }
    setNotas((prev) => ({ ...prev, [actor.id]: [data, ...(prev[actor.id] || [])] }));
    setNota('');
  }

  // Click sobre la nota para editarla, y se guarda al salir del campo.
  async function guardarNota(n, texto) {
    const cuerpo = texto.trim();
    setEditando(null);
    if (cuerpo === n.cuerpo) return;
    if (!cuerpo) return borrarNota(n);

    setNotas((prev) => ({
      ...prev,
      [n.actor_id]: (prev[n.actor_id] || []).map((x) => (x.id === n.id ? { ...x, cuerpo } : x)),
    }));
    const { error } = await supabase.from('project_notes').update({ cuerpo }).eq('id', n.id);
    if (error) toast('No se ha podido guardar');
  }

  async function borrarNota(n) {
    setNotas((prev) => ({
      ...prev,
      [n.actor_id]: (prev[n.actor_id] || []).filter((x) => x.id !== n.id),
    }));
    borrada.current = n;
    setHayDeshacer(true);
    const { error } = await supabase.from('project_notes').delete().eq('id', n.id);
    if (error) {
      setNotas((prev) => ({ ...prev, [n.actor_id]: [n, ...(prev[n.actor_id] || [])] }));
      borrada.current = null;
      setHayDeshacer(false);
      toast('No se ha podido borrar');
    }
  }

  async function restaurarNota() {
    const n = borrada.current;
    if (!n) return;
    borrada.current = null;
    setHayDeshacer(false);
    const { data, error } = await supabase
      .from('project_notes')
      .insert({ project_id: projectId, actor_id: n.actor_id, author_id: userId, cuerpo: n.cuerpo })
      .select('id, actor_id, cuerpo, created_at')
      .single();
    if (error) {
      toast('No se ha podido recuperar');
      return;
    }
    setNotas((prev) => ({ ...prev, [n.actor_id]: [data, ...(prev[n.actor_id] || [])] }));
  }

  async function subir(archivos) {
    const lista = Array.from(archivos || []).filter(Boolean);
    if (!actor || lista.length === 0) return;
    setSubiendo(true);

    for (const f of lista) {
      if (f.size > MAX_BYTES) {
        toast(`«${f.name}» pasa de 20 MB`);
        continue;
      }
      if (!TIPOS_OK.has(f.type)) {
        toast(`«${f.name}» no es un tipo admitido`);
        continue;
      }
      const limpio = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const ruta = `${projectId}/${crypto.randomUUID()}-${limpio}`;

      const { error: eSubida } = await supabase.storage
        .from('project-files')
        .upload(ruta, f, { contentType: f.type || undefined, upsert: false });
      if (eSubida) {
        // El motivo importa: sin él no se distingue un permiso denegado
        // de un archivo duplicado o de un bucket que no existe.
        console.error('Subida fallida', { ruta, error: eSubida });
        toast(`No se ha podido subir «${f.name}»: ${eSubida.message || 'error desconocido'}`);
        continue;
      }

      const { data, error } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          actor_id: actor.id,
          uploader_id: userId,
          nombre: f.name,
          storage_path: ruta,
          mime: f.type || null,
          bytes: f.size,
        })
        .select('id, actor_id, nombre, storage_path, bytes, created_at')
        .single();

      if (error) {
        // Si la fila falla, el archivo se queda huérfano en el bucket:
        // se retira para no dejar basura que nadie puede ver ni borrar.
        await supabase.storage.from('project-files').remove([ruta]);
        console.error('Fila fallida', { ruta, error });
        toast(`No se ha podido guardar «${f.name}»: ${error.message || error.code || 'error desconocido'}`);
        continue;
      }
      setDocs((prev) => ({ ...prev, [actor.id]: [data, ...(prev[actor.id] || [])] }));
    }

    setSubiendo(false);
    if (input.current) input.current.value = '';
  }

  async function abrirDoc(doc) {
    const { data, error } = await supabase.storage.from('project-files').createSignedUrl(doc.storage_path, URL_SEGUNDOS);
    if (error || !data?.signedUrl) {
      console.error('URL firmada fallida', { ruta: doc.storage_path, error });
      toast(`No se ha podido abrir: ${error?.message || 'sin permiso'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  if (cargando) return <div className="spinner"></div>;

  if (actores.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.65, maxWidth: 470 }}>
        El briefing se construye sobre los actores del mapa. Añade a quien decide y a quien influye, y
        aquí podrás anotar su posición y los argumentos que vas a usar con cada uno.
      </div>
    );
  }

  const prioritarios = actores.filter(enZonaDePrioridad);
  const resto = actores.filter((a) => !enZonaDePrioridad(a));
  const misNotas = actor ? notas[actor.id] || [] : [];
  const misDocs = actor ? docs[actor.id] || [] : [];

  function fila(a) {
    const activo = a.id === sel;
    const conBriefing = !!(a.posicion_texto || a.argumentos);
    return (
      <button
        key={a.id}
        onClick={() => {
          setSel(a.id);
          setNota('');
        }}
        style={{
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 8,
          marginBottom: 3,
          borderRadius: 8,
          border: 'none',
          background: activo ? '#f0eefe' : 'transparent',
        }}
      >
        <ActorAvatar actor={a} size={24} atenuado={a.relacion === 'sin_contactar'} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: activo ? 600 : 400,
              color: activo ? '#1a1a18' : '#555',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {a.nombre}
          </span>
          <span style={{ display: 'block', fontSize: 10, color: '#888' }}>{posicionLabel(a.posicion)}</span>
        </span>
        {/* El punto dice quién tiene briefing escrito: con doce actores
            es la única forma de ver qué falta por preparar. */}
        {conBriefing && (
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: MORADO, flexShrink: 0 }}></span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        background: '#fff',
        border: `.5px solid ${BORDE}`,
        borderRadius: 10,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 215px) minmax(0, 1fr)',
        overflow: 'hidden',
      }}
    >
      <div style={{ borderRight: `.5px solid ${BORDE}`, padding: '13px 10px', background: '#fafaf7' }}>
        {prioritarios.length > 0 && (
          <>
            <div style={{ fontSize: 10.5, color: MORADO, letterSpacing: '.3px', padding: '0 8px 7px' }}>
              PRIORIDAD · {prioritarios.length}
            </div>
            {prioritarios.map(fila)}
          </>
        )}
        {resto.length > 0 && (
          <>
            <div
              style={{
                fontSize: 10.5,
                color: '#888',
                letterSpacing: '.3px',
                padding: '11px 8px 7px',
                borderTop: prioritarios.length ? `.5px solid ${BORDE}` : 'none',
                marginTop: prioritarios.length ? 8 : 0,
              }}
            >
              RESTO · {resto.length}
            </div>
            {resto.map(fila)}
          </>
        )}
      </div>

      <div style={{ padding: '16px 18px', minWidth: 0 }}>
        {!actor ? (
          <div style={{ fontSize: 12.5, color: '#999' }}>Elige un actor de la lista.</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 15 }}>
              <ActorAvatar actor={actor} size={34} fondo={enZonaDePrioridad(actor) ? '#eeedfe' : '#f0f0eb'} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{actor.nombre}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                  {actor.descripcion ? `${actor.descripcion} · ` : ''}
                  {posicionLabel(actor.posicion)} · {relacionLabel(actor.relacion).toLowerCase()}
                </div>
              </div>
              {enZonaDePrioridad(actor) && (
                <span
                  style={{
                    fontSize: 10.5,
                    background: '#eeedfe',
                    color: '#3c3489',
                    padding: '3px 9px',
                    borderRadius: 12,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  Prioridad
                </span>
              )}
              <span style={{ fontSize: 10.5, color: '#a8a49c', flexShrink: 0 }}>{estado}</span>
            </div>

            <div style={{ ...ETIQUETA, marginBottom: 6 }}>SU POSICIÓN</div>
            <textarea
              key={`pos-${actor.id}`}
              defaultValue={actor.posicion_texto || ''}
              rows={2}
              placeholder="Qué defiende, con qué condiciones, qué ha dicho en público"
              onBlur={(e) => guardar('posicion_texto', e.target.value)}
              style={{ ...campo, marginBottom: 8 }}
            />

            <div style={{ display: 'flex', gap: 7, marginBottom: 15, flexWrap: 'wrap' }}>
              <input
                key={`fuente-${actor.id}`}
                defaultValue={actor.posicion_fuente || ''}
                placeholder="De dónde sale (comparecencia, alegación, prensa…)"
                onBlur={(e) => guardar('posicion_fuente', e.target.value)}
                style={{ ...campo, flex: 1, minWidth: 180, padding: '7px 11px', fontSize: 12 }}
              />
              {/* La fecha solo aparece si hay fuente: sin fuente no hay
                  nada que fechar. Cuando la hay sí importa — una posición
                  de hace dos años te lleva a la reunión con el
                  argumentario equivocado. */}
              {actor.posicion_fuente && (
                <input
                  key={`fecha-${actor.id}`}
                  type="date"
                  defaultValue={actor.posicion_fecha || ''}
                  onBlur={(e) => guardar('posicion_fecha', e.target.value)}
                  style={{ ...campo, width: 'auto', padding: '7px 10px', fontSize: 12 }}
                />
              )}
            </div>

            <div style={{ ...ETIQUETA, marginBottom: 6 }}>NUESTROS ARGUMENTOS</div>
            <textarea
              key={`arg-${actor.id}`}
              defaultValue={actor.argumentos || ''}
              rows={2}
              placeholder="Qué le vas a decir a este interlocutor en concreto"
              onBlur={(e) => guardar('argumentos', e.target.value)}
              style={{ ...campo, marginBottom: 16 }}
            />

            <div style={{ borderTop: `.5px solid ${BORDE}`, paddingTop: 13, marginBottom: 16 }}>
              <div style={{ ...ETIQUETA, marginBottom: 9 }}>NOTAS SOBRE ESTE ACTOR</div>
              {misNotas.slice(0, 4).map((n) => (
                <div key={n.id} style={{ display: 'flex', gap: 9, marginBottom: 10 }}>
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
                    {editando === n.id ? (
                      <textarea
                        autoFocus
                        defaultValue={n.cuerpo}
                        rows={2}
                        onBlur={(e) => guardarNota(n, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditando(null);
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardarNota(n, e.target.value);
                        }}
                        style={{ ...campo, padding: '7px 10px', fontSize: 12, background: '#fff', border: `1px solid ${MORADO}` }}
                      />
                    ) : (
                      <div
                        onClick={() => setEditando(n.id)}
                        style={{ fontSize: 12, color: '#555', lineHeight: 1.55, whiteSpace: 'pre-wrap', cursor: 'text' }}
                      >
                        {n.cuerpo}
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>{fechaCorta(n.created_at)}</div>
                  </div>
                  {/* El click sobre el texto ya edita, pero sin un
                      icono nadie lo descubre. */}
                  <button
                    onClick={() => setEditando(n.id)}
                    aria-label="Editar"
                    className="gt-nota-editar"
                    style={{ background: 'none', border: 'none', color: '#c4c0b8', padding: 2, flexShrink: 0 }}
                  >
                    <i className="ti ti-pencil" style={{ fontSize: 13 }}></i>
                  </button>
                  <button
                    onClick={() => borrarNota(n)}
                    aria-label="Borrar nota"
                    style={{ background: 'none', border: 'none', color: '#c4c0b8', padding: 2, flexShrink: 0 }}
                  >
                    <i className="ti ti-x" style={{ fontSize: 13 }}></i>
                  </button>
                </div>
              ))}
              {hayDeshacer && (
                <button
                  onClick={restaurarNota}
                  style={{ background: 'none', border: 'none', color: MORADO, fontSize: 11.5, padding: '0 0 9px' }}
                >
                  Deshacer
                </button>
              )}
              {misNotas.length > 4 && (
                <div style={{ fontSize: 11, color: '#888', marginBottom: 9 }}>
                  y {misNotas.length - 4} notas más
                </div>
              )}
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onBlur={anadirNota}
                onKeyDown={(e) => e.key === 'Enter' && anadirNota()}
                placeholder="Añade una nota sobre este actor"
                style={{ ...campo, padding: '8px 11px', fontSize: 12 }}
              />
            </div>

            {/* Documentos DE ESTE ACTOR: el argumentario de esa reunión o
                el escrito que te hizo llegar. En el repositorio general
                del proyecto se perderían justo cuando hacen falta. */}
            <div style={{ borderTop: `.5px solid ${BORDE}`, paddingTop: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                <span style={ETIQUETA}>DOCUMENTOS</span>
                <button
                  onClick={() => input.current?.click()}
                  disabled={subiendo}
                  style={{ background: 'none', border: 'none', color: MORADO, fontSize: 11.5, padding: 0 }}
                >
                  <i className="ti ti-paperclip" style={{ fontSize: 13, verticalAlign: -2, marginRight: 4 }}></i>
                  {subiendo ? 'Subiendo…' : 'Adjuntar'}
                </button>
                <input
                  ref={input}
                  type="file"
                  multiple
                  accept={[...TIPOS_OK].join(',')}
                  onChange={(e) => subir(e.target.files)}
                  style={{ display: 'none' }}
                />
              </div>

              {misDocs.length === 0 && (
                <div style={{ fontSize: 11.5, color: '#999', lineHeight: 1.6 }}>
                  El argumentario que le llevas o lo que te haya hecho llegar.
                </div>
              )}

              {misDocs.map((f) => (
                <button
                  key={f.id}
                  onClick={() => abrirDoc(f)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: '5px 0',
                  }}
                >
                  <i className="ti ti-file-text" style={{ fontSize: 14, color: '#a8a49c', flexShrink: 0 }}></i>
                  <span
                    style={{
                      fontSize: 12,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.nombre}
                  </span>
                  <span style={{ fontSize: 10.5, color: '#888', flexShrink: 0 }}>{fechaCorta(f.created_at)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
