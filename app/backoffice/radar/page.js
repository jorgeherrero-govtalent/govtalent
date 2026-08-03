'use client';

import { useEffect, useState } from 'react';

const ESTADO_LABELS = {
  detectado: 'Detectado',
  probable: 'Alta probabilidad',
  confirmado: 'Confirmado',
  descartado: 'Descartado',
};

const ESTADO_COLORS = {
  detectado: { bg: '#f0efe9', color: '#77766f' },
  probable: { bg: '#f0edfe', color: '#6d5aef' },
  confirmado: { bg: '#eaf3ee', color: '#1d6f5c' },
  descartado: { bg: '#fbeceb', color: '#c2534e' },
};

export default function RadarBackoffice() {
  const [claims, setClaims] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [filter, setFilter] = useState('pendientes');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch('/api/backoffice/radar-claims');
    const data = await res.json();
    setClaims(data.claims || []);
  }

  async function runScan() {
    setScanning(true);
    setScanMessage('');
    try {
      const res = await fetch('/api/admin/radar-scan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setScanMessage(data.error || 'Error al ejecutar la búsqueda.');
      } else {
        setScanMessage(`${data.created || 0} hallazgo(s) nuevo(s) añadidos a la cola de revisión.`);
        load();
      }
    } catch (e) {
      setScanMessage('No se pudo conectar con el motor de búsqueda.');
    } finally {
      setScanning(false);
    }
  }

  async function handleAction(claimId, action) {
    setBusyId(claimId);
    try {
      await fetch('/api/backoffice/radar-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: claimId, action }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const filtered = (claims || []).filter((c) => {
    if (filter === 'pendientes') return c.status === 'detectado' || c.status === 'probable';
    if (filter === 'confirmados') return c.status === 'confirmado';
    if (filter === 'descartados') return c.status === 'descartado';
    return true;
  });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Radar de inteligencia — cola de revisión</h1>
          <p style={{ fontSize: 12.5, color: '#888', margin: '4px 0 0' }}>
            Ningún hallazgo llega al usuario sin pasar por aquí primero.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <button
            onClick={runScan}
            disabled={scanning}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              borderRadius: 8,
              border: 'none',
              background: scanning ? '#c9c1f7' : '#6d5aef',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: scanning ? 'default' : 'pointer',
            }}
          >
            <i className="ti ti-radar-2"></i> {scanning ? 'Buscando…' : 'Ejecutar búsqueda ahora'}
          </button>
          {scanMessage && <div style={{ fontSize: 11.5, color: '#8a897f', marginTop: 6, maxWidth: 260 }}>{scanMessage}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          ['pendientes', 'Pendientes'],
          ['confirmados', 'Aprobados'],
          ['descartados', 'Descartados'],
          ['todos', 'Todos'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid #e0dfd8',
              background: filter === key ? '#15140f' : '#fff',
              color: filter === key ? '#fff' : '#3a3a36',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {claims === null ? (
        <div style={{ fontSize: 13, color: '#888' }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: '#888', padding: '30px 0', textAlign: 'center' }}>
          No hay claims en esta categoría todavía.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((c) => {
            const colors = ESTADO_COLORS[c.status] || ESTADO_COLORS.detectado;
            return (
              <div key={c.id} style={{ background: '#fff', border: '1px solid #eceae2', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 20,
                          background: colors.bg,
                          color: colors.color,
                        }}
                      >
                        {ESTADO_LABELS[c.status]} · {c.confidence_score} pts
                      </span>
                      <span style={{ fontSize: 11, color: '#a3a297' }}>
                        {c.claim_type === 'departure' ? 'Cese' : 'Nombramiento'}
                      </span>
                      {!c.organization_id && (
                        <span style={{ fontSize: 11, color: '#c2534e' }}>Organización sin vincular al directorio</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#15140f' }}>{c.person_name}</div>
                    <div style={{ fontSize: 12.5, color: '#57564f', marginTop: 2 }}>
                      {c.role_title || 'Cargo no especificado'} · {c.organization_name || 'Organización desconocida'}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#3a3a36', marginTop: 8 }}>{c.claim_text}</div>

                    {c.evidence?.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0efe9' }}>
                        {c.evidence.map((e) => (
                          <div key={e.id} style={{ fontSize: 11.5, color: '#8a897f', marginBottom: 4 }}>
                            <i className="ti ti-link" style={{ fontSize: 11 }}></i>{' '}
                            {e.provider || e.source_type} —{' '}
                            {e.source_url ? (
                              <a href={e.source_url} target="_blank" rel="noreferrer" style={{ color: '#6d5aef' }}>
                                ver fuente
                              </a>
                            ) : (
                              'sin URL'
                            )}{' '}
                            ({e.points} pts)
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {(c.status === 'detectado' || c.status === 'probable') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => handleAction(c.id, 'approve')}
                        disabled={busyId === c.id}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#1d6f5c',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Aprobar y publicar
                      </button>
                      <button
                        onClick={() => handleAction(c.id, 'discard')}
                        disabled={busyId === c.id}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 8,
                          border: '1px solid #e0dfd8',
                          background: '#fff',
                          color: '#3a3a36',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Descartar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
