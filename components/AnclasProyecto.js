'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * La barra de anclas del proyecto.
 *
 * El proyecto es una página única que se recorre entera: la barra no
 * oculta nada, solo salta. Por eso marca la sección en la que estás en
 * vez de comportarse como una pestaña — si pareciera una pestaña, la
 * gente creería que el resto está escondido y dejaría de bajar.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';

export default function AnclasProyecto({ secciones, offset = 64 }) {
  const [activa, setActiva] = useState(secciones[0]?.id);
  const saltando = useRef(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        // Durante un salto no se hace caso al observador: si no, la
        // sección activa parpadearía por las secciones intermedias.
        if (saltando.current) return;
        const visibles = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles[0]) setActiva(visibles[0].target.id);
      },
      { rootMargin: `-${offset + 8}px 0px -55% 0px`, threshold: 0 }
    );

    for (const s of secciones) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [secciones, offset]);

  function saltar(id) {
    const el = document.getElementById(id);
    if (!el) return;
    saltando.current = true;
    setActiva(id);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    setTimeout(() => {
      saltando.current = false;
    }, 700);
  }

  return (
    <nav
      aria-label="Secciones del proyecto"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 3,
        background: '#fff',
        borderBottom: `.5px solid ${BORDE}`,
        display: 'flex',
        gap: 17,
        flexWrap: 'wrap',
        padding: '11px 0 0',
        margin: '0 0 16px',
      }}
    >
      {secciones.map((s) => (
        <button
          key={s.id}
          onClick={() => saltar(s.id)}
          aria-current={activa === s.id ? 'true' : undefined}
          style={{
            fontSize: 12.5,
            fontWeight: activa === s.id ? 500 : 400,
            color: s.bloqueada ? '#a8a49c' : activa === s.id ? MORADO : '#555',
            background: 'none',
            border: 'none',
            borderBottom: activa === s.id ? `2px solid ${MORADO}` : '2px solid transparent',
            padding: '0 0 9px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          {s.bloqueada && <i className="ti ti-lock" style={{ fontSize: 12 }}></i>}
          {s.label}
        </button>
      ))}
    </nav>
  );
}
