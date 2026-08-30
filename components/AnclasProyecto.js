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

// 64px de la barra de navegación (.nav es sticky) más aire.
const BAJO_LA_BARRA = 80;

export default function AnclasProyecto({ secciones }) {
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
      { rootMargin: `-${BAJO_LA_BARRA + 10}px 0px -55% 0px`, threshold: 0 }
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
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - BAJO_LA_BARRA, behavior: 'smooth' });
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
          /* Por debajo de la cabecera de la aplicación: con 16px el
             título quedaba escondido detrás de ella. */
          position: sticky;
          top: 84px;
          align-self: start;
        }
        .gt-anclas-lista { display: flex; flex-direction: column; gap: 1px; }
        @media (max-width: 900px) {
          .gt-anclas {
            position: sticky;
            top: 64px;
            max-height: none;
            overflow-y: visible;
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
                {/* El distintivo manda sobre el contador: una sección
                    recién estrenada no lleva número todavía, y si
                    llevase los dos la línea se rompería. */}
                {s.distintivo ? (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '.3px',
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: on ? '#fff' : '#f0eefe',
                      color: MORADO,
                      flexShrink: 0,
                    }}
                  >
                    {s.distintivo}
                  </span>
                ) : (
                  /* El contador se calla cuando no hay nada: un cero en
                     cada línea es ruido, no información. */
                  s.cuenta > 0 && (
                    <span style={{ fontSize: 10.5, color: on ? MORADO : '#a8a49c', flexShrink: 0 }}>{s.cuenta}</span>
                  )
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
