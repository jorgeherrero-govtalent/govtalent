'use client';

// Donut de porcentaje en SVG puro (sin librerías). Muestra un anillo de
// color con el porcentaje en el centro, más una leyenda con el desglose.
export default function DonutStat({ title, pct, count, total, color = '#6d5aef', label, otherLabel }) {
  const size = 132;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f1ec" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
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
          <div style={{ fontSize: 22, fontWeight: 800, color: '#222' }}>{pct}%</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#222', marginBottom: 10 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#555', marginBottom: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }}></span>
          {label}: <b style={{ color: '#222' }}>{count}</b>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#555' }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: '#f1f1ec', flexShrink: 0 }}></span>
          {otherLabel}: <b style={{ color: '#222' }}>{total - count}</b>
        </div>
      </div>
    </div>
  );
}
