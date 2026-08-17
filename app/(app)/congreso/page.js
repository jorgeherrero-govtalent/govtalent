'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import { groupColor, grupoCorto } from '@/lib/grupos';

const PAGE_SIZES = [20, 50, 100, 200];

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

function fechaLarga(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function FlagES() {
  return (
    <span
      role="img"
      aria-label="España"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 20,
        height: 14,
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ height: '25%', background: '#C60B1E' }} />
      <span style={{ height: '50%', background: '#FFC400' }} />
      <span style={{ height: '25%', background: '#C60B1E' }} />
    </span>
  );
}

/**
 * useSearchParams() obliga a envolver el componente en Suspense: sin él,
 * Next.js no puede prerenderizar la página y la compilación falla con
 * "Error occurred prerendering page". El wrapper de abajo lo resuelve.
 */
export default function CongresoDirectoryPage() {
  return (
    <Suspense fallback={<div className="sec" style={{ maxWidth: 1000 }}><div className="spinner"></div></div>}>
      <CongresoDirectory />
    </Suspense>
  );
}

function CongresoDirectory() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('progreso'); // progreso | bloqueadas | todas
  const [situacionFilter, setSituacionFilter] = useState(new Set());
  const [tipoFilter, setTipoFilter] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const saved = parseInt(window.localStorage.getItem('gt_page_size') || '20', 10);
    if (PAGE_SIZES.includes(saved)) setPageSize(saved);
  }, []);

  // Llegando desde una comisión, el filtro viene puesto en la URL. Así
  // el enlace se puede compartir y el atrás del navegador lo deshace.
  useEffect(() => {
    const c = searchParams.get('comision');
    if (c) {
      setSituacionFilter(new Set([c]));
      setEstado('todas');
    }
  }, [searchParams]);

  useEffect(() => {
    supabase
      .from('es_initiatives_directory')
      .select('*')
      .order('fecha_presentacion', { ascending: false, nullsFirst: false })
      .then(({ data }) => setItems(data || []));
  }, []);

  function changePageSize(n) {
    setPageSize(n);
    setPage(1);
    try {
      window.localStorage.setItem('gt_page_size', String(n));
    } catch {}
  }

  const vivas = useMemo(() => (items || []).filter((i) => !i.is_closed), [items]);
  const enProgreso = vivas.filter((i) => !i.is_blocked).length;
  const bloqueadas = vivas.filter((i) => i.is_blocked).length;

  // El filtro principal es la situación, no la comisión: 255 de 467 no
  // tienen comisión —están en Pleno o en Gobierno— y un filtro que cubre
  // menos de la mitad no sirve. La situación cubre el 100%.
  const situacionOptions = useMemo(() => {
    const cuenta = new Map();
    for (const i of vivas) {
      const s = i.situacion || '(sin situación)';
      cuenta.set(s, (cuenta.get(s) || 0) + 1);
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => ({ value: v, label: `${v} (${n})` }));
  }, [vivas]);

  const tipoOptions = [
    { value: 'proyecto', label: 'Proyecto de ley' },
    { value: 'proposicion', label: 'Proposición de ley' },
  ];

  const filtered = useMemo(() => {
    let l = items || [];
    if (estado === 'progreso') l = l.filter((i) => !i.is_closed && !i.is_blocked);
    else if (estado === 'bloqueadas') l = l.filter((i) => i.is_blocked);
    else l = l.filter((i) => !i.is_closed);

    if (search) {
      const q = normalize(search);
      l = l.filter((i) => normalize(i.title).includes(q) || normalize(i.num_expediente).includes(q));
    }
    if (situacionFilter.size > 0) l = l.filter((i) => situacionFilter.has(i.situacion || '(sin situación)'));
    if (tipoFilter.size > 0) l = l.filter((i) => tipoFilter.has(i.kind));
    return l;
  }, [items, search, estado, situacionFilter, tipoFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, estado, situacionFilter, tipoFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);
  const from = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, filtered.length);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, '…', totalPages];
    if (current >= totalPages - 2) return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', current, '…', totalPages];
  }, [current, totalPages]);

  const activeCount = situacionFilter.size + tipoFilter.size;

  const chip = (activo) => ({
    background: activo ? '#EEEDFE' : '#fff',
    border: `.5px solid ${activo ? '#6d5aef' : '#e0dfd8'}`,
    color: activo ? '#3C3489' : '#555',
    borderRadius: 20,
    padding: '7px 12px',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="sec" style={{ maxWidth: 1000 }}>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
        <Link href="/regulatorio" style={{ color: '#999', textDecoration: 'none' }}>
          Regulatorio
        </Link>
        {' › '}
        <span style={{ color: '#666' }}>Congreso</span>
      </div>

      {/* Las comisiones viven en Instituciones: son órganos, no asuntos
          en tramitación. Aquí solo aparecen dentro de cada norma, en la
          pestaña de Actores. */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
          <FlagES />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Iniciativas legislativas</h1>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {items ? `${items.length} en la XV Legislatura · ${vivas.length} en tramitación` : '—'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 13, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '7px 14px',
            flex: '1 1 180px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título o expediente..."
            aria-label="Buscar iniciativa"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>

        <span onClick={() => setEstado('progreso')} style={chip(estado === 'progreso')}>
          En progreso ({enProgreso})
        </span>
        <span onClick={() => setEstado('bloqueadas')} style={chip(estado === 'bloqueadas')}>
          Bloqueadas ({bloqueadas})
        </span>

        <MultiSelectFilter
          label="Situación"
          values={situacionOptions}
          selected={situacionFilter}
          onApply={setSituacionFilter}
        />
        <MultiSelectFilter label="Tipo" values={tipoOptions} selected={tipoFilter} onApply={setTipoFilter} />
      </div>

      {activeCount > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...situacionFilter, ...tipoFilter].map((v) => (
            <span key={v} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          <span style={{ fontSize: 11, color: '#888' }}>{filtered.length} resultados</span>
          <span
            onClick={() => {
              setSituacionFilter(new Set());
              setTipoFilter(new Set());
            }}
            style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Limpiar filtros
          </span>
        </div>
      )}

      {items === null ? (
        <div className="spinner"></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-file-off"></i>
            No hay iniciativas con estos filtros.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {slice.map((i) => (
            <Link
              key={i.num_expediente}
              href={`/congreso/${i.slug}`}
              style={{
                display: 'flex',
                gap: 13,
                padding: '14px 16px',
                borderBottom: '.5px solid #f0f0eb',
                alignItems: 'flex-start',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              {/* Barra lateral: morado si se mueve, gris si está parada.
                  Es lo que permite escanear la lista de un vistazo. */}
              <div
                style={{
                  width: 3,
                  alignSelf: 'stretch',
                  background: i.is_blocked ? '#d5d3c9' : '#6d5aef',
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              ></div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 9.5,
                      background: i.is_blocked ? '#f0efe9' : '#EEEDFE',
                      color: i.is_blocked ? '#8d8b83' : '#3C3489',
                      padding: '2px 8px',
                      borderRadius: 9,
                    }}
                  >
                    {i.kind_label}
                  </span>
                  {i.is_blocked && (
                    <span
                      style={{
                        fontSize: 9.5,
                        border: '.5px solid #d5d3c9',
                        color: '#8d8b83',
                        padding: '2px 8px',
                        borderRadius: 9,
                      }}
                    >
                      Bloqueada
                    </span>
                  )}
                  {i.tipo_tramitacion === 'Urgente' && !i.is_blocked && (
                    <span style={{ fontSize: 9.5, color: '#6d5aef' }}>Urgente</span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    lineHeight: 1.4,
                    color: i.is_blocked ? '#666' : '#1a1a1a',
                  }}
                >
                  {i.title}
                </div>

                {/* "En" delante de la situación evita que se confunda con
                    el autor: "Gobierno · Contestación" a secas parecía que
                    lo presentaba el Gobierno, cuando es dónde está. */}
                <div style={{ fontSize: 10.5, color: i.is_blocked ? '#aaa' : '#999', marginTop: 4 }}>
                  {i.situacion && <span style={{ color: '#bbb' }}>En </span>}
                  {[i.situacion, i.fase, i.n_ponentes > 0 ? `${i.n_ponentes} ponentes` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>

                {/* Los grupos proponentes con su color: en las coaliciones
                    es lo que hace legible quién firma con quién. */}
                {(i.grupos || []).length > 0 && (i.grupos || []).length <= 5 && !i.is_blocked && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: '#bbb' }}>Presenta</span>
                    {i.grupos.map((g) => (
                      <span key={g.grupo} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span
                          style={{ width: 8, height: 8, borderRadius: 2, background: groupColor(g.grupo), flexShrink: 0 }}
                        ></span>
                        <span style={{ fontSize: 10, color: '#666' }}>{grupoCorto(g.grupo)}</span>
                      </span>
                    ))}
                  </div>
                )}

                {i.is_blocked && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                    <i className="ti ti-clock-pause" style={{ fontSize: 12, color: '#b0aea6' }}></i>
                    <span style={{ fontSize: 10.5, color: '#999' }}>
                      {i.motivo_bloqueo === 'prorrogas'
                        ? `Plazo prorrogado ${i.n_prorrogas} veces · sin actuación desde ${fechaLarga(i.ultima_actuacion)}`
                        : `Sin actuación desde ${fechaLarga(i.ultima_actuacion)}`}
                    </span>
                  </div>
                )}

                {!i.is_blocked && i.dias_plazo !== null && (
                  <div style={{ fontSize: 10, color: '#666', marginTop: 7 }}>
                    <i
                      className="ti ti-calendar"
                      style={{ fontSize: 11, color: '#b0aea6', verticalAlign: -1 }}
                      aria-hidden="true"
                    ></i>{' '}
                    Enmiendas hasta el {fechaCorta(i.plazo_enmiendas)}
                  </div>
                )}
              </div>

              <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0, marginTop: 3 }}></i>
            </Link>
          ))}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '11px 16px',
              background: '#fcfbf8',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 11.5, color: '#888' }}>Filas</span>
              <div style={{ display: 'flex', gap: 2, background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 7, padding: 2 }}>
                {PAGE_SIZES.map((n) => (
                  <span
                    key={n}
                    onClick={() => changePageSize(n)}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 5,
                      cursor: 'pointer',
                      background: pageSize === n ? '#6d5aef' : 'transparent',
                      color: pageSize === n ? '#fff' : '#666',
                    }}
                  >
                    {n}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 11.5, color: '#888' }}>
                {from}–{to} de {filtered.length}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                onClick={() => setPage(Math.max(1, current - 1))}
                style={{ border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: current === 1 ? '#ccc' : '#555' }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 13 }}></i>
              </span>
              {pageNumbers.map((n, idx) =>
                n === '…' ? (
                  <span key={`e${idx}`} style={{ fontSize: 11.5, color: '#aaa', padding: '0 3px' }}>…</span>
                ) : (
                  <span
                    key={n}
                    onClick={() => setPage(n)}
                    style={{
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      background: n === current ? '#6d5aef' : 'transparent',
                      color: n === current ? '#fff' : '#555',
                      border: n === current ? 'none' : '.5px solid #e0dfd8',
                    }}
                  >
                    {n}
                  </span>
                )
              )}
              <span
                onClick={() => setPage(Math.min(totalPages, current + 1))}
                style={{ border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: current === totalPages ? '#ccc' : '#555' }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 13 }}></i>
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos abiertos del Congreso de los Diputados. «Bloqueada» es una lectura nuestra: más de 20 prórrogas y un año
        sin actuación, o año y medio sin actuación ni plazo vigente.
      </div>
    </div>
  );
}
