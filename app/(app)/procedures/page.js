'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import UpgradeModal from '@/components/UpgradeModal';
import usePlanPro from '@/lib/usePlanPro';

const PAGE_SIZES = [20, 50, 100, 200];

// Colores de los grupos. Los ocho actuales cubren el 99% de las
// participaciones; ID, GUE-NGL y ENF son de legislaturas anteriores y sí
// aparecen en procedimientos antiguos, así que llevan color propio en
// lugar de caer al gris genérico.
export const GRUPO_COLORES = {
  PPE: '#378ADD',
  'S-D': '#E23B3B',
  RENEW: '#FFD617',
  'VERTS-ALE': '#3D9E56',
  ECR: '#4A6FA5',
  PFE: '#2B4C7E',
  'THE-LEFT': '#8B1A1A',
  ESN: '#6B4C9A',
  ID: '#1B4F72',
  'GUE-NGL': '#A03030',
  ENF: '#264653',
  NI: '#888780',
};

export const GRUPO_NOMBRES = {
  PPE: 'Partido Popular Europeo',
  'S-D': 'Socialistas y Demócratas',
  RENEW: 'Renew Europe',
  'VERTS-ALE': 'Verdes / ALE',
  ECR: 'Conservadores y Reformistas',
  PFE: 'Patriotas por Europa',
  'THE-LEFT': 'La Izquierda',
  ESN: 'Europa de las Naciones Soberanas',
  ID: 'Identidad y Democracia',
  'GUE-NGL': 'Izquierda Unitaria Europea',
  ENF: 'Europa de las Naciones y de las Libertades',
  NI: 'No inscritos',
};

const colorGrupo = (g) => GRUPO_COLORES[g] || '#b0aea6';

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function FlagEU() {
  return (
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
  );
}

export default function ProceduresDirectoryPage() {
  const esPro = usePlanPro();
  const [upsell, setUpsell] = useState(null);
  const supabase = createClient();

  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [comisionFilter, setComisionFilter] = useState(new Set());
  const [anoFilter, setAnoFilter] = useState(new Set());
  const [soloVivos, setSoloVivos] = useState(true);
  const [soloEspanoles, setSoloEspanoles] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const saved = parseInt(window.localStorage.getItem('gt_page_size') || '20', 10);
    if (PAGE_SIZES.includes(saved)) setPageSize(saved);
  }, []);

  useEffect(() => {
    // Solo las columnas que la lista pinta: reparto_grupos es un jsonb
    // que solo se usa en el semicírculo de la ficha.
    supabase
      .from('ep_procedures_directory')
      .select(
        'process_id, slug, label, title, current_stage_label, is_closed, ponente, ponente_grupo, comision_competente, n_espanoles, year, last_activity_at'
      )
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .then(({ data }) => setItems(data || []));
  }, []);

  function changePageSize(n) {
    setPageSize(n);
    setPage(1);
    try {
      window.localStorage.setItem('gt_page_size', String(n));
    } catch {}
  }

  const comisionOptions = useMemo(() => {
    const cuenta = new Map();
    for (const i of items || []) {
      for (const c of (i.comision_competente || '').split(',').map((x) => x.trim()).filter(Boolean)) {
        cuenta.set(c, (cuenta.get(c) || 0) + 1);
      }
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => ({ value: code, label: `${code} (${n})` }));
  }, [items]);

  const anoOptions = useMemo(() => {
    const anos = [...new Set((items || []).map((i) => i.year).filter(Boolean))];
    return anos.sort((a, b) => b - a).map((a) => ({ value: a, label: String(a) }));
  }, [items]);

  const filtered = useMemo(() => {
    let l = items || [];
    if (soloVivos) l = l.filter((i) => !i.is_closed);
    if (soloEspanoles) l = l.filter((i) => i.n_espanoles > 0);
    if (search) {
      const q = normalize(search);
      l = l.filter((i) => normalize(i.title).includes(q) || normalize(i.label).includes(q));
    }
    if (comisionFilter.size > 0) {
      l = l.filter((i) =>
        (i.comision_competente || '')
          .split(',')
          .map((x) => x.trim())
          .some((c) => comisionFilter.has(c))
      );
    }
    if (anoFilter.size > 0) l = l.filter((i) => anoFilter.has(i.year));
    return l;
  }, [items, search, comisionFilter, anoFilter, soloVivos, soloEspanoles]);

  useEffect(() => {
    setPage(1);
  }, [search, comisionFilter, anoFilter, soloVivos, soloEspanoles]);

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

  const vivos = (items || []).filter((i) => !i.is_closed).length;
  const activeCount = comisionFilter.size + anoFilter.size;
  // El título de un procedimiento puede ocupar cinco líneas, así que la
  // columna necesita separación real de la siguiente: con gap 8 el texto
  // quedaba pegado a la comisión.
  const GRID = '2.2fr 0.8fr 1.1fr 24px';
  const GRID_GAP = 22;

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
        <Link href="/regulatorio" style={{ color: '#999', textDecoration: 'none' }}>
          Regulatorio
        </Link>
        {' › '}
        <span style={{ color: '#666' }}>Procedimientos</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
          <FlagEU />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Procedimientos legislativos</h1>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {items ? `${items.length} procedimientos del Parlamento Europeo · ${vivos} en tramitación` : '—'}
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
            flex: '1 1 190px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título o referencia..."
            aria-label="Buscar procedimiento"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>

        <span
          onClick={() => setSoloVivos((v) => !v)}
          style={{
            background: soloVivos ? '#EEEDFE' : '#fff',
            border: `.5px solid ${soloVivos ? '#6d5aef' : '#e0dfd8'}`,
            color: soloVivos ? '#3C3489' : '#555',
            borderRadius: 20,
            padding: '7px 12px',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          En tramitación {soloVivos && <i className="ti ti-x" style={{ fontSize: 11 }}></i>}
        </span>

        {/* Aquí no hay nada que desplegar: el clic es toda la
            interacción, así que el upsell tiene que salir en ese clic.
            Se conserva el aspecto de interruptor y no se pone candado:
            queremos que lo pulse. */}
        <span
          onClick={() => {
            if (esPro === false) {
              setUpsell({
                title: 'Filtrar por eurodiputados españoles',
                message:
                  'Quédate solo con los procedimientos en los que participa algún eurodiputado español. Disponible en el plan Pro.',
              });
              return;
            }
            setSoloEspanoles((v) => !v);
          }}
          style={{
            background: soloEspanoles ? '#e8f4f0' : '#fff',
            border: `.5px solid ${soloEspanoles ? '#1d6f5c' : '#e0dfd8'}`,
            color: soloEspanoles ? '#1d6f5c' : '#555',
            borderRadius: 20,
            padding: '7px 12px',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Con españoles {soloEspanoles && <i className="ti ti-x" style={{ fontSize: 11 }}></i>}
        </span>

        <MultiSelectFilter
          label="Comisión"
          values={comisionOptions}
          selected={comisionFilter}
          onApply={setComisionFilter}
          bloqueado={esPro === false}
          onBloqueado={() =>
            setUpsell({
              title: 'Filtrar por comisión',
              message:
                'Quédate con los procedimientos de las comisiones que te tocan, sin recorrer los 221. Disponible en el plan Pro.',
            })
          }
        />
        <MultiSelectFilter label="Año" values={anoOptions} selected={anoFilter} onApply={setAnoFilter} />
      </div>

      {activeCount > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...comisionFilter].map((v) => (
            <span key={`c${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          {[...anoFilter].map((v) => (
            <span key={`a${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          <span style={{ fontSize: 11, color: '#888' }}>{filtered.length} resultados</span>
          <span
            onClick={() => {
              setComisionFilter(new Set());
              setAnoFilter(new Set());
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
            No hay procedimientos con estos filtros.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: GRID_GAP,
              padding: '10px 16px',
              borderBottom: '.5px solid #f0f0eb',
              fontSize: 10.5,
              fontWeight: 700,
              color: '#999',
              textTransform: 'uppercase',
            }}
          >
            <div>Procedimiento</div>
            <div>Comisión</div>
            <div>Ponente</div>
            <div></div>
          </div>

          {slice.map((p) => (
            <Link
              key={p.process_id}
              href={`/procedures/${p.slug}`}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: GRID_GAP,
                padding: '13px 16px',
                borderBottom: '.5px solid #f0f0eb',
                // Alineado arriba, no al centro: con títulos de cinco
                // líneas la comisión quedaba flotando en mitad de la fila.
                alignItems: 'start',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{p.title}</div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, color: '#999' }}>{p.label}</span>
                  {!p.is_closed ? (
                    <span style={{ fontSize: 10, background: '#EEEDFE', color: '#3C3489', padding: '2px 7px', borderRadius: 9 }}>
                      {p.current_stage_label || 'En tramitación'}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, background: '#E1F5EE', color: '#0F6E56', padding: '2px 7px', borderRadius: 9 }}>
                      Concluido
                    </span>
                  )}
                  {p.n_espanoles > 0 && (
                    <span style={{ fontSize: 10, color: '#6d5aef' }}>{p.n_espanoles} españoles</span>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 11.5, color: '#666', paddingTop: 1 }}>{p.comision_competente || '—'}</div>

              <div style={{ minWidth: 0, paddingTop: 1 }}>
                {p.ponente ? (
                  <>
                    <div style={{ fontSize: 11.5, color: '#555' }}>{p.ponente}</div>
                    {p.ponente_grupo && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: colorGrupo(p.ponente_grupo),
                            flexShrink: 0,
                          }}
                        ></span>
                        <span style={{ fontSize: 10, color: '#999' }}>{p.ponente_grupo}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 11.5, color: '#bbb' }}>Sin ponente asignado</span>
                )}
              </div>

              <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, marginTop: 2 }}></i>
            </Link>
          ))}

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
              {pageNumbers.map((n, i) =>
                n === '…' ? (
                  <span key={`e${i}`} style={{ fontSize: 11.5, color: '#aaa', padding: '0 3px' }}>…</span>
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
        Datos abiertos del Parlamento Europeo. Procedimientos legislativos ordinarios desde 2014.
      </div>

      {upsell && (
        <UpgradeModal title={upsell.title} message={upsell.message} onClose={() => setUpsell(null)} />
      )}
    </div>
  );
}
