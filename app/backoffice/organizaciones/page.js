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

export default function OrganizationsBackofficePage() {
  const [orgs, setOrgs] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todas');
  const [busyId, setBusyId] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch('/api/backoffice/organizations');
    const data = await res.json();
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
          (o.contact_email || '').toLowerCase().includes(q)
      );
  }, [orgs, search, filter]);

  const counts = useMemo(() => {
    if (!orgs) return {};
    return {
      todas: orgs.length,
      verificadas: orgs.filter(FILTERS.verificadas).length,
      no_verificadas: orgs.filter(FILTERS.no_verificadas).length,
      no_reclamadas: orgs.filter(FILTERS.no_reclamadas).length,
    };
  }, [orgs]);

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

  function exportCsv() {
    const headers = ['Nombre', 'Tipo', 'Ubicación', 'Tamaño', 'Web', 'Email contacto', 'Verificada', 'Reclamada', 'Ofertas', 'Fuente'];
    const rows = filtered.map((o) => [
      o.name,
      TYPE_LABELS[o.org_type] || o.org_type,
      o.location || '',
      o.size_range || '',
      o.website_url || '',
      o.contact_email || '',
      o.verified ? 'Sí' : 'No',
      o.claimed === false ? 'No' : 'Sí',
      o.job_count,
      o.source || '',
    ].map(csvEscape));
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `govtalent-organizaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Organizaciones</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        {orgs ? `${filtered.length} de ${orgs.length} organizaciones` : 'Cargando...'}
      </p>

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

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          placeholder="Buscar por nombre, ciudad, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, padding: '9px 13px', border: '.5px solid #e0dfd8', borderRadius: 9, fontSize: 13, outline: 'none' }}
        />
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
          <i className="ti ti-download"></i> Exportar CSV
        </button>
      </div>

      {orgs === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Cargando organizaciones...</div>
      ) : (
        <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#faf9f5', textAlign: 'left' }}>
                {['Nombre', 'Tipo', 'Ubicación', 'Contacto', 'Ofertas', 'Miembros', 'Estado', 'Fuente', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 700, color: '#666', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} style={{ borderTop: '.5px solid #e0dfd8' }}>
                  <td style={{ padding: '9px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <Link href={`/organizations/${o.slug}`} target="_blank" style={{ color: '#1a1a18', textDecoration: 'none' }}>
                      {o.name}
                    </Link>
                  </td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: '#666' }}>{TYPE_LABELS[o.org_type] || o.org_type}</td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: '#666' }}>{o.location || '—'}</td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: '#666' }}>{o.contact_email || '—'}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>{o.job_count}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>{o.member_count}</td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
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
                  <td style={{ padding: '9px 14px', fontSize: 10.5, color: '#aaa', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.source || ''}>
                    {o.source || '—'}
                  </td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
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

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
