'use client';

// Ranking tipo "leaderboard": icono + título, y filas numeradas con barra de
// degradado que se va difuminando a medida que baja el puesto. Inspirado en
// paneles de BI tipo Scoutyn, hecho solo con CSS (sin librerías de gráficos).
export default function RankingList({ icon, title, data, iconColor = '#1d6f5c', iconBg = '#eaf5f0', emptyLabel = 'Sin datos suficientes' }) {
  const max = Math.max(1, ...data.map((d) => d.value));

  // Degradado de intensidad por puesto: el primero con el color pleno, el
  // resto cada vez más claro (mismo tono, distinta opacidad).
  const opacityForRank = (i) => Math.max(0.28, 1 - i * 0.16);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: iconBg,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          <i className={`ti ${icon}`}></i>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#222' }}>{title}</div>
      </div>

      {data.length === 0 ? (
        <div style={{ fontSize: 12, color: '#999' }}>{emptyLabel}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {data.map((d, i) => (
            <div key={d.label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: iconColor,
                    opacity: opacityForRank(i),
                    color: '#fff',
                    fontSize: 10.5,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12.5,
                    color: '#444',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {d.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: iconColor, flexShrink: 0 }}>{d.value}</span>
              </div>
              <div style={{ height: 7, borderRadius: 6, background: '#f1f1ec', overflow: 'hidden', marginLeft: 29 }}>
                <div
                  style={{
                    width: `${(d.value / max) * 100}%`,
                    height: '100%',
                    borderRadius: 6,
                    background: iconColor,
                    opacity: opacityForRank(i),
                  }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
