'use client';

/**
 * El interruptor de la aplicación.
 *
 * Vivía dentro de AvisosTab como función privada. Se saca aquí porque lo
 * usa también el alta de organización, y dos copias del mismo control se
 * separan sin que nadie lo note: basta que alguien ajuste el morado en
 * un sitio para que la aplicación tenga dos interruptores distintos.
 *
 * Es un <button role="switch"> y no un <input type="checkbox">: un
 * interruptor no es una casilla, y los lectores de pantalla lo anuncian
 * como lo que es. `aria-checked` lleva el estado; quien lo use debe
 * pasar una etiqueta con `aria-label` o asociarlo a un texto visible.
 */

const MORADO = '#6d5aef';
const APAGADO = '#e0dfd8';

export default function Interruptor({ activo, onChange, size = 'grande', etiqueta }) {
  const w = size === 'grande' ? 38 : 34;
  const h = size === 'grande' ? 22 : 20;
  const bola = h - 4;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={onChange}
      style={{
        width: w,
        height: h,
        borderRadius: h / 2,
        background: activo ? MORADO : APAGADO,
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        flexShrink: 0,
        position: 'relative',
        transition: 'background .18s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: activo ? w - bola - 2 : 2,
          width: bola,
          height: bola,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .18s ease',
        }}
      ></span>
    </button>
  );
}
