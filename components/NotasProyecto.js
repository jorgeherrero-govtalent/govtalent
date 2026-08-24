'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

/**
 * Las notas del proyecto.
 *
 * Sin botón de guardar: se escribe y se guarda al salir del campo. Y sin
 * confirmación al borrar — se quita y se ofrece deshacer durante unos
 * segundos, que da más seguridad que un «¿estás seguro?» y molesta menos.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function haceCuanto(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export default function NotasProyecto({ projectId, userId }) {
  const supabase = createClient();
  const [notas, setNotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nueva, setNueva] = useState('');
  const [editando, setEditando] = useState(null);
  const [estado, setEstado] = useState('');
  const deshacer = useRef(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_notes')
      .select('id, cuerpo, actor_id, created_at, updated_at')
      .eq('project_id', projectId)
      .is('actor_id', null)
      .order('created_at', { ascending: false });
    if (error) toast('No se han podido cargar las notas');
    setNotas(data || []);
    setCargando(false);
  }, [supabase, projectId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crear() {
    const cuerpo = nueva.trim();
    if (!cuerpo) return;
    setEstado('Guardando…');
    const { data, error } = await supabase
      .from('project_notes')
      .insert({ project_id: projectId, author_id: userId, cuerpo })
      .select('id, cuerpo, actor_id, created_at, updated_at')
      .single();
    if (error) {
      setEstado('Error al guardar');
      toast('No se ha podido guardar la nota');
      return;
    }
    setNotas((prev) => [data, ...prev]);
    setNueva('');
    setEstado('Guardado');
    setTimeout(() => setEstado(''), 1600);
  }

  async function guardarEdicion(id, texto) {
    const cuerpo = texto.trim();
    setEditando(null);
    const actual = notas.find((n) => n.id === id);
    if (!actual || cuerpo === actual.cuerpo) return;
    if (!cuerpo) return borrar(id);

    setNotas((prev) => prev.map((n) => (n.id === id ? { ...n, cuerpo } : n)));
    setEstado('Guardando…');
    const { error } = await supabase.from('project_notes').update({ cuerpo }).eq('id', id);
    setEstado(error ? 'Error al guardar' : 'Guardado');
    if (error) toast('No se ha podido guardar');
    setTimeout(() => setEstado(''), 1600);
  }

  // Se guarda la fila en memoria para poder reinsertarla: es más simple
  // que un borrado lógico y suficiente para una ventana de segundos.
  async function borrar(id) {
    const nota = notas.find((n) => n.id === id);
    if (!nota) return;
    setNotas((prev) => prev.filter((n) => n.id !== id));
    deshacer.current = nota;

    const { error } = await supabase.from('project_notes').delete().eq('id', id);
    if (error) {
      setNotas((prev) => [nota, ...prev]);
      toast('No se ha podido borrar');
      return;
    }
    toast('Nota eliminada');
  }

  async function restaurar() {
    const nota = deshacer.current;
    if (!nota) return;
    deshacer.current = null;
    const { data, error } = await supabase
      .from('project_notes')
      .insert({ project_id: projectId, author_id: userId, cuerpo: nota.cuerpo })
      .select('id, cuerpo, actor_id, created_at, updated_at')
      .single();
    if (error) {
      toast('No se ha podido recuperar la nota');
      return;
    }
    setNotas((prev) => [data, ...prev]);
  }

  if (cargando) return <div className="spinner"></div>;

  return (
    <div style={{ maxWidth: 640 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 9,
          border: `.5px solid ${BORDE}`,
          borderRadius: 10,
          padding: '11px 13px',
          background: '#fafaf7',
          marginBottom: 16,
        }}
      >
        <i className="ti ti-message-plus" style={{ fontSize: 16, color: '#a8a49c', marginTop: 3 }}></i>
        <textarea
          value={nueva}
          rows={nueva ? 3 : 1}
          onChange={(e) => setNueva(e.target.value)}
          onBlur={crear}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) crear();
            if (e.key === 'Escape') setNueva('');
          }}
          placeholder="Escribe una nota…"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'none',
            fontSize: 13,
            lineHeight: 1.65,
            fontFamily: 'inherit',
            resize: 'none',
            padding: 0,
          }}
        />
      </div>

      <div style={{ minHeight: 16, marginBottom: 6, fontSize: 11, color: '#a8a49c' }}>{estado}</div>

      {notas.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.65 }}>
          Aquí van las decisiones y el criterio que no caben en un dato: por qué se eligió una vía, qué
          dijo alguien en una reunión, qué falta por confirmar.
        </div>
      )}

      {notas.map((n, i) => (
        <div
          key={n.id}
          style={{
            display: 'flex',
            gap: 10,
            padding: '12px 0',
            borderTop: i === 0 ? 'none' : `.5px solid ${BORDE}`,
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#eeedfe',
              color: MORADO,
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            <i className="ti ti-note" style={{ fontSize: 12 }}></i>
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            {editando === n.id ? (
              <textarea
                autoFocus
                defaultValue={n.cuerpo}
                rows={3}
                onBlur={(e) => guardarEdicion(n.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditando(null);
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardarEdicion(n.id, e.target.value);
                }}
                style={{
                  width: '100%',
                  border: `1px solid ${MORADO}`,
                  borderRadius: 9,
                  padding: '9px 11px',
                  fontSize: 13,
                  lineHeight: 1.65,
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            ) : (
              // Click para editar, sin abrir nada.
              <div
                onClick={() => setEditando(n.id)}
                style={{ fontSize: 13, color: '#1a1a18', lineHeight: 1.65, whiteSpace: 'pre-wrap', cursor: 'text' }}
              >
                {n.cuerpo}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: '#888', marginTop: 4 }}>
              {haceCuanto(n.created_at)}
              {n.updated_at && n.updated_at !== n.created_at && ' · editada'}
            </div>
          </div>

          {/* El click sobre el texto ya edita, pero sin un icono nadie
              lo descubre. */}
          <button
            onClick={() => setEditando(n.id)}
            aria-label="Editar nota"
            style={{ background: 'none', border: 'none', color: '#c4c0b8', padding: 2, flexShrink: 0 }}
          >
            <i className="ti ti-pencil" style={{ fontSize: 13 }}></i>
          </button>
          <button
            onClick={() => borrar(n.id)}
            aria-label="Eliminar nota"
            style={{ background: 'none', border: 'none', color: '#c4c0b8', padding: 2, flexShrink: 0 }}
          >
            <i className="ti ti-x" style={{ fontSize: 14 }}></i>
          </button>
        </div>
      ))}

      {deshacer.current && (
        <button
          onClick={restaurar}
          style={{
            background: 'none',
            border: 'none',
            color: MORADO,
            fontSize: 12,
            padding: '10px 0 0',
          }}
        >
          Deshacer la última eliminación
        </button>
      )}

      <div style={{ fontSize: 11.5, color: '#999', marginTop: 18, lineHeight: 1.6 }}>
        Mencionar con @ a compañeros llega con Teams.
      </div>
    </div>
  );
}
