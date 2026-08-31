'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import UpgradeModal from '@/components/UpgradeModal';
import usePlanPro from '@/lib/usePlanPro';
import ComisionesEuTab from '@/components/ComisionesEuTab';

// Color por grupo político. Con 9 grupos, la sigla sola no basta para
// reconocerlos de un vistazo; el cuadrito de color sí.
const GROUP_COLORS = {
  PPE: '#378ADD',
  'S&D': '#D4537E',
  Renew: '#BA7517',
  'Verts/ALE': '#639922',
  ECR: '#185FA5',
  PfE: '#7F77DD',
  'The Left': '#E24B4A',
  ESN: '#1D9E75',
  NI: '#888780',
};

const COUNTRIES = {
  AT: 'Austria', BE: 'Bélgica', BG: 'Bulgaria', CY: 'Chipre', CZ: 'Chequia',
  DE: 'Alemania', DK: 'Dinamarca', EE: 'Estonia', ES: 'España', FI: 'Finlandia',
  FR: 'Francia', GR: 'Grecia', HR: 'Croacia', HU: 'Hungría', IE: 'Irlanda',
  IT: 'Italia', LT: 'Lituania', LU: 'Luxemburgo', LV: 'Letonia', MT: 'Malta',
  NL: 'Países Bajos', PL: 'Polonia', PT: 'Portugal', RO: 'Rumanía',
  SE: 'Suecia', SI: 'Eslovenia', SK: 'Eslovaquia',
};

const countryName = (c) => COUNTRIES[c] || c || '—';
const PAGE_SIZES = [20, 50, 100, 200];

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Foto con reserva de espacio y respaldo a iniciales: sin width/height
// fijos las 719 filas bailan mientras cargan, y alguna URL acabará dando
// 404 antes o después.
function Photo({ url, name, size = 36, radius = 8 }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const base = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    objectFit: 'cover',
    background: '#ece9e2',
  };

  if (!url || failed) {
    return (
      <div
        style={{
          ...base,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8d8b83',
          fontSize: Math.round(size * 0.32),
          fontWeight: 600,
        }}
        aria-hidden="true"
      >
        {initials}
      </div>
    );
  }
  return <img src={url} alt="" width={size} height={size} style={base} onError={() => setFailed(true)} />;
}

function GroupTag({ code }) {
  if (!code) return <span style={{ fontSize: 11.5, color: '#aaa' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 2,
          background: GROUP_COLORS[code] || '#888780',
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11.5, color: '#555' }}>{code}</span>
    </span>
  );
}

// Máximo 2 comisiones por fila: con 4 o 5 la tabla se descuadra.
function Committees({ list }) {
  if (!list || list.length === 0) return <span style={{ fontSize: 11.5, color: '#ccc' }}>—</span>;
  const shown = list.slice(0, 2);
  const rest = list.length - shown.length;
  return (
    <div style={{ fontSize: 11.5, color: '#666', lineHeight: 1.5 }}>
      {shown.map((c, i) => (
        <div key={i} style={{ color: c.role === 'MEMBER' ? '#666' : '#aaa' }}>
          {c.name}
          {c.role !== 'MEMBER' ? ' · supl.' : ''}
        </div>
      ))}
      {rest > 0 && <div style={{ color: '#aaa' }}>+{rest} más</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña 1 — Eurodiputados                                           */
/* ------------------------------------------------------------------ */
function MepsTab({ meps }) {
  const esPro = usePlanPro();
  const [upsell, setUpsell] = useState(false);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState(new Set());
  const [groupFilter, setGroupFilter] = useState(new Set());
  const [committeeFilter, setCommitteeFilter] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const saved = parseInt(window.localStorage.getItem('gt_page_size') || '20', 10);
    if (PAGE_SIZES.includes(saved)) setPageSize(saved);
  }, []);

  function changePageSize(n) {
    setPageSize(n);
    setPage(1); // sin esto, estar en la página 30 con 20 filas y saltar a 200 deja la tabla vacía
    try {
      window.localStorage.setItem('gt_page_size', String(n));
    } catch {}
  }

  const countryOptions = useMemo(() => {
    const codes = [...new Set(meps.map((m) => m.country_code).filter(Boolean))];
    return codes
      .map((c) => ({ value: c, label: countryName(c) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [meps]);

  const groupOptions = useMemo(() => {
    const codes = [...new Set(meps.map((m) => m.political_group_code).filter(Boolean))];
    return codes.sort().map((c) => ({ value: c, label: c }));
  }, [meps]);

  const committeeOptions = useMemo(() => {
    const names = new Set();
    for (const m of meps) for (const c of m.committees || []) names.add(c.name);
    return [...names].sort((a, b) => a.localeCompare(b)).map((n) => ({ value: n, label: n }));
  }, [meps]);

  const filtered = useMemo(() => {
    let list = meps;
    if (search) {
      const q = normalize(search);
      list = list.filter((m) => normalize(m.full_name).includes(q));
    }
    if (countryFilter.size > 0) list = list.filter((m) => countryFilter.has(m.country_code));
    if (groupFilter.size > 0) list = list.filter((m) => groupFilter.has(m.political_group_code));
    if (committeeFilter.size > 0) {
      list = list.filter((m) => (m.committees || []).some((c) => committeeFilter.has(c.name)));
    }
    return list;
  }, [meps, search, countryFilter, groupFilter, committeeFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, countryFilter, groupFilter, committeeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);
  const from = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, filtered.length);

  const activeCount = countryFilter.size + groupFilter.size + committeeFilter.size;

  function clearFilters() {
    setSearch('');
    setCountryFilter(new Set());
    setGroupFilter(new Set());
    setCommitteeFilter(new Set());
  }

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, '…', totalPages];
    if (current >= totalPages - 2) return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', current, '…', totalPages];
  }, [current, totalPages]);

  const GRID = '1.7fr .9fr 1.5fr 28px';

  return (
    <>
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
            aria-label="Buscar eurodiputado por nombre"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <MultiSelectFilter label="País" values={countryOptions} selected={countryFilter} onApply={setCountryFilter} />
        <MultiSelectFilter label="Grupo" values={groupOptions} selected={groupFilter} onApply={setGroupFilter} />
        <MultiSelectFilter
          label="Comisión"
          values={committeeOptions}
          selected={committeeFilter}
          onApply={setCommitteeFilter}
          bloqueado={esPro === false}
          onBloqueado={() => setUpsell(true)}
        />
      </div>

      {activeCount > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...countryFilter].map((v) => (
            <span key={`c${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {countryName(v)}
            </span>
          ))}
          {[...groupFilter].map((v) => (
            <span key={`g${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          {[...committeeFilter].map((v) => (
            <span key={`k${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          <span onClick={clearFilters} style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}>
            Limpiar filtros
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hay eurodiputados con estos filtros.
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
            <div>Eurodiputado</div>
            <div>Grupo</div>
            <div>Comisiones</div>
            <div></div>
          </div>

          {slice.map((m) => (
            <Link
              key={m.id}
              href={`/institutions/eu-parliament/${m.slug}`}
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
                <Photo url={m.photo_url} name={m.full_name} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.full_name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {m.national_party ? `${m.national_party} · ` : ''}
                    {countryName(m.country_code)}
                  </div>
                </div>
              </div>
              <div><GroupTag code={m.political_group_code} /></div>
              <Committees list={m.committees} />
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
          message="Busca los eurodiputados por comisiones concretas. Disponible en el plan Pro."
          onClose={() => setUpsell(false)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña 3 — Grupos políticos                                        */
/* ------------------------------------------------------------------ */
function GroupsTab({ groups }) {
  const total = groups.reduce((a, g) => a + Number(g.members), 0);
  const sorted = [...groups].sort((a, b) => Number(b.members) - Number(a.members));

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {sorted.map((g) => {
        const pct = total > 0 ? Math.round((Number(g.members) / total) * 100) : 0;
        return (
          <div key={g.code} style={{ padding: '12px 14px', borderBottom: '.5px solid #f0f0eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
              <span
                style={{ width: 11, height: 11, borderRadius: 3, background: GROUP_COLORS[g.code] || '#888780', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{g.code}</div>
                {g.name && g.name !== g.code && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{g.name}</div>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>
                {g.members} <span style={{ color: '#aaa' }}>· {pct}%</span>
              </div>
            </div>
            <div style={{ height: 5, background: '#f0efe9', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{ width: `${pct}%`, height: '100%', background: GROUP_COLORS[g.code] || '#888780' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña — Órganos de gobierno                                       */
/* ------------------------------------------------------------------ */
function GobiernoTab({ governance, chairs }) {
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState(new Set());
  const [groupFilter, setGroupFilter] = useState(new Set());
  const [bodyFilter, setBodyFilter] = useState(new Set());

  // Se combinan cargos de gobierno y presidencias de comisión para poder
  // filtrar sobre el conjunto: al usuario le da igual de qué vista sale
  // cada dato, quiere saber quién manda y dónde.
  const soloPresidenciasComision = useMemo(
    () => chairs.filter((c) => c.role === 'CHAIR' && ['committee', 'subcommittee'].includes(c.body_type)),
    [chairs]
  );

  const countryOptions = useMemo(() => {
    const codes = [
      ...new Set([...governance, ...soloPresidenciasComision].map((g) => g.country_code).filter(Boolean)),
    ];
    return codes
      .map((c) => ({ value: c, label: countryName(c) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [governance, soloPresidenciasComision]);

  const groupOptions = useMemo(() => {
    const codes = [
      ...new Set([...governance, ...soloPresidenciasComision].map((g) => g.political_group_code).filter(Boolean)),
    ];
    return codes.sort().map((c) => ({ value: c, label: c }));
  }, [governance, soloPresidenciasComision]);

  const bodyOptions = useMemo(() => {
    const vistos = new Map();
    for (const c of soloPresidenciasComision) {
      if (c.body_code && !vistos.has(c.body_code)) vistos.set(c.body_code, c.body_name);
    }
    return [...vistos.entries()]
      .map(([code, name]) => ({ value: code, label: `${code} · ${name}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [soloPresidenciasComision]);

  function pasa(p, aplicarOrgano) {
    if (countryFilter.size > 0 && !countryFilter.has(p.country_code)) return false;
    if (groupFilter.size > 0 && !groupFilter.has(p.political_group_code)) return false;
    if (aplicarOrgano && bodyFilter.size > 0 && !bodyFilter.has(p.body_code)) return false;
    if (search) {
      const q = normalize(search);
      if (!normalize(p.full_name).includes(q) && !normalize(p.body_name).includes(q)) return false;
    }
    return true;
  }

  // El filtro de comisión solo tiene sentido en las presidencias: la Mesa
  // no pertenece a ninguna comisión. Si está activo, los bloques políticos
  // se ocultan en vez de mostrarse vacíos.
  const filtroComisionActivo = bodyFilter.size > 0;

  // Una misma persona puede tener el mismo rol en varios órganos: Metsola
  // preside el Parlamento, la Mesa y la Conferencia de Presidentes. Sin
  // agrupar, saldría tres veces como si fueran tres personas distintas.
  function agruparPorPersona(lista) {
    const mapa = new Map();
    for (const g of lista) {
      const k = g.mep_id;
      if (!mapa.has(k)) mapa.set(k, { ...g, organos: [] });
      if (g.body_name) mapa.get(k).organos.push({ code: g.body_code, name: g.body_name });
    }
    return [...mapa.values()];
  }

  const porRol = (rol) =>
    filtroComisionActivo ? [] : agruparPorPersona(governance.filter((g) => g.role === rol && pasa(g, false)));

  const presidencia = porRol('PRESIDENT');
  const vicepresidencias = porRol('PRESIDENT_VICE');
  const cuestores = porRol('QUAESTOR');
  const otros = filtroComisionActivo
    ? []
    : agruparPorPersona(
        governance.filter((g) => !['PRESIDENT', 'PRESIDENT_VICE', 'QUAESTOR'].includes(g.role) && pasa(g, false))
      );

  const presidenciasComision = useMemo(
    () => soloPresidenciasComision.filter((c) => pasa(c, true)).sort((a, b) => (a.body_name || '').localeCompare(b.body_name || '')),
    [soloPresidenciasComision, countryFilter, groupFilter, bodyFilter, search]
  );

  const totalMostrado =
    presidencia.length + vicepresidencias.length + cuestores.length + otros.length + presidenciasComision.length;
  const activeCount = countryFilter.size + groupFilter.size + bodyFilter.size;

  const Persona = ({ p, mostrarOrgano }) => (
    <Link
      href={`/institutions/eu-parliament/${p.slug}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 0',
        borderBottom: '.5px solid #f0f0eb',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <Photo url={p.photo_url} name={p.full_name} size={30} radius={15} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.full_name}</div>
        <div style={{ fontSize: 11, color: '#999' }}>
          {p.political_group_code} · {countryName(p.country_code)}
        </div>
        {/* Cuando alguien preside varios órganos, se listan todos en vez de
            repetir la persona una vez por cada uno. */}
        {p.organos && p.organos.length > 1 && (
          <div style={{ fontSize: 10.5, color: '#3C3489', marginTop: 3 }}>
            {p.organos.map((o) => o.name).join(' · ')}
          </div>
        )}
      </div>
      {mostrarOrgano && p.body_code && (
        <span
          style={{
            fontSize: 10,
            background: '#EEEDFE',
            color: '#3C3489',
            padding: '2px 8px',
            borderRadius: 10,
            whiteSpace: 'nowrap',
          }}
        >
          {p.body_code}
        </span>
      )}
    </Link>
  );

  const Bloque = ({ titulo, lista, mostrarOrgano }) =>
    lista.length === 0 ? null : (
      <div className="card" style={{ padding: 18, marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: '#999',
            textTransform: 'uppercase',
            letterSpacing: '.3px',
            marginBottom: 12,
          }}
        >
          {titulo} · {lista.length}
        </div>
        <div>
          {lista.map((p, i) => (
            <div key={`${p.mep_id}-${p.body_code || i}`} style={i === lista.length - 1 ? { borderBottom: 'none' } : undefined}>
              <Persona p={p} mostrarOrgano={mostrarOrgano} />
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <>
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
            placeholder="Buscar por nombre u órgano..."
            aria-label="Buscar cargo"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <MultiSelectFilter label="País" values={countryOptions} selected={countryFilter} onApply={setCountryFilter} />
        <MultiSelectFilter label="Grupo" values={groupOptions} selected={groupFilter} onApply={setGroupFilter} />
        <MultiSelectFilter label="Comisión" values={bodyOptions} selected={bodyFilter} onApply={setBodyFilter} />
      </div>

      {(activeCount > 0 || search) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...countryFilter].map((v) => (
            <span key={`c${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {countryName(v)}
            </span>
          ))}
          {[...groupFilter].map((v) => (
            <span key={`g${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          {[...bodyFilter].map((v) => (
            <span key={`b${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          <span style={{ fontSize: 11, color: '#888' }}>{totalMostrado} cargos</span>
          <span
            onClick={() => {
              setSearch('');
              setCountryFilter(new Set());
              setGroupFilter(new Set());
              setBodyFilter(new Set());
            }}
            style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Limpiar filtros
          </span>
        </div>
      )}

      {filtroComisionActivo && (
        <div style={{ fontSize: 11.5, color: '#888', marginBottom: 12 }}>
          Con el filtro de comisión activo solo se muestran presidencias de comisión: la Mesa y los cuestores no
          pertenecen a ninguna.
        </div>
      )}

      {totalMostrado === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-users-off"></i>
            No hay cargos que encajen con estos filtros.
          </div>
        </div>
      ) : (
        <>
          <Bloque titulo="Presidencia del Parlamento" lista={presidencia} />
          <Bloque titulo="Vicepresidencias" lista={vicepresidencias} />
          <Bloque titulo="Cuestores" lista={cuestores} />
          <Bloque titulo="Presidencias de comisión" lista={presidenciasComision} mostrarOrgano />
          <Bloque titulo="Otros cargos" lista={otros} mostrarOrgano />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */
export default function EuParliamentPage() {
  const supabase = createClient();
  const [tab, setTab] = useState('meps');
  const [meps, setMeps] = useState(null);
  const [committees, setCommittees] = useState([]);
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [governance, setGovernance] = useState([]);
  const [chairs, setChairs] = useState([]);

  useEffect(() => {
    Promise.all([
      supabase.from('eu_meps_directory').select('*').order('full_name'),
      supabase.from('eu_committees_directory').select('*'),
      supabase.from('eu_committee_members').select('*'),
      supabase.from('eu_groups_directory').select('*'),
      supabase.from('eu_ep_governance').select('*').order('rank_order'),
      supabase.from('eu_committee_chairs').select('*').order('rank_order'),
    ]).then(([m, c, mm, g, gov, ch]) => {
      setMeps(m.data || []);
      setCommittees(c.data || []);
      setMembers(mm.data || []);
      setGroups(g.data || []);
      setGovernance(gov.data || []);
      setChairs(ch.data || []);
    });
  }, []);

  const tabs = [
    { id: 'meps', label: 'Eurodiputados' },
    { id: 'committees', label: 'Comisiones' },
    { id: 'groups', label: 'Grupos políticos' },
    { id: 'gobierno', label: 'Órganos de gobierno' },
  ];

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
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
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Parlamento Europeo</h1>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {meps ? `${meps.length} eurodiputados` : '—'} · 10ª legislatura
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14 }}>
        {tabs.map((t) => (
          <span
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontSize: 13,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#1d6f5c' : '#999',
              borderBottom: tab === t.id ? '2px solid #1d6f5c' : '2px solid transparent',
              paddingBottom: 8,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {meps === null ? (
        <div className="spinner"></div>
      ) : tab === 'meps' ? (
        <MepsTab meps={meps} />
      ) : tab === 'committees' ? (
        <ComisionesEuTab />
      ) : tab === 'groups' ? (
        <GroupsTab groups={groups} />
      ) : (
        <GobiernoTab governance={governance} chairs={chairs} />
      )}
    </div>
  );
}
