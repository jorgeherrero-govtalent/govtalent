'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import FilterableHeader from '@/components/FilterableHeader';
import { hasInterestGroupBadge } from '@/lib/interestGroupBadge';
import { canAccessDatabase } from '@/lib/plan';
import { normalizeUrl } from '@/lib/normalizeUrl';
import { TYPE_LABELS, SECTOR_LABELS } from '@/lib/orgTaxonomy';

const QUICK_FILTERS = {
  todas: () => true,
  verificadas: (o) => o.verified,
  grupo_interes: (o) => hasInterestGroupBadge(o),
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function BarRow({ label, count, max, color = '#1d6f5c' }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div
        style={{
          flex: '0 0 108px',
          fontSize: 12.5,
          color: '#57564f',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, height: 4, background: '#f0efe9', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .4s ease' }}></div>
      </div>
      <div style={{ flex: '0 0 26px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: '#15140f', fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </div>
    </div>
  );
}

function StatCard({ value, label }) {
  return (
    <div style={{ flex: '1 1 150px', padding: '20px 22px', background: '#fff', border: '1px solid #eceae2', borderRadius: 14 }}>
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          color: '#15140f',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: '#8a897f', marginTop: 9, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

export default function OrganizationsDatabasePage() {
  const supabase = createClient();
  const [orgs, setOrgs] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState('todas');
  const [typeFilter, setTypeFilter] = useState(new Set());
  const [sectorFilter, setSectorFilter] = useState(new Set());
  const [locationFilter, setLocationFilter] = useState(new Set());
  const [sizeFilter, setSizeFilter] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' });
  const [openPopover, setOpenPopover] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [planChecked, setPlanChecked] = useState(false);
  const [planAllowed, setPlanAllowed] = useState(true);
  const [showBI, setShowBI] = useState(false);

  useEffect(() => {
    checkPlan();
  }, []);

  async function checkPlan() {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setPlanChecked(true);
      return;
    }
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(plan, plan_status, trial_ends_at, trial_ai_matches_used, is_founding_member)')
      .eq('user_id', authData.user.id)
      .limit(1)
      .maybeSingle();
    const org = membership?.organizations;
    setPlanAllowed(org ? canAccessDatabase(org) : false);
    setPlanChecked(true);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [search, quickFilter, typeFilter, sectorFilter, locationFilter, sizeFilter, pageSize]);

  async function load() {
    const { data, error } = await supabase
      .from('organizations')
      .select(
        'id, name, slug, org_type, sector, location, size_range, verified, interest_group_registered, interest_group_registry_number, interest_group_registered_at, website_url, linkedin_url, logo_url, created_at'
      )
      .order('name')
      .limit(5000);

    if (error) {
      setLoadError(error.message);
      setOrgs([]);
      return;
    }
    setOrgs(data || []);
  }

  const typeValues = useMemo(() => {
    const seen = new Set((orgs || []).map((o) => o.org_type).filter(Boolean));
    return [...seen].sort().map((t) => ({ value: t, label: TYPE_LABELS[t] || t }));
  }, [orgs]);

  const sectorValues = useMemo(() => {
    const seen = new Set((orgs || []).map((o) => o.sector).filter(Boolean));
    return [...seen]
      .sort((a, b) => (SECTOR_LABELS[a] || a).localeCompare(SECTOR_LABELS[b] || b, 'es'))
      .map((s) => ({ value: s, label: SECTOR_LABELS[s] || s }));
  }, [orgs]);

  const locationValues = useMemo(() => {
    const seen = new Set((orgs || []).map((o) => o.location).filter(Boolean));
    return [...seen].sort((a, b) => a.localeCompare(b, 'es')).map((l) => ({ value: l, label: l }));
  }, [orgs]);

  const sizeValues = useMemo(() => {
    const seen = new Set((orgs || []).map((o) => o.size_range).filter(Boolean));
    return [...seen].sort((a, b) => a.localeCompare(b, 'es')).map((s) => ({ value: s, label: s }));
  }, [orgs]);

  const filtered = useMemo(() => {
    if (!orgs) return [];
    const q = search.trim().toLowerCase();
    let list = (orgs || [])
      .filter(QUICK_FILTERS[quickFilter] || QUICK_FILTERS.todas)
      .filter((o) => typeFilter.size === 0 || typeFilter.has(o.org_type))
      .filter((o) => sectorFilter.size === 0 || sectorFilter.has(o.sector || ''))
      .filter((o) => locationFilter.size === 0 || locationFilter.has(o.location || ''))
      .filter((o) => sizeFilter.size === 0 || sizeFilter.has(o.size_range || ''))
      .filter((o) => !q || o.name.toLowerCase().includes(q) || (o.location || '').toLowerCase().includes(q) || (SECTOR_LABELS[o.sector] || '').toLowerCase().includes(q));

    if (sortConfig.key) {
      const getVal = (o) => {
        if (sortConfig.key === 'org_type') return TYPE_LABELS[o.org_type] || '';
        return o[sortConfig.key] || '';
      };
      list = [...list].sort((a, b) => {
        const cmp = String(getVal(a)).localeCompare(String(getVal(b)), 'es');
        return sortConfig.dir === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [orgs, search, quickFilter, typeFilter, sectorFilter, locationFilter, sizeFilter, sortConfig]);

  const biStats = useMemo(() => {
    const total = filtered.length;
    const sectoresDistintos = new Set(filtered.map((o) => o.sector).filter(Boolean)).size;
    const ciudadesDistintas = new Set(filtered.map((o) => o.location).filter(Boolean)).size;
    const grandesOrganizaciones = filtered.filter((o) => o.size_range === '+1000').length;

    const count = (getKey) => {
      const map = {};
      filtered.forEach((o) => {
        const k = getKey(o) || 'Sin especificar';
        map[k] = (map[k] || 0) + 1;
      });
      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    };

    return {
      total,
      sectoresDistintos,
      ciudadesDistintas,
      grandesOrganizaciones,
      topSectors: count((o) => SECTOR_LABELS[o.sector]),
      topLocations: count((o) => o.location),
      topTypes: count((o) => TYPE_LABELS[o.org_type] || o.org_type),
    };
  }, [filtered]);

  function handleExport() {
    const rows = filtered.map((o) => ({
      Organización: o.name,
      Tipo: TYPE_LABELS[o.org_type] || '',
      Ubicación: o.location || '',
      Sector: SECTOR_LABELS[o.sector] || '',
      Empleados: o.size_range || '',
      Verificada: o.verified ? 'Sí' : 'No',
      'Grupo de interés': hasInterestGroupBadge(o) ? 'Sí' : 'No',
      'Sitio web': o.website_url || '',
      LinkedIn: o.linkedin_url || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 28 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Directorio');
    XLSX.writeFile(wb, `directorio-govtalent-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = filtered.length === 0 ? 0 : currentPage * pageSize + 1;
  const pageEnd = Math.min(filtered.length, (currentPage + 1) * pageSize);
  const paginated = filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  if (orgs === null || !planChecked) return <div className="spinner"></div>;

  if (!planAllowed) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '48px auto', padding: 32, textAlign: 'center' }}>
        <i className="ti ti-lock" style={{ fontSize: 30, color: '#6d5aef', marginBottom: 10 }}></i>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: '#1a1a18' }}>
          Directorio inteligente de organizaciones — plan Pro
        </div>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 18 }}>
          Consulta, filtra y exporta el directorio completo de organizaciones del sector. Disponible en el plan Pro.
        </p>
        <Link href="/precios" target="_blank" className="btn-p" style={{ textDecoration: 'none' }}>
          Ver planes
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Directorio inteligente de organizaciones</h1>
          <p style={{ fontSize: 12.5, color: '#888', margin: '4px 0 0' }}>Explora y filtra las {orgs.length} organizaciones del sector.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleExport}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '.5px solid #e0dfd8',
              background: '#fff',
              color: '#3a3a36',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <i className="ti ti-file-spreadsheet"></i> Exportar ({filtered.length})
          </button>
          <button
            onClick={() => setShowBI((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: showBI ? '1px solid #15140f' : '1px solid #e0dfd8',
              background: showBI ? '#15140f' : '#fff',
              color: showBI ? '#fff' : '#3a3a36',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <i className="ti ti-chart-bar"></i> GovTalent BI
          </button>
        </div>
      </div>

      {showBI && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatCard value={biStats.total.toLocaleString('es-ES')} label="Organizaciones con estos filtros" />
            <StatCard value={biStats.sectoresDistintos} label="Sectores representados" />
            <StatCard value={biStats.ciudadesDistintas} label="Ciudades distintas" />
            <StatCard value={biStats.grandesOrganizaciones} label="Grandes organizaciones (+1000 empleados)" />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: 0,
              background: '#fff',
              border: '1px solid #eceae2',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '20px 24px', borderRight: '1px solid #f0efe9' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', marginBottom: 14, letterSpacing: '.04em' }}>
                TOP SECTORES
              </div>
              {biStats.topSectors.map(([label, count]) => (
                <BarRow key={label} label={label} count={count} max={biStats.topSectors[0]?.[1] || 1} />
              ))}
            </div>
            <div style={{ padding: '20px 24px', borderRight: '1px solid #f0efe9' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', marginBottom: 14, letterSpacing: '.04em' }}>
                TOP UBICACIONES
              </div>
              {biStats.topLocations.map(([label, count]) => (
                <BarRow key={label} label={label} count={count} max={biStats.topLocations[0]?.[1] || 1} color="#6d5aef" />
              ))}
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', marginBottom: 14, letterSpacing: '.04em' }}>
                TOP TIPOS DE ORGANIZACIÓN
              </div>
              {biStats.topTypes.map(([label, count]) => (
                <BarRow key={label} label={label} count={count} max={biStats.topTypes[0]?.[1] || 1} color="#b8860b" />
              ))}
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="err-msg" style={{ marginBottom: 14 }}>
          No se pudieron cargar las organizaciones: {loadError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Buscar por nombre, sector o ubicación..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '.5px solid #e0dfd8', borderRadius: 8, fontSize: 13, outline: 'none' }}
        />
        {[
          ['todas', 'Todas'],
          ['verificadas', 'Verificadas'],
          ['grupo_interes', 'Grupo de interés'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setQuickFilter(key)}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '.5px solid #e0dfd8',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: quickFilter === key ? '#f0f8f5' : '#fff',
              color: quickFilter === key ? '#1d6f5c' : '#666',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>{filtered.length} resultados</div>

      <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: '#faf9f5', textAlign: 'left' }}>
              <th style={{ padding: '10px 14px' }}>
                <FilterableHeader
                  label="Organización"
                  columnKey="name"
                  values={[]}
                  selected={new Set()}
                  onApply={() => {}}
                  sortConfig={sortConfig}
                  onSort={(key, dir) => setSortConfig({ key, dir })}
                  isOpen={openPopover === 'name'}
                  onToggle={() => setOpenPopover(openPopover === 'name' ? null : 'name')}
                  onClose={() => setOpenPopover(null)}
                />
              </th>
              <th style={{ padding: '10px 14px' }}>
                <FilterableHeader
                  label="Tipo"
                  columnKey="org_type"
                  values={typeValues}
                  selected={typeFilter}
                  onApply={setTypeFilter}
                  sortConfig={sortConfig}
                  onSort={(key, dir) => setSortConfig({ key, dir })}
                  isOpen={openPopover === 'org_type'}
                  onToggle={() => setOpenPopover(openPopover === 'org_type' ? null : 'org_type')}
                  onClose={() => setOpenPopover(null)}
                />
              </th>
              <th style={{ padding: '10px 14px' }}>
                <FilterableHeader
                  label="Ubicación"
                  columnKey="location"
                  values={locationValues}
                  selected={locationFilter}
                  onApply={setLocationFilter}
                  sortConfig={sortConfig}
                  onSort={(key, dir) => setSortConfig({ key, dir })}
                  isOpen={openPopover === 'location'}
                  onToggle={() => setOpenPopover(openPopover === 'location' ? null : 'location')}
                  onClose={() => setOpenPopover(null)}
                />
              </th>
              <th style={{ padding: '10px 14px' }}>
                <FilterableHeader
                  label="Sector"
                  columnKey="sector"
                  values={sectorValues}
                  selected={sectorFilter}
                  onApply={setSectorFilter}
                  sortConfig={sortConfig}
                  onSort={(key, dir) => setSortConfig({ key, dir })}
                  isOpen={openPopover === 'sector'}
                  onToggle={() => setOpenPopover(openPopover === 'sector' ? null : 'sector')}
                  onClose={() => setOpenPopover(null)}
                />
              </th>
              <th style={{ padding: '10px 14px' }}>
                <FilterableHeader
                  label="Empleados"
                  columnKey="size_range"
                  values={sizeValues}
                  selected={sizeFilter}
                  onApply={setSizeFilter}
                  sortConfig={sortConfig}
                  onSort={(key, dir) => setSortConfig({ key, dir })}
                  isOpen={openPopover === 'size_range'}
                  onToggle={() => setOpenPopover(openPopover === 'size_range' ? null : 'size_range')}
                  onClose={() => setOpenPopover(null)}
                />
              </th>
              <th style={{ padding: '10px 14px', fontWeight: 700, color: '#666', fontSize: 11, textTransform: 'uppercase' }}>Enlaces</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((o) => (
              <tr key={o.id} style={{ borderTop: '.5px solid #e0dfd8' }}>
                <td style={{ padding: '9px 14px', fontWeight: 600 }}>
                  {o.name}
                  {o.verified && <i className="ti ti-circle-check-filled" style={{ color: '#1d9d63', marginLeft: 5, fontSize: 13 }}></i>}
                  {hasInterestGroupBadge(o) && <i className="ti ti-shield-check" style={{ color: '#6d5aef', marginLeft: 4, fontSize: 13 }}></i>}
                </td>
                <td style={{ padding: '9px 14px', color: '#555' }}>{TYPE_LABELS[o.org_type] || '—'}</td>
                <td style={{ padding: '9px 14px', color: '#555' }}>{o.location || '—'}</td>
                <td style={{ padding: '9px 14px', color: '#555' }}>{SECTOR_LABELS[o.sector] || '—'}</td>
                <td style={{ padding: '9px 14px', color: '#555' }}>{o.size_range || '—'}</td>
                <td style={{ padding: '9px 14px' }}>
                  <div className="dir-row-links">
                    {o.website_url && (
                      <a href={normalizeUrl(o.website_url)} target="_blank" rel="noreferrer" title="Sitio web">
                        <i className="ti ti-world"></i>
                      </a>
                    )}
                    {o.linkedin_url && (
                      <a href={o.linkedin_url} target="_blank" rel="noreferrer" title="LinkedIn">
                        <i className="ti ti-brand-linkedin"></i>
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#999' }}>
                  No hay organizaciones que coincidan con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderTop: 'none',
          background: '#fff',
          border: '.5px solid #e0dfd8',
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          marginTop: -1,
          fontSize: 12.5,
          color: '#888',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Mostrar
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            style={{ border: '.5px solid #e0dfd8', borderRadius: 7, padding: '4px 8px', fontSize: 12.5 }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>
            Mostrando {pageStart}-{pageEnd} de {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                border: '.5px solid #e0dfd8',
                background: '#fff',
                color: currentPage === 0 ? '#ccc' : '#555',
                cursor: currentPage === 0 ? 'default' : 'pointer',
              }}
            >
              <i className="ti ti-chevron-left" style={{ fontSize: 13 }}></i>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                border: '.5px solid #e0dfd8',
                background: '#fff',
                color: currentPage >= totalPages - 1 ? '#ccc' : '#555',
                cursor: currentPage >= totalPages - 1 ? 'default' : 'pointer',
              }}
            >
              <i className="ti ti-chevron-right" style={{ fontSize: 13 }}></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
