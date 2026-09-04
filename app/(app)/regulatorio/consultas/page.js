'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';

const PAGE_SIZES = [20, 50, 100, 200];

const TIPOS = {
  consulta_previa: 'Consulta previa',
  audiencia_publica: 'Audiencia pública',
};

const tipoLabel = (c) => TIPOS[c] || c || '—';

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Mismos umbrales y colores que Expedientes, para que un plazo se lea
// igual venga de Bruselas o de un ministerio.
function urgencia(dias) {
  if (dias == null) return { bg: '#F1EFE8', fg: '#5F5E5A' };
  if (dias <= 7) return { bg: '#FCEBEB', fg: '#A32D2D' };
  if (dias <= 30) return { bg: '#FAEEDA', fg: '#854F0B' };
  return { bg: '#E1F5EE', fg: '#0F6E56' };
}

export default function ConsultasPublicasPage() {
  const supabase = createClient();

  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [soloAbiertas, setSoloAbiertas] = useState(true);
  const [ministerioFilter, setMinisterioFilter] = useState(new Set());
  const [tipoFilter, setTipoFilter] = useState(new Set());
  const [orden, setOrden] = useState('asc');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    // Se lee la vista y no la tabla: el estado y los días restantes se
    // calculan allí a partir de fecha_fin. Repetir ese cálculo aquí sería
    // garantizar que algún día dejen de coincidir.
    supabase
      .from('consultas_estado')
      .select('*')
      .order('fecha_fin', { ascending: true, nullsFirst: false })
      .then(({ data }) => setItems(data || []));
  }, []);

  const ministerioOptions = useMemo(() => {
    const set = new Set((items || []).map((i) => i.ministerio).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'es')).map((m) => ({ code: m, label: m }));
  }, [items]);

  const tipoOptions = useMemo(
    () => Object.entries(TIPOS).map(([code, label]) => ({ code, label })),
    []
  );

  const filtered = useMemo(() => {
    let out = items || [];
    if (soloAbiertas) out = out.filter((i) => i.estado === 'abierta' || i.estado === 'urgente');
    if (ministerioFilter.size) out = out.filter((i) => ministerioFilter.has(i.ministerio));
    if (tipoFilter.size) out = out.filter((i) => tipoFilter.has(i.tipo));

    const q = normalize(search).trim();
    if (q) {
      out = out.filter((i) =>
        normalize(`${i.titulo} ${i.referencia || ''} ${i.ministerio}`).includes(q)
      );
    }

    // Las que no tienen plazo van siempre al final: sin fecha no hay nada
    // que decidir sobre ellas.
    return [...out].sort((a, b) => {
      if (!a.fecha_fin) return 1;
      if (!b.fecha_fin) return -1;
      return orden === 'asc'
        ? a.fecha_fin.localeCompare(b.fecha_fin)
        : b.fecha_fin.localeCompare(a.fecha_fin);
    });
  }, [items, soloAbiertas, ministerioFilter, tipoFilter, search, orden]);

  const abiertas = (items || []).filter((i) => i.estado === 'abierta' || i.estado === 'urgente').length;
  const urgentes = (items || []).filter((i) => i.estado === 'urgente').length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const from = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, filtered.length);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);

  const pageNumbers = useMemo(() => {
    const out = [];
    for (let n = 1; n <= totalPages; n += 1) {
      if (n === 1 || n === totalPages || Math.abs(n - current) <= 1) out.push(n);
      else if (out[out.length - 1] !== '…') out.push('…');
    }
    return out;
  }, [totalPages, current]);

  function changePageSize(n) {
    setPageSize(n);
    setPage(1);
  }

  function clearFilters() {
    setMinisterioFilter(new Set());
    setTipoFilter(new Set());
    setPage(1);
  }

  const activeCount = ministerioFilter.size + tipoFilter.size;
  const GRID = '2.4fr 1fr 1.1fr 28px';

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
        <Link href="/regulatorio" style={{ color: '#999', textDecoration: 'none' }}>
          Regulatorio
        </Link>
        {' › '}
        <span style={{ color: '#666' }}>Consultas públicas</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
          <span
            role="img"
            aria-label="Bandera de España"
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
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Consultas públicas</h1>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {items ? `${abiertas} abiertas en los ministerios · ${urgentes} vencen en 7 días` : '—'}
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
            placeholder="Buscar por título, ministerio o referencia..."
            aria-label="Buscar consulta"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>

        <span
          onClick={() => setSoloAbiertas((v) => !v)}
          style={{
            background: soloAbiertas ? '#EEEDFE' : '#fff',
            border: `.5px solid ${soloAbiertas ? '#6d5aef' : '#e0dfd8'}`,
            color: soloAbiertas ? '#3C3489' : '#555',
            borderRadius: 20,
            padding: '7px 12px',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Solo abiertas {soloAbiertas && <i className="ti ti-x" style={{ fontSize: 11 }}></i>}
        </span>

        <MultiSelectFilter
          label="Ministerio"
          values={ministerioOptions}
          selected={ministerioFilter}
          onApply={setMinisterioFilter}
        />
        <MultiSelectFilter
          label="Tipo de trámite"
          values={tipoOptions}
          selected={tipoFilter}
          onApply={setTipoFilter}
        />

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
          {[...ministerioFilter].map((v) => (
            <span key={`m${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          {[...tipoFilter].map((v) => (
            <span key={`t${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {tipoLabel(v)}
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
            <i className="ti ti-message-off"></i>
            {soloAbiertas
              ? 'No hay consultas abiertas con estos filtros.'
              : 'No hay consultas con estos filtros.'}
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
            <div>Consulta</div>
            <div>Trámite</div>
            <div>Plazo</div>
            <div></div>
          </div>

          {slice.map((c) => {
            const vigente = c.estado === 'abierta' || c.estado === 'urgente';
            const u = urgencia(vigente ? c.dias_restantes : null);
            const expandida = abierta === c.id;

            return (
              <div key={c.id} style={{ borderBottom: '.5px solid #f0f0eb' }}>
                {/* Se despliega en la propia fila en vez de navegar: la
                    ficha de detalle no existe todavía y lo que el usuario
                    necesita —buzón, asunto y documento— cabe aquí. */}
                <div
                  onClick={() => setAbierta(expandida ? null : c.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: GRID,
                    padding: '11px 14px',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{c.titulo}</div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, background: '#EEEDFE', color: '#3C3489', padding: '2px 7px', borderRadius: 9 }}>
                        {c.ministerio}
                      </span>
                      {c.referencia && (
                        <span style={{ fontSize: 10, color: '#aaa', padding: '2px 0' }}>{c.referencia}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: 11.5, color: '#666' }}>{tipoLabel(c.tipo)}</div>

                  <div>
                    {vigente ? (
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
                        {c.dias_restantes === 0 ? 'Cierra hoy' : `${c.dias_restantes} días`}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11.5, color: '#aaa' }}>
                        {formatDate(c.fecha_fin) ? `Cerró ${formatDate(c.fecha_fin)}` : 'Sin plazo'}
                      </span>
                    )}
                  </div>

                  <i
                    className={`ti ti-chevron-${expandida ? 'down' : 'right'}`}
                    style={{ color: '#ccc', fontSize: 14 }}
                  ></i>
                </div>

                {expandida && (
                  <div style={{ padding: '0 14px 14px 14px', background: '#fcfbf8' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 12, fontSize: 12 }}>
                      {c.fecha_fin && (
                        <div style={{ color: '#666' }}>
                          <i className="ti ti-calendar" style={{ fontSize: 13, color: '#aaa', verticalAlign: -1, marginRight: 7 }}></i>
                          Hasta el {formatDate(c.fecha_fin)}
                          {c.fecha_inicio ? ` · desde el ${formatDate(c.fecha_inicio)}` : ''}
                        </div>
                      )}

                      {c.buzon ? (
                        <div style={{ color: '#666' }}>
                          <i className="ti ti-mail" style={{ fontSize: 13, color: '#aaa', verticalAlign: -1, marginRight: 7 }}></i>
                          <a href={`mailto:${c.buzon}`} style={{ color: '#555', textDecoration: 'none' }}>
                            {c.buzon}
                          </a>
                        </div>
                      ) : (
                        <div style={{ color: '#aaa' }}>
                          <i className="ti ti-mail-off" style={{ fontSize: 13, verticalAlign: -1, marginRight: 7 }}></i>
                          El ministerio no publica buzón para este trámite
                        </div>
                      )}

                      {/* El ministerio exige un asunto concreto para que la
                          aportación se tenga por presentada, así que va
                          destacado y no como nota al pie. */}
                      {c.asunto_requerido && (
                        <div style={{ color: '#666' }}>
                          <i className="ti ti-tag" style={{ fontSize: 13, color: '#aaa', verticalAlign: -1, marginRight: 7 }}></i>
                          Asunto exigido: <span style={{ fontWeight: 600 }}>{c.asunto_requerido}</span>
                        </div>
                      )}

                      {c.nota && (
                        <div style={{ color: '#8a6d3b', fontSize: 11.5 }}>
                          <i className="ti ti-alert-triangle" style={{ fontSize: 13, verticalAlign: -1, marginRight: 7 }}></i>
                          {c.nota}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
                        {c.url_documento && (
                          <a
                            href={c.url_documento}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 12, color: '#6d5aef', textDecoration: 'none' }}
                          >
                            <i className="ti ti-file-text" style={{ fontSize: 13, verticalAlign: -1, marginRight: 5 }}></i>
                            Texto del proyecto
                          </a>
                        )}
                        <a
                          href={c.url_origen}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: '#6d5aef', textDecoration: 'none' }}
                        >
                          <i className="ti ti-external-link" style={{ fontSize: 13, verticalAlign: -1, marginRight: 5 }}></i>
                          Ver en la web del ministerio
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
        Datos tomados de las secciones de participación pública de cada ministerio. Los plazos se
        cuentan en días naturales.
      </div>
    </div>
  );
}
