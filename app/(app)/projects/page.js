'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import UpgradeModal from '@/components/UpgradeModal';
import MapaActores from '@/components/MapaActores';
import AgendaProyecto from '@/components/AgendaProyecto';
import NotasProyecto from '@/components/NotasProyecto';
import AsuntosProyecto from '@/components/AsuntosProyecto';
import BriefingProyecto from '@/components/BriefingProyecto';
import DocumentosProyecto from '@/components/DocumentosProyecto';
import AnclasProyecto from '@/components/AnclasProyecto';
import ActorAvatar from '@/components/ActorAvatar';
import ProyectoDemo, { ResumenDemo } from '@/components/ProyectoDemo';
import { limiteProyectos, puedeCrearProyecto, tieneProyectos, upsellProyectos } from '@/lib/proyectos';

/**
 * Proyectos.
 *
 * Dos pantallas en una ruta:
 *   /projects           → el índice, con buscador y tarjetas
 *   /projects?p=<id>    → el proyecto abierto, con lateral para cambiar
 *
 * Va en la misma ruta y no en /projects/[id] para que cambiar de
 * proyecto no recargue la página, manteniendo la URL compartible.
 *
 * Free ve el proyecto de ejemplo y el modal de Pro; cualquier clic en la
 * zona de contenido lo abre.
 *
 * Patrones: la tarjeta con cifras es la de Regulatorio; el modal es
 * UpgradeModal. Morado #6d5aef (btn-ai) para todo lo de Pro.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const CARD = { background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 10 };
const ETIQUETA = { fontSize: 11, color: '#888', letterSpacing: '.3px' };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function haceCuanto(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 60) return 'hace un momento';
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

// Un proyecto arranca desde un ASUNTO, no desde una persona: quien
// decide es un actor del mapa, no el objeto del trabajo. Por eso el
// arranque solo ofrece los cinco tipos regulatorios y deja fuera
// diputados, comisarios, comisiones y grupos.
const TIPOS_ARRANQUE = {
  ley: ['Congreso · proyecto de ley', 'ti-file-text'],
  actividad: ['Congreso · actividad parlamentaria', 'ti-file-text'],
  expediente: ['Comisión Europea · expediente', 'ti-file-text'],
  procedimiento: ['Parlamento Europeo · procedimiento', 'ti-gavel'],
  boe: ['BOE', 'ti-news'],
};

const DEMO_LISTA = [
  { id: 'demo-1', name: 'Ley de gobernanza de la IA', objetivo: 'Congreso · fase de enmiendas' },
  { id: 'demo-2', name: 'Movilidad sostenible', objetivo: 'Trasposición · sin plazo abierto' },
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
      <Proyectos />
    </Suspense>
  );
}

function Proyectos() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const abiertoId = params.get('p');

  const [cargando, setCargando] = useState(true);
  const [user, setUser] = useState(null);
  const [proyectos, setProyectos] = useState([]);
  const [datos, setDatos] = useState({});
  const [modalUpsell, setModalUpsell] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('recientes');
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [menu, setMenu] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(null);
  // Los botones de la cabecera abren el buscador de la sección que toca.
  const [atajo, setAtajo] = useState(null);
  // Para el estado vacío: lo último que el usuario ha seguido. Tres,
  // no más: es una sugerencia para arrancar, no un directorio.
  const [seguidos, setSeguidos] = useState([]);

  const esPro = tieneProyectos(user);

  const cargar = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setCargando(false);
      return;
    }

    const { data: perfil } = await supabase.from('users').select('id, plan').eq('id', auth.user.id).single();
    setUser(perfil);

    if (perfil?.plan !== 'pro') {
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
    for (const id of ids) acc[id] = { actores: 0, asuntos: 0, sinContactar: 0, novedades: 0, caras: [] };

    // Consultas agregadas, no una por proyecto: con veinte proyectos
    // serían ochenta llamadas.
    if (ids.length) {
      const [{ data: items }, { data: actores }, { data: eventos }] = await Promise.all([
        supabase.from('project_items').select('project_id').in('project_id', ids),
        supabase
          .from('project_actors')
          .select('project_id, relacion, nombre, kind, ref_id')
          .in('project_id', ids)
          .order('created_at'),
        supabase.from('project_events').select('project_id, estado').in('project_id', ids),
      ]);
      for (const it of items || []) acc[it.project_id].asuntos += 1;
      for (const a of actores || []) {
        const d = acc[a.project_id];
        d.actores += 1;
        if (a.relacion === 'sin_contactar') d.sinContactar += 1;
        if (d.caras.length < 3) d.caras.push(a);
      }
      for (const e of eventos || []) if (e.estado === 'nuevo') acc[e.project_id].novedades += 1;
    }

    setDatos(acc);
    setProyectos(data || []);

    // Solo hace falta si no hay ningún proyecto: es lo que se ofrece
    // en la pantalla vacía.
    if ((data || []).length === 0) {
      const { data: fs } = await supabase
        .from('follows')
        .select('kind, ref_id, label')
        .eq('user_id', auth.user.id)
        .in('kind', Object.keys(TIPOS_ARRANQUE))
        .order('created_at', { ascending: false })
        .limit(3);
      setSeguidos(fs || []);
    }

    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    window.addEventListener('click', cerrar);
    return () => window.removeEventListener('click', cerrar);
  }, [menu]);

  const lista = esPro ? proyectos : DEMO_LISTA;
  const abierto = lista.find((p) => p.id === abiertoId) || (!esPro ? DEMO_LISTA[0] : null);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let out = proyectos;
    if (q) out = out.filter((p) => `${p.name} ${p.objetivo || ''}`.toLowerCase().includes(q));
    if (orden === 'alfabetico') out = [...out].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return out;
  }, [proyectos, busqueda, orden]);

  function abrir(id) {
    router.replace(`/projects?p=${id}`, { scroll: false });
  }


  async function crear() {
    const t = nombre.trim();
    if (!t) return;
    if (!puedeCrearProyecto(user, proyectos.length)) {
      toast(`Has llegado al máximo de ${limiteProyectos()} proyectos`);
      return;
    }
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name: t })
      .select('id, name, description, objetivo, updated_at')
      .single();
    if (error) {
      toast('No se ha podido crear el proyecto');
      return;
    }
    setProyectos((prev) => [data, ...prev]);
    setDatos((prev) => ({ ...prev, [data.id]: { actores: 0, asuntos: 0, sinContactar: 0, novedades: 0, caras: [] } }));
    setNombre('');
    setCreando(false);
    abrir(data.id);
  }

  // El proyecto nace con el asunto dentro, así que trae su histórico de
  // avisos y sus plazos sin que haya que añadir nada.
  async function crearDesde(f) {
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name: f.label || 'Proyecto sin título' })
      .select('id, name, description, objetivo, updated_at')
      .single();
    if (error) {
      toast('No se ha podido crear el proyecto');
      return;
    }
    const { error: e2 } = await supabase
      .from('project_items')
      .insert({ project_id: data.id, kind: f.kind, ref_id: f.ref_id, etiqueta: f.label });
    if (e2) toast('El proyecto se ha creado, pero el asunto no se ha añadido');

    setProyectos((prev) => [data, ...prev]);
    setDatos((prev) => ({
      ...prev,
      [data.id]: { actores: 0, asuntos: e2 ? 0 : 1, sinContactar: 0, novedades: 0, caras: [] },
    }));
    abrir(data.id);
  }

  async function renombrar(id, texto) {
    const t = texto.trim();
    setRenombrando(null);
    if (!t) return;
    setProyectos((prev) => prev.map((p) => (p.id === id ? { ...p, name: t } : p)));
    const { error } = await supabase.from('projects').update({ name: t }).eq('id', id);
    if (error) toast('No se ha podido renombrar');
  }

  async function archivar(id) {
    setProyectos((prev) => prev.filter((p) => p.id !== id));
    if (abiertoId === id) router.replace('/projects', { scroll: false });
    const { error } = await supabase.from('projects').update({ archived: true }).eq('id', id);
    if (error) toast('No se ha podido archivar');
  }

  async function eliminar(id) {
    setConfirmarBorrado(null);
    setProyectos((prev) => prev.filter((p) => p.id !== id));
    if (abiertoId === id) router.replace('/projects', { scroll: false });
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) toast('No se ha podido eliminar');
  }

  async function guardarObjetivo(texto) {
    if (!abierto || !esPro) return;
    const v = texto.trim();
    if (v === (abierto.objetivo || '')) return;
    setProyectos((prev) => prev.map((p) => (p.id === abierto.id ? { ...p, objetivo: v || null } : p)));
    const { error } = await supabase.from('projects').update({ objetivo: v || null }).eq('id', abierto.id);
    if (error) toast('No se ha podido guardar el objetivo');
  }

  if (cargando) {
    return (
      <div className="sec">
        <div className="spinner"></div>
      </div>
    );
  }

  // =====================================================================
  // ÍNDICE
  // =====================================================================
  if (esPro && !abierto) {
    const conPlazo = proyectos.length > 0;
    return (
      <div className="sec" style={{ maxWidth: 1080 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Proyectos</h1>
            <div style={{ fontSize: 12.5, color: '#888', marginTop: 3 }}>
              {conPlazo
                ? `${proyectos.length} ${proyectos.length === 1 ? 'proyecto activo' : 'proyectos activos'}`
                : 'Monitoriza, planifica y gestiona desde el mismo lugar.'}
            </div>
          </div>
          {!creando && (
            <button className="btn-ai" onClick={() => setCreando(true)}>
              <i className="ti ti-plus"></i> Nuevo proyecto
            </button>
          )}
        </div>

        {proyectos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div
              style={{
                flex: 1,
                minWidth: 200,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                ...CARD,
                padding: '9px 12px',
              }}
            >
              <i className="ti ti-search" style={{ fontSize: 15, color: '#a8a49c' }}></i>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre…"
                style={{ border: 'none', outline: 'none', fontSize: 12.5, fontFamily: 'inherit', flex: 1, background: 'none' }}
              />
            </div>
            <select className="fsel" value={orden} onChange={(e) => setOrden(e.target.value)}>
              <option value="recientes">Recientes</option>
              <option value="alfabetico">Por nombre</option>
            </select>
          </div>
        )}

        {creando && (
          <div style={{ ...CARD, padding: 16, marginBottom: 12 }}>
            <input
              autoFocus
              value={nombre}
              maxLength={140}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') crear();
                if (e.key === 'Escape') {
                  setNombre('');
                  setCreando(false);
                }
              }}
              placeholder="Ley de gobernanza de la inteligencia artificial"
              style={{
                width: '100%',
                padding: '10px 13px',
                border: `1px solid ${MORADO}`,
                borderRadius: 9,
                fontSize: 13.5,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
              <button className="btn-ai" onClick={crear} disabled={!nombre.trim()}>
                Crear proyecto
              </button>
              <button
                className="btn-o"
                onClick={() => {
                  setNombre('');
                  setCreando(false);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Sin empty-state a propósito: esa clase agranda los botones y
            convierte el arranque en un cartel. */}
        {proyectos.length === 0 && !creando && seguidos.length > 0 && (
          <div style={{ ...CARD, padding: '18px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Empieza por un asunto que ya sigues</div>
            <div style={{ fontSize: 12.5, color: '#888', marginTop: 4, marginBottom: 14 }}>
              El proyecto nacerá con ese asunto dentro, con su histórico y sus plazos.
            </div>

            {seguidos.map((f, i) => {
              const [donde, icono] = TIPOS_ARRANQUE[f.kind] || ['Seguimiento', 'ti-bookmark'];
              return (
                <div
                  key={`${f.kind}-${f.ref_id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '10px 0',
                    borderTop: `.5px solid ${BORDE}`,
                    borderBottom: i === seguidos.length - 1 ? `.5px solid ${BORDE}` : 'none',
                  }}
                >
                  <i className={`ti ${icono}`} style={{ fontSize: 16, color: '#a8a49c', flexShrink: 0 }}></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.label || 'Sin título'}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{donde}</div>
                  </div>
                  <button className="btn-ai-o" onClick={() => crearDesde(f)} style={{ flexShrink: 0 }}>
                    Crear proyecto
                  </button>
                </div>
              );
            })}

            <div style={{ fontSize: 12, color: '#888', marginTop: 13 }}>
              O{' '}
              <button
                onClick={() => setCreando(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: MORADO, fontSize: 12 }}
              >
                empieza uno en blanco
              </button>
              .
            </div>
          </div>
        )}

        {/* Quien no sigue nada todavía no tiene de dónde partir: se le
            explica y se le deja escribir directamente. */}
        {proyectos.length === 0 && !creando && seguidos.length === 0 && (
          <div style={{ ...CARD, padding: '22px 24px' }}>
            <div style={{ maxWidth: 430 }}>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
                Monitoriza, planifica y gestiona desde el mismo lugar
              </div>
              <div style={{ fontSize: 12.5, color: '#888', marginTop: 7, lineHeight: 1.6 }}>
                Un proyecto reúne los asuntos que sigues, los actores a los que quieres llegar y lo que vas
                haciendo con cada uno. Dale nombre al que estés trabajando.
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 15, flexWrap: 'wrap' }}>
                <input
                  value={nombre}
                  maxLength={140}
                  onChange={(e) => setNombre(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && crear()}
                  placeholder="Ley de gobernanza de la inteligencia artificial"
                  style={{
                    flex: 1,
                    minWidth: 200,
                    padding: '9px 12px',
                    border: `1px solid ${MORADO}`,
                    borderRadius: 9,
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button className="btn-ai" onClick={crear} disabled={!nombre.trim()}>
                  Crear
                </button>
              </div>
            </div>
          </div>
        )}

        {visibles.length === 0 && proyectos.length > 0 && (
          <div style={{ fontSize: 12.5, color: '#999', padding: '20px 0', textAlign: 'center' }}>
            Ningún proyecto coincide con «{busqueda}».
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 10 }}>
          {visibles.map((p) => {
            const d = datos[p.id] || { actores: 0, asuntos: 0, sinContactar: 0, novedades: 0, caras: [] };
            return (
              <div key={p.id} style={{ ...CARD, padding: '16px 18px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {renombrando === p.id ? (
                      <input
                        autoFocus
                        defaultValue={p.name}
                        maxLength={140}
                        onBlur={(e) => renombrar(p.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renombrar(p.id, e.target.value);
                          if (e.key === 'Escape') setRenombrando(null);
                        }}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          border: `1px solid ${MORADO}`,
                          borderRadius: 7,
                          fontSize: 14.5,
                          fontWeight: 600,
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => abrir(p.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          textAlign: 'left',
                          fontSize: 14.5,
                          fontWeight: 600,
                          lineHeight: 1.35,
                          width: '100%',
                        }}
                      >
                        {p.name}
                      </button>
                    )}
                    {(p.objetivo || p.description) && (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: '#888',
                          marginTop: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.objetivo || p.description}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu(menu === p.id ? null : p.id);
                    }}
                    aria-label="Opciones del proyecto"
                    style={{ background: 'none', border: 'none', color: '#a8a49c', padding: 2, flexShrink: 0 }}
                  >
                    <i className="ti ti-dots" style={{ fontSize: 17 }}></i>
                  </button>
                </div>

                {menu === p.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: 40,
                      ...CARD,
                      boxShadow: '0 4px 14px rgba(0,0,0,.09)',
                      padding: 5,
                      width: 155,
                      zIndex: 5,
                    }}
                  >
                    {[
                      ['Renombrar', () => { setMenu(null); setRenombrando(p.id); }],
                      ['Archivar', () => { setMenu(null); archivar(p.id); }],
                    ].map(([texto, accion]) => (
                      <button
                        key={texto}
                        onClick={accion}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          fontSize: 12,
                          padding: '7px 9px',
                          borderRadius: 6,
                          border: 'none',
                          background: 'none',
                          color: '#555',
                        }}
                      >
                        {texto}
                      </button>
                    ))}
                    <button
                      onClick={() => { setMenu(null); setConfirmarBorrado(p); }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        fontSize: 12,
                        padding: '8px 9px 7px',
                        borderRadius: 6,
                        border: 'none',
                        background: 'none',
                        color: '#555',
                        borderTop: `.5px solid ${BORDE}`,
                        marginTop: 3,
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                )}

                {/* Las caras dicen de qué va el proyecto más rápido que el
                    título: se reconoce por quién hay dentro. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '14px 0 12px', minHeight: 26 }}>
                  {d.caras.map((a, i) => (
                    <span key={i} style={{ marginRight: -10, border: '1.5px solid #fff', borderRadius: 8, display: 'inline-flex' }}>
                      <ActorAvatar actor={a} size={26} />
                    </span>
                  ))}
                  {d.actores > 3 && (
                    <span style={{ fontSize: 11.5, color: '#888', paddingLeft: 16 }}>y {d.actores - 3} más</span>
                  )}
                  {d.actores === 0 && <span style={{ fontSize: 11.5, color: '#a8a49c' }}>Sin actores todavía</span>}
                </div>

                <div style={{ display: 'flex', gap: 20, paddingTop: 12, borderTop: `.5px solid ${BORDE}` }}>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 600, color: MORADO, lineHeight: 1.1 }}>{d.actores}</div>
                    <div style={{ fontSize: 10.5, color: '#888' }}>actores</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 600, color: MORADO, lineHeight: 1.1 }}>{d.asuntos}</div>
                    <div style={{ fontSize: 10.5, color: '#888' }}>asuntos</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 600, color: d.novedades > 0 ? '#1a1a18' : '#a8a49c', lineHeight: 1.1 }}>
                      {d.novedades}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#888' }}>novedades</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right', alignSelf: 'flex-end' }}>
                    <div style={{ fontSize: 10.5, color: '#888' }}>{haceCuanto(p.updated_at)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {confirmarBorrado && (
          <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setConfirmarBorrado(null)}>
            <div className="modal-box" style={{ maxWidth: 420 }}>
              <div className="modal-head">
                <h2>Eliminar el proyecto</h2>
                <div className="modal-x" onClick={() => setConfirmarBorrado(null)}>
                  <i className="ti ti-x"></i>
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#555', lineHeight: 1.65 }}>
                Se borran «{confirmarBorrado.name}», su mapa de actores, sus notas y su agenda. Los asuntos
                que sigues no se ven afectados. No se puede deshacer.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn-o" onClick={() => setConfirmarBorrado(null)}>
                  Cancelar
                </button>
                <button className="btn-ai" onClick={() => eliminar(confirmarBorrado.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}

        {modalUpsell && <UpgradeModal {...upsellProyectos()} onClose={() => setModalUpsell(false)} />}
      </div>
    );
  }

  // =====================================================================
  // PROYECTO ABIERTO
  // =====================================================================
  const d = (esPro && abierto ? datos[abierto.id] : null) || {
    actores: 0,
    asuntos: 0,
    sinContactar: 0,
    novedades: 0,
    briefings: 0,
    acciones: 0,
  };

  // Una sola página que se recorre entera. El índice salta, no oculta:
  // por eso solo se listan secciones que existen de verdad.
  const secciones = esPro
    ? [
        { id: 'resumen', label: 'Resumen' },
        { id: 'asuntos', label: 'Asuntos' },
        { id: 'mapa', label: 'Mapa de actores' },
        { id: 'briefing', label: 'Briefing' },
        { id: 'agenda', label: 'Agenda' },
        { id: 'documentos', label: 'Documentos' },
        { id: 'notas', label: 'Notas' },
      ]
    : [
        { id: 'resumen', label: 'Resumen' },
        { id: 'norma', label: 'La norma' },
        { id: 'mapa', label: 'Mapa de actores' },
        { id: 'briefing', label: 'Briefing' },
        { id: 'agenda', label: 'Agenda' },
        { id: 'documentos', label: 'Documentos' },
      ];

  return (
    <div className="sec" style={{ maxWidth: 1180 }}>
      <style>{`
        .gt-proyecto { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,168px); gap: 26px; }
        @media (max-width: 900px) { .gt-proyecto { grid-template-columns: minmax(0,1fr); gap: 0; } }
      `}</style>

      {/* Cabecera: el título es el selector de proyecto, y las acciones
          a mano. Sin lateral izquierda — la columna se la queda el
          índice, que es lo que se usa constantemente. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {esPro ? (
            <CambiarProyecto
              proyectos={proyectos}
              actual={abierto}
              novedades={Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v.novedades]))}
              onElegir={abrir}
              onNuevo={() => {
                router.replace('/projects', { scroll: false });
                setCreando(true);
              }}
              onVerTodos={() => router.replace('/projects', { scroll: false })}
            />
          ) : (
            <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35 }}>{abierto?.name}</div>
          )}
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {d.actores} {d.actores === 1 ? 'actor' : 'actores'} · {d.asuntos}{' '}
            {d.asuntos === 1 ? 'asunto' : 'asuntos'}
          </div>
        </div>

        {esPro && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
            <button className="btn-ai-o" onClick={() => setAtajo('actor')}>
              <i className="ti ti-plus"></i> Actor
            </button>
            <button className="btn-o" onClick={() => setAtajo('asunto')}>
              <i className="ti ti-plus"></i> Asunto
            </button>
          </div>
        )}
        {!esPro && (
          <button className="btn-ai" onClick={() => setModalUpsell(true)}>
            <i className="ti ti-bolt"></i> Desbloquear
          </button>
        )}
      </div>

      <div className="gt-proyecto">
        <div
          style={{ minWidth: 0 }}
          onClick={esPro ? undefined : () => setModalUpsell(true)}
        >
          {!esPro && (
            <>
              <ResumenDemo />
              <div style={{ height: 24 }}></div>
              <ProyectoDemo />
            </>
          )}

          {esPro && (
            <>
              <section id="resumen" style={{ scrollMarginTop: 72, marginBottom: 30 }}>
                <div style={{ ...ETIQUETA, marginBottom: 7 }}>OBJETIVO</div>
                <textarea
                  key={abierto.id}
                  defaultValue={abierto.objetivo || ''}
                  placeholder="Qué quieres conseguir con este asunto"
                  onBlur={(e) => guardarObjetivo(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    maxWidth: 620,
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

                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 16 }}>
                  <div>
                    <div style={{ fontSize: 21, fontWeight: 600, color: MORADO, lineHeight: 1.1 }}>{d.actores}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>actores</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 21, fontWeight: 600, color: MORADO, lineHeight: 1.1 }}>{d.asuntos}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>asuntos</div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 21,
                        fontWeight: 600,
                        color: d.sinContactar > 0 ? '#1a1a18' : '#a8a49c',
                        lineHeight: 1.1,
                      }}
                    >
                      {d.sinContactar}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>sin contactar</div>
                  </div>
                  <div style={{ opacity: 0.55, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <i className="ti ti-lock" style={{ fontSize: 14, color: '#8b8780' }}></i>
                    <span style={{ fontSize: 11.5, color: '#555' }}>Equipo con Teams</span>
                  </div>
                </div>
              </section>

              <section id="asuntos" style={{ scrollMarginTop: 72, marginBottom: 30 }}>
                <div style={{ ...ETIQUETA, marginBottom: 12 }}>ASUNTOS Y SU TRAMITACIÓN</div>
                <AsuntosProyecto
                  projectId={abierto.id}
                  userId={user.id}
                  abrirBuscador={atajo === 'asunto'}
                  onCerrarBuscador={() => setAtajo(null)}
                />
              </section>

              <section id="mapa" style={{ scrollMarginTop: 72, marginBottom: 30 }}>
                <div style={{ ...ETIQUETA, marginBottom: 12 }}>MAPA DE ACTORES</div>
                <MapaActores
                  projectId={abierto.id}
                  abrirBuscador={atajo === 'actor'}
                  onCerrarBuscador={() => setAtajo(null)}
                />
              </section>

              <section id="briefing" style={{ scrollMarginTop: 72, marginBottom: 30 }}>
                <div style={{ ...ETIQUETA, marginBottom: 12 }}>BRIEFING POR ACTOR</div>
                <BriefingProyecto projectId={abierto.id} userId={user.id} />
              </section>

              <section id="agenda" style={{ scrollMarginTop: 72, marginBottom: 30 }}>
                <div style={{ ...ETIQUETA, marginBottom: 12 }}>AGENDA</div>
                <AgendaProyecto projectId={abierto.id} />
              </section>

              <section id="documentos" style={{ scrollMarginTop: 72, marginBottom: 30 }}>
                <div style={{ ...ETIQUETA, marginBottom: 12 }}>DOCUMENTOS</div>
                <DocumentosProyecto projectId={abierto.id} userId={user.id} />
              </section>

              <section id="notas" style={{ scrollMarginTop: 72, marginBottom: 10 }}>
                <div style={{ ...ETIQUETA, marginBottom: 12 }}>NOTAS</div>
                <NotasProyecto projectId={abierto.id} userId={user.id} />
              </section>
            </>
          )}
        </div>

        <AnclasProyecto secciones={secciones} />
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
