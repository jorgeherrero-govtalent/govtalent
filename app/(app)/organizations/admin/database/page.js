'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import FilterableHeader from '@/components/FilterableHeader';
import SimpleBarChart from '@/components/SimpleBarChart';
import { hasInterestGroupBadge } from '@/lib/interestGroupBadge';

const TYPE_LABELS = {
  empresa: 'Empresa',
  consultora_public_affairs: 'Consultora',
  tercer_sector_ong: 'ONG / Tercer sector',
  partido_politico: 'Partido político',
  institucion_publica: 'Institución pública',
  think_tank_fundacion: 'Think tank',
  medios_comunicacion: 'Medios',
  universidad_centro_educativo: 'Centro educativo',
  asociacion_profesional: 'Asociación profesional',
  otro: 'Otro',
};

const SIZE_LABELS = {
  '1-10': '1-10 empleados',
  '11-50': '11-50 empleados',
  '50-200': '50-200 empleados',
  '200-1000': '200-1000 empleados',
  '+1000': '+1000 empleados',
};
const SIZE_ORDER = ['1-10', '11-50', '50-200', '200-1000', '+1000'];

const QUICK_FILTERS = {
  todas: () => true,
  verificadas: (o) => o.verified,
  grupo_interes: (o) => hasInterestGroupBadge(o),
};

const PAGE_SIZE = 25;

export default function OrganizationsDatabasePage() {
  const supabase = createClient();
  const [orgs, setOrgs] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('tabla'); // 'tabla' | 'analisis'
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState('todas');
  const [typeFilter, setTypeFilter] = useState(new Set());
  const [sectorFilter, setSectorFilter] = useState(new Set());
  const [locationFilter, setLocationFilter] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' });
  const [openPopover, setOpenPopover] = useState(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [search, quickFilter, typeFilter, sectorFilter, locationFilter]);

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
    return [...seen].sort((a, b) => a.localeCompare(b, 'es')).map((s) => ({ value: s, label: s }));
  }, [orgs]);

  const locationValues = useMemo(() => {
    const seen = new Set((orgs || []).map((o) => o.location).filter(Boolean));
    return [...seen].sort((a, b) => a.localeCompare(b, 'es')).map((l) => ({ value: l, label: l }));
  }, [orgs]);

  const filtered = useMemo(() => {
    if (!orgs) return [];
    const q = search.trim().toLowerCase();
    let list = (orgs || [])
      .filter(QUICK_FILTERS[quickFilter] || QUICK_FILTERS.todas)
      .filter((o) => typeFilter.size === 0 || typeFilter.has(o.org_type))
      .filter((o) => sectorFilter.size === 0 || sectorFilter.has(o.sector || ''))
      .filter((o) => locationFilter.size === 0 || locationFilter.has(o.location || ''))
      .filter((o) => !q || o.name.toLowerCase().includes(q) || (o.location || '').toLowerCase().includes(q) || (o.sector || '').toLowerCase().includes(q));

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
  }, [orgs, search, quickFilter, typeFilter, sectorFilter, locationFilter, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // --- Datos para el panel de análisis (BI) ---
  const analytics = useMemo(() => {
    const list = orgs || [];
    const byType = {};
    const byLocation = {};
    const bySize = {};
    let interestGroupCount = 0;

    for (const o of list) {
      if (o.org_type) byType[o.org_type] = (byType[o.org_type] || 0) + 1;
      if (o.location) byLocation[o.location] = (byLocation[o.location] || 0) + 1;
      const sizeKey = o.size_range || 'sin_especificar';
      bySize[sizeKey] = (bySize[sizeKey] || 0) + 1;
      if (hasInterestGroupBadge(o)) interestGroupCount++;
    }

    const typeData = Object.entries(byType)
      .map(([key, value]) => ({ label: TYPE_LABELS[key] || key, value }))
      .sort((a, b) => b.value - a.value);

    const locationData = Object.entries(byLocation)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const sizeData = [...SIZE_ORDER, 'sin_especificar']
      .filter((k) => bySize[k])
      .map((k) => ({ label: k === 'sin_especificar' ? 'Sin especificar' : SIZE_LABELS[k], value: bySize[k] }));

    return {
      total: list.length,
      typeData,
      locationData,
      sizeData,
      interestGroupCount,
      interestGroupPct: list.length ? Math.round((interestGroupCount / list.length) * 100) : 0,
    };
  }, [orgs]);

  if (orgs === null) return <div className="spinner"></div>;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Base de datos de organizaciones</h1>
          <p style={{ fontSize: 12.5, color: '#888', margin: '4px 0 0' }}>
            Explora y filtra las {orgs.length} organizaciones del sector, con análisis agregado por tipo, ubicación y tamaño.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#f4f4f0', borderRadius: 9, padding: 3 }}>
          <button
            type="button"
            onClick={() => setView('tabla')}
            style={{
              padding: '7px 14px',
              borderRadius: 7,
              border: 'none',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: view === 'tabla' ? '#fff' : 'transparent',
              color: view === 'tabla' ? '#1d6f5c' : '#888',
              boxShadow: view === 'tabla' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
            }}
          >
            <i className="ti ti-table" style={{ marginRight: 5 }}></i> Tabla
          </button>
          <button
            type="button"
            onClick={() => setView('analisis')}
            style={{
              padding: '7px 14px',
              borderRadius: 7,
              border: 'none',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: view === 'analisis' ? '#fff' : 'transparent',
              color: view === 'analisis' ? '#1d6f5c' : '#888',
              boxShadow: view === 'analisis' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
            }}
          >
            <i className="ti ti-chart-bar" style={{ marginRight: 5 }}></i> Análisis
          </button>
        </div>
      </div>

      {loadError && (
        <div className="err-msg" style={{ marginBottom: 14 }}>
          No se pudieron cargar las organizaciones: {loadError}
        </div>
      )}

      {view === 'analisis' ? (
        analytics && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1d6f5c' }}>{analytics.total}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Organizaciones totales</div>
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#6d5aef' }}>
                  {analytics.interestGroupCount}
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#999' }}> ({analytics.interestGroupPct}%)</span>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Registradas como grupo de interés</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
              <SimpleBarChart title="Por tipo de organización" data={analytics.typeData} />
              <SimpleBarChart title="Por ubicación (top 10)" data={analytics.locationData} color="#6d5aef" />
              <SimpleBarChart title="Por tamaño (empleados)" data={analytics.sizeData} color="#c9902e" />
            </div>
          </div>
        )
      ) : (
        <>
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

          <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, overflow: 'auto' }}>
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
                  <th style={{ padding: '10px 14px', fontWeight: 700, color: '#666', fontSize: 11, textTransform: 'uppercase' }}>Empleados</th>
                  <th style={{ padding: '10px 14px' }}></th>
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
                    <td style={{ padding: '9px 14px', color: '#555' }}>{o.sector || '—'}</td>
                    <td style={{ padding: '9px 14px', color: '#555' }}>{o.size_range || '—'}</td>
                    <td style={{ padding: '9px 14px' }}>
                      {o.slug && (
                        <Link href={`/organizations/${o.slug}`} style={{ color: '#1d6f5c' }}>
                          Ver <i className="ti ti-chevron-right" style={{ fontSize: 11 }}></i>
                        </Link>
                      )}
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

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={{ padding: '6px 12px', borderRadius: 7, border: '.5px solid #e0dfd8', background: '#fff', fontSize: 12.5, opacity: page === 0 ? 0.4 : 1 }}
              >
                <i className="ti ti-chevron-left"></i>
              </button>
              <span style={{ fontSize: 12.5, color: '#666' }}>
                Página {page + 1} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                style={{ padding: '6px 12px', borderRadius: 7, border: '.5px solid #e0dfd8', background: '#fff', fontSize: 12.5, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
              >
                <i className="ti ti-chevron-right"></i>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
