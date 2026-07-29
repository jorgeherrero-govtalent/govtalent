'use client';

// Gráfico de barras horizontal sencillo, sin ninguna librería externa —
// solo CSS. `data` debe venir como [{ label, value }], ya ordenado si se
// quiere un orden concreto.
export default function SimpleBarChart({ title, data, color = '#1d6f5c', emptyLabel = 'Sin datos suficientes' }) {
  const safeData = data || [];
  const max = Math.max(1, ...safeData.map((d) => d.value));

  return (
    <div className="card" style={{ padding: 18 }}>
      {title && <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{title}</div>}
      {safeData.length === 0 ? (
        <div style={{ fontSize: 12, color: '#999' }}>{emptyLabel}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {safeData.map((d) => (
            <div key={d.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, gap: 8 }}>
                <span style={{ color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                <span style={{ fontWeight: 600, color: '#333', flexShrink: 0 }}>{d.value}</span>
              </div>
              <div style={{ background: '#f0f0ec', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${(d.value / max) * 100}%`, background: color, height: '100%', borderRadius: 6 }}></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
