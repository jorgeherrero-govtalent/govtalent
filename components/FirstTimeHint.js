'use client';

import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'gt_hint_seen_';

// Aviso puntual que se muestra la primera vez que el usuario ve un elemento
// concreto (identificado por hintKey), y nunca más después de eso. Se guarda
// en localStorage del propio navegador -- no hace falta tocar la base de
// datos ni el backend para esto.
export default function FirstTimeHint({ hintKey, message, position = 'bottom', children }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_PREFIX + hintKey);
      if (!seen) {
        setVisible(true);
        localStorage.setItem(STORAGE_PREFIX + hintKey, '1');
      }
    } catch {
      // localStorage no disponible (modo privado, navegador restringido...):
      // simplemente no mostramos el aviso, no es crítico.
    }
  }, [hintKey]);

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      {visible && (
        <div
          style={{
            position: 'absolute',
            [position === 'bottom' ? 'top' : 'bottom']: '100%',
            left: 0,
            marginTop: position === 'bottom' ? 8 : 0,
            marginBottom: position === 'top' ? 8 : 0,
            background: '#1a1a18',
            color: '#fff',
            padding: '9px 12px',
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.4,
            width: 220,
            zIndex: 50,
            boxShadow: '0 6px 20px rgba(0,0,0,.2)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <i className="ti ti-bulb" style={{ color: '#ffd166', fontSize: 14, flexShrink: 0, marginTop: 1 }}></i>
          <span style={{ flex: 1 }}>{message}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setVisible(false);
            }}
            style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1, flexShrink: 0 }}
          >
            <i className="ti ti-x"></i>
          </button>
        </div>
      )}
    </span>
  );
}
