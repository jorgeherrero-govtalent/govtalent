'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

function Tip({ text, children }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const tipWidth = 210;

  function handleEnter() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - tipWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tipWidth - 8));
      setPos({ top: rect.top - 8, left });
    }
    setShow(true);
  }

  return (
    <div
      ref={ref}
      style={{ display: 'inline-flex', minWidth: 0, maxWidth: '100%' }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: 'translateY(-100%)',
              width: tipWidth,
              background: '#1a1a18',
              color: '#fff',
              fontSize: 11.5,
              fontWeight: 500,
              lineHeight: 1.4,
              padding: '8px 11px',
              borderRadius: 8,
              textAlign: 'center',
              zIndex: 200,
              boxShadow: '0 6px 16px rgba(0,0,0,.22)',
              pointerEvents: 'none',
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </div>
  );
}

function BarRow({ label, count, max, color = '#6d5aef' }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <Tip text={label}>
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
      </Tip>
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
    <div className="stat-card-hover" style={{ flex: '1 1 150px', padding: '20px 22px', background: '#fff', border: '1px solid #eceae2', borderRadius: 14, transition: 'border-color .15s' }}>
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

function RankList({ data, color = '#6d5aef' }) {
  return (
    <div>
      {data.map(([label, count], i) => (
        <div
          key={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '8px 0',
            borderBottom: i < data.length - 1 ? '1px solid #f5f4ee' : 'none',
          }}
        >
          <span style={{ width: 20, fontSize: 11, fontWeight: 700, color: '#c7c6bd', fontVariantNumeric: 'tabular-nums' }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <Tip text={label}>
            <span
              style={{
                flex: 1,
                fontSize: 12.5,
                color: '#3a3934',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          </Tip>
          <span style={{ fontSize: 12.5, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

function PatronalChips({ data }) {
  const max = data[0]?.[1] || 1;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {data.map(([label, count]) => {
        const intensity = count / max;
        return (
          <Tip key={label} text={label}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 11px',
                borderRadius: 20,
                background: `rgba(109,90,239,${(0.07 + intensity * 0.17).toFixed(2)})`,
                border: '1px solid rgba(109,90,239,.25)',
                maxWidth: '100%',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#15140f',
                  maxWidth: 170,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#6d5aef',
                  background: '#fff',
                  borderRadius: 20,
                  padding: '1px 7px',
                  flexShrink: 0,
                }}
              >
                {count}
              </span>
            </div>
          </Tip>
        );
      })}
    </div>
  );
}

const DONUT_COLORS = ['#6d5aef', '#9b8afb', '#c3b6fc', '#7c93f0', '#b8a9f5', '#d8d3f5'];

function DonutChart({ data }) {
  const total = data.reduce((s, [, c]) => s + c, 0);
  const size = 118;
  const strokeWidth = 17;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, color: '#15140f', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {total.toLocaleString('es-ES')}
          </div>
          <div style={{ fontSize: 9.5, color: '#a3a297', marginTop: 2, fontWeight: 600, letterSpacing: '.03em' }}>TOTAL</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {data.map(([label, count], i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span
              style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }}
            ></span>
            <Tip text={label}>
              <span style={{ color: '#57564f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                {label}
              </span>
            </Tip>
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
  const [searchMode, setSearchMode] = useState('kw');
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
  const [expandedPanel, setExpandedPanel] = useState(null);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportUsage, setExportUsage] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportRows, setExportRows] = useState([]);
  // Ids de organización marcadas con el checkbox — un Set plano en vez de
  // depender de `filtered`/`paginated`, así la selección sobrevive a
  // cambios de página o de filtros tal como pidió Jorge.
  const [selectedIds, setSelectedIds] = useState(new Set());

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
      .select('organizations(id, plan, plan_status, trial_ends_at, trial_ai_matches_used, is_founding_member)')
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
    const vals = [...seen].sort().map((t) => ({ value: t, label: TYPE_LABELS[t] || t }));
    if ((orgs || []).some((o) => !o.org_type)) vals.push({ value: '', label: '(Vacío)' });
    return vals;
  }, [orgs]);

  const sectorValues = useMemo(() => {
    const seen = new Set((orgs || []).map((o) => o.sector).filter(Boolean));
    const vals = [...seen]
      .sort((a, b) => (SECTOR_LABELS[a] || a).localeCompare(SECTOR_LABELS[b] || b, 'es'))
      .map((s) => ({ value: s, label: SECTOR_LABELS[s] || s }));
    if ((orgs || []).some((o) => !o.sector)) vals.push({ value: '', label: '(Vacío)' });
    return vals;
  }, [orgs]);

  const locationValues = useMemo(() => {
    const seen = new Set((orgs || []).map((o) => o.location).filter(Boolean));
    const vals = [...seen].sort((a, b) => a.localeCompare(b, 'es')).map((l) => ({ value: l, label: l }));
    if ((orgs || []).some((o) => !o.location)) vals.push({ value: '', label: '(Vacío)' });
    return vals;
  }, [orgs]);

  const sizeValues = useMemo(() => {
    const seen = new Set((orgs || []).map((o) => o.size_range).filter(Boolean));
    const vals = [...seen].sort((a, b) => a.localeCompare(b, 'es')).map((s) => ({ value: s, label: s }));
    if ((orgs || []).some((o) => !o.size_range)) vals.push({ value: '', label: '(Vacío)' });
    return vals;
  }, [orgs]);

  const patronalValues = useMemo(() => {
    const seen = new Set((orgs || []).flatMap((o) => o.patronales || []));
    const vals = [...seen].sort((a, b) => a.localeCompare(b, 'es')).map((p) => ({ value: p, label: p }));
    if ((orgs || []).some((o) => (o.patronales || []).length === 0)) vals.push({ value: '__EMPTY__', label: '(Vacío)' });
    return vals;
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
      .filter(
        (o) =>
          patronalFilter.size === 0 ||
          (patronalFilter.has('__EMPTY__') && (o.patronales || []).length === 0) ||
          (o.patronales || []).some((p) => patronalFilter.has(p))
      )
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

    const countAll = (getKey) => {
      const map = {};
      filtered.forEach((o) => {
        const k = getKey(o) || 'Sin especificar';
        map[k] = (map[k] || 0) + 1;
      });
      return Object.entries(map).sort((a, b) => b[1] - a[1]);
    };
    const count = (getKey) => countAll(getKey).slice(0, 5);

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
    const topPatronales = Object.entries(patronalCounts).sort((a, b) => b[1] - a[1]);

    return {
      total,
      sectoresDistintos,
      ciudadesDistintas,
      grandesOrganizaciones,
      afiliadas,
      topSectors: countAll((o) => SECTOR_LABELS[o.sector]),
      topLocations: countAll((o) => o.location),
      topTypes,
      topPatronales,
    };
  }, [filtered]);

  function handleExport(rows) {
    const data = rows.map((o) => ({
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
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 28 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Directorio');
    XLSX.writeFile(wb, `directorio-govtalent-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // rows: qué conjunto se va a exportar — `filtered` desde el botón de
  // arriba, o solo las organizaciones marcadas desde la barra flotante de
  // selección.
  async function openExportConfirm(rows) {
    setExportRows(rows);
    setExportError('');
    setShowExportConfirm(true);
    const res = await fetch('/api/organizations/database/export');
    if (res.ok) {
      const data = await res.json();
      setExportUsage(data);
    }
  }

  async function confirmExport() {
    setExportBusy(true);
    setExportError('');
    const res = await fetch('/api/organizations/database/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rowCount: exportRows.length,
        filters: {
          quickFilter,
          types: [...typeFilter],
          sectors: [...sectorFilter],
          locations: [...locationFilter],
          sizes: [...sizeFilter],
          patronales: [...patronalFilter],
          search: search || undefined,
          seleccionManual: selectedIds.size > 0,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setExportBusy(false);
    if (!res.ok) {
      setExportError(data.error || 'No se pudo completar la exportación');
      if (data.usedThisMonth !== undefined) setExportUsage({ usedThisMonth: data.usedThisMonth, limit: data.limit });
      return;
    }
    handleExport(exportRows);
    setExportUsage({ usedThisMonth: data.usedThisMonth, limit: data.limit });
    setShowExportConfirm(false);
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  // El checkbox de cabecera solo controla la página visible, no los cientos
  // de resultados filtrados — es lo que espera cualquiera acostumbrado a
  // Airtable/Notion/Clay.
  const allPageSelected = paginated.length > 0 && paginated.every((o) => selectedIds.has(o.id));
  function toggleSelectPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginated.forEach((o) => next.delete(o.id));
      } else {
        paginated.forEach((o) => next.add(o.id));
      }
      return next;
    });
  }
  const selectedOrgs = orgs ? orgs.filter((o) => selectedIds.has(o.id)) : [];

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
    <div style={{ padding: `24px 28px ${selectedIds.size > 0 ? 90 : 24}px`, maxWidth: 1280 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Directorio inteligente de organizaciones</h1>
          <p style={{ fontSize: 12.5, color: '#888', margin: '4px 0 0' }}>Explora y filtra las {orgs.length} organizaciones del sector.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => openExportConfirm(filtered)}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', letterSpacing: '.04em' }}>
                  TOP SECTORES <span style={{ color: '#d5d4c9' }}>· {biStats.topSectors.length}</span>
                </div>
                {biStats.topSectors.length > 5 && (
                  <button
                    onClick={() => setExpandedPanel(expandedPanel === 'sectores' ? null : 'sectores')}
                    style={{ background: 'none', border: 'none', color: '#6d5aef', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    {expandedPanel === 'sectores' ? 'Ver menos' : 'Ver todos'}
                  </button>
                )}
              </div>
              <div style={{ maxHeight: expandedPanel === 'sectores' ? 320 : 'none', overflowY: expandedPanel === 'sectores' ? 'auto' : 'visible' }}>
                {(expandedPanel === 'sectores' ? biStats.topSectors : biStats.topSectors.slice(0, 5)).map(([label, count]) => (
                  <BarRow key={label} label={label} count={count} max={biStats.topSectors[0]?.[1] || 1} />
                ))}
              </div>
            </div>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0efe9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', letterSpacing: '.04em' }}>
                  TOP UBICACIONES <span style={{ color: '#d5d4c9' }}>· {biStats.topLocations.length}</span>
                </div>
                {biStats.topLocations.length > 5 && (
                  <button
                    onClick={() => setExpandedPanel(expandedPanel === 'ubicaciones' ? null : 'ubicaciones')}
                    style={{ background: 'none', border: 'none', color: '#6d5aef', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    {expandedPanel === 'ubicaciones' ? 'Ver menos' : 'Ver todos'}
                  </button>
                )}
              </div>
              <div style={{ maxHeight: expandedPanel === 'ubicaciones' ? 320 : 'none', overflowY: expandedPanel === 'ubicaciones' ? 'auto' : 'visible' }}>
                <RankList data={expandedPanel === 'ubicaciones' ? biStats.topLocations : biStats.topLocations.slice(0, 5)} />
              </div>
            </div>
            <div style={{ padding: '20px 24px', borderRight: '1px solid #f0efe9' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', marginBottom: 16, letterSpacing: '.04em' }}>
                COMPOSICIÓN POR TIPO
              </div>
              <DonutChart data={biStats.topTypes} />
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#a3a297', letterSpacing: '.04em' }}>TOP PATRONALES</div>
                {biStats.topPatronales.length > 5 && (
                  <button
                    onClick={() => setExpandedPanel(expandedPanel === 'patronales' ? null : 'patronales')}
                    style={{ background: 'none', border: 'none', color: '#6d5aef', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    {expandedPanel === 'patronales' ? 'Ver menos' : 'Ver todos'}
                  </button>
                )}
              </div>
              {biStats.topPatronales.length > 0 ? (
                <div style={{ maxHeight: expandedPanel === 'patronales' ? 320 : 'none', overflowY: expandedPanel === 'patronales' ? 'auto' : 'visible' }}>
                  <PatronalChips data={expandedPanel === 'patronales' ? biStats.topPatronales : biStats.topPatronales.slice(0, 5)} />
                </div>
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

      <div
        style={{
          maxWidth: 640,
          margin: '0 auto 22px',
          padding: '26px 30px',
          borderRadius: 18,
          background: 'linear-gradient(160deg, #faf9ff 0%, #f2effc 100%)',
          border: '1px solid #e2dcf8',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <i className="ti ti-sparkles" style={{ color: '#6d5aef', fontSize: 18 }}></i>
          <span style={{ fontSize: 15.5, fontWeight: 700, color: '#15140f' }}>¿Qué organizaciones buscas?</span>
          <span
            style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#6d5aef', color: '#fff' }}
          >
            Beta
          </span>
        </div>

        <div
          style={{
            display: 'inline-flex',
            background: '#fff',
            border: '1px solid #e2dcf8',
            borderRadius: 10,
            padding: 3,
            marginBottom: 14,
          }}
        >
          <button
            type="button"
            onClick={() => setSearchMode('ia')}
            style={{
              border: 'none',
              padding: '6px 14px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: searchMode === 'ia' ? '#6d5aef' : 'transparent',
              color: searchMode === 'ia' ? '#fff' : '#8a897f',
            }}
          >
            Con IA
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('kw')}
            style={{
              border: 'none',
              padding: '6px 14px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: searchMode === 'kw' ? '#6d5aef' : 'transparent',
              color: searchMode === 'kw' ? '#fff' : '#8a897f',
            }}
          >
            Por palabra clave
          </button>
        </div>

        {searchMode === 'ia' ? (
          <div style={{ position: 'relative', maxWidth: 520, margin: '0 auto' }}>
            <input
              placeholder='Ej: "asociaciones de energía en Madrid con más de 200 empleados"'
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runAiSearch()}
              disabled={aiSearching}
              style={{
                width: '100%',
                padding: '13px 96px 13px 18px',
                border: '1px solid #d9d2f9',
                borderRadius: 12,
                fontSize: 13.5,
                outline: 'none',
                background: '#fff',
                boxShadow: '0 2px 12px rgba(109,90,239,.09)',
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
                borderRadius: 8,
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
        ) : (
          <div style={{ position: 'relative', maxWidth: 520, margin: '0 auto' }}>
            <i
              className="ti ti-search"
              style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8a897f', fontSize: 15 }}
            ></i>
            <input
              placeholder="Buscar por nombre, sector o ubicación..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '13px 18px 13px 38px',
                border: '1px solid #e0dfd8',
                borderRadius: 12,
                fontSize: 13.5,
                outline: 'none',
                background: '#fff',
              }}
            />
          </div>
        )}

        <div style={{ fontSize: 11.5, color: '#8a897f', marginTop: 11 }}>
          {searchMode === 'ia'
            ? 'Escribe lo que buscas en lenguaje natural y la IA aplica los filtros por ti.'
            : 'Cambia a "Con IA" para búsquedas más elaboradas en lenguaje natural.'}
        </div>
        {aiError && <div style={{ fontSize: 12, color: '#a33', marginTop: 8 }}>{aiError}</div>}
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>{filtered.length} resultados</div>

      <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: '#faf9f5', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px', width: 32 }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectPage}
                  aria-label="Seleccionar toda la página"
                  style={{ margin: 0, cursor: 'pointer' }}
                />
              </th>
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
              <th style={{ padding: '10px 14px', fontWeight: 700, color: '#666', fontSize: 11, textTransform: 'uppercase' }}>Enlaces</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((o) => (
              <tr
                key={o.id}
                style={{ borderTop: '.5px solid #e0dfd8', background: selectedIds.has(o.id) ? '#f0f8f5' : 'transparent' }}
              >
                <td style={{ padding: '9px 12px' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(o.id)}
                    onChange={() => toggleSelected(o.id)}
                    aria-label={`Seleccionar ${o.name}`}
                    style={{ margin: 0, cursor: 'pointer' }}
                  />
                </td>
                <td style={{ padding: '9px 14px', fontWeight: 600 }}>
                  {o.name}
                  {o.verified && <i className="ti ti-circle-check-filled" style={{ color: '#1d9d63', marginLeft: 5, fontSize: 13 }}></i>}
                  {hasInterestGroupBadge(o) && <i className="ti ti-shield-check" style={{ color: '#6d5aef', marginLeft: 4, fontSize: 13 }}></i>}
                </td>
                <td style={{ padding: '9px 14px', color: '#555' }}>{TYPE_LABELS[o.org_type] || '—'}</td>
                <td style={{ padding: '9px 14px', color: '#555' }}>{SECTOR_LABELS[o.sector] || '—'}</td>
                <td style={{ padding: '9px 14px', color: '#555' }}>
                  {(o.patronales || []).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {o.patronales.map((p) => (
                        <span
                          key={p}
                          title={p}
                          style={{
                            fontSize: 12,
                            color: '#3a3a36',
                            maxWidth: 220,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: 1.35,
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
                <td style={{ padding: '9px 14px', color: '#555' }}>{o.size_range || '—'}</td>
                <td style={{ padding: '9px 14px', color: '#555' }}>{o.location || '—'}</td>
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
                <td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#999' }}>
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

      {selectedIds.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a18',
            borderRadius: 12,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            color: '#fff',
            fontSize: 13,
            boxShadow: '0 8px 24px rgba(0,0,0,.25)',
            zIndex: 40,
          }}
        >
          <span
            style={{
              background: '#1d6f5c',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: 20,
              fontWeight: 600,
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}
            <i
              className="ti ti-x"
              onClick={() => setSelectedIds(new Set())}
              style={{ cursor: 'pointer', fontSize: 13 }}
              aria-label="Quitar selección"
            ></i>
          </span>
          <button
            onClick={() => openExportConfirm(selectedOrgs)}
            style={{
              background: '#6d5aef',
              color: '#fff',
              border: 'none',
              padding: '7px 14px',
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <i className="ti ti-download"></i> Exportar seleccionadas
          </button>
        </div>
      )}

      {showExportConfirm && (
        <div className="modal-ov" onClick={() => !exportBusy && setShowExportConfirm(false)}>
          <div className="modal-box" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8 }}>
              <div className="modal-x" onClick={() => !exportBusy && setShowExportConfirm(false)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: '#eeecfd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                color: '#6d5aef',
                marginBottom: 14,
              }}
            >
              <i className="ti ti-download"></i>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a18', marginBottom: 6 }}>
              Estás exportando {exportRows.length} organizaciones
            </div>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5, marginBottom: 14 }}>
              Se descargará un Excel con el directorio filtrado tal como lo ves ahora.
            </div>

            {exportUsage && (
              <div style={{ background: '#f4f4f0', borderRadius: 10, padding: '10px 12px', marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 6 }}>
                  <span>Uso de tu cuota mensual</span>
                  <span style={{ fontWeight: 600, color: '#1a1a18' }}>
                    {exportUsage.usedThisMonth} / {exportUsage.limit} filas
                  </span>
                </div>
                <div style={{ background: '#e0dfd8', borderRadius: 6, height: 6 }}>
                  <div
                    style={{
                      background: '#6d5aef',
                      borderRadius: 6,
                      height: 6,
                      width: `${Math.min(100, (exportUsage.usedThisMonth / exportUsage.limit) * 100)}%`,
                    }}
                  ></div>
                </div>
              </div>
            )}

            {exportError && (
              <div style={{ fontSize: 12.5, color: '#b3261e', background: '#fbeceb', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                {exportError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-o" onClick={() => setShowExportConfirm(false)} disabled={exportBusy}>
                Cancelar
              </button>
              <button className="btn-p" onClick={confirmExport} disabled={exportBusy}>
                {exportBusy ? 'Exportando...' : 'Confirmar y descargar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
