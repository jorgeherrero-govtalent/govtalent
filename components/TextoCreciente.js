'use client';

import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Caja de texto que crece hacia abajo según se escribe, como la de
 * Claude, hasta `maxAltura`; a partir de ahí hace scroll por dentro.
 *
 * La usan la tarjeta negra de la home (ConsolaAlarmas) y la página de
 * Alarmas (AlarmasTab): una sola pieza para que las dos cajas del agente
 * se comporten igual. Antes vivía dentro de AlarmasTab y la home usaba un
 * <input> de una línea, que no crecía.
 *
 * Intro envía y Mayúsculas + Intro hace un salto de línea: eso lo decide
 * quien la usa, con onKeyDown (ver `enviarConIntro`).
 */

// En el servidor useLayoutEffect avisa; allí no hay altura que medir.
const useAlturaEfecto = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const TextoCreciente = forwardRef(function TextoCreciente({ value, maxAltura = 320, style, ...resto }, refExterno) {
  const propio = useRef(null);
  const ref = refExterno || propio;

  useAlturaEfecto(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const alto = Math.min(el.scrollHeight, maxAltura);
    el.style.height = `${alto}px`;
    el.style.overflowY = el.scrollHeight > maxAltura ? 'auto' : 'hidden';
  }, [value, maxAltura]);

  return <textarea ref={ref} value={value} style={{ ...style, resize: 'none', overflowY: 'hidden' }} {...resto} />;
});

export default TextoCreciente;

/**
 * Intro envía; Mayúsculas + Intro, salto de línea. Mientras se compone un
 * acento o una ñ (isComposing) no se envía nada.
 */
export function enviarConIntro(enviar) {
  return (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
  };
}
