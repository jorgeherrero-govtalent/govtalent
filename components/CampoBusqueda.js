'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * El buscador de la plataforma: el mismo aspecto que el del menú lateral
 * (caja blanca de 9px, lupa gris y el atajo ⌘K a la derecha). Todos los
 * buscadores de las páginas pasan por aquí para que no vuelva a haber
 * uno distinto en cada pantalla. El estilo vive en globals.css (.gt-campo).
 *
 * - estilo: solo la colocación de la caja (flex, anchos, márgenes).
 * - atajo: false en los buscadores de dentro de un desplegable o un modal,
 *   donde el atajo no tiene sentido y la caja es demasiado estrecha.
 * - onLimpiar: si se pasa, aparece la × para vaciar cuando hay texto.
 * - como / cajaProps: para que la caja sea un <form> con su onSubmit.
 * - El resto de propiedades van al <input>.
 *
 * ⌘K (Ctrl K fuera de Mac) enfoca el buscador de la página; pulsado otra
 * vez con el foco ya dentro, pasa al buscador general del menú.
 */
export default function CampoBusqueda({
  estilo,
  className = '',
  atajo = true,
  como: Caja = 'label',
  cajaProps,
  inputRef,
  onLimpiar,
  ...input
}) {
  const propio = useRef(null);
  const ref = inputRef || propio;
  // Se decide tras montar: en el servidor no hay navigator y el primer
  // render tiene que coincidir.
  const [tecla, setTecla] = useState('⌘K');
  useEffect(() => {
    if (!/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '')) setTecla('Ctrl K');
  }, []);

  useEffect(() => {
    if (!atajo) return;
    function onKey(e) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || (e.key !== 'k' && e.key !== 'K')) return;
      const el = ref.current;
      if (!el || el.offsetParent === null) return;
      // Con varios buscadores a la vista, responde el primero.
      const primero = Array.from(document.querySelectorAll('input[data-gt-atajo]')).find((x) => x.offsetParent !== null);
      // Si el foco ya está aquí, se deja pasar: lo recoge el del menú.
      if (primero !== el || document.activeElement === el) return;
      e.preventDefault();
      e.stopPropagation();
      el.focus();
      el.select();
    }
    // En captura, para llegar antes que el buscador del menú.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [atajo, ref]);

  return (
    <Caja className={`gt-campo${className ? ` ${className}` : ''}`} style={estilo} {...cajaProps}>
      <i className="ti ti-search" aria-hidden="true"></i>
      <input ref={ref} data-gt-atajo={atajo ? '' : undefined} {...input} />
      {onLimpiar && input.value ? (
        <button
          type="button"
          className="gt-campo-x"
          aria-label="Borrar la búsqueda"
          onClick={(e) => {
            e.preventDefault();
            onLimpiar();
            ref.current?.focus();
          }}
        >
          <i className="ti ti-x" aria-hidden="true"></i>
        </button>
      ) : null}
      {atajo && !input.value && (
        <span className="gt-campo-kbd" aria-hidden="true">
          {tecla}
        </span>
      )}
    </Caja>
  );
}
