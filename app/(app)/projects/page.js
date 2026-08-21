'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import UpgradeModal from '@/components/UpgradeModal';
import MapaActores from '@/components/MapaActores';
import ProyectoDemo from '@/components/ProyectoDemo';
import {
  limiteProyectos,
  puedeCrearProyecto,
  tieneProyectos,
  upsellProyectos,
} from '@/lib/proyectos';

/**
 * Proyectos — espacio de trabajo.
 *
 * Lateral con los proyectos y contenido a la derecha, sin recargar al
 * cambiar: el proyecto activo va en ?p= para que la URL siga siendo
 * compartible y el atrás del navegador funcione.
 *
 * Free ve la pantalla con dos proyectos de muestra y el modal de Pro
 * encima. Una lista vacía y bloqueada no explica de qué te pierdes.
 *
 * Patrones copiados: la anatomía de tarjeta con cifras es la de
 * Regulatorio; el modal es UpgradeModal. Morado #6d5aef (btn-ai) para
 * todo lo de Pro, nunca el verde de marca.
 */

const BORDE = '#e0dfd8';
const MORADO = '#6d5aef';
const CARD = { background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 10 };

const MUESTRA = [
  {
    id: 'demo-1',
    name: 'Reglamento de IA',
    objetivo: 'Que la supervisión no imponga auditoría previa a los sistemas de riesgo limitado.',
    n_actores: 14,
    n_asuntos: 4,
    sin_contactar: 6,
  },
  {
    id: 'demo-2',
    name: 'Movilidad sostenible',
    objetivo: 'Llegar a las comunidades antes de que se cierre el reglamento.',
    n_actores: 9,
    n_asuntos: 7,
    sin_contactar: 2,
  },
];

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="sec">
          <div className="spinner"></div>
        </div>
      }
    >
      <Workspace />
    </Suspense>
  );
}

function Workspace() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const activoId = params.get('p');

  const [cargando, setCargando] = useState(true);
  const [user, setUser] = useState(null);
  const [proyectos, setProyectos] = useState([]);
  const [conteos, setConteos] = useState({});
  const [modalUpsell, setModalUpsell] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  // Free arranca en el mapa y no en el resumen: es lo más visual y lo
  // único que explica el producto sin leer.
  const [pestana, setPestana] = useState('resumen');

  const esPro = tieneProyectos(user);
  const lista = esPro ? proyectos : MUESTRA;
  const activo = lista.find((p) => p.id === activoId) || lista[0] || null;

  const cargar = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setCargando(false);
      return;
    }

    const { data: perfil } = await supabase
      .from('users')
      .select('id, plan')
      .eq('id', auth.user.id)
      .single();
    setUser(perfil);

    if (perfil?.plan !== 'pro') {
      setPestana('mapa');
      setCargando(false);
      setModalUpsell(true);
      return;
    }

    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description, objetivo, updated_at')
      .eq('user_id', auth.user.id)
      .eq('archived', false)
      .order('updated_at', { ascending: false });

    if (error) {
      toast('No se han podido cargar tus proyectos');
      setCargando(false);
      return;
    }

    const ids = (data || []).map((p) => p.id);
    const acc = {};
    for (const id of ids) acc[id] = { actores: 0, asuntos: 0, sinContactar: 0, novedades: 0 };

    // Tres consultas agregadas, no tres por proyecto: con veinte
    // proyectos serían sesenta llamadas.
    if (ids.length) {
      const [{ data: items }, { data: actores }, { data: eventos }] = await Promise.all([
        supabase.from('project_items').select('project_id').in('project_id', ids),
        supabase.from('project_actors').select('project_id, relacion').in('project_id', ids),
        supabase.from('project_events').select('project_id, estado').in('project_id', ids),
      ]);
      for (const it of items || []) acc[it.project_id].asuntos += 1;
      for (const a of actores || []) {
        acc[a.project_id].actores += 1;
        if (a.relacion === 'sin_contactar') acc[a.project_id].sinContactar += 1;
      }
      for (const e of eventos || []) if (e.estado === 'nuevo') acc[e.project_id].novedades += 1;
    }

    setConteos(acc);
    setProyectos(data || []);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function abrir(id) {
    router.replace(`/projects?p=${id}`, { scroll: false });
    setPestana('resumen');
  }

  async function crear() {
    const titulo = nombre.trim();
    if (!titulo) return;
    if (!puedeCrearProyecto(user, proyectos.length)) {
      toast(`Has llegado al máximo de ${limiteProyectos()} proyectos`);
      return;
    }
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name: titulo })
      .select('id, name, description, objetivo, updated_at')
      .single();
    if (error) {
      toast('No se ha podido crear el proyecto');
      return;
    }
    setProyectos((prev) => [data, ...prev]);
    setConteos((prev) => ({ ...prev, [data.id]: { actores: 0, asuntos: 0, sinContactar: 0, novedades: 0 } }));
    setNombre('');
    setCreando(false);
    abrir(data.id);
  }

  async function guardarObjetivo(texto) {
    if (!activo || !esPro) return;
    const v = texto.trim();
    if (v === (activo.objetivo || '')) return;
    setProyectos((prev) => prev.map((p) => (p.id === activo.id ? { ...p, objetivo: v || null } : p)));
    const { error } = await supabase.from('projects').update({ objetivo: v || null }).eq('id', activo.id);
    if (error) toast('No se ha podido guardar el objetivo');
  }

  if (cargando) {
    return (
      <div className="sec">
        <div className="spinner"></div>
      </div>
    );
  }

  const c = (esPro && activo ? conteos[activo.id] : null) || {
    actores: activo?.n_actores || 0,
    asuntos: activo?.n_asuntos || 0,
    sinContactar: activo?.sin_contactar || 0,
    novedades: 0,
  };

  return (
    <div className="sec" style={{ maxWidth: 1180 }}>
      <div style={{ ...CARD, display: 'grid', gridTemplateColumns: 'minmax(0,210px) minmax(0,1fr)' }}>
        {/* --- Lateral --- */}
        <div style={{ borderRight: `.5px solid ${BORDE}`, padding: '16px 11px', background: '#fafaf7' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 11,
            }}
          >
            <span style={{ fontSize: 11, color: '#888', letterSpacing: '.3px' }}>PROYECTOS</span>
            {esPro && (
              <button
                onClick={() => setCreando(true)}
                aria-label="Nuevo proyecto"
                style={{ background: 'none', border: 'none', color: MORADO, padding: 0 }}
              >
                <i className="ti ti-plus" style={{ fontSize: 16 }}></i>
              </button>
            )}
          </div>

          {lista.map((p) => {
            const sel = activo?.id === p.id;
            const nov = (esPro ? conteos[p.id]?.novedades : 0) || 0;
            return (
              <button
                key={p.id}
                onClick={() => esPro ? abrir(p.id) : setModalUpsell(true)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '7px 9px',
                  marginBottom: 3,
                  borderRadius: 8,
                  border: 'none',
                  background: sel ? '#f0eefe' : 'transparent',
                }}
              >
                <i
                  className="ti ti-folder"
                  style={{ fontSize: 14, color: sel ? MORADO : '#a8a49c', flexShrink: 0 }}
                ></i>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: sel ? 500 : 400,
                    color: sel ? '#1a1a18' : '#555',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </span>
                {nov > 0 && (
                  <span
                    style={{
                      fontSize: 10.5,
                      background: MORADO,
                      color: '#fff',
                      borderRadius: 20,
                      padding: '0 6px',
                      flexShrink: 0,
                    }}
                  >
                    {nov}
                  </span>
                )}
              </button>
            );
          })}

          {/* Crear escribiendo en la propia fila, no con un formulario
              aparte: es lo que hace que se sienta ágil. */}
          {creando ? (
            <input
              autoFocus
              value={nombre}
              maxLength={140}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={() => (nombre.trim() ? crear() : setCreando(false))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') crear();
                if (e.key === 'Escape') {
                  setNombre('');
                  setCreando(false);
                }
              }}
              placeholder="Nombre del proyecto"
              style={{
                width: '100%',
                padding: '7px 9px',
                border: `1px solid ${MORADO}`,
                borderRadius: 8,
                fontSize: 12.5,
                outline: 'none',
                fontFamily: 'inherit',
                background: '#fff',
              }}
            />
          ) : (
            esPro && (
              <button
                onClick={() => setCreando(true)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '7px 9px',
                  border: 'none',
                  background: 'none',
                  color: '#a8a49c',
                  fontSize: 12.5,
                }}
              >
                <i className="ti ti-plus" style={{ fontSize: 14 }}></i> Nuevo
              </button>
            )
          )}

          {!esPro && (
            <button className="btn-ai" style={{ width: '100%', marginTop: 14 }} onClick={() => setModalUpsell(true)}>
              <i className="ti ti-bolt"></i> Desbloquear
            </button>
          )}
        </div>

        {/* --- Contenido --- */}
        <div style={{ padding: '18px 22px', minWidth: 0 }}>
          {!activo ? (
            <div className="empty-state">
              <i className="ti ti-folder"></i>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#1a1a18' }}>
                Todavía no tienes proyectos
              </div>
              <p style={{ fontSize: 13, color: '#666', margin: '8px auto 20px', maxWidth: 380, lineHeight: 1.65 }}>
                Un proyecto reúne los asuntos que sigues, los actores a los que quieres llegar y lo
                que vas haciendo con cada uno.
              </p>
              <button className="btn-ai" onClick={() => setCreando(true)}>
                <i className="ti ti-plus"></i> Crear el primero
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35 }}>{activo.name}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                {c.actores} {c.actores === 1 ? 'actor' : 'actores'} · {c.asuntos}{' '}
                {c.asuntos === 1 ? 'asunto' : 'asuntos'}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 17,
                  borderBottom: `.5px solid ${BORDE}`,
                  margin: '14px 0 16px',
                  flexWrap: 'wrap',
                }}
              >
                {[
                  ['resumen', 'Resumen'],
                  ['mapa', 'Mapa de actores'],
                ].map(([id, texto]) => (
                  <button
                    key={id}
                    onClick={() => setPestana(id)}
                    style={{
                      fontSize: 12.5,
                      fontWeight: pestana === id ? 500 : 400,
                      color: pestana === id ? MORADO : '#555',
                      background: 'none',
                      border: 'none',
                      borderBottom: pestana === id ? `2px solid ${MORADO}` : '2px solid transparent',
                      padding: '0 0 8px',
                    }}
                  >
                    {texto}
                  </button>
                ))}
              </div>

              {pestana === 'resumen' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,290px)', gap: 18 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#888', letterSpacing: '.3px', marginBottom: 7 }}>
                      OBJETIVO
                    </div>
                    {esPro ? (
                      <textarea
                        defaultValue={activo.objetivo || ''}
                        placeholder="Qué quieres conseguir con este asunto"
                        onBlur={(e) => guardarObjetivo(e.target.value)}
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: `.5px solid ${BORDE}`,
                          borderRadius: 9,
                          fontSize: 13,
                          lineHeight: 1.7,
                          outline: 'none',
                          fontFamily: 'inherit',
                          background: '#fafaf7',
                          resize: 'vertical',
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: 13, color: '#555', lineHeight: 1.7 }}>{activo.objetivo}</div>
                    )}

                    <div style={{ fontSize: 11, color: '#888', letterSpacing: '.3px', margin: '18px 0 7px' }}>
                      ASUNTOS QUE SIGUE
                    </div>
                    <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.65 }}>
                      Desde la ficha de una ley o un expediente podrás mandarla a este proyecto. Lo
                      activamos en cuanto el mapa esté rodado.
                    </div>
                  </div>

                  {/* Tarjetas de cifras: el patrón de Regulatorio. */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...CARD, padding: '15px 16px', marginBottom: 10 }}>
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 21, fontWeight: 600, color: MORADO, lineHeight: 1.1 }}>
                            {c.actores}
                          </div>
                          <div style={{ fontSize: 11, color: '#888' }}>actores</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 21, fontWeight: 600, color: MORADO, lineHeight: 1.1 }}>
                            {c.asuntos}
                          </div>
                          <div style={{ fontSize: 11, color: '#888' }}>asuntos</div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 21,
                              fontWeight: 600,
                              // Sin color de estado: el contraste hace el trabajo.
                              color: c.sinContactar > 0 ? '#1a1a18' : '#a8a49c',
                              lineHeight: 1.1,
                            }}
                          >
                            {c.sinContactar}
                          </div>
                          <div style={{ fontSize: 11, color: '#888' }}>sin contactar</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ ...CARD, padding: '15px 16px', opacity: 0.55 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <i className="ti ti-lock" style={{ fontSize: 14, color: '#8b8780' }}></i>
                        <span style={{ fontSize: 11, color: '#888', letterSpacing: '.3px' }}>EQUIPO</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.55 }}>
                        Invitar a compañeros y repartir los actores llega con Teams.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {pestana === 'mapa' && (esPro ? <MapaActores projectId={activo.id} /> : <ProyectoDemo />)}
            </>
          )}
        </div>
      </div>

      {!esPro && (
        <p style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 14 }}>
          Ejemplos de cómo se ve un proyecto en Pro.
        </p>
      )}

      {modalUpsell && <UpgradeModal {...upsellProyectos()} onClose={() => setModalUpsell(false)} />}
    </div>
  );
}
