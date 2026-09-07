'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import FilterableHeader from '@/components/FilterableHeader';
import { canAccessDatabase } from '@/lib/plan';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// PostgREST devuelve 1.000 filas como máximo por petición. La vista tiene
// unas 12.000, así que hay que pedirlas por tramos hasta agotarlas.
const CHUNK = 1000;
const MAX_FILAS = 20000;

const JURISDICCIONES = [
  { value: 'todas', label: 'Todas' },
  { value: 'España', label: 'España' },
  { value: 'UE', label: 'UE' },
];

const BANDA_LABELS = {
  electo: 'Electo',
  alta_direccion: 'Alta dirección',
  direccion: 'Dirección',
  subdireccion: 'Subdirección',
  mando_intermedio: 'Mando intermedio',
  tecnico: 'Técnico',
  otro: 'Otros',
};

function nivelContacto(score) {
  if (score >= 70) return { barras: 3, label: 'Alta', apagado: false };
  if (score >= 40) return { barras: 2, label: 'Media', apagado: false };
  return { barras: 1, label: 'Baja', apagado: true };
}

// Barras monocromas: las activas en morado corporativo, el resto en gris.
function ScoreBarras({ score }) {
  const { barras, label, apagado } = nivelContacto(score || 0);
  const alturas = [6, 9, 12];
  return (
    <span style={{ whiteSpace: 'nowrap' }} title={`${score || 0} / 100`}>
      <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, marginRight: 9, verticalAlign: -1 }}>
        {alturas.map((h, i) => (
          <span
            key={h}
            style={{
              width: 3.5,
              height: h,
              borderRadius: 1,
              background: i < barras ? '#6d5aef' : '#e6e5df',
            }}
          ></span>
        ))}
      </span>
      <span style={{ color: apagado ? '#8a897f' : '#3a3a36' }}>{label}</span>
    </span>
  );
}

function iniciales(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return (partes[0][0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
}

// Desplegable multi-selección para la barra superior. Comparte estilo con
// FilterableHeader pero vive fuera de la tabla.
function FiltroBarra({ icono, label, values, selected, onApply }) {
  const [abierto, setAbierto] = useState(false);
  const [draft, setDraft] = useState(selected);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    if (abierto) {
      setDraft(new Set(selected));
      setBusqueda('');
    }
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = (values || []).filter((v) =>
    v.label.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          border: '.5px solid #e0dfd8',
          background: '#fff',
          borderRadius: 9,
          padding: '8px 13px',
          fontSize: 12.5,
          color: '#3a3a36',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <i className={`ti ${icono}`} style={{ fontSize: 15, color: '#a8a79c' }}></i>
        {label}
        {selected.size > 0 && (
          <span
            style={{
              background: '#eeecfd',
              color: '#6d5aef',
              borderRadius: 20,
              padding: '1px 7px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {selected.size}
          </span>
        )}
        <i className="ti ti-chevron-down" style={{ fontSize: 14, color: '#a8a79c' }}></i>
      </button>

      {abierto && (
        <>
          <div onClick={() => setAbierto(false)} style={{ position: 'fixed', inset: 0, zIndex: 300 }}></div>
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 301,
              width: 280,
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 8px 28px rgba(0,0,0,.15)',
              border: '.5px solid #e0dfd8',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 10, borderBottom: '.5px solid #e0dfd8' }}>
              <input
                autoFocus
                placeholder={`Buscar ${label.toLowerCase()}...`}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  border: '.5px solid #e0dfd8',
                  borderRadius: 7,
                  fontSize: 12.5,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11 }}>
                <button
                  type="button"
                  onClick={() => setDraft(new Set(values.map((v) => v.value)))}
                  style={{ background: 'none', border: 'none', color: '#1d6f5c', cursor: 'pointer', padding: 0 }}
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(new Set())}
                  style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: 0 }}
                >
                  Ninguno
                </button>
              </div>
            </div>

            <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
              {visibles.length === 0 && (
                <div style={{ padding: 10, fontSize: 12, color: '#999', textAlign: 'center' }}>Sin resultados</div>
              )}
              {visibles.map((v) => (
                <label
                  key={v.value}
                  title={v.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 8px',
                    borderRadius: 7,
                    fontSize: 12.5,
                    color: '#333',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f7f7f4')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <input
                    type="checkbox"
                    checked={draft.has(v.value)}
                    onChange={() =>
                      setDraft((prev) => {
                        const next = new Set(prev);
                        if (next.has(v.value)) next.delete(v.value);
                        else next.add(v.value);
                        return next;
                      })
                    }
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '.5px solid #e0dfd8' }}>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                style={{ flex: 1, padding: '7px 8px', borderRadius: 7, border: '.5px solid #e0dfd8', background: '#fff', fontSize: 12.5, color: '#666' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onApply(draft);
                  setAbierto(false);
                }}
                style={{ flex: 1, padding: '7px 8px', borderRadius: 7, border: 'none', background: '#1d6f5c', color: '#fff', fontSize: 12.5, fontWeight: 600 }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DirectorioInstitucionalPage() {
  const supabase = createClient();

  const [filas, setFilas] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [planChecked, setPlanChecked] = useState(false);
  const [planAllowed, setPlanAllowed] = useState(true);

  const [search, setSearch] = useState('');
  const [jurisdiccion, setJurisdiccion] = useState('todas');
  const [institucionFilter, setInstitucionFilter] = useState(new Set());
  const [areaFilter, setAreaFilter] = useState(new Set());
  const [bandaFilter, setBandaFilter] = useState(new Set());
  const [contactoFilter, setContactoFilter] = useState(new Set());

  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' });
  const [openPopover, setOpenPopover] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportUsage, setExportUsage] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportRows, setExportRows] = useState([]);

  useEffect(() => {
    async function comprobarPlan() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        setPlanAllowed(false);
        setPlanChecked(true);
        return;
      }
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organizations(id, plan)')
        .eq('user_id', authData.user.id)
        .limit(1)
        .maybeSingle();
      const org = membership?.organizations;
      setPlanAllowed(org ? canAccessDatabase(org) : false);
      setPlanChecked(true);
    }
    comprobarPlan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function cargar() {
      const acumulado = [];
      for (let desde = 0; desde < MAX_FILAS; desde += CHUNK) {
        const { data, error } = await supabase
          .from('directorio_pro')
          .select(
            'id, jurisdiccion, tipo_institucion, institucion, unidad, nombre, cargo, cargo_canonico, banda, orden, es_titular, area, email, email_unidad, telefono, direccion_postal, slug, contactabilidad, objecion'
          )
          .eq('objecion', false)
          .order('orden', { ascending: true })
          .range(desde, desde + CHUNK - 1);
        if (error) {
          setLoadError(error.message);
          setFilas([]);
          return;
        }
        acumulado.push(...(data || []));
        if (!data || data.length < CHUNK) break;
      }
      setFilas(acumulado);
    }
    cargar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(0);
  }, [search, jurisdiccion, institucionFilter, areaFilter, bandaFilter, contactoFilter, pageSize]);

  const base = filas || [];

  // Las opciones de institución dependen de la jurisdicción elegida: no
  // tiene sentido ofrecer los 23 ministerios cuando estás mirando la UE.
  const institucionValues = useMemo(() => {
    const set = new Set();
    base.forEach((f) => {
      if (jurisdiccion !== 'todas' && f.jurisdiccion !== jurisdiccion) return;
      if (f.institucion) set.add(f.institucion);
    });
    return [...set].sort().map((v) => ({ value: v, label: v }));
  }, [base, jurisdiccion]);

  const areaValues = useMemo(() => {
    const set = new Set();
    base.forEach((f) => f.area && set.add(f.area));
    return [...set].sort().map((v) => ({ value: v, label: v }));
  }, [base]);

  const bandaValues = useMemo(() => {
    const set = new Set();
    base.forEach((f) => f.banda && set.add(f.banda));
    return [...set].sort().map((v) => ({ value: v, label: BANDA_LABELS[v] || v }));
  }, [base]);

  const contactoValues = [
    { value: 'alta', label: 'Alta' },
    { value: 'media', label: 'Media' },
    { value: 'baja', label: 'Baja' },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = base
      .filter((f) => jurisdiccion === 'todas' || f.jurisdiccion === jurisdiccion)
      .filter((f) => institucionFilter.size === 0 || institucionFilter.has(f.institucion))
      .filter((f) => areaFilter.size === 0 || areaFilter.has(f.area))
      .filter((f) => bandaFilter.size === 0 || bandaFilter.has(f.banda))
      .filter((f) => {
        if (contactoFilter.size === 0) return true;
        const n = nivelContacto(f.contactabilidad || 0).label.toLowerCase();
        return contactoFilter.has(n);
      })
      .filter((f) => {
        if (!q) return true;
        return (
          String(f.nombre || '').toLowerCase().includes(q) ||
          String(f.cargo || '').toLowerCase().includes(q) ||
          String(f.unidad || '').toLowerCase().includes(q) ||
          String(f.institucion || '').toLowerCase().includes(q)
        );
      });

    if (sortConfig.key) {
      const dir = sortConfig.dir === 'desc' ? -1 : 1;
      out.sort((a, b) => {
        const va = a[sortConfig.key];
        const vb = b[sortConfig.key];
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va || '').localeCompare(String(vb || ''), 'es') * dir;
      });
    }
    return out;
  }, [base, search, jurisdiccion, institucionFilter, areaFilter, bandaFilter, contactoFilter, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = filtered.length === 0 ? 0 : currentPage * pageSize + 1;
  const pageEnd = Math.min(filtered.length, (currentPage + 1) * pageSize);
  const paginated = filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  const allPageSelected = paginated.length > 0 && paginated.every((f) => selectedIds.has(f.id));

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) paginated.forEach((f) => next.delete(f.id));
      else paginated.forEach((f) => next.add(f.id));
      return next;
    });
  }

  const seleccionadas = useMemo(
    () => filtered.filter((f) => selectedIds.has(f.id)),
    [filtered, selectedIds]
  );

  async function abrirExportacion(rows) {
    setExportRows(rows);
    setExportError('');
    setExportUsage(null);
    setShowExportConfirm(true);
    try {
      const res = await fetch('/api/instituciones/directorio/export');
      if (res.ok) setExportUsage(await res.json());
    } catch (e) {
      // La barra de cuota es informativa: si falla, el guardián del POST
      // sigue haciendo su trabajo antes de dejar descargar.
    }
  }

  async function confirmarExportacion() {
    setExportBusy(true);
    setExportError('');
    try {
      const res = await fetch('/api/instituciones/directorio/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowCount: exportRows.length,
          filters: {
            search: search || null,
            jurisdiccion,
            institucion: [...institucionFilter],
            area: [...areaFilter],
            banda: [...bandaFilter],
            contactabilidad: [...contactoFilter],
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExportError(json.error || 'No se pudo exportar.');
        if (json.usedThisMonth != null) setExportUsage({ usedThisMonth: json.usedThisMonth, limit: json.limit });
        setExportBusy(false);
        return;
      }

      const rows = exportRows.map((f) => ({
        Nombre: f.nombre || '',
        Cargo: f.cargo || '',
        'Cargo normalizado': f.cargo_canonico || '',
        Banda: BANDA_LABELS[f.banda] || f.banda || '',
        Unidad: f.unidad || '',
        Institución: f.institucion || '',
        Jurisdicción: f.jurisdiccion || '',
        Poder: f.tipo_institucion || '',
        Área: f.area || '',
        Titular: f.es_titular ? 'Sí' : 'No',
        Email: f.email || '',
        'Email de la unidad': f.email_unidad || '',
        Teléfono: f.telefono || '',
        'Dirección postal': f.direccion_postal || '',
        Contactabilidad: nivelContacto(f.contactabilidad || 0).label,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 30 }, { wch: 44 }, { wch: 24 }, { wch: 16 }, { wch: 38 }, { wch: 34 },
        { wch: 12 }, { wch: 13 }, { wch: 26 }, { wch: 8 }, { wch: 32 }, { wch: 32 },
        { wch: 14 }, { wch: 40 }, { wch: 16 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Directorio institucional');
      XLSX.writeFile(wb, `directorio-institucional-${new Date().toISOString().slice(0, 10)}.xlsx`);

      setShowExportConfirm(false);
    } catch (e) {
      setExportError('No se pudo exportar.');
    }
    setExportBusy(false);
  }

  if (filas === null || !planChecked) return <div className="spinner"></div>;

  if (!planAllowed) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '48px auto', padding: 32, textAlign: 'center' }}>
        <i className="ti ti-lock" style={{ fontSize: 30, color: '#6d5aef', marginBottom: 10 }}></i>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: '#1a1a18' }}>
          Directorio institucional — plan Pro
        </div>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 18 }}>
          Consulta, filtra y exporta los contactos de la Administración General del Estado y de las
          instituciones europeas. Disponible en el plan Pro.
        </p>
        <Link href="/precios" target="_blank" className="btn-p" style={{ textDecoration: 'none' }}>
          Ver planes
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: `24px 28px ${selectedIds.size > 0 ? 90 : 24}px`, maxWidth: 1320 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Directorio institucional</h1>
        <p style={{ fontSize: 12.5, color: '#888', margin: '4px 0 0' }}>
          {base.length.toLocaleString('es-ES')} personas de la Administración General del Estado, el Congreso y las
          instituciones europeas.
        </p>
      </div>

      {loadError && (
        <div style={{ fontSize: 12.5, color: '#b3261e', background: '#fbeceb', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
          No se pudo cargar el directorio: {loadError}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '.5px solid #e0dfd8',
            background: '#fff',
            borderRadius: 9,
            padding: '8px 12px',
            minWidth: 250,
            flex: 1,
            maxWidth: 340,
          }}
        >
          <i className="ti ti-search" style={{ fontSize: 15, color: '#a8a79c' }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, cargo o unidad"
            style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, background: 'transparent' }}
          />
          {search && (
            <i
              className="ti ti-x"
              onClick={() => setSearch('')}
              style={{ fontSize: 14, color: '#a8a79c', cursor: 'pointer' }}
            ></i>
          )}
        </div>

        <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #e2dcf8', borderRadius: 10, padding: 3 }}>
          {JURISDICCIONES.map((j) => (
            <button
              key={j.value}
              type="button"
              onClick={() => {
                setJurisdiccion(j.value);
                setInstitucionFilter(new Set());
              }}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: jurisdiccion === j.value ? '#6d5aef' : 'transparent',
                color: jurisdiccion === j.value ? '#fff' : '#8a897f',
              }}
            >
              {j.label}
            </button>
          ))}
        </div>

        <FiltroBarra
          icono="ti-building-bank"
          label="Institución"
          values={institucionValues}
          selected={institucionFilter}
          onApply={setInstitucionFilter}
        />
        <FiltroBarra
          icono="ti-target"
          label="Área"
          values={areaValues}
          selected={areaFilter}
          onApply={setAreaFilter}
        />

        <button
          onClick={() => abrirExportacion(filtered)}
          disabled={filtered.length === 0}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            border: '.5px solid #d9d2f9',
            background: '#f0edfe',
            borderRadius: 9,
            padding: '8px 14px',
            fontSize: 12.5,
            color: '#6d5aef',
            fontWeight: 700,
            cursor: filtered.length === 0 ? 'default' : 'pointer',
            opacity: filtered.length === 0 ? 0.5 : 1,
          }}
        >
          <i className="ti ti-file-spreadsheet" style={{ fontSize: 15 }}></i> Exportar ({filtered.length})
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
        {filtered.length.toLocaleString('es-ES')} resultados
      </div>

      <div
        style={{
          background: '#fff',
          border: '.5px solid #e0dfd8',
          borderRadius: 12,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          overflow: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1080 }}>
          <thead>
            <tr style={{ background: '#faf9f5', textAlign: 'left' }}>
              <th style={{ padding: '11px 14px', width: 32 }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectPage}
                  aria-label="Seleccionar toda la página"
                  style={{ margin: 0, cursor: 'pointer' }}
                />
              </th>
              <th style={{ padding: '11px 18px' }}>
                <FilterableHeader
                  label="Persona"
                  columnKey="nombre"
                  values={[]}
                  selected={new Set()}
                  onApply={() => {}}
                  sortConfig={sortConfig}
                  onSort={(key, dir) => setSortConfig({ key, dir })}
                  isOpen={openPopover === 'nombre'}
                  onToggle={() => setOpenPopover(openPopover === 'nombre' ? null : 'nombre')}
                  onClose={() => setOpenPopover(null)}
                />
              </th>
              <th style={{ padding: '11px 18px' }}>
                <FilterableHeader
                  label="Contactabilidad"
                  columnKey="contactabilidad"
                  values={contactoValues}
                  selected={contactoFilter}
                  onApply={setContactoFilter}
                  sortConfig={sortConfig}
                  onSort={(key, dir) => setSortConfig({ key, dir })}
                  isOpen={openPopover === 'contactabilidad'}
                  onToggle={() => setOpenPopover(openPopover === 'contactabilidad' ? null : 'contactabilidad')}
                  onClose={() => setOpenPopover(null)}
                />
              </th>
              <th style={{ padding: '11px 18px' }}>
                <FilterableHeader
                  label="Cargo"
                  columnKey="banda"
                  values={bandaValues}
                  selected={bandaFilter}
                  onApply={setBandaFilter}
                  sortConfig={sortConfig}
                  onSort={(key, dir) => setSortConfig({ key, dir })}
                  isOpen={openPopover === 'banda'}
                  onToggle={() => setOpenPopover(openPopover === 'banda' ? null : 'banda')}
                  onClose={() => setOpenPopover(null)}
                />
              </th>
              <th style={{ padding: '11px 18px' }}>
                <FilterableHeader
                  label="Institución"
                  columnKey="institucion"
                  values={institucionValues}
                  selected={institucionFilter}
                  onApply={setInstitucionFilter}
                  sortConfig={sortConfig}
                  onSort={(key, dir) => setSortConfig({ key, dir })}
                  isOpen={openPopover === 'institucion'}
                  onToggle={() => setOpenPopover(openPopover === 'institucion' ? null : 'institucion')}
                  onClose={() => setOpenPopover(null)}
                />
              </th>
              <th
                style={{
                  padding: '11px 18px',
                  fontWeight: 700,
                  color: '#666',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '.03em',
                }}
              >
                Email
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((f) => (
              <tr
                key={f.id}
                style={{
                  borderTop: '.5px solid #e0dfd8',
                  background: selectedIds.has(f.id) ? '#f7f6f2' : 'transparent',
                }}
              >
                <td style={{ padding: '11px 14px' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(f.id)}
                    onChange={() => toggleSelected(f.id)}
                    aria-label={`Seleccionar ${f.nombre}`}
                    style={{ margin: 0, cursor: 'pointer' }}
                  />
                </td>
                <td style={{ padding: '11px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: f.es_titular ? '#eeecfd' : '#f0efe9',
                        color: f.es_titular ? '#6d5aef' : '#a8a79c',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10.5,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                      title={f.es_titular ? 'Titular de la unidad' : ''}
                    >
                      {iniciales(f.nombre)}
                    </span>
                    <span style={{ fontWeight: 600, color: '#1a1a18' }}>{f.nombre}</span>
                  </div>
                </td>
                <td style={{ padding: '11px 18px' }}>
                  <ScoreBarras score={f.contactabilidad} />
                </td>
                <td style={{ padding: '11px 18px', color: '#555' }}>
                  {f.cargo || '—'}
                  <div style={{ fontSize: 11, color: '#a8a79c', marginTop: 2 }}>{f.unidad || ''}</div>
                </td>
                <td style={{ padding: '11px 18px', color: '#555' }}>
                  {f.institucion || '—'}
                  <div style={{ fontSize: 11, color: '#a8a79c', marginTop: 2 }}>
                    {f.jurisdiccion} · {f.tipo_institucion}
                  </div>
                </td>
                <td style={{ padding: '11px 18px' }}>
                  {f.email ? (
                    <a href={`mailto:${f.email}`} style={{ color: '#6d5aef', textDecoration: 'none' }}>
                      {f.email}
                    </a>
                  ) : f.email_unidad ? (
                    <a href={`mailto:${f.email_unidad}`} style={{ color: '#8a897f', textDecoration: 'none' }}>
                      {f.email_unidad}
                    </a>
                  ) : (
                    <span style={{ color: '#c9c8bf' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#999' }}>
                  No hay personas que coincidan con estos filtros.
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
            Mostrando {pageStart}-{pageEnd} de {filtered.length.toLocaleString('es-ES')}
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
            onClick={() => abrirExportacion(seleccionadas)}
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
              Estás exportando {exportRows.length} contactos
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
              <button className="btn-p" onClick={confirmarExportacion} disabled={exportBusy}>
                {exportBusy ? 'Exportando...' : 'Confirmar y descargar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
