'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Hook para arrastrar y reposicionar una imagen de fondo (background-position).
 *
 * @param {object} opts
 * @param {'y'|'xy'} opts.axis - 'y' solo permite mover verticalmente (portadas),
 *   'xy' permite mover en ambos ejes (avatares/logos).
 * @param {number|{x:number,y:number}} opts.value - posición guardada (0-100).
 *   Para axis='y' es un número; para axis='xy' es {x, y}.
 * @param {boolean} opts.editable - si es false, no se puede arrastrar.
 * @param {(value:number|{x:number,y:number}) => void} opts.onCommit - se llama
 *   al soltar el ratón, con el valor final para guardar en la base de datos.
 */
export function parsePosition(value) {
  if (!value || typeof value !== 'string') return { x: 50, y: 50 };
  const [x, y] = value.split(' ').map((v) => parseInt(v, 10));
  return { x: isNaN(x) ? 50 : x, y: isNaN(y) ? 50 : y };
}

export function useDragPosition({ axis = 'y', value, editable = true, onCommit }) {
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  const liveRef = useRef(null);
  const [, forceRender] = useState(0);
  const startRef = useRef(null);
  const containerRef = useRef(null);

  function toXY(v) {
    if (axis === 'y') {
      const y = typeof v === 'number' ? v : 50;
      return { x: 50, y };
    }
    return v && typeof v === 'object' ? { x: v.x ?? 50, y: v.y ?? 50 } : { x: 50, y: 50 };
  }

  const current = dragging && liveRef.current ? liveRef.current : toXY(value);

  const handlePointerMove = useCallback((e) => {
    if (!startRef.current) return;
    const { startX, startY, rectW, rectH, origin } = startRef.current;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dxPct = ((clientX - startX) / rectW) * 100;
    const dyPct = ((clientY - startY) / rectH) * 100;
    let nx = origin.x - dxPct;
    let ny = origin.y - dyPct;
    nx = Math.min(100, Math.max(0, nx));
    ny = Math.min(100, Math.max(0, ny));
    liveRef.current = axis === 'y' ? { x: 50, y: ny } : { x: nx, y: ny };
    forceRender((n) => n + 1);
  }, [axis]);

  const handlePointerUp = useCallback(() => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('touchmove', handlePointerMove);
    window.removeEventListener('touchend', handlePointerUp);
    setDragging(false);
    const final = liveRef.current;
    startRef.current = null;
    liveRef.current = null;
    if (final && onCommit) {
      onCommit(axis === 'y' ? Math.round(final.y) : { x: Math.round(final.x), y: Math.round(final.y) });
    }
  }, [axis, onCommit, handlePointerMove]);

  const onPointerDown = useCallback(
    (e) => {
      if (!editable || !containerRef.current) return;
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const rect = containerRef.current.getBoundingClientRect();
      startRef.current = {
        startX: clientX,
        startY: clientY,
        rectW: rect.width,
        rectH: rect.height,
        origin: toXY(value),
      };
      liveRef.current = toXY(value);
      setDragging(true);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove, { passive: false });
      window.addEventListener('touchend', handlePointerUp);
    },
    [editable, value, handlePointerMove, handlePointerUp]
  );

  return {
    containerRef,
    dragging,
    hover,
    setHover,
    backgroundPosition: `${current.x}% ${current.y}%`,
    bind: {
      onPointerDown,
      onTouchStart: onPointerDown,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: { cursor: editable ? (dragging ? 'grabbing' : 'grab') : 'default' },
    },
  };
}
