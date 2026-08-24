'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * El índice del proyecto, fijo a la derecha.
 *
 * POR QUÉ A LA DERECHA Y NO ARRIBA: una barra horizontal compite con la
 * cabecera por el espacio vertical y se parte en dos líneas en cuanto
 * hay siete secciones. Una columna no le quita sitio a nada y aguanta
 * las que hagan falta.
 *
 * Y GANA ALGO QUE LA BARRA NO PODÍA TENER: el contador por sección. Ves
 * que hay seis actores, tres briefings escritos y cuatro acciones
 * pendientes sin entrar en ninguna, así que el índice deja de ser solo
 * navegación y pasa a ser el estado del proyecto.
 *
 * Salta, no oculta: el proyecto sigue siendo una página única.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';

export default function AnclasProyecto({ secciones, offset = 16 }) {
  const [activa, setActiva] = useState(secciones[0]?.id);
  const saltando = useRef(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        // Durante un salto se ignora el observador: si no, la sección
        // activa parpadearía al pasar por las intermedias.
        if (saltando.current) return;
        const visibles = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles[0]) setActiva(visibles[0].target.id);
      },
      { rootMargin: '-80px 0px -55% 0px', threshold: 0 }
    );

    for (const s of secciones) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [secciones]);

  function saltar(id) {
    const el = document.getElementById(id);
    if (!el) return;
    saltando.current = true;
    setActiva(id);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
    setTimeout(() => {
      saltando.current = false;
    }, 700);
  }

  return (
    <>
      {/* En pantalla estrecha la columna no cabe: se convierte en una
          fila que se desplaza en horizontal, sin envolverse en tres
          líneas. */}
      <style>{`
        .gt-anclas {
          position: sticky;
          top: 16px;
          align-self: start;
        }
        .gt-anclas-lista { display: flex; flex-direction: column; gap: 1px; }
        @media (max-width: 900px) {
          .gt-anclas {
            position: sticky;
            top: 0;
            z-index: 3;
            background: #fff;
            border-bottom: .5px solid ${BORDE};
            padding: 10px 0;
            margin-bottom: 14px;
          }
          .gt-anclas-titulo { display: none; }
          .gt-anclas-lista {
            flex-direction: row;
            gap: 6px;
            overflow-x: auto;
            scrollbar-width: none;
          }
          .gt-anclas-lista::-webkit-scrollbar { display: none; }
          .gt-anclas-item { white-space: nowrap; border-left: none !important; border-radius: 20px !important; }
        }
      `}</style>

      <nav className="gt-anclas" aria-label="Secciones del proyecto">
        <div
          className="gt-anclas-titulo"
          style={{ fontSize: 10, color: '#a8a49c', letterSpacing: '.4px', padding: '0 9px 9px' }}
        >
          EN ESTE PROYECTO
        </div>

        <div className="gt-anclas-lista">
          {secciones.map((s) => {
            const on = activa === s.id;
            return (
              <button
                key={s.id}
                className="gt-anclas-item"
                onClick={() => saltar(s.id)}
                aria-current={on ? 'true' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 9px',
                  border: 'none',
                  borderLeft: `2px solid ${on ? MORADO : 'transparent'}`,
                  borderRadius: '0 7px 7px 0',
                  background: on ? '#f0eefe' : 'transparent',
                  fontSize: 11.5,
                  fontWeight: on ? 500 : 400,
                  color: on ? MORADO : '#555',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>{s.label}</span>
                {/* El contador se calla cuando no hay nada: un cero en
                    cada línea es ruido, no información. */}
                {s.cuenta > 0 && (
                  <span style={{ fontSize: 10.5, color: on ? MORADO : '#a8a49c', flexShrink: 0 }}>{s.cuenta}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
