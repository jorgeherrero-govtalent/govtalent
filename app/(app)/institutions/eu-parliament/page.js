'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';

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
        <MultiSelectFilter label="Comisión" values={committeeOptions} selected={committeeFilter} onApply={setCommitteeFilter} />
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
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña 2 — Comisiones                                              */
/* ------------------------------------------------------------------ */
function CommitteeRow({ committee, members, onlySpanish, chairs }) {
  // La presidencia de la comisión viene de eu_committee_chairs: es el dato
  // que más se busca y hasta ahora no se mostraba en ningún sitio.
  const presidencia = (chairs || []).find((c) => c.body_code === committee.code && c.role === 'CHAIR');
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    let l = members.filter((m) => m.body_id === committee.id);
    if (onlySpanish) l = l.filter((m) => m.country_code === 'ES');
    return l.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'MEMBER' ? -1 : 1;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [members, committee.id, onlySpanish]);

  return (
    <div className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: '#EEEDFE',
              color: '#3C3489',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {committee.code}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{committee.name}</div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>
              {committee.titulares} titulares · {committee.suplentes} suplentes · {committee.espanoles} españoles
            </div>
            {presidencia && (
              <div style={{ fontSize: 11, color: '#3C3489', marginTop: 3 }}>
                <i className="ti ti-user-star" style={{ fontSize: 12, verticalAlign: -1 }}></i>{' '}
                Preside {presidencia.full_name}
              </div>
            )}
          </div>
        </div>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ color: open ? '#1d6f5c' : '#999', fontSize: 16 }}></i>
      </div>

      {open && (
        <div style={{ borderTop: '.5px solid #f0f0eb', marginTop: 12, paddingTop: 11 }}>
          {list.length === 0 ? (
            <div style={{ fontSize: 12, color: '#aaa' }}>Sin miembros con este filtro.</div>
          ) : (
            list.map((m) => (
              <Link
                key={`${m.mep_id}-${m.role}`}
                href={`/institutions/eu-parliament/${m.slug}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', textDecoration: 'none', color: 'inherit' }}
              >
                <Photo url={m.photo_url} name={m.full_name} size={30} radius={15} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.full_name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {m.national_party ? `${m.national_party} · ` : ''}
                    {m.political_group_code} · {countryName(m.country_code)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10.5,
                    padding: '3px 9px',
                    borderRadius: 12,
                    background: m.role === 'MEMBER' ? '#E1F5EE' : '#F1EFE8',
                    color: m.role === 'MEMBER' ? '#0F6E56' : '#5F5E5A',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.role === 'MEMBER' ? 'Titular' : 'Suplente'}
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CommitteesTab({ committees, members, chairs }) {
  const [search, setSearch] = useState('');
  const [onlySpanish, setOnlySpanish] = useState(false);

  const filtered = useMemo(() => {
    let l = committees;
    if (search) {
      const q = normalize(search);
      l = l.filter((c) => normalize(c.name).includes(q) || normalize(c.code).includes(q));
    }
    if (onlySpanish) l = l.filter((c) => c.espanoles > 0);
    return [...l].sort((a, b) => a.name.localeCompare(b.name));
  }, [committees, search, onlySpanish]);

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
            placeholder="Buscar comisión..."
            aria-label="Buscar comisión"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <span
          onClick={() => setOnlySpanish((v) => !v)}
          style={{
            background: onlySpanish ? '#e8f4f0' : '#fff',
            border: `.5px solid ${onlySpanish ? '#1d6f5c' : '#e0dfd8'}`,
            color: onlySpanish ? '#1d6f5c' : '#555',
            borderRadius: 20,
            padding: '7px 12px',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Solo españoles {onlySpanish && <i className="ti ti-x" style={{ fontSize: 11 }}></i>}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-search-off"></i>
            No hay comisiones con esa búsqueda.
          </div>
        </div>
      ) : (
        filtered.map((c) => (
          <CommitteeRow key={c.id} committee={c} members={members} onlySpanish={onlySpanish} chairs={chairs} />
        ))
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
  const presidencia = governance.filter((g) => g.role === 'PRESIDENT');
  const vicepresidencias = governance.filter((g) => g.role === 'PRESIDENT_VICE');
  const cuestores = governance.filter((g) => g.role === 'QUAESTOR');
  const otros = governance.filter(
    (g) => !['PRESIDENT', 'PRESIDENT_VICE', 'QUAESTOR'].includes(g.role)
  );

  // Solo presidencias de comisión y subcomisión: las de delegación son
  // muchas y desdibujan lo que importa.
  const presidenciasComision = useMemo(
    () =>
      chairs
        .filter((c) => c.role === 'CHAIR' && ['committee', 'subcommittee'].includes(c.body_type))
        .sort((a, b) => (a.body_name || '').localeCompare(b.body_name || '')),
    [chairs]
  );

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
          {mostrarOrgano && p.body_name ? `${p.body_name} · ` : ''}
          {p.political_group_code} · {countryName(p.country_code)}
        </div>
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

  if (governance.length === 0 && presidenciasComision.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <i className="ti ti-users-off"></i>
          No hay cargos de gobierno registrados.
        </div>
      </div>
    );
  }

  return (
    <>
      <Bloque titulo="Presidencia del Parlamento" lista={presidencia} />
      <Bloque titulo="Vicepresidencias" lista={vicepresidencias} />
      <Bloque titulo="Cuestores" lista={cuestores} />
      <Bloque titulo="Presidencias de comisión" lista={presidenciasComision} mostrarOrgano />
      <Bloque titulo="Otros cargos" lista={otros} mostrarOrgano />
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
        <CommitteesTab committees={committees} members={members} chairs={chairs} />
      ) : tab === 'groups' ? (
        <GroupsTab groups={groups} />
      ) : (
        <GobiernoTab governance={governance} chairs={chairs} />
      )}
    </div>
  );
}
