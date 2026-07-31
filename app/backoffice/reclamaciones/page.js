'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const STATUS_LABELS = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

export default function ClaimsBackofficePage() {
  const supabase = createClient();
  const [claims, setClaims] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch('/api/backoffice/organizations/claims');
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'No se pudieron cargar las reclamaciones');
      setClaims([]);
      return;
    }
    setClaims(data.claims || []);
  }

  async function viewDocument(claimId) {
    try {
      const res = await fetch('/api/organizations/claims/document-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo abrir el documento');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast(err.message);
    }
  }

  async function approve(claimId) {
    setBusyId(claimId);
    const res = await fetch(`/api/backoffice/organizations/claims/${claimId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      toast(data.error || 'No se pudo aprobar la solicitud');
      return;
    }
    toast('Reclamación aprobada ✓');
    load();
  }

  async function reject(claimId) {
    setBusyId(claimId);
    const res = await fetch(`/api/backoffice/organizations/claims/${claimId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', rejectionReason }),
    });
    const data = await res.json();
    setBusyId(null);
    setRejectingId(null);
    setRejectionReason('');
    if (!res.ok) {
      toast(data.error || 'No se pudo rechazar la solicitud');
      return;
    }
    toast('Reclamación rechazada');
    load();
  }

  async function revoke(claimId) {
    if (!window.confirm('¿Seguro que quieres revocar esta aprobación? El usuario perderá el acceso a la organización.')) return;
    setBusyId(claimId);
    const res = await fetch(`/api/backoffice/organizations/claims/${claimId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke' }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      toast(data.error || 'No se pudo revocar la aprobación');
      return;
    }
    toast('Aprobación revocada ✓');
    load();
  }

  if (claims === null) return <div className="spinner"></div>;

  const filtered = claims.filter((c) => filter === 'all' || c.status === filter);
  const pendingCount = claims.filter((c) => c.status === 'pending').length;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 4px' }}>Reclamaciones de organización</h1>
      <p style={{ fontSize: 12.5, color: '#888', margin: '0 0 18px' }}>
        Solicitudes de representantes que quieren gestionar la página de su organización.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          ['pending', `Pendientes (${pendingCount})`],
          ['approved', 'Aprobadas'],
          ['rejected', 'Rechazadas'],
          ['all', 'Todas'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '.5px solid #e0dfd8',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: filter === key ? '#f0f8f5' : '#fff',
              color: filter === key ? '#1d6f5c' : '#666',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 13 }}>No hay reclamaciones en esta vista.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((c) => (
          <div key={c.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{c.organizations?.name || 'Organización eliminada'}</div>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 20,
                      background: c.claim_type === 'verification' ? '#eef0fb' : '#f0f8f5',
                      color: c.claim_type === 'verification' ? '#4a4fc4' : '#1d6f5c',
                    }}
                  >
                    {c.claim_type === 'verification' ? 'Verificación' : 'Reclamación'}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: '#666', marginTop: 2 }}>
                  {c.users?.first_name} {c.users?.last_name} · {c.users?.email}
                </div>
                {c.role_title && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Cargo: {c.role_title}</div>}
                {c.note && <div style={{ fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic' }}>“{c.note}”</div>}
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{new Date(c.created_at).toLocaleString('es-ES')}</div>
              </div>
              <div
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 20,
                  background: c.status === 'pending' ? '#fdf3e0' : c.status === 'approved' ? '#e8f7ef' : '#fbe9e9',
                  color: c.status === 'pending' ? '#b8860b' : c.status === 'approved' ? '#1d9d63' : '#c0392b',
                }}
              >
                {STATUS_LABELS[c.status]}
              </div>
            </div>

            {c.status === 'rejected' && c.rejection_reason && (
              <div style={{ fontSize: 12, color: '#a33', marginTop: 8 }}>Motivo del rechazo: {c.rejection_reason}</div>
            )}

            {c.status === 'pending' && c.organizations?.claimed && (
              <div style={{ fontSize: 12, color: '#a33', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-alert-triangle"></i> Esta organización ya fue reclamada por otra solicitud. Revisa antes de aprobar.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn-o" style={{ fontSize: 12.5 }} onClick={() => viewDocument(c.id)}>
                <i className="ti ti-file-text"></i> Ver documento
              </button>
              {c.organizations?.slug && (
                <a
                  href={`/organizations/${c.organizations.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-o"
                  style={{ fontSize: 12.5, textDecoration: 'none' }}
                >
                  <i className="ti ti-external-link"></i> Ver página
                </a>
              )}

              {c.status === 'pending' && (
                <>
                  <button className="btn-p" style={{ fontSize: 12.5 }} disabled={busyId === c.id} onClick={() => approve(c.id)}>
                    <i className="ti ti-check"></i> Aprobar
                  </button>
                  {rejectingId === c.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%', marginTop: 6 }}>
                      <input
                        autoFocus
                        placeholder="Motivo del rechazo (opcional)"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        style={{ flex: 1, padding: '6px 10px', border: '.5px solid #e0dfd8', borderRadius: 7, fontSize: 12.5 }}
                      />
                      <button className="btn-o" style={{ fontSize: 12.5 }} disabled={busyId === c.id} onClick={() => reject(c.id)}>
                        Confirmar
                      </button>
                      <button
                        style={{ fontSize: 12.5, background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}
                        onClick={() => {
                          setRejectingId(null);
                          setRejectionReason('');
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-o"
                      style={{ fontSize: 12.5, color: '#a33', borderColor: '#e8c8c8' }}
                      onClick={() => setRejectingId(c.id)}
                    >
                      <i className="ti ti-x"></i> Rechazar
                    </button>
                  )}
                </>
              )}

              {c.status === 'approved' && (
                <button
                  className="btn-o"
                  style={{ fontSize: 12.5, color: '#a33', borderColor: '#e8c8c8' }}
                  disabled={busyId === c.id}
                  onClick={() => revoke(c.id)}
                >
                  <i className="ti ti-rotate"></i> Revocar aprobación
                </button>
              )}

              {c.status === 'rejected' && (
                <button className="btn-p" style={{ fontSize: 12.5 }} disabled={busyId === c.id} onClick={() => approve(c.id)}>
                  <i className="ti ti-check"></i> Aprobar de todos modos
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
