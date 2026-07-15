'use client';

import { useEffect, useMemo, useState } from 'react';

const FIELDS = [
  { key: 'name', label: 'Nombre completo' },
  { key: 'professional_title', label: 'Título profesional' },
  { key: 'company', label: 'Empresa', derived: true },
  { key: 'sector', label: 'Sector', derived: true },
  { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Email', readOnly: true },
  { key: 'location', label: 'Ciudad' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'cv_url', label: 'CV', derived: true },
];

export default function UsersBackofficePage() {
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch('/api/backoffice/users');
    const data = await res.json();
    if (!res.ok) {
      setLoadError(data.error || `Error ${res.status}`);
      setUsers([]);
      return;
    }
    setUsers((data.users || []).map((u) => ({ ...u, name: `${u.first_name} ${u.last_name}`.trim() })));
  }

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2000);
  }

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.company || '').toLowerCase().includes(q) ||
        (u.professional_title || '').toLowerCase().includes(q) ||
        (u.location || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  function copyValue(value) {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    showToast('Copiado ✓');
  }

  function exportCsv() {
    const headers = FIELDS.map((f) => f.label);
    const rows = filtered.map((u) => FIELDS.map((f) => csvEscape(u[f.key] || '')));
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `govtalent-candidatos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSaving(true);
    const f = new FormData(e.target);
    const updates = {
      first_name: f.get('first_name'),
      last_name: f.get('last_name'),
      professional_title: f.get('professional_title') || null,
      location: f.get('location') || null,
      phone: f.get('phone') || null,
      linkedin_url: f.get('linkedin_url') || null,
    };

    const res = await fetch(`/api/backoffice/users/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setSaving(false);

    if (!res.ok) {
      showToast('No se pudo guardar');
      return;
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === editing.id ? { ...u, ...updates, name: `${updates.first_name} ${updates.last_name}`.trim() } : u))
    );
    setEditing(null);
    showToast('Guardado ✓');
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Usuarios</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        {users ? `${filtered.length} de ${users.length} candidatos` : 'Cargando...'}
      </p>

      {loadError && (
        <div style={{ background: '#fdecea', border: '.5px solid #f3c9c9', color: '#c0392b', borderRadius: 9, padding: '10px 14px', fontSize: 12.5, marginBottom: 16 }}>
          <i className="ti ti-alert-triangle"></i> Error al cargar: {loadError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          placeholder="Buscar por nombre, email, empresa, ciudad..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: '9px 13px',
            border: '.5px solid #e0dfd8',
            borderRadius: 9,
            fontSize: 13,
            outline: 'none',
          }}
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

      {users === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Cargando candidatos...</div>
      ) : (
        <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#faf9f5', textAlign: 'left' }}>
                {FIELDS.map((f) => (
                  <th key={f.key} style={{ padding: '10px 14px', fontWeight: 700, color: '#666', whiteSpace: 'nowrap' }}>
                    {f.label}
                  </th>
                ))}
                <th style={{ padding: '10px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} style={{ borderTop: '.5px solid #e0dfd8' }}>
                  {FIELDS.map((f) => (
                    <td
                      key={f.key}
                      onClick={() => copyValue(u[f.key])}
                      title="Clic para copiar"
                      style={{
                        padding: '9px 14px',
                        whiteSpace: 'nowrap',
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        cursor: u[f.key] ? 'pointer' : 'default',
                        color: u[f.key] ? '#333' : '#ccc',
                      }}
                    >
                      {f.key === 'cv_url' && u.cv_url ? (
                        <a href={u.cv_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: '#1d6f5c' }}>
                          Ver CV
                        </a>
                      ) : f.key === 'linkedin_url' && u.linkedin_url ? (
                        <a href={u.linkedin_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: '#1d6f5c' }}>
                          {u.linkedin_url}
                        </a>
                      ) : (
                        u[f.key] || '—'
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '9px 14px' }}>
                    <button
                      onClick={() => setEditing(u)}
                      style={{
                        border: '.5px solid #e0dfd8',
                        background: '#fff',
                        borderRadius: 7,
                        padding: '5px 10px',
                        fontSize: 11.5,
                        color: '#555',
                      }}
                    >
                      <i className="ti ti-edit" style={{ fontSize: 12 }}></i> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          }}
          onClick={(e) => e.target === e.currentTarget && setEditing(null)}
        >
          <form
            onSubmit={saveEdit}
            style={{ background: '#fff', borderRadius: 14, padding: 24, width: 420, maxWidth: '90vw', position: 'relative' }}
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

            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Editar candidato</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <FormField label="Nombre" name="first_name" defaultValue={editing.first_name} required />
              <FormField label="Apellidos" name="last_name" defaultValue={editing.last_name} required />
            </div>
            <FormField label="Título profesional" name="professional_title" defaultValue={editing.professional_title} />
            <FormField label="Ciudad" name="location" defaultValue={editing.location} />
            <FormField label="Teléfono" name="phone" defaultValue={editing.phone} />
            <FormField label="LinkedIn" name="linkedin_url" defaultValue={editing.linkedin_url} />

            <p style={{ fontSize: 11, color: '#999', margin: '4px 0 16px' }}>
              Email, empresa, sector y CV no son editables desde aquí — vienen de la cuenta de acceso o de la
              experiencia que el propio candidato ha añadido a su perfil.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
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

function FormField({ label, name, defaultValue, required }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#555', marginBottom: 4 }}>{label}</label>
      <input
        name={name}
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
