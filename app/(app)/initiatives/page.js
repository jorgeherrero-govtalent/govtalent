'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';

const PAGE_SIZES = [20, 50, 100, 200];

// Tipos de acto que devuelve la Comisión en foreseenActType. Se traducen
// los conocidos y el resto se muestra tal cual: es preferible enseñar un
// código que inventarse una etiqueta.
const ACT_TYPES = {
  REG: 'Reglamento',
  REG_DEL: 'Reglamento delegado',
  REG_IMPL: 'Reglamento de ejecución',
  DIR: 'Directiva',
  DIR_DEL: 'Directiva delegada',
  DEC: 'Decisión',
  DEC_DEL: 'Decisión delegada',
  DEC_IMPL: 'Decisión de ejecución',
  COM: 'Comunicación',
  SWD: 'Documento de trabajo',
  REC: 'Recomendación',
  RPT: 'Informe',
  OTHER: 'Otros',
};

const actLabel = (c) => ACT_TYPES[c] || c || '—';

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Color del contador según lo que quede: rojo cuando aprieta, ámbar cuando
// hay tiempo pero conviene moverse, gris cuando es holgado.
function urgencia(dias) {
  if (dias == null) return { bg: '#F1EFE8', fg: '#5F5E5A' };
  if (dias <= 7) return { bg: '#FCEBEB', fg: '#A32D2D' };
  if (dias <= 30) return { bg: '#FAEEDA', fg: '#854F0B' };
  return { bg: '#E1F5EE', fg: '#0F6E56' };
}

export default function InitiativesDirectoryPage() {
  const supabase = createClient();

  const [items, setItems] = useState(null);
  const [topics, setTopics] = useState([]);
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState(new Set());
  const [actFilter, setActFilter] = useState(new Set());
  const [onlyOpen, setOnlyOpen] = useState(true);
  // 'asc' = lo que antes cierra primero; 'desc' = lo que más tarde cierra.
  const [orden, setOrden] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const saved = parseInt(window.localStorage.getItem('gt_page_size') || '20', 10);
    if (PAGE_SIZES.includes(saved)) setPageSize(saved);
  }, []);

  useEffect(() => {
    Promise.all([
      // Solo las diez columnas que la lista pinta. Con select('*') viajaba
      // también `attachments` —los documentos de cada expediente en
      // jsonb— que pesa 16 MB de los 26 de la tabla y solo se usa en la
      // pestaña de Documentos de la ficha.
      supabase
        .from('eu_initiatives_directory')
        .select('id, slug, reference, title, title_en, act_type, feedback_end, is_open, dias_restantes, topics')
        .order('feedback_end', { ascending: false, nullsFirst: false }),
      supabase.from('eu_topics_directory').select('*').order('label'),
    ]).then(([res, t]) => {
      setItems(res.data || []);
      setTopics(t.data || []);
    });
  }, []);

  function changePageSize(n) {
    setPageSize(n);
    setPage(1);
    try {
      window.localStorage.setItem('gt_page_size', String(n));
    } catch {}
  }

  const topicOptions = useMemo(
    () => topics.map((t) => ({ value: t.code, label: `${t.label} (${t.total})` })),
    [topics]
  );

  const actOptions = useMemo(() => {
    const codes = [...new Set((items || []).map((i) => i.act_type).filter(Boolean))];
    return codes.sort().map((c) => ({ value: c, label: actLabel(c) }));
  }, [items]);

  const filtered = useMemo(() => {
    let list = items || [];
    if (onlyOpen) list = list.filter((i) => i.is_open);
    if (search) {
      const q = normalize(search);
      list = list.filter(
        (i) => normalize(i.title).includes(q) || normalize(i.title_en).includes(q) || normalize(i.reference).includes(q)
      );
    }
    if (topicFilter.size > 0) {
      list = list.filter((i) => (i.topics || []).some((t) => topicFilter.has(t.code)));
    }
    if (actFilter.size > 0) list = list.filter((i) => actFilter.has(i.act_type));

    // Se ordena siempre por fecha de cierre; el sentido lo elige el usuario.
    // Los que no tienen fecha van al final en ambos casos.
    return [...list].sort((a, b) => {
      if (!a.feedback_end) return 1;
      if (!b.feedback_end) return -1;
      const diff = new Date(a.feedback_end) - new Date(b.feedback_end);
      return orden === 'asc' ? diff : -diff;
    });
  }, [items, search, topicFilter, actFilter, onlyOpen, orden]);

  useEffect(() => {
    setPage(1);
  }, [search, topicFilter, actFilter, onlyOpen, orden]);

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

  const abiertas = (items || []).filter((i) => i.is_open).length;
  const activeCount = topicFilter.size + actFilter.size;

  function clearFilters() {
    setSearch('');
    setTopicFilter(new Set());
    setActFilter(new Set());
  }

  const GRID = '2.4fr 1fr 1.1fr 28px';

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
        <Link href="/regulatorio" style={{ color: '#999', textDecoration: 'none' }}>
          Regulatorio
        </Link>
        {' › '}
        <span style={{ color: '#666' }}>Expedientes</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
          <span
            role="img"
            aria-label="Bandera de la Unión Europea"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 14,
              borderRadius: 3,
              background: '#003399',
              flexShrink: 0,
              border: '.5px solid rgba(0,0,0,.12)',
            }}
          >
            <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #FFCC00' }} />
          </span>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Expedientes</h1>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {items ? `${items.length} iniciativas de la Comisión Europea · ${abiertas} con ventana abierta` : '—'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '7px 14px',
            flex: '1 1 200px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título o referencia..."
            aria-label="Buscar expediente"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>

        <span
          onClick={() => setOnlyOpen((v) => !v)}
          style={{
            background: onlyOpen ? '#EEEDFE' : '#fff',
            border: `.5px solid ${onlyOpen ? '#6d5aef' : '#e0dfd8'}`,
            color: onlyOpen ? '#3C3489' : '#555',
            borderRadius: 20,
            padding: '7px 12px',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Solo ventana abierta {onlyOpen && <i className="ti ti-x" style={{ fontSize: 11 }}></i>}
        </span>

        <MultiSelectFilter label="Materia" values={topicOptions} selected={topicFilter} onApply={setTopicFilter} />
        <MultiSelectFilter label="Tipo de acto" values={actOptions} selected={actFilter} onApply={setActFilter} />

        <span
          onClick={() => setOrden((o) => (o === 'asc' ? 'desc' : 'asc'))}
          title={orden === 'asc' ? 'Primero lo que antes cierra' : 'Primero lo que más tarde cierra'}
          style={{
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '7px 12px',
            fontSize: 12,
            color: '#555',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <i
            className={`ti ti-sort-${orden === 'asc' ? 'ascending' : 'descending'}-2`}
            style={{ fontSize: 14, color: '#6d5aef' }}
          ></i>
          {orden === 'asc' ? 'Cierra antes' : 'Cierra después'}
        </span>
      </div>

      {activeCount > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...topicFilter].map((v) => (
            <span key={`t${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {topics.find((t) => t.code === v)?.label || v}
            </span>
          ))}
          {[...actFilter].map((v) => (
            <span key={`a${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {actLabel(v)}
            </span>
          ))}
          <span onClick={clearFilters} style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}>
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
            {onlyOpen
              ? 'No hay expedientes con ventana abierta y estos filtros.'
              : 'No hay expedientes con estos filtros.'}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              padding: '10px 14px',
              borderBottom: '.5px solid #f0f0eb',
              fontSize: 10.5,
              fontWeight: 700,
              color: '#999',
              textTransform: 'uppercase',
            }}
          >
            <div>Expediente</div>
            <div>Tipo</div>
            <div>Ventana</div>
            <div></div>
          </div>

          {slice.map((i) => {
            const u = urgencia(i.is_open ? i.dias_restantes : null);
            return (
              <Link
                key={i.id}
                href={`/initiatives/${i.slug}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
                  padding: '11px 14px',
                  borderBottom: '.5px solid #f0f0eb',
                  alignItems: 'center',
                  textDecoration: 'none',
                  color: 'inherit',
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{i.title}</div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                    {(i.topics || []).slice(0, 2).map((t) => (
                      <span
                        key={t.code}
                        style={{ fontSize: 10, background: '#EEEDFE', color: '#3C3489', padding: '2px 7px', borderRadius: 9 }}
                      >
                        {t.label}
                      </span>
                    ))}
                    {(i.topics || []).length > 2 && (
                      <span style={{ fontSize: 10, color: '#aaa', padding: '2px 0' }}>
                        +{i.topics.length - 2}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: 11.5, color: '#666' }}>{actLabel(i.act_type)}</div>

                <div>
                  {i.is_open ? (
                    <span
                      style={{
                        fontSize: 10.5,
                        background: u.bg,
                        color: u.fg,
                        padding: '3px 9px',
                        borderRadius: 12,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {i.dias_restantes === 0 ? 'Cierra hoy' : `${i.dias_restantes} días`}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11.5, color: '#aaa' }}>
                      {formatDate(i.feedback_end) ? `Cerró ${formatDate(i.feedback_end)}` : 'Sin ventana'}
                    </span>
                  )}
                </div>

                <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14 }}></i>
              </Link>
            );
          })}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '11px 14px',
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
        Datos de la Comisión Europea — portal de participación pública.{' '}
        <a href="https://have-your-say.ec.europa.eu" target="_blank" rel="noreferrer" style={{ color: '#6d5aef' }}>
          Ver fuente oficial ↗
        </a>
      </div>
    </div>
  );
}
