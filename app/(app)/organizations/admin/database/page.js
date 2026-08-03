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

const DONUT_COLORS = ['#1d6f5c', '#6d5aef', '#b8860b', '#c2534e', '#3a8fb7', '#a3a297'];

function DonutChart({ data }) {
  const total = data.reduce((s, [, c]) => s + c, 0);
  const size = 118;
  const strokeWidth = 17;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f0efe9" strokeWidth={strokeWidth} />
        {data.map(([label, count], i) => {
          if (count === 0) return null;
          const frac = total > 0 ? count / total : 0;
          const dash = frac * circumference;
          const el = (
            <circle
              key={label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-cumulative}
            />
          );
          cumulative += dash;
          return el;
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {data.map(([label, count], i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span
              style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }}
            ></span>
            <span style={{ color: '#57564f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
              {label}
            </span>
            <span style={{ fontWeight: 700, color: '#15140f', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {total > 0 ? Math.round((count / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
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
  const [patronalFilter, setPatronalFilter] = useState(new Set());
  const [aiQuery, setAiQuery] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [aiError, setAiError] = useState('');
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
  }, [search, quickFilter, typeFilter, sectorFilter, locationFilter, sizeFilter, patronalFilter, pageSize]);

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

    const { data: affData } = await supabase.from('organization_affiliations').select('organization_id, patronal_id').limit(5000);
    const nameById = new Map((data || []).map((o) => [o.id, o.name]));
    const patronalesByOrg = new Map();
    (affData || []).forEach((a) => {
      const patronalName = nameById.get(a.patronal_id);
      if (!patronalName) return;
      if (!patronalesByOrg.has(a.organization_id)) patronalesByOrg.set(a.organization_id, []);
      patronalesByOrg.get(a.organization_id).push(patronalName);
    });

    setOrgs((data || []).map((o) => ({ ...o, patronales: patronalesByOrg.get(o.id) || [] })));
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

  const patronalValues = useMemo(() => {
    const seen = new Set((orgs || []).flatMap((o) => o.patronales || []));
    return [...seen].sort((a, b) => a.localeCompare(b, 'es')).map((p) => ({ value: p, label: p }));
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
      .filter((o) => patronalFilter.size === 0 || (o.patronales || []).some((p) => patronalFilter.has(p)))
      .filter((o) => !q || o.name.toLowerCase().includes(q) || (o.location || '').toLowerCase().includes(q) || (SECTOR_LABELS[o.sector] || '').toLowerCase().includes(q));

    if (sortConfig.key) {
      const getVal = (o) => {
        if (sortConfig.key === 'org_type') return TYPE_LABELS[o.org_type] || '';
        if (sortConfig.key === 'patronales') return (o.patronales || []).join(', ');
        return o[sortConfig.key] || '';
      };
      list = [...list].sort((a, b) => {
        const cmp = String(getVal(a)).localeCompare(String(getVal(b)), 'es');
        return sortConfig.dir === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [orgs, search, quickFilter, typeFilter, sectorFilter, locationFilter, sizeFilter, patronalFilter, sortConfig]);

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

    const afiliadas = filtered.filter((o) => (o.patronales || []).length > 0).length;

    const topTypesRaw = count((o) => TYPE_LABELS[o.org_type] || o.org_type);
    const topTypesSum = topTypesRaw.reduce((s, [, c]) => s + c, 0);
    const otrosTypes = total - topTypesSum;
    const topTypes = otrosTypes > 0 ? [...topTypesRaw, ['Otros', otrosTypes]] : topTypesRaw;

    const patronalCounts = {};
    filtered.forEach((o) => {
      (o.patronales || []).forEach((p) => {
        patronalCounts[p] = (patronalCounts[p] || 0) + 1;
      });
    });
    const topPatronales = Object.entries(patronalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      total,
      sectoresDistintos,
      ciudadesDistintas,
      grandesOrganizaciones,
      afiliadas,
      topSectors: count((o) => SECTOR_LABELS[o.sector]),
      topLocations: count((o) => o.location),
      topTypes,
      topPatronales,
    };
  }, [filtered]);

  function handleExport() {
    const rows = filtered.map((o) => ({
      Organización: o.name,
      Tipo: TYPE_LABELS[o.org_type] || '',
      Ubicación: o.location || '',
      Sector: SECTOR_LABELS[o.sector] || '',
      Empleados: o.size_range || '',
      'Afiliada a': (o.patronales || []).join(', '),
      Verificada: o.verified ? 'Sí' : 'No',
      'Grupo de interés': hasInterestGroupBadge(o) ? 'Sí' : 'No',
      'Sitio web': o.website_url || '',
      LinkedIn: o.linkedin_url || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 28 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Directorio');
    XLSX.writeFile(wb, `directorio-govtalent-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function runAiSearch() {
    if (!aiQuery.trim() || aiSearching) return;
    setAiSearching(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai/directory-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiQuery, patronales: patronalValues.map((p) => p.value) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || 'No se pudo interpretar la búsqueda.');
        return;
      }
      setTypeFilter(new Set(data.types || []));
      setSectorFilter(new Set(data.sectors || []));
      setSizeFilter(new Set(data.sizes || []));
      setPatronalFilter(data.patronal ? new Set([data.patronal]) : new Set());
      if (data.location) {
        const matches = locationValues
          .filter((l) => l.label.toLowerCase().includes(data.location.toLowerCase()))
          .map((l) => l.value);
        setLocationFilter(new Set(matches));
      } else {
        setLocationFilter(new Set());
      }
      setSearch(data.searchText || '');
    } catch (e) {
      setAiError('No se pudo conectar con el servicio de IA. Inténtalo de nuevo.');
    } finally {
      setAiSearching(false);
    }
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
              border: '1px solid #6d5aef',
              background: showBI ? '#6d5aef' : '#fff',
              color: showBI ? '#fff' : '#6d5aef',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <i className="ti ti-chart-bar"></i> GovTalent BI
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 20,
                background: showBI ? 'rgba(255,255,255,.22)' : '#f0edfe',
                color: showBI ? '#fff' : '#6d5aef',
              }}
            >
              Beta
            </span>
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
            <StatCard value={biStats.afiliadas} label="Afiliadas a alguna patronal" />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 0,
              background: '#fff',
              border: '1px solid #eceae2',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '20px 24px', borderRight: '1px solid #f0efe9', borderBottom: '1px solid #f0efe9' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', marginBottom: 14, letterSpacing: '.04em' }}>
                TOP SECTORES
              </div>
              {biStats.topSectors.map(([label, count]) => (
                <BarRow key={label} label={label} count={count} max={biStats.topSectors[0]?.[1] || 1} />
              ))}
            </div>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0efe9' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', marginBottom: 14, letterSpacing: '.04em' }}>
                TOP UBICACIONES
              </div>
              {biStats.topLocations.map(([label, count]) => (
                <BarRow key={label} label={label} count={count} max={biStats.topLocations[0]?.[1] || 1} color="#6d5aef" />
              ))}
            </div>
            <div style={{ padding: '20px 24px', borderRight: '1px solid #f0efe9' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', marginBottom: 16, letterSpacing: '.04em' }}>
                COMPOSICIÓN POR TIPO
              </div>
              <DonutChart data={biStats.topTypes} />
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', marginBottom: 14, letterSpacing: '.04em' }}>
                TOP PATRONALES
              </div>
              {biStats.topPatronales.length > 0 ? (
                biStats.topPatronales.map(([label, count]) => (
                  <BarRow key={label} label={label} count={count} max={biStats.topPatronales[0]?.[1] || 1} color="#c2534e" />
                ))
              ) : (
                <div style={{ fontSize: 12.5, color: '#a3a297' }}>Sin afiliaciones registradas con estos filtros.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="err-msg" style={{ marginBottom: 14 }}>
          No se pudieron cargar las organizaciones: {loadError}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative' }}>
          <i
            className="ti ti-sparkles"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#6d5aef', fontSize: 15 }}
          ></i>
          <input
            placeholder='Prueba: "asociaciones del sector energético en Madrid con más de 200 empleados"'
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runAiSearch()}
            disabled={aiSearching}
            style={{
              width: '100%',
              padding: '11px 90px 11px 38px',
              border: '1px solid #d9d2f9',
              borderRadius: 10,
              fontSize: 13.5,
              outline: 'none',
              background: '#faf9ff',
            }}
          />
          <button
            onClick={runAiSearch}
            disabled={aiSearching || !aiQuery.trim()}
            style={{
              position: 'absolute',
              right: 6,
              top: 6,
              bottom: 6,
              padding: '0 16px',
              borderRadius: 7,
              border: 'none',
              background: aiSearching || !aiQuery.trim() ? '#c9c1f7' : '#6d5aef',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: aiSearching || !aiQuery.trim() ? 'default' : 'pointer',
            }}
          >
            {aiSearching ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
          <span
            style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: '#f0edfe', color: '#6d5aef' }}
          >
            Beta
          </span>
          <span style={{ fontSize: 11.5, color: '#999' }}>Escribe lo que buscas en lenguaje natural y la IA aplica los filtros por ti.</span>
        </div>
        {aiError && <div style={{ fontSize: 12, color: '#a33', marginTop: 6 }}>{aiError}</div>}
      </div>

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
              <th style={{ padding: '10px 14px' }}>
                <FilterableHeader
                  label="Afiliaciones"
                  columnKey="patronales"
                  values={patronalValues}
                  selected={patronalFilter}
                  onApply={setPatronalFilter}
                  sortConfig={sortConfig}
                  onSort={(key, dir) => setSortConfig({ key, dir })}
                  isOpen={openPopover === 'patronales'}
                  onToggle={() => setOpenPopover(openPopover === 'patronales' ? null : 'patronales')}
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
                <td style={{ padding: '9px 14px', color: '#555' }}>
                  {(o.patronales || []).length > 0 ? (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {o.patronales.map((p) => (
                        <span
                          key={p}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 20,
                            background: '#f0edfe',
                            color: '#6d5aef',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
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
                <td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#999' }}>
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
