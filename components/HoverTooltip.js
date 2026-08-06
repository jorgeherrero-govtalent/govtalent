'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

// Reemplazo del patrón .tt / .tt-bubble (position:absolute dentro del propio
// elemento) para los casos en los que ese elemento vive dentro de un
// contenedor con overflow:hidden — por ejemplo el badge de verificación en
// las filas de la vista de listado del directorio (.dir-list tiene
// overflow:hidden por las esquinas redondeadas, y eso recortaba el tooltip
// de las primeras filas). Se renderiza en document.body vía portal y se
// posiciona con getBoundingClientRect, así que nunca lo recorta un
// ancestro, sea cual sea la vista o el scroll.
export default function HoverTooltip({ label, children }) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const anchorRef = useRef(null);

  function handleEnter() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({ top: rect.top - 9, left: rect.left + rect.width / 2 });
    }
    setShow(true);
  }

  return (
    <span
      ref={anchorRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: 'translate(-50%, -100%)',
              background: '#1a1a18',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              padding: '6px 11px',
              borderRadius: 7,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          >
            {label}
            <span
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                border: '5px solid transparent',
                borderTopColor: '#1a1a18',
              }}
            />
          </span>,
          document.body
        )}
    </span>
  );
}
