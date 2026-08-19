'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import AvisosTab from '@/components/AvisosTab';

/**
 * Lo que sigue el usuario, con sus novedades.
 *
 * Es la sección que da sentido al botón de seguir: sin ella, sigues
 * cosas y no puedes verlas en ningún sitio.
 *
 * Dos partes: las novedades arriba —lo que ha pasado desde la última
 * visita— y debajo todo lo seguido.
 */

// El orden es el de la lista agrupada: primero lo que se mueve, luego
// quien decide.
const TIPOS = {
  ley: { label: 'Ley', plural: 'Leyes', icon: 'file-text', orden: 1 },
  actividad: { label: 'Actividad', plural: 'Actividad parlamentaria', icon: 'messages', orden: 2 },
  expediente: { label: 'Expediente', plural: 'Expedientes de la Comisión', icon: 'file-text', orden: 3 },
  procedimiento: { label: 'Procedimiento', plural: 'Procedimientos del PE', icon: 'gavel', orden: 4 },
  boe: { label: 'BOE', plural: 'Publicado en el BOE', icon: 'news', orden: 5 },
  diputado: { label: 'Diputado', plural: 'Diputados', icon: 'user', orden: 6 },
  eurodiputado: { label: 'Eurodiputado', plural: 'Eurodiputados', icon: 'user', orden: 7 },
  comision: { label: 'Comisión', plural: 'Comisiones del Congreso', icon: 'users', orden: 8 },
  'comision-eu': { label: 'Comisión', plural: 'Comisiones del PE', icon: 'users', orden: 9 },
  grupo: { label: 'Grupo', plural: 'Grupos parlamentarios', icon: 'flag', orden: 10 },
  direccion: { label: 'Dirección General', plural: 'Direcciones generales', icon: 'building', orden: 11 },
  cargo: { label: 'Alto cargo', plural: 'Altos cargos', icon: 'user', orden: 12 },
};

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function haceCuanto(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 60) return 'hace un momento';
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export default function SeguimientoPage() {
  return (
    <Suspense
      fallback={
        <div className="sec" style={{ maxWidth: 780 }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <Seguimiento />
    </Suspense>
  );
}

function Seguimiento() {
  const supabase = createClient();
  // Los dos correos enlazan a ?ajustes=1 para darse de baja.
  const sp = useSearchParams();

  const [items, setItems] = useState(null);
  const [novedades, setNovedades] = useState([]);
  const [filtro, setFiltro] = useState('todo');
  const [seccion, setSeccion] = useState('sigo');
  const [nAlertas, setNAlertas] = useState(0);
  const [sinSesion, setSinSesion] = useState(false);

  useEffect(() => {
    if (sp?.get('ajustes') === '1') setSeccion('avisos');
  }, [sp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || null;
      if (!uid) {
        if (!cancelled) {
          setSinSesion(true);
          setItems([]);
        }
        return;
      }
      const [{ data: f }, { data: e }, { count: nA }] = await Promise.all([
        supabase.from('my_follows').select('*').order('ultima_novedad', { ascending: false, nullsFirst: false }),
        supabase.from('my_follow_events').select('*').order('occurred_at', { ascending: false }).limit(40),
        supabase
          .from('sector_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('activa', true),
      ]);
      if (cancelled) return;
      setItems(f || []);
      setNovedades(e || []);
      setNAlertas(nA || 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nuevas = useMemo(() => novedades.filter((n) => n.es_nueva), [novedades]);

  const filtrados = useMemo(() => {
    let l = items || [];
    if (filtro === 'novedades') l = l.filter((i) => i.n_novedades > 0);
    else if (filtro === 'normativa') l = l.filter((i) => !i.es_actor);
    else if (filtro === 'actores') l = l.filter((i) => i.es_actor);
    else if (filtro && filtro !== 'todo') l = l.filter((i) => i.fuente === filtro);
    return l;
  }, [items, filtro]);

  // Agrupada por tipo: veinte elementos en una lista plana obligan a
  // desplazarse mucho; agrupados se ven todos de un vistazo.
  const grupos = useMemo(() => {
    const m = new Map();
    for (const i of filtrados) {
      if (!m.has(i.kind)) m.set(i.kind, []);
      m.get(i.kind).push(i);
    }
    return [...m.entries()].sort((a, b) => (TIPOS[a[0]]?.orden || 99) - (TIPOS[b[0]]?.orden || 99));
  }, [filtrados]);

  // Las fuentes que el usuario tiene de verdad: un filtro que no
  // devuelve nada es peor que no tenerlo.
  const fuentes = useMemo(() => {
    const c = new Map();
    for (const i of items || []) if (i.fuente) c.set(i.fuente, (c.get(i.fuente) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  // Marcar como visto: la próxima visita ya no las contará como nuevas
  async function marcarVisto() {
    const ahora = new Date().toISOString();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;
    const { error } = await supabase.from('follows').update({ seen_at: ahora }).eq('user_id', uid);
    if (error) {
      toast.error('No se ha podido marcar como visto');
      return;
    }
    setItems((prev) => (prev || []).map((i) => ({ ...i, n_novedades: 0, seen_at: ahora })));
    setNovedades((prev) => prev.map((n) => ({ ...n, es_nueva: false })));
    toast.info('Marcado como visto');
  }

  async function dejarDeSeguir(item) {
    setItems((prev) => (prev || []).filter((i) => i.id !== item.id));
    const { error } = await supabase.from('follows').delete().eq('id', item.id);
    if (error) {
      toast.error('No se ha podido dejar de seguir');
      setItems((prev) => [...(prev || []), item]);
      return;
    }
    toast.info('Has dejado de seguirlo');
  }

  const chip = (activo) => ({
    padding: '6px 12px',
    borderRadius: 7,
    fontSize: 12.5,
    cursor: 'pointer',
    border: 'none',
    background: activo ? '#f0eefe' : 'transparent',
    color: activo ? '#6d5aef' : '#8b8780',
    whiteSpace: 'nowrap',
  });

  if (sinSesion) {
    return (
      <div className="sec" style={{ maxWidth: 780 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-bell"></i>
            Inicia sesión para ver lo que sigues.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sec" style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-.2px' }}>Seguimiento</h1>
        <p style={{ fontSize: 12.5, color: '#8b8780', margin: '5px 0 0' }}>
          {items === null
            ? '—'
            : items.length === 0
              ? 'Aún no sigues nada.'
              : `${items.length} ${items.length === 1 ? 'asunto' : 'asuntos'}${nuevas.length > 0 ? ` · ${nuevas.length} ${nuevas.length === 1 ? 'novedad' : 'novedades'}` : ''}${nAlertas > 0 ? ` · ${nAlertas} ${nAlertas === 1 ? 'alerta activa' : 'alertas activas'}` : ''}`}
        </p>
      </div>

      {/* Dos caras de lo mismo: qué vigilo y cómo me lo cuentan. */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 18, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setSeccion('sigo')} style={chip(seccion === 'sigo')}>
          Lo que sigo
        </button>
        <button type="button" onClick={() => setSeccion('avisos')} style={chip(seccion === 'avisos')}>
          Gestión de mis avisos
        </button>
      </div>

      {seccion === 'avisos' ? (
        <AvisosTab />
      ) : items === null ? (
        <div className="spinner"></div>
      ) : items.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 10, padding: 22, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: '#f0eefe',
                color: '#6d5aef',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className="ti ti-bell" style={{ fontSize: 17 }}></i>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Sigue lo que te importa</div>
              <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: '6px 0 15px' }}>
                Pulsa <span style={{ color: '#6d5aef' }}>Seguir</span> en cualquier ley, comisión o diputado y te
                avisaremos cuando cambie de fase, se designen ponentes o se acerque un plazo.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link
                  href="/congreso"
                  style={{
                    fontSize: 12.5,
                    color: '#6d5aef',
                    background: '#f0eefe',
                    padding: '7px 13px',
                    borderRadius: 7,
                    textDecoration: 'none',
                  }}
                >
                  Ver leyes en trámite
                </Link>
                <Link
                  href="/institutions/comisiones"
                  style={{
                    fontSize: 12.5,
                    color: '#57534e',
                    background: '#f5f4f1',
                    padding: '7px 13px',
                    borderRadius: 7,
                    textDecoration: 'none',
                  }}
                >
                  Explorar comisiones
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {nuevas.length > 0 && (
            <div
              style={{
                background: '#fff',
                borderRadius: 10,
                padding: 20,
                marginBottom: 16,
                boxShadow: '0 1px 2px rgba(0,0,0,.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 14,
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-.15px' }}>
                  {nuevas.length} {nuevas.length === 1 ? 'novedad' : 'novedades'} desde tu última visita
                </div>
                <button
                  type="button"
                  onClick={marcarVisto}
                  style={{ fontSize: 12, color: '#8b8780', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Marcar como visto
                </button>
              </div>

              {nuevas.slice(0, 8).map((n) => {
                const t = TIPOS[n.kind] || TIPOS.ley;
                return (
                  <div key={n.event_id} style={{ display: 'flex', gap: 13, padding: '11px 0', alignItems: 'baseline' }}>
                    <span
                      style={{ width: 5, height: 5, borderRadius: '50%', background: t.color, flexShrink: 0 }}
                    ></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                        {n.title} <span style={{ color: '#8b8780' }}>{(n.detail || '').toLowerCase()}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#b8b4ac', marginTop: 3 }}>{haceCuanto(n.occurred_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 2, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => setFiltro('todo')} style={chip(filtro === 'todo')}>
              Todo ({items.length})
            </button>
            {nuevas.length > 0 && (
              <button type="button" onClick={() => setFiltro('novedades')} style={chip(filtro === 'novedades')}>
                Con novedades
              </button>
            )}
            <button type="button" onClick={() => setFiltro('normativa')} style={chip(filtro === 'normativa')}>
              Normativa
            </button>
            <button type="button" onClick={() => setFiltro('actores')} style={chip(filtro === 'actores')}>
              Actores
            </button>
            {fuentes.length > 1 && <span style={{ width: 1, height: 18, background: '#f2f0ec', margin: '0 6px' }}></span>}
            {fuentes.length > 1 &&
              fuentes.map(([f, n]) => (
                <button key={f} type="button" onClick={() => setFiltro(f)} style={chip(filtro === f)}>
                  {f} ({n})
                </button>
              ))}
          </div>

          {filtrados.length === 0 ? (
            <div style={{ ...CARD, padding: 22, fontSize: 12.5, color: '#8b8780', textAlign: 'center' }}>
              Nada con este filtro.
            </div>
          ) : (
            grupos.map(([kind, lista]) => {
              const t = TIPOS[kind] || TIPOS.ley;
              const nuevasAqui = lista.filter((i) => i.n_novedades > 0).length;
              return (
                <div key={kind} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 9,
                      marginBottom: 8,
                      paddingLeft: 2,
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#a8a49c', letterSpacing: '.4px' }}>
                      {(t.plural || t.label).toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: '#c4c0b8' }}>{lista.length}</span>
                    {nuevasAqui > 0 && (
                      <span style={{ fontSize: 10.5, color: '#6d5aef' }}>
                        {nuevasAqui} con novedades
                      </span>
                    )}
                  </div>

                  <div style={{ ...CARD, overflow: 'hidden' }}>
                    {lista.map((i, idx) => (
                      <div
                        key={i.id}
                        style={{
                          display: 'flex',
                          gap: 12,
                          padding: '12px 16px',
                          alignItems: 'center',
                          borderTop: idx === 0 ? 'none' : '.5px solid #f2f0ec',
                        }}
                      >
                        {i.ruta ? (
                          <Link
                            href={i.ruta}
                            style={{
                              display: 'flex',
                              gap: 12,
                              alignItems: 'center',
                              flex: 1,
                              minWidth: 0,
                              textDecoration: 'none',
                              color: 'inherit',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, lineHeight: 1.4, letterSpacing: '-.1px' }}>{i.label}</div>
                              {/* El contexto: el grupo de un diputado, la
                                  comisión de una ley, la cámara de una
                                  comisión. Sin esto hay que abrir para saber
                                  qué es. */}
                              <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 3 }}>
                                {[i.estado, i.activo === false ? 'concluido' : null].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, lineHeight: 1.4 }}>{i.label}</div>
                            <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 3 }}>{i.estado}</div>
                          </div>
                        )}

                        {i.n_novedades > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              background: '#f0eefe',
                              color: '#6d5aef',
                              padding: '3px 8px',
                              borderRadius: 10,
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            {i.n_novedades}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => dejarDeSeguir(i)}
                          aria-label="Dejar de seguir"
                          title="Dejar de seguir"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 5,
                            borderRadius: 6,
                            border: 'none',
                            background: 'transparent',
                            color: '#c4c0b8',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <i className="ti ti-bell-off" style={{ fontSize: 15 }}></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
