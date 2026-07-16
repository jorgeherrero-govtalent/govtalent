'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

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

const FILTERS = {
  todas: () => true,
  verificadas: (o) => o.verified,
  no_verificadas: (o) => !o.verified,
  no_reclamadas: (o) => o.claimed === false,
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function OrganizationsBackofficePage() {
  const [orgs, setOrgs] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todas');
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [search, filter, pageSize]);

  async function load() {
    const res = await fetch('/api/backoffice/organizations');
    const data = await res.json();
    if (!res.ok) {
      setLoadError(data.error || `Error ${res.status}`);
      setOrgs([]);
      return;
    }
    setOrgs(data.organizations || []);
  }

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2200);
  }

  const filtered = useMemo(() => {
    if (!orgs) return [];
    const q = search.toLowerCase();
    return orgs
      .filter(FILTERS[filter])
      .filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.location || '').toLowerCase().includes(q) ||
          (o.contact_email || '').toLowerCase().includes(q) ||
          (o.sector || '').toLowerCase().includes(q)
      );
  }, [orgs, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = filtered.length === 0 ? 0 : currentPage * pageSize + 1;
  const pageEnd = Math.min(filtered.length, (currentPage + 1) * pageSize);
  const paginated = useMemo(
    () => filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    [filtered, currentPage, pageSize]
  );

  const counts = useMemo(() => {
    if (!orgs) return {};
    return {
      todas: orgs.length,
      verificadas: orgs.filter(FILTERS.verificadas).length,
      no_verificadas: orgs.filter(FILTERS.no_verificadas).length,
      no_reclamadas: orgs.filter(FILTERS.no_reclamadas).length,
    };
  }, [orgs]);

  const allPageSelected = paginated.length > 0 && paginated.every((o) => selectedIds.has(o.id));

  function toggleSelectAll() {
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

  function toggleSelectOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSaving(true);
    const f = new FormData(e.target);
    const updates = {
      name: f.get('name'),
      org_type: f.get('org_type'),
      sector: f.get('sector') || null,
      location: f.get('location') || null,
      size_range: f.get('size_range') || null,
      website_url: f.get('website_url') || null,
      linkedin_url: f.get('linkedin_url') || null,
      contact_email: f.get('contact_email') || null,
      notification_email: f.get('notification_email') || null,
    };

    const res = await fetch(`/api/backoffice/organizations/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'No se pudo guardar');
      return;
    }

    setOrgs((prev) => prev.map((o) => (o.id === editing.id ? { ...o, ...updates } : o)));
    setEditing(null);
    showToast('Organización actualizada ✓');
  }

  async function toggleVerified(org) {
    setBusyId(org.id);
    const res = await fetch(`/api/backoffice/organizations/${org.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: !org.verified }),
    });
    setBusyId(null);
    if (!res.ok) return showToast('No se pudo actualizar');
    setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, verified: !o.verified } : o)));
    showToast(!org.verified ? 'Organización verificada ✓' : 'Verificación retirada');
  }

  async function deleteOrg(org) {
    if (!confirm(`¿Eliminar "${org.name}"? Solo funcionará si no ha sido reclamada por nadie.`)) return;
    setBusyId(org.id);
    const res = await fetch(`/api/backoffice/organizations/${org.id}`, { method: 'DELETE' });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return showToast(data.error || 'No se pudo eliminar');
    }
    setOrgs((prev) => prev.filter((o) => o.id !== org.id));
    showToast('Organización eliminada ✓');
  }

  async function bulkVerify() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/backoffice/organizations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verified: true }),
        })
      )
    );
    setBulkBusy(false);
    setOrgs((prev) => prev.map((o) => (ids.includes(o.id) ? { ...o, verified: true } : o)));
    setSelectedIds(new Set());
    showToast(`${ids.length} organizaciones verificadas ✓`);
  }

  function exportCsv() {
    const headers = ['Nombre', 'Sector', 'Ubicación', 'Tamaño', 'Web', 'Email contacto', 'Verificada', 'Reclamada', 'Ofertas', 'Fuente'];
    const source = selectedIds.size > 0 ? filtered.filter((o) => selectedIds.has(o.id)) : filtered;
    const rows = source
      .map((o) => [
        o.name,
        o.sector || '',
        o.location || '',
        o.size_range || '',
        o.website_url || '',
        o.contact_email || '',
        o.verified ? 'Sí' : 'No',
        o.claimed === false ? 'No' : 'Sí',
        o.job_count,
        o.source || '',
      ])
      .map((r) => r.map(csvEscape));
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `govtalent-organizaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const thStyle = { padding: '10px 14px', fontWeight: 700, color: '#666', whiteSpace: 'nowrap', textAlign: 'center', verticalAlign: 'middle' };
  const tdStyle = { padding: '10px 14px', whiteSpace: 'nowrap', textAlign: 'center', verticalAlign: 'middle', color: '#666' };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Organizaciones</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        {orgs ? `${filtered.length} de ${orgs.length} organizaciones` : 'Cargando...'}
      </p>

      {loadError && (
        <div style={{ background: '#fdecea', border: '.5px solid #f3c9c9', color: '#c0392b', borderRadius: 9, padding: '10px 14px', fontSize: 12.5, marginBottom: 16 }}>
          <i className="ti ti-alert-triangle"></i> Error al cargar: {loadError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {Object.entries({
          todas: 'Todas',
          verificadas: 'Verificadas',
          no_verificadas: 'No verificadas',
          no_reclamadas: 'Sin reclamar',
        }).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '6px 13px',
              borderRadius: 20,
              border: filter === key ? '1px solid #1d6f5c' : '.5px solid #e0dfd8',
              background: filter === key ? '#f0f8f5' : '#fff',
              color: filter === key ? '#1d6f5c' : '#666',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {label} {orgs && `(${counts[key] ?? 0})`}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar por nombre, ciudad, email, sector..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '9px 13px', border: '.5px solid #e0dfd8', borderRadius: 9, fontSize: 13, outline: 'none' }}
        />
        <Link
          href="/backoffice/organizaciones/importar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 16px',
            borderRadius: 9,
            border: '.5px solid #1d6f5c',
            background: '#fff',
            color: '#1d6f5c',
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            textDecoration: 'none',
          }}
        >
          <i className="ti ti-upload"></i> Cargar organizaciones
        </Link>
        <button
          onClick={exportCsv}
          disabled={!filtered.length}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 16px',
            borderRadius: 9,
            border: 'none',
            background: '#1d6f5c',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <i className="ti ti-download"></i> Exportar CSV{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#f0f8f5',
            border: '.5px solid #c0e4d8',
            borderRadius: 9,
            padding: '9px 14px',
            marginBottom: 12,
            fontSize: 12.5,
            color: '#1d6f5c',
          }}
        >
          <b>{selectedIds.size}</b> seleccionadas
          <button
            onClick={bulkVerify}
            disabled={bulkBusy}
            style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#1d6f5c', color: '#fff', fontSize: 12, fontWeight: 600 }}
          >
            {bulkBusy ? 'Verificando...' : 'Verificar seleccionadas'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ padding: '6px 12px', borderRadius: 7, border: '.5px solid #c0e4d8', background: '#fff', color: '#1d6f5c', fontSize: 12 }}
          >
            Deseleccionar
          </button>
        </div>
      )}

      {orgs === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Cargando organizaciones...</div>
      ) : (
        <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#faf9f5' }}>
                <th style={{ ...thStyle, width: 32 }}>
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Nombre</th>
                <th style={thStyle}>Sector</th>
                <th style={thStyle}>Ubicación</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Contacto</th>
                <th style={thStyle}>Ofertas</th>
                <th style={thStyle}>Miembros</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Fuente</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((o) => (
                <tr key={o.id} style={{ borderTop: '.5px solid #e0dfd8', background: selectedIds.has(o.id) ? '#f7fbf9' : 'transparent' }}>
                  <td style={{ ...tdStyle }}>
                    <input type="checkbox" checked={selectedIds.has(o.id)} onChange={() => toggleSelectOne(o.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600, color: '#1a1a18' }}>
                    <Link href={`/organizations/${o.slug}`} target="_blank" style={{ color: '#1a1a18', textDecoration: 'none' }}>
                      {o.name}
                    </Link>
                  </td>
                  <td style={tdStyle}>{o.sector || '—'}</td>
                  <td style={tdStyle}>{o.location || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{o.contact_email || '—'}</td>
                  <td style={tdStyle}>{o.job_count}</td>
                  <td style={tdStyle}>{o.member_count}</td>
                  <td style={tdStyle}>
                    {o.verified ? (
                      <span style={{ color: '#1d9d63', fontWeight: 600, fontSize: 11.5 }}>
                        <i className="ti ti-circle-check-filled"></i> Verificada
                      </span>
                    ) : (
                      <span style={{ color: '#c9902e', fontWeight: 600, fontSize: 11.5 }}>
                        <i className="ti ti-clock"></i> No verificada
                      </span>
                    )}
                    {o.claimed === false && (
                      <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>Sin reclamar</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 10.5, color: '#aaa', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={o.source || ''}>
                    {o.source || '—'}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => setEditing(o)}
                      style={{
                        border: '.5px solid #e0dfd8',
                        background: '#fff',
                        borderRadius: 7,
                        padding: '5px 10px',
                        fontSize: 11.5,
                        color: '#555',
                        marginRight: 6,
                      }}
                    >
                      <i className="ti ti-edit" style={{ fontSize: 12 }}></i> Editar
                    </button>
                    <button
                      onClick={() => toggleVerified(o)}
                      disabled={busyId === o.id}
                      style={{
                        border: '.5px solid #e0dfd8',
                        background: '#fff',
                        borderRadius: 7,
                        padding: '5px 10px',
                        fontSize: 11.5,
                        color: '#555',
                        marginRight: 6,
                      }}
                    >
                      {o.verified ? 'Retirar verificación' : 'Verificar'}
                    </button>
                    {o.claimed === false && (
                      <button
                        onClick={() => deleteOrg(o)}
                        disabled={busyId === o.id}
                        style={{
                          border: '.5px solid #f3c9c9',
                          background: '#fff',
                          borderRadius: 7,
                          padding: '5px 8px',
                          fontSize: 11.5,
                          color: '#c0392b',
                        }}
                      >
                        <i className="ti ti-trash" style={{ fontSize: 12 }}></i>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: '.5px solid #e0dfd8',
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
      )}

      {editing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 20,
          }}
          onClick={(e) => e.target === e.currentTarget && setEditing(null)}
        >
          <form
            onSubmit={saveEdit}
            style={{ background: '#fff', borderRadius: 14, padding: 24, width: 480, maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}
          >
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Cerrar"
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '.5px solid #e0dfd8',
                background: '#fff',
                color: '#888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
              }}
            >
              <i className="ti ti-x"></i>
            </button>

            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Editar organización</h2>

            <OrgField label="Nombre" name="name" defaultValue={editing.name} required />

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#555', marginBottom: 4 }}>Tipo</label>
              <select
                name="org_type"
                defaultValue={editing.org_type}
                required
                style={{ width: '100%', padding: '8px 11px', border: '.5px solid #e0dfd8', borderRadius: 8, fontSize: 13, outline: 'none' }}
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <OrgField label="Sector" name="sector" defaultValue={editing.sector} />
            <OrgField label="Ubicación" name="location" defaultValue={editing.location} />

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#555', marginBottom: 4 }}>Nº de empleados</label>
              <select
                name="size_range"
                defaultValue={editing.size_range || ''}
                style={{ width: '100%', padding: '8px 11px', border: '.5px solid #e0dfd8', borderRadius: 8, fontSize: 13, outline: 'none' }}
              >
                <option value="">—</option>
                {['1-10', '11-50', '50-200', '200-1000', '+1000'].map((s) => (
                  <option key={s} value={s}>
                    {s} empleados
                  </option>
                ))}
              </select>
            </div>

            <OrgField label="Sitio web" name="website_url" defaultValue={editing.website_url} />
            <OrgField label="LinkedIn" name="linkedin_url" defaultValue={editing.linkedin_url} />
            <OrgField label="Email de contacto" name="contact_email" type="email" defaultValue={editing.contact_email} />
            <OrgField label="Email de notificaciones" name="notification_email" type="email" defaultValue={editing.notification_email} />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setEditing(null)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '.5px solid #e0dfd8', background: '#fff', fontSize: 13 }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#1d6f5c', color: '#fff', fontSize: 13, fontWeight: 600 }}
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a18',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}

function OrgField({ label, name, defaultValue, type = 'text', required }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#555', marginBottom: 4 }}>{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue || ''}
        required={required}
        style={{
          width: '100%',
          padding: '8px 11px',
          border: '.5px solid #e0dfd8',
          borderRadius: 8,
          fontSize: 13,
          outline: 'none',
        }}
      />
    </div>
  );
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
