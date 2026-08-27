'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Desplegable.
 *
 * Sustituye a <select>, cuyo panel lo dibuja el sistema operativo: el
 * resaltado azul de la opción marcada no se puede cambiar con CSS en
 * ningún navegador, y desentona con el resto del producto.
 *
 * Mismo planteamiento que SelectorFecha —portal, posicionamiento por
 * getBoundingClientRect, cierre al pulsar fuera o con Escape— para que
 * los dos campos se comporten igual dentro de un formulario.
 *
 * Va en un portal porque cualquier padre con overflow oculto recortaría
 * el panel.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';

export default function Desplegable({
  value,
  onChange,
  opciones = [],
  placeholder = 'Elegir',
  ancho,
  // Cuando se permite no elegir nada. La etiqueta la decide quien lo usa
  // porque no es lo mismo "Sin especificar" que "Todos".
  vacio,
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState(null);
  const boton = useRef(null);
  const panel = useRef(null);

  const lista = vacio ? [{ v: '', label: vacio }, ...opciones] : opciones;
  const elegida = lista.find((o) => String(o.v) === String(value ?? ''));

  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    // Alto estimado del panel, acotado: con muchas opciones se hace
    // desplazable en vez de crecer sin fin.
    const alto = Math.min(lista.length * 34 + 12, 280);
    const arriba = r.bottom + alto > window.innerHeight && r.top > alto;
    setPos({
      left: Math.min(r.left, window.innerWidth - r.width - 12),
      top: arriba ? r.top - alto - 6 : r.bottom + 6,
      width: r.width,
    });
  }, [abierto, lista.length]);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e) {
      if (boton.current?.contains(e.target) || panel.current?.contains(e.target)) return;
      setAbierto(false);
    }
    function tecla(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    // El setTimeout evita que el mismo clic que abre lo cierre.
    const t = setTimeout(() => window.addEventListener('click', fuera), 0);
    window.addEventListener('keydown', tecla);
    return () => {
      clearTimeout(t);
      window.removeEventListener('click', fuera);
      window.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  function elegir(v) {
    onChange(v === '' ? null : v);
    setAbierto(false);
  }

  const campo = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: ancho || '100%',
    padding: '9px 12px',
    border: `.5px solid ${abierto ? MORADO : BORDE}`,
    borderRadius: 9,
    background: '#fafaf7',
    fontSize: 13,
    fontFamily: 'inherit',
    color: elegida && elegida.v !== '' ? '#1a1a18' : '#a8a49c',
    textAlign: 'left',
    cursor: 'pointer',
  };

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        style={campo}
      >
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {elegida ? elegida.label : placeholder}
        </span>
        <i
          className={`ti ti-chevron-${abierto ? 'up' : 'down'}`}
          style={{ fontSize: 14, color: '#a8a49c', flexShrink: 0 }}
        ></i>
      </button>

      {abierto &&
        pos &&
        createPortal(
          <div
            ref={panel}
            role="listbox"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: pos.width,
              maxHeight: 280,
              overflowY: 'auto',
              background: '#fff',
              border: `.5px solid ${BORDE}`,
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,.10)',
              padding: 5,
              zIndex: 400,
            }}
          >
            {lista.map((o) => {
              const activa = String(o.v) === String(value ?? '');
              return (
                <div
                  key={String(o.v)}
                  role="option"
                  aria-selected={activa}
                  onClick={() => elegir(o.v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '7px 10px',
                    borderRadius: 7,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    // La opción marcada se distingue por fondo suave y
                    // color de marca, no por el azul del sistema.
                    background: activa ? '#efedff' : 'transparent',
                    color: activa ? MORADO : '#3d3a35',
                    fontWeight: activa ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!activa) e.currentTarget.style.background = '#f5f4f1';
                  }}
                  onMouseLeave={(e) => {
                    if (!activa) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.label}
                  </span>
                  {activa && <i className="ti ti-check" style={{ fontSize: 12, flexShrink: 0 }}></i>}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
