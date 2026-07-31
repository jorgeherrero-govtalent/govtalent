'use client';

// Widget de checklist de progreso, reutilizable tanto para el perfil de
// candidato como para el panel de organización. No es un pop-up: vive
// integrado en la página, así que no interrumpe ni se puede "cerrar sin
// querer" perdiendo el contexto.
export default function ProgressChecklist({ title, items, hint, pct: pctOverride, hideWhenComplete = false }) {
  const doneCount = items.filter((i) => i.done).length;
  const pct = pctOverride ?? (items.length ? Math.round((doneCount / items.length) * 100) : 0);

  if (hideWhenComplete && pct >= 100) return null;

  return (
    <div className="sw">
      <h4>{title}</h4>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 7 }}>
        Completado al <b style={{ color: '#1d6f5c' }}>{pct}%</b>
      </div>
      <div style={{ background: '#f0efe9', borderRadius: 6, height: 6, marginBottom: pct >= 100 ? 0 : 12 }}>
        <div style={{ background: '#1d6f5c', borderRadius: 6, height: 6, width: `${pct}%`, transition: 'width .3s ease' }}></div>
      </div>
      {pct < 100 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <div
              key={item.label}
              onClick={!item.done ? item.onClick : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: !item.done && item.onClick ? 'pointer' : 'default' }}
            >
              <i
                className={`ti ${item.done ? 'ti-circle-check-filled' : 'ti-circle'}`}
                style={{ fontSize: 15, color: item.done ? '#1d9d63' : '#ccc', flexShrink: 0 }}
              ></i>
              <span
                style={{
                  color: item.done ? '#888' : item.onClick ? '#1d6f5c' : '#333',
                  fontWeight: !item.done && item.onClick ? 500 : 400,
                  textDecoration: item.done ? 'line-through' : 'none',
                }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
      {hint && pct < 100 && <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 10 }}>{hint}</div>}
    </div>
  );
}
