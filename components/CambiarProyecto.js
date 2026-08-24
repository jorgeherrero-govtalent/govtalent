'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Cambiar de proyecto desde el título.
 *
 * Sustituye a la lateral izquierda. El razonamiento: la lateral solo
 * servía para cambiar de proyecto, que se hace de vez en cuando; el
 * índice sirve para moverse dentro, que se hace todo el tiempo. Darle
 * una columna permanente a lo primero y no a lo segundo estaba al revés.
 *
 * Con buscador y atajo de teclado, porque con veinte proyectos y nombres
 * como "Modificación de la Directiva de servicios digitales" leer una
 * lista es más lento que escribir tres letras.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';

export default function CambiarProyecto({ proyectos, actual, novedades = {}, onElegir, onNuevo, onVerTodos }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const caja = useRef(null);

  // ⌘K o Ctrl+K abre el buscador desde cualquier parte de la página.
  useEffect(() => {
    function tecla(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierto(true);
        setQ('');
      }
      if (e.key === 'Escape') setAbierto(false);
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e) {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false);
    }
    // En el mismo tick el clic que abre cerraría el panel.
    const t = setTimeout(() => window.addEventListener('click', fuera), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('click', fuera);
    };
  }, [abierto]);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return proyectos;
    return proyectos.filter((p) => p.name.toLowerCase().includes(texto));
  }, [proyectos, q]);

  return (
    <div ref={caja} style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
      <button
        onClick={() => {
          setAbierto((v) => !v);
          setQ('');
        }}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          background: abierto ? '#f0eefe' : 'transparent',
          border: 'none',
          borderRadius: 8,
          padding: '3px 9px 3px 4px',
          margin: '-3px -4px',
          maxWidth: '100%',
        }}
      >
        <span
          style={{
            fontSize: 19,
            fontWeight: 600,
            lineHeight: 1.35,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {actual?.name || 'Proyecto'}
        </span>
        <i
          className="ti ti-chevron-down"
          style={{ fontSize: 16, color: abierto ? MORADO : '#a8a49c', flexShrink: 0 }}
          aria-hidden="true"
        ></i>
      </button>

      {abierto && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 6px)',
            width: 320,
            maxWidth: '90vw',
            background: '#fff',
            border: `.5px solid ${BORDE}`,
            borderRadius: 10,
            boxShadow: '0 6px 20px rgba(0,0,0,.1)',
            padding: 7,
            zIndex: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              border: `.5px solid ${BORDE}`,
              borderRadius: 8,
              padding: '6px 9px',
              marginBottom: 7,
              background: '#fafaf7',
            }}
          >
            <i className="ti ti-search" style={{ fontSize: 14, color: '#a8a49c' }}></i>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && visibles[0]) {
                  onElegir(visibles[0].id);
                  setAbierto(false);
                }
              }}
              placeholder="Buscar proyecto…"
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'none',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: '#a8a49c',
                border: `.5px solid ${BORDE}`,
                borderRadius: 4,
                padding: '1px 5px',
                fontFamily: 'ui-monospace, monospace',
                flexShrink: 0,
              }}
            >
              ⌘K
            </span>
          </div>

          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {visibles.length === 0 && (
              <div style={{ fontSize: 12, color: '#999', padding: '8px 9px' }}>
                Ningún proyecto con ese nombre.
              </div>
            )}

            {visibles.map((p) => {
              const on = p.id === actual?.id;
              const nov = novedades[p.id] || 0;
              return (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onElegir(p.id);
                    setAbierto(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 9px',
                    marginBottom: 2,
                    border: 'none',
                    borderRadius: 7,
                    background: on ? '#f0eefe' : 'transparent',
                  }}
                >
                  <i
                    className="ti ti-folder"
                    style={{ fontSize: 14, color: on ? MORADO : '#a8a49c', flexShrink: 0 }}
                  ></i>
                  <span
                    style={{
                      fontSize: 12,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: on ? 500 : 400,
                      color: on ? '#1a1a18' : '#555',
                    }}
                  >
                    {p.name}
                  </span>
                  {nov > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        background: MORADO,
                        color: '#fff',
                        borderRadius: 20,
                        padding: '0 5px',
                        flexShrink: 0,
                      }}
                    >
                      {nov}
                    </span>
                  )}
                  {on && (
                    <i className="ti ti-check" style={{ fontSize: 13, color: MORADO, flexShrink: 0 }}></i>
                  )}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: `.5px solid ${BORDE}`,
              marginTop: 6,
              paddingTop: 7,
            }}
          >
            <button
              onClick={() => {
                setAbierto(false);
                onNuevo();
              }}
              style={{ background: 'none', border: 'none', color: MORADO, fontSize: 11.5, padding: '0 9px' }}
            >
              + Nuevo proyecto
            </button>
            <button
              onClick={() => {
                setAbierto(false);
                onVerTodos();
              }}
              style={{ background: 'none', border: 'none', color: '#888', fontSize: 11.5, padding: '0 9px' }}
            >
              Ver todos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
