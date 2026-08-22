'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import UpgradeModal from '@/components/UpgradeModal';
import { upsellProyectos } from '@/lib/proyectos';

/**
 * Mandar una ficha a un proyecto.
 *
 * Vive dentro de FollowButton, así que aparece en todas las fichas de la
 * plataforma sin construir un flujo por tipo.
 *
 * QUÉ ENTRA DÓNDE. El kind decide solo: una ley, un expediente o un
 * procedimiento son ASUNTOS del proyecto; un diputado, un comisario o
 * una comisión son ACTORES del mapa. Nadie tiene que elegirlo.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';

// Los cinco tipos regulatorios. El resto son actores.
const ASUNTOS = new Set(['ley', 'actividad', 'expediente', 'procedimiento', 'boe']);

export function esAsunto(kind) {
  return ASUNTOS.has(kind);
}

export default function SelectorProyecto({ kind, refId, label, onClose }) {
  const supabase = createClient();
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [esPro, setEsPro] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [yaEn, setYaEn] = useState(new Set());

  const comoAsunto = esAsunto(kind);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        setCargando(false);
        return;
      }
      const { data: perfil } = await supabase.from('users').select('plan').eq('id', auth.user.id).single();
      if (perfil?.plan !== 'pro') {
        setEsPro(false);
        setCargando(false);
        return;
      }
      setEsPro(true);

      const { data: ps } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', auth.user.id)
        .eq('archived', false)
        .order('updated_at', { ascending: false });
      setProyectos(ps || []);

      // En cuáles está ya, para no ofrecer añadirlo dos veces.
      const ids = (ps || []).map((p) => p.id);
      if (ids.length) {
        const tabla = comoAsunto ? 'project_items' : 'project_actors';
        const { data: puestos } = await supabase
          .from(tabla)
          .select('project_id')
          .in('project_id', ids)
          .eq('kind', kind)
          .eq('ref_id', String(refId));
        setYaEn(new Set((puestos || []).map((x) => x.project_id)));
      }
      setCargando(false);
    })();
  }, [supabase, kind, refId, comoAsunto]);

  async function anadir(projectId) {
    if (guardando || yaEn.has(projectId)) return;
    setGuardando(true);

    const fila = comoAsunto
      ? { project_id: projectId, kind, ref_id: String(refId), etiqueta: label }
      : { project_id: projectId, kind, ref_id: String(refId), nombre: label, es_propio: false };

    const { error } = await supabase.from(comoAsunto ? 'project_items' : 'project_actors').insert(fila);
    setGuardando(false);

    if (error) {
      // Clave duplicada: ya estaba, y decirlo es mejor que un error.
      if (error.code === '23505') {
        setYaEn((prev) => new Set(prev).add(projectId));
        toast('Ya estaba en ese proyecto');
        return;
      }
      toast('No se ha podido añadir al proyecto');
      return;
    }

    setYaEn((prev) => new Set(prev).add(projectId));
    toast(comoAsunto ? 'Añadido como asunto del proyecto' : 'Añadido al mapa de actores');
    onClose();
  }

  async function crearYAnadir() {
    const t = nombre.trim();
    if (!t || guardando) return;
    setGuardando(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: auth.user.id, name: t })
      .select('id')
      .single();
    setGuardando(false);
    if (error) {
      toast('No se ha podido crear el proyecto');
      return;
    }
    anadir(data.id);
  }

  if (!cargando && !esPro) {
    return <UpgradeModal {...upsellProyectos()} onClose={onClose} />;
  }

  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <h2>Añadir a un proyecto</h2>
          <div className="modal-x" onClick={onClose}>
            <i className="ti ti-x"></i>
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#888', marginTop: -6, marginBottom: 14, lineHeight: 1.55 }}>
          {comoAsunto
            ? 'Entrará como asunto, con su tramitación y sus plazos.'
            : 'Entrará en el mapa de actores, en el centro, para que lo coloques.'}
        </div>

        {cargando && <div className="spinner"></div>}

        {!cargando &&
          proyectos.map((p, i) => {
            const puesto = yaEn.has(p.id);
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderTop: i === 0 ? `.5px solid ${BORDE}` : 'none',
                  borderBottom: `.5px solid ${BORDE}`,
                }}
              >
                <i className="ti ti-folder" style={{ fontSize: 15, color: '#a8a49c', flexShrink: 0 }}></i>
                <span
                  style={{
                    fontSize: 12.5,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: puesto ? '#a8a49c' : '#1a1a18',
                  }}
                >
                  {p.name}
                </span>
                {puesto ? (
                  <span style={{ fontSize: 11.5, color: '#a8a49c', flexShrink: 0 }}>Ya está</span>
                ) : (
                  <button className="btn-g" onClick={() => anadir(p.id)} disabled={guardando} style={{ flexShrink: 0 }}>
                    Añadir
                  </button>
                )}
              </div>
            );
          })}

        {!cargando && proyectos.length === 0 && !creando && (
          <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.65, marginBottom: 14 }}>
            Todavía no tienes ningún proyecto. Crea el primero con este {comoAsunto ? 'asunto' : 'actor'}{' '}
            dentro.
          </div>
        )}

        {creando ? (
          <div style={{ display: 'flex', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
            <input
              autoFocus
              value={nombre}
              maxLength={140}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') crearYAnadir();
                if (e.key === 'Escape') setCreando(false);
              }}
              placeholder={label ? label.slice(0, 60) : 'Nombre del proyecto'}
              style={{
                flex: 1,
                minWidth: 170,
                padding: '9px 12px',
                border: `1px solid ${MORADO}`,
                borderRadius: 9,
                fontSize: 13,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button className="btn-ai" onClick={crearYAnadir} disabled={!nombre.trim() || guardando}>
              Crear
            </button>
          </div>
        ) : (
          !cargando && (
            <button
              onClick={() => {
                setNombre(label ? label.slice(0, 140) : '');
                setCreando(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: 'none',
                border: 'none',
                color: MORADO,
                fontSize: 12.5,
                padding: '13px 0 0',
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: 14 }}></i> Crear un proyecto nuevo
            </button>
          )
        )}
      </div>
    </div>
  );
}
