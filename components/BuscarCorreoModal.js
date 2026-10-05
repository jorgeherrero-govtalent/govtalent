'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Buscar el correo de una persona que la fuente no trae. PRÓXIMAMENTE.
 *
 * Se abre desde el botón de «play» de cada persona sin correo en las
 * fichas del directorio. Enseña ya cómo funcionará —dos modos, rápido y
 * profundo, con su coste— pero el botón de buscar está desactivado: no
 * hay motor detrás todavía. Formato tomado del modal «Enriquecer email»
 * de Enginy (05-10-2026).
 *
 * Sin morado: es una acción del usuario, no una función de plataforma
 * activa, y la ficha va en grises.
 */

const BORDE = '#e0dfd8';

const MODOS = [
  {
    id: 'profundo',
    icono: 'ti-database-search',
    titulo: 'Profundo, con mayor tasa de acierto',
    texto: 'Consultaremos más fuentes de datos, pero puede tardar más.',
  },
  {
    id: 'rapido',
    icono: 'ti-bolt',
    titulo: 'Rápido',
    texto: 'Solo consultaremos las fuentes de datos más rápidas.',
  },
];

export default function BuscarCorreoModal({ persona, onClose }) {
  const [modo, setModo] = useState('rapido');
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="buscar-correo-titulo" style={{ maxWidth: 460 }}>
        <div className="modal-head" style={{ borderBottom: 'none', paddingBottom: 6, marginBottom: 6 }}>
          <h2 id="buscar-correo-titulo" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17 }}>
            Buscar correo
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 9px',
                borderRadius: 20,
                background: '#f5f4f1',
                color: '#57534e',
              }}
            >
              Próximamente
            </span>
          </h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Cerrar">
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        {persona ? (
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px', lineHeight: 1.55 }}>
            {persona.nombre}
            {persona.cargo ? ` · ${persona.cargo}` : ''}
          </p>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="radiogroup" aria-label="Modo de búsqueda">
          {MODOS.map((m) => {
            const activo = modo === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => setModo(m.id)}
                style={{
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  border: `1px solid ${activo ? '#1a1a18' : BORDE}`,
                  background: activo ? '#f5f4f1' : '#fff',
                  borderRadius: 12,
                  padding: '14px 16px',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 600, color: '#1a1a18' }}>
                  <i className={`ti ${m.icono}`} style={{ fontSize: 17, color: '#767670' }} aria-hidden="true"></i>
                  {m.titulo}
                </span>
                <span style={{ display: 'block', fontSize: 12.5, color: '#767670', marginTop: 6, lineHeight: 1.5 }}>{m.texto}</span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 20,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 12.5, color: '#767670' }}>Esta función estará disponible muy pronto.</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13, color: '#57534e', cursor: 'pointer', padding: '9px 10px' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled
              title="Próximamente"
              style={{
                border: 'none',
                borderRadius: 9,
                padding: '9px 16px',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                background: '#f0efe9',
                color: '#8b8780',
                cursor: 'not-allowed',
              }}
            >
              Buscar correo
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
