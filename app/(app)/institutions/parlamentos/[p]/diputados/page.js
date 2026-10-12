'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import UpgradeModal from '@/components/UpgradeModal';
import usePlanPro from '@/lib/usePlanPro';
import { PestanasParlamento, CabeceraParlamento, Photo, GroupTag, Vacio } from '@/components/ParlamentoAutonomico';
import { PARLAMENTOS_UI, base, useComposicion, limpiarComision, etiquetaCargo, normalizar, esComision } from '@/lib/ccaa/composicionUI';

/**
 * Diputados de un parlamento autonómico. Copia del directorio de
 * diputados del Congreso: misma rejilla, mismos filtros (Grupo libre,
 * Comisión con plan) y misma paginación. Sin filtro de circunscripción:
 * la Asamblea de Madrid tiene una sola.
 */

const PAGE_SIZES = [20, 50, 100, 200];
const GRID = '1.7fr .9fr 1.5fr 28px';

function Committees({ list }) {
  if (!list || list.length === 0) return <span style={{ fontSize: 11.5, color: '#ccc' }}>—</span>;
  const shown = list.slice(0, 2);
  const rest = list.length - shown.length;
  return (
    <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>
      {shown.map((c, i) => (
        <div key={i} style={{ color: c.label ? '#555' : '#999' }}>
          {c.nombre}
          {c.label ? <span style={{ color: '#aaa' }}> · {c.label}</span> : ''}
        </div>
      ))}
      {rest > 0 && <div style={{ color: '#aaa' }}>+{rest} más</div>}
    </div>
  );
}

export default function DiputadosAutonomicosPage() {
  const { p } = useParams();
  const cfg = PARLAMENTOS_UI[p];
  const esPro = usePlanPro();
  const [upsell, setUpsell] = useState(false);
  const { datos, error } = useComposicion(p);

  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState(new Set());
  const [constituencyFilter, setConstituencyFilter] = useState(new Set());
  const [comisionFilter, setComisionFilter] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    try {
      const saved = parseInt(window.localStorage.getItem('gt_page_size') || '20', 10);
      if (PAGE_SIZES.includes(saved)) setPageSize(saved);
    } catch {}
  }, []);

  function changePageSize(n) {
    setPageSize(n);
    setPage(1);
    try {
      window.localStorage.setItem('gt_page_size', String(n));
    } catch {}
  }

  // Comisiones de cada diputado, sin los órganos de gobierno (tienen
  // pestaña propia) y con el cargo de más peso primero.
  const comisionesPorDiputado = useMemo(() => {
    if (!datos) return {};
    const out = {};
    for (const [id, l] of Object.entries(datos.porDiputado)) {
      const vistos = new Map();
      for (const c of l) {
        const com = datos.comisionPorId[c.comision_id];
        if (!esComision(com)) continue;
        const nombre = limpiarComision(com.nombre);
        if (!vistos.has(nombre)) vistos.set(nombre, { nombre, label: etiquetaCargo(c.cargo_norm) });
      }
      out[id] = [...vistos.values()];
    }
    return out;
  }, [datos]);

  // Circunscripción solo donde hay más de una (Cataluña: cuatro; Madrid: una).
  const constituencyOptions = useMemo(() => {
    const u = [...new Set((datos?.diputados || []).map((d) => d.circunscripcion).filter(Boolean))];
    return u.length > 1 ? u.sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c })) : [];
  }, [datos]);

  const groupOptions = useMemo(() => (datos?.grupos || []).map((g) => ({ value: g.id, label: g.sigla || g.nombre })), [datos]);

  const comisionOptions = useMemo(() => {
    const cuenta = new Map();
    for (const l of Object.values(comisionesPorDiputado)) for (const c of l) cuenta.set(c.nombre, (cuenta.get(c.nombre) || 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([n, k]) => ({ value: n, label: `${n} (${k})` }));
  }, [comisionesPorDiputado]);

  const filtered = useMemo(() => {
    if (!datos) return [];
    let list = datos.diputados;
    if (search) {
      const q = normalizar(search);
      list = list.filter((d) => {
        const g = datos.grupoPorId[d.grupo_id];
        return normalizar(d.nombre).includes(q) || normalizar(g?.nombre).includes(q) || normalizar(g?.sigla).includes(q);
      });
    }
    if (groupFilter.size > 0) list = list.filter((d) => groupFilter.has(d.grupo_id));
    if (constituencyFilter.size > 0) list = list.filter((d) => constituencyFilter.has(d.circunscripcion));
    if (comisionFilter.size > 0) list = list.filter((d) => (comisionesPorDiputado[d.id] || []).some((c) => comisionFilter.has(c.nombre)));
    return list;
  }, [datos, search, groupFilter, constituencyFilter, comisionFilter, comisionesPorDiputado]);

  useEffect(() => {
    setPage(1);
  }, [search, groupFilter, constituencyFilter, comisionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);
  const from = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, filtered.length);
  const activeCount = groupFilter.size + constituencyFilter.size + comisionFilter.size;

  function clearFilters() {
    setSearch('');
    setGroupFilter(new Set());
    setConstituencyFilter(new Set());
    setComisionFilter(new Set());
  }

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, '…', totalPages];
    if (current >= totalPages - 2) return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', current, '…', totalPages];
  }, [current, totalPages]);

  if (!cfg) return <div className="sec"><Vacio texto="No tenemos este parlamento." /></div>;

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <CabeceraParlamento p={p} titulo="Diputados" datos={datos} />
      <PestanasParlamento p={p} />

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
            flex: '1 1 180px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            aria-label="Buscar diputado por nombre"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <MultiSelectFilter label="Grupo" values={groupOptions} selected={groupFilter} onApply={setGroupFilter} />
        {constituencyOptions.length > 0 && (
          <MultiSelectFilter label="Circunscripción" values={constituencyOptions} selected={constituencyFilter} onApply={setConstituencyFilter} />
        )}
        <MultiSelectFilter
          label="Comisión"
          values={comisionOptions}
          selected={comisionFilter}
          onApply={setComisionFilter}
          bloqueado={esPro === false}
          onBloqueado={() => setUpsell(true)}
        />
      </div>

      {activeCount > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...groupFilter].map((v) => (
            <span key={`g${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {datos?.grupoPorId[v]?.sigla || v}
            </span>
          ))}
          {[...constituencyFilter].map((v) => (
            <span key={`c${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          {[...comisionFilter].map((v) => (
            <span key={`k${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          <span onClick={clearFilters} style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}>
            Limpiar filtros
          </span>
        </div>
      )}

      {error ? (
        <Vacio icono="ti-alert-circle" texto="No se ha podido cargar la composición. Inténtalo de nuevo en un momento." />
      ) : !datos ? (
        <div className="spinner"></div>
      ) : datos.diputados.length === 0 ? (
        <Vacio icono="ti-user-off" texto={`Aún no hemos cargado los diputados ${cfg.deNombre}.`} />
      ) : filtered.length === 0 ? (
        <Vacio icono="ti-user-off" texto="No hay diputados con estos filtros.">
          <div style={{ marginTop: 10 }}>
            <button className="btn-o" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
        </Vacio>
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
            <div>Diputado</div>
            <div>Grupo</div>
            <div>Comisiones</div>
            <div></div>
          </div>

          {slice.map((d) => (
            <Link
              key={d.id}
              href={`${base(p)}/diputados/${d.slug}`}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                padding: '10px 14px',
                borderBottom: '.5px solid #f0f0eb',
                alignItems: 'center',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Photo url={d.foto_url} name={d.nombre} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.nombre}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{d.circunscripcion || cfg.ccaa}</div>
                </div>
              </div>
              <div>
                <GroupTag grupo={datos.grupoPorId[d.grupo_id]} />
              </div>
              <Committees list={comisionesPorDiputado[d.id]} />
              <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14 }}></i>
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
                      background: pageSize === n ? '#1d6f5c' : 'transparent',
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
                  <span key={`e${i}`} style={{ fontSize: 11.5, color: '#aaa', padding: '0 3px' }}>
                    …
                  </span>
                ) : (
                  <span
                    key={n}
                    onClick={() => setPage(n)}
                    style={{
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      background: n === current ? '#1d6f5c' : 'transparent',
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

      {upsell && (
        <UpgradeModal
          title="Filtrar por comisión"
          message="Quédate con los diputados de las comisiones que deciden sobre lo tuyo. Disponible con suscripción."
          onClose={() => setUpsell(false)}
        />
      )}
    </div>
  );
}
