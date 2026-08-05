'use client';

import { useEffect, useState } from 'react';

const CONFIANZA_LABELS = { alta: 'Confianza alta', media: 'Confianza media', baja: 'Confianza baja' };
const CONFIANZA_COLORS = {
  alta: { bg: '#eaf3ee', color: '#1d6f5c' },
  media: { bg: '#fdf3e3', color: '#a3862f' },
  baja: { bg: '#f0efe9', color: '#77766f' },
};

export default function RadiografiaModal({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showMetodologia, setShowMetodologia] = useState(false);

  useEffect(() => {
    fetch('/api/radiografia/calcular')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.message || 'No se pudo calcular tu Radiografía Profesional.');
        else setData(d);
      })
      .catch(() => setError('No se pudo calcular tu Radiografía Profesional.'));
  }, []);

  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 580 }}>
        <div className="modal-head">
          <h2>Tu Radiografía Profesional</h2>
          <div className="modal-x" onClick={onClose}>
            <i className="ti ti-x"></i>
          </div>
        </div>

        {error && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#8a897f', fontSize: 13 }}>{error}</div>
        )}

        {!error && !data && (
          <div style={{ padding: '30px 0', textAlign: 'center', color: '#8a897f', fontSize: 13 }}>Calculando…</div>
        )}

        {data && (
          <div>
            {/* Bloque 2 — Trayectoria profesional, protagonista */}
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #eceae2' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#a3a297', letterSpacing: '.03em', marginBottom: 8 }}>
                TU TRAYECTORIA SE APROXIMA A
              </div>
              {data.trayectoria.rol ? (
                <>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#f0edfe',
                      border: '1px solid #d9d2f9',
                      borderRadius: 20,
                      padding: '8px 16px',
                      marginBottom: 10,
                    }}
                  >
                    <i className="ti ti-sparkles" style={{ fontSize: 15, color: '#6d5aef' }}></i>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#15140f' }}>{data.trayectoria.rol}</span>
                  </div>
                  <div>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 20,
                        background: CONFIANZA_COLORS[data.trayectoria.confianza].bg,
                        color: CONFIANZA_COLORS[data.trayectoria.confianza].color,
                      }}
                    >
                      {CONFIANZA_LABELS[data.trayectoria.confianza]}
                    </span>
                  </div>
                  {data.trayectoria.mensaje_comparacion && (
                    <div style={{ fontSize: 12.5, color: '#57564f', marginTop: 10 }}>{data.trayectoria.mensaje_comparacion}</div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: '#8a897f' }}>
                  Todavía no tenemos suficiente información en tu perfil para calcular tu trayectoria.
                </div>
              )}
            </div>

            {/* Bloque 1 — Benchmark, como apoyo */}
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #eceae2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                  <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="32" cy="32" r="26" fill="none" stroke="#e2dcf8" strokeWidth="8" />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="#6d5aef"
                      strokeWidth="8"
                      strokeDasharray={`${(data.benchmark.porcentaje / 100) * 163} 163`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14.5,
                      fontWeight: 700,
                      color: '#15140f',
                    }}
                  >
                    {data.benchmark.porcentaje}%
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: '#57564f', lineHeight: 1.5 }}>
                  Compatibilidad con el perfil característico del sector
                  {data.benchmark.criterios_evaluados < 5 && (
                    <div style={{ fontSize: 11, color: '#a3a297', marginTop: 4 }}>
                      Basado en {data.benchmark.criterios_evaluados} de 5 criterios disponibles
                    </div>
                  )}
                </div>
              </div>

              <div>
                {data.benchmark.criterios.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 9 }}>
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: c.cumplido ? '#6d5aef' : '#e0dfd8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {c.cumplido && <i className="ti ti-check" style={{ fontSize: 10, color: '#fff' }}></i>}
                    </span>
                    <div>
                      <div style={{ fontSize: 12.5, color: '#15140f', fontWeight: c.cumplido ? 600 : 400 }}>{c.label}</div>
                      {c.detalle && <div style={{ fontSize: 11, color: '#8a897f', marginTop: 1 }}>{c.detalle}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {data.benchmark.mensaje_ajuste && (
                <div style={{ fontSize: 11.5, color: '#8a897f', marginTop: 10, fontStyle: 'italic' }}>
                  {data.benchmark.mensaje_ajuste}
                </div>
              )}
            </div>

            {/* Bloque 3 — Recomendaciones */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15140f', marginBottom: 10 }}>
                ¿Cómo podrías mejorar tu perfil?
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {data.recomendaciones.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#faf9f5',
                      border: '1px solid #eceae2',
                      borderRadius: 9,
                      padding: '9px 11px',
                    }}
                  >
                    <i className={`ti ${r.icon}`} style={{ fontSize: 15, color: '#6d5aef', flexShrink: 0 }}></i>
                    <span style={{ fontSize: 11.5, color: '#15140f', fontWeight: 600 }}>{r.titulo}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Conclusión */}
            <div
              style={{
                background: '#15140f',
                borderRadius: 12,
                padding: '14px 16px',
                fontSize: 12.5,
                color: '#e8e6de',
                lineHeight: 1.6,
                marginBottom: 14,
              }}
            >
              {data.conclusion}
            </div>

            {/* Metodología */}
            <div
              onClick={() => setShowMetodologia((v) => !v)}
              style={{ fontSize: 11.5, color: '#6d5aef', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}
            >
              ¿Cómo calculamos este resultado? <i className={`ti ${showMetodologia ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
            </div>
            {showMetodologia && (
              <div style={{ marginTop: 10, fontSize: 11, color: '#8a897f', lineHeight: 1.6 }}>
                <div style={{ marginBottom: 6 }}>
                  <b>Compatibilidad:</b> {data.benchmark.fuente}
                </div>
                <div style={{ marginBottom: 6 }}>
                  <b>Trayectoria:</b> {data.trayectoria.fuente}
                </div>
                <div>
                  <b>Recomendaciones:</b> Generadas automáticamente por GovTalent según tu perfil profesional y tu
                  actividad en la plataforma.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
