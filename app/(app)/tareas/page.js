'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import TareaModal, { Barras, NOMBRE_TIPO, TIPOS, grupoVinculo } from '@/components/TareaModal';
import { toast } from '@/lib/toast';

/**
 * Tareas.
 *
 * Diseño del 04-10-2026: calcado de Enginy (pestañas Vencidas · Próximas ·
 * Ignoradas · Completadas, filtros y tabla), en blanco y gris con el
 * morado de la marca donde Enginy usa negro.
 *
 * Lee la vista tareas_todas (sql/68): las tareas sueltas y las acciones de
 * Proyectos, así no hay dos sitios con tareas. Las de proyecto se abren en
 * su proyecto; las sueltas, en la ventana de editar. Al completar o
 * ignorar se escribe en la tabla de cada una.
 */

const MORADO = '#6d5aef';
const GRIS = '#6f6b64';
const BORDE = '#e3e1da';
const PAGE_SIZES = [20, 50, 100, 200];

const PESTANAS = [
  { id: 'vencidas', nombre: 'Vencidas' },
  { id: 'proximas', nombre: 'Próximas' },
  { id: 'ignoradas', nombre: 'Ignoradas' },
  { id: 'completadas', nombre: 'Completadas', sinContador: true },
];

const GRUPOS = ['Normativa', 'Persona', 'Institución', 'Proyecto', 'Sin vincular'];

// project_actions guarda sus estados con otros nombres.
const ESTADO_PROYECTO = { pendiente: 'pendiente', completada: 'hecha', ignorada: 'cancelada' };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaTarea(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const manana = new Date();
  manana.setDate(hoy.getDate() + 1);
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const mismo = (a, b) => a.toDateString() === b.toDateString();
  if (mismo(d, hoy)) return `Hoy, ${hora}`;
  if (mismo(d, ayer)) return `Ayer, ${hora}`;
  if (mismo(d, manana)) return `Mañana, ${hora}`;
  const anio = d.getFullYear() !== hoy.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MESES[d.getMonth()]}${anio}, ${hora}`;
}

function pestanaDe(t, ahora) {
  if (t.estado === 'completada') return 'completadas';
  if (t.estado === 'ignorada') return 'ignoradas';
  return t.vence_at && new Date(t.vence_at).getTime() < ahora ? 'vencidas' : 'proximas';
}

const BOTON_FILTRO = {
  height: 36,
  padding: '0 12px',
  border: `.5px solid ${BORDE}`,
  borderRadius: 9,
  background: '#fff',
  font: 'inherit',
  fontSize: 13,
  color: '#1a1a18',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

export default function TareasPage() {
  const supabase = createClient();
  const [filas, setFilas] = useState(null);
  const [miembros, setMiembros] = useState([]);
  const [yo, setYo] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [pestana, setPestana] = useState('vencidas');
  const [busca, setBusca] = useState('');
  const [tipoFilter, setTipoFilter] = useState(new Set());
  const [grupoFilter, setGrupoFilter] = useState(new Set());
  const [soloMias, setSoloMias] = useState(true);
  const [orden, setOrden] = useState('asc');
  const [seleccion, setSeleccion] = useState(new Set());
  const [modal, setModal] = useState(null); // null | {} (nueva) | fila (editar)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [ahora, setAhora] = useState(() => Date.now());

  async function cargar() {
    const { data } = await supabase.from('tareas_todas').select('*').order('vence_at', { ascending: true, nullsFirst: false }).limit(3000);
    setFilas(data || []);
    setAhora(Date.now());
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || null;
      setYo(uid);
      const [{ data: ms }, { data: om }] = await Promise.all([
        supabase.rpc('miembros_para_asignar'),
        uid
          ? supabase.from('organization_members').select('organization_id').eq('user_id', uid).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setMiembros(ms || []);
      setOrgId(om?.organization_id || null);
      await cargar();
    })();
    try {
      const n = parseInt(window.localStorage.getItem('gt_page_size') || '20', 10);
      if (PAGE_SIZES.includes(n)) setPageSize(n);
    } catch {
      // Sin almacenamiento: se queda en 20.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nombres = useMemo(() => {
    const m = new Map();
    for (const x of miembros) if (!m.has(x.user_id)) m.set(x.user_id, x.nombre);
    return m;
  }, [miembros]);

  // Lo que pasan los filtros, antes de repartir por pestañas: así los
  // contadores de las pestañas dicen lo mismo que vas a ver al entrar.
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (filas || []).filter((t) => {
      if (soloMias && t.asignada_a !== yo) return false;
      if (tipoFilter.size && !tipoFilter.has(t.tipo || '')) return false;
      if (grupoFilter.size && !grupoFilter.has(grupoVinculo(t.vinculo_kind) || 'Sin vincular')) return false;
      if (q && !`${t.titulo} ${t.vinculo_titulo || ''} ${t.vinculo_contexto || ''} ${t.notas || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filas, busca, tipoFilter, grupoFilter, soloMias, yo]);

  const cuenta = useMemo(() => {
    const c = { vencidas: 0, proximas: 0, ignoradas: 0, completadas: 0 };
    for (const t of filtradas) c[pestanaDe(t, ahora)] += 1;
    return c;
  }, [filtradas, ahora]);

  const visibles = useMemo(() => {
    const l = filtradas.filter((t) => pestanaDe(t, ahora) === pestana);
    const dir = orden === 'asc' ? 1 : -1;
    return l.sort((a, b) => {
      if (!a.vence_at && !b.vence_at) return 0;
      if (!a.vence_at) return 1;
      if (!b.vence_at) return -1;
      return (new Date(a.vence_at) - new Date(b.vence_at)) * dir;
    });
  }, [filtradas, pestana, orden, ahora]);

  useEffect(() => {
    setPage(1);
    setSeleccion(new Set());
  }, [pestana, busca, tipoFilter, grupoFilter, soloMias, orden]);

  const totalPages = Math.max(1, Math.ceil(visibles.length / pageSize));
  const current = Math.min(page, totalPages);
  const pagina = visibles.slice((current - 1) * pageSize, current * pageSize);
  const from = visibles.length ? (current - 1) * pageSize + 1 : 0;
  const to = Math.min(current * pageSize, visibles.length);
  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, '…', totalPages];
    if (current >= totalPages - 2) return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', current, '…', totalPages];
  }, [current, totalPages]);

  function changePageSize(n) {
    setPageSize(n);
    setPage(1);
    try {
      window.localStorage.setItem('gt_page_size', String(n));
    } catch {
      // Sin almacenamiento: vale solo para esta visita.
    }
  }

  const clave = (t) => `${t.origen}:${t.id}`;
  const todasMarcadas = pagina.length > 0 && pagina.every((t) => seleccion.has(clave(t)));

  function marcar(t) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(clave(t))) n.delete(clave(t));
      else n.add(clave(t));
      return n;
    });
  }

  function marcarPagina() {
    setSeleccion((s) => {
      const n = new Set(s);
      if (todasMarcadas) pagina.forEach((t) => n.delete(clave(t)));
      else pagina.forEach((t) => n.add(clave(t)));
      return n;
    });
  }

  async function cambiarEstado(lista, estado) {
    if (!lista.length) return;
    const sueltas = lista.filter((t) => t.origen === 'tarea').map((t) => t.id);
    const deProyecto = lista.filter((t) => t.origen === 'proyecto').map((t) => t.id);
    const ops = [];
    if (sueltas.length) {
      ops.push(
        supabase
          .from('tareas')
          .update({ estado, completada_at: estado === 'completada' ? new Date().toISOString() : null })
          .in('id', sueltas)
      );
    }
    if (deProyecto.length) ops.push(supabase.from('project_actions').update({ estado: ESTADO_PROYECTO[estado] }).in('id', deProyecto));
    const res = await Promise.all(ops);
    if (res.some((r) => r.error)) {
      toast.error('No se pudieron cambiar todas las tareas');
    } else {
      const n = lista.length;
      const que = { completada: n === 1 ? 'completada' : 'completadas', ignorada: n === 1 ? 'ignorada' : 'ignoradas', pendiente: n === 1 ? 'devuelta a pendientes' : 'devueltas a pendientes' }[estado];
      toast(`${n} ${n === 1 ? 'tarea' : 'tareas'} ${que}`);
    }
    setSeleccion(new Set());
    cargar();
  }

  const marcadas = visibles.filter((t) => seleccion.has(clave(t)));
  const hayFiltros = busca || tipoFilter.size || grupoFilter.size || !soloMias;

  function limpiar() {
    setBusca('');
    setTipoFilter(new Set());
    setGrupoFilter(new Set());
    setSoloMias(true);
  }

  return (
    <div className="sec" style={{ maxWidth: 1180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>Tareas</h1>
        <button
          type="button"
          onClick={() => setModal({})}
          style={{ height: 38, padding: '0 16px', borderRadius: 9, border: 'none', background: MORADO, color: '#fff', font: 'inherit', fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}
        >
          <i className="ti ti-plus" style={{ fontSize: 15 }} aria-hidden="true"></i>
          Crear tarea
        </button>
      </div>

      <div role="tablist" aria-label="Estado" style={{ display: 'flex', gap: 26, borderBottom: '1px solid #e3e1da', marginBottom: 14, flexWrap: 'wrap' }}>
        {PESTANAS.map((p) => {
          const on = pestana === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPestana(p.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${on ? MORADO : 'transparent'}`,
                padding: '9px 2px',
                marginBottom: -1,
                font: 'inherit',
                fontSize: 13.5,
                fontWeight: on ? 600 : 400,
                color: on ? '#1a1a18' : GRIS,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              {p.nombre}
              {!p.sinContador && (
                <span style={{ fontSize: 11.5, padding: '1px 7px', borderRadius: 6, background: '#f1f0eb', border: '.5px solid #e3e1da', color: '#3a3a36' }}>
                  {cuenta[p.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
        <div style={{ display: 'flex', gap: 8, padding: 12, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #efeee8' }}>
          <label style={{ ...BOTON_FILTRO, minWidth: 220, cursor: 'text' }}>
            <i className="ti ti-search" style={{ color: GRIS }} aria-hidden="true"></i>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar tareas"
              aria-label="Buscar tareas"
              style={{ border: 'none', outline: 'none', font: 'inherit', fontSize: 13, width: '100%', background: 'transparent' }}
            />
          </label>
          <MultiSelectFilter
            label="Tipo"
            values={[...TIPOS.map((t) => ({ value: t.v, label: t.label })), { value: '', label: 'Sin tipo' }]}
            selected={tipoFilter}
            onApply={setTipoFilter}
          />
          <MultiSelectFilter label="Vinculada a" values={GRUPOS.map((g) => ({ value: g, label: g }))} selected={grupoFilter} onApply={setGrupoFilter} />
          <button
            type="button"
            aria-pressed={soloMias}
            onClick={() => setSoloMias((v) => !v)}
            style={{ ...BOTON_FILTRO, borderColor: soloMias ? MORADO : BORDE, color: soloMias ? '#4b3bc4' : '#1a1a18' }}
          >
            <i className="ti ti-user" aria-hidden="true"></i>
            Asignadas a mí
            {soloMias && <i className="ti ti-x" style={{ fontSize: 13 }} aria-hidden="true"></i>}
          </button>
          {hayFiltros ? (
            <button type="button" onClick={limpiar} style={{ ...BOTON_FILTRO, border: 'none', fontWeight: 600, color: '#3a3a36' }}>
              Limpiar filtros
            </button>
          ) : null}
          <span style={{ flexGrow: 1 }}></span>
          <button type="button" onClick={() => setOrden((o) => (o === 'asc' ? 'desc' : 'asc'))} style={BOTON_FILTRO} aria-label={`Ordenar por fecha, ${orden === 'asc' ? 'de antes a después' : 'de después a antes'}`}>
            <i className="ti ti-calendar" aria-hidden="true"></i>
            Fecha
            <i className={`ti ti-arrow-${orden === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 13, color: GRIS }} aria-hidden="true"></i>
          </button>
        </div>

        {marcadas.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px', background: '#f6f5ff', borderBottom: '1px solid #efeee8', fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>
              {marcadas.length} {marcadas.length === 1 ? 'seleccionada' : 'seleccionadas'}
            </span>
            {pestana !== 'completadas' && (
              <button type="button" onClick={() => cambiarEstado(marcadas, 'completada')} style={{ ...BOTON_FILTRO, height: 32 }}>
                <i className="ti ti-check" aria-hidden="true"></i> Completar
              </button>
            )}
            {pestana !== 'ignoradas' && pestana !== 'completadas' && (
              <button type="button" onClick={() => cambiarEstado(marcadas, 'ignorada')} style={{ ...BOTON_FILTRO, height: 32 }}>
                <i className="ti ti-eye-off" aria-hidden="true"></i> Ignorar
              </button>
            )}
            {(pestana === 'ignoradas' || pestana === 'completadas') && (
              <button type="button" onClick={() => cambiarEstado(marcadas, 'pendiente')} style={{ ...BOTON_FILTRO, height: 32 }}>
                <i className="ti ti-arrow-back-up" aria-hidden="true"></i> Volver a pendientes
              </button>
            )}
          </div>
        )}

        {filas === null ? (
          <div style={{ padding: 40, textAlign: 'center', color: GRIS, fontSize: 13 }}>Cargando…</div>
        ) : visibles.length === 0 ? (
          <div style={{ padding: '70px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: 10, border: `.5px solid ${BORDE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
              <i className="ti ti-info-circle" style={{ fontSize: 20, color: GRIS }} aria-hidden="true"></i>
            </span>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Sin tareas</div>
            <div style={{ fontSize: 13, color: GRIS }}>
              {hayFiltros ? 'Ninguna tarea coincide con los filtros.' : 'Las tareas aparecerán aquí cuando se creen.'}
            </div>
            <button
              type="button"
              onClick={() => (hayFiltros ? limpiar() : setModal({}))}
              style={{ ...BOTON_FILTRO, marginTop: 8, fontWeight: 600 }}
            >
              {hayFiltros ? 'Limpiar filtros' : 'Crear tarea'}
            </button>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 860 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: GRIS, fontSize: 12 }}>
                    <th style={{ padding: '11px 16px', width: 28, fontWeight: 500 }}>
                      <input type="checkbox" checked={todasMarcadas} onChange={marcarPagina} aria-label="Seleccionar todas las de esta página" />
                    </th>
                    <th style={{ padding: '11px 8px', fontWeight: 500 }}>Tarea</th>
                    <th style={{ padding: '11px 8px', fontWeight: 500 }}>Vinculada a</th>
                    <th style={{ padding: '11px 8px', fontWeight: 500 }}>Asignada a</th>
                    <th style={{ padding: '11px 16px', fontWeight: 500 }}>Fecha límite</th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((t) => {
                    const vencida = pestana === 'vencidas';
                    const abrir = () => {
                      if (t.origen === 'tarea') setModal(t);
                    };
                    return (
                      <tr key={clave(t)} style={{ borderTop: '1px solid #efeee8', background: seleccion.has(clave(t)) ? '#faf9ff' : 'transparent' }}>
                        <td style={{ padding: '13px 16px', verticalAlign: 'top' }}>
                          <input type="checkbox" checked={seleccion.has(clave(t))} onChange={() => marcar(t)} aria-label={`Seleccionar «${t.titulo}»`} />
                        </td>
                        <td style={{ padding: '13px 8px', verticalAlign: 'top' }}>
                          {t.origen === 'tarea' ? (
                            <button
                              type="button"
                              onClick={abrir}
                              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: '#1a1a18', textAlign: 'left', cursor: 'pointer' }}
                            >
                              {t.titulo}
                            </button>
                          ) : (
                            <Link href={t.vinculo_ruta} style={{ fontWeight: 600, color: '#1a1a18', textDecoration: 'none' }}>
                              {t.titulo}
                            </Link>
                          )}
                          <div style={{ fontSize: 12, color: GRIS, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {t.prioridad && <Barras prioridad={t.prioridad} tam={12} />}
                            {[t.origen === 'proyecto' ? 'Acción de proyecto' : NOMBRE_TIPO[t.tipo], t.prioridad && `Prioridad ${t.prioridad}`]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </td>
                        <td style={{ padding: '13px 8px', verticalAlign: 'top', maxWidth: 320 }}>
                          {t.vinculo_titulo ? (
                            <>
                              {t.vinculo_ruta ? (
                                <Link href={t.vinculo_ruta} style={{ color: '#1a1a18', textDecoration: 'none' }}>
                                  {t.vinculo_titulo}
                                </Link>
                              ) : (
                                t.vinculo_titulo
                              )}
                              <div style={{ fontSize: 12, color: GRIS, marginTop: 2 }}>
                                {[grupoVinculo(t.vinculo_kind), t.vinculo_contexto].filter(Boolean).join(' · ')}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: GRIS }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '13px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          {t.asignada_a === yo ? 'Tú' : nombres.get(t.asignada_a) || '—'}
                        </td>
                        <td style={{ padding: '13px 16px', verticalAlign: 'top', whiteSpace: 'nowrap', fontWeight: vencida ? 600 : 400 }}>
                          {fechaTarea(t.vence_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', background: '#fcfbf8', borderTop: '1px solid #efeee8', flexWrap: 'wrap', gap: 10, borderRadius: '0 0 14px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 11.5, color: '#888' }}>Filas</span>
                <div style={{ display: 'flex', gap: 2, background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 7, padding: 2 }}>
                  {PAGE_SIZES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => changePageSize(n)}
                      style={{ font: 'inherit', fontSize: 11, padding: '3px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', background: pageSize === n ? MORADO : 'transparent', color: pageSize === n ? '#fff' : '#666' }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: 11.5, color: '#888' }}>
                  {from}–{to} de {visibles.length}
                </span>
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <button
                    type="button"
                    aria-label="Página anterior"
                    disabled={current === 1}
                    onClick={() => setPage(Math.max(1, current - 1))}
                    style={{ font: 'inherit', background: 'transparent', border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', color: current === 1 ? '#ccc' : '#555' }}
                  >
                    <i className="ti ti-chevron-left" style={{ fontSize: 13 }}></i>
                  </button>
                  {pageNumbers.map((n, idx) =>
                    n === '…' ? (
                      <span key={`e${idx}`} style={{ fontSize: 11.5, color: '#aaa', padding: '0 3px' }}>…</span>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        aria-current={n === current ? 'page' : undefined}
                        onClick={() => setPage(n)}
                        style={{ font: 'inherit', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, background: n === current ? MORADO : 'transparent', color: n === current ? '#fff' : '#555', border: n === current ? 'none' : '.5px solid #e0dfd8' }}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    aria-label="Página siguiente"
                    disabled={current === totalPages}
                    onClick={() => setPage(Math.min(totalPages, current + 1))}
                    style={{ font: 'inherit', background: 'transparent', border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', color: current === totalPages ? '#ccc' : '#555' }}
                  >
                    <i className="ti ti-chevron-right" style={{ fontSize: 13 }}></i>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {modal && (
        <TareaModal
          tarea={modal.id ? modal : null}
          miembros={miembros}
          yo={yo}
          orgId={orgId}
          onClose={() => setModal(null)}
          onGuardada={() => {
            setModal(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
