'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * El buscador de la barra superior.
 *
 * DE MOMENTO NO BUSCA EN TODO: manda a /regulatorio/buscar, que es lo
 * único que hay hoy. La vista search_index que unificará los catorce
 * orígenes todavía no está creada, y prefiero una caja que funcione a
 * medias a una que no haga nada.
 *
 * Cuando la vista esté, lo único que cambia aquí es el destino de
 * `buscar()` y se le añade el desplegable de resultados agrupados. La
 * caja, el atajo de teclado y el comportamiento en móvil se quedan como
 * están.
 *
 * EN MÓVIL SE PLIEGA A LUPA: a 720px la barra ya esconde los módulos
 * (los cubre BarraMovil), y una caja de texto de 240px ahí dentro
 * dejaría sin sitio al logo. Pulsando la lupa se despliega ocupando la
 * barra entera, que es lo que hacen las apps que caben en un pulgar.
 */

const VERDE = '#1d6f5c';

export default function BuscadorGlobal() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [abiertoMovil, setAbiertoMovil] = useState(false);
  const inputRef = useRef(null);

  // Barra inclinada para enfocar, como en GitHub o Linear. Se ignora si
  // ya estás escribiendo en otro sitio: si no, la barra de un formulario
  // te saltaría al buscador a media frase.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const escribiendo =
        t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (escribiendo) return;
      e.preventDefault();
      setAbiertoMovil(true);
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function buscar(e) {
    e?.preventDefault();
    const t = q.trim();
    // Tres caracteres es el mínimo que ya usa /regulatorio/buscar. Con
    // menos, cualquier término devuelve media base.
    if (t.length < 3) return;
    router.push(`/regulatorio/buscar?q=${encodeURIComponent(t)}`);
    setAbiertoMovil(false);
    inputRef.current?.blur();
  }

  return (
    <>
      <style>{`
        .gt-buscador {
          display: flex;
          align-items: center;
          gap: 7px;
          background: #faf9f6;
          border: .5px solid #e0dfd8;
          border-radius: 20px;
          padding: 7px 13px;
          width: 240px;
          flex-shrink: 0;
          margin-right: 8px;
        }
        .gt-buscador:focus-within {
          background: #fff;
          border-color: #c9c7bd;
        }
        .gt-buscador input {
          border: none;
          outline: none;
          background: transparent;
          font-family: inherit;
          font-size: 12.5px;
          width: 100%;
          color: #1a1a18;
        }
        .gt-buscador-lupa { display: none; }

        @media (max-width: 900px) {
          .gt-buscador { width: 170px; }
        }
        @media (max-width: 720px) {
          /* Plegado: solo la lupa hasta que se pulsa. */
          .gt-buscador { display: none; }
          .gt-buscador-lupa {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            border: none;
            background: none;
            color: #767670;
            cursor: pointer;
            flex-shrink: 0;
          }
          .gt-buscador.abierto {
            display: flex;
            width: auto;
            flex: 1;
            margin: 0 6px;
          }
          .gt-buscador.abierto + .gt-buscador-lupa { display: none; }
        }
      `}</style>

      <form
        onSubmit={buscar}
        className={`gt-buscador${abiertoMovil ? ' abierto' : ''}`}
        role="search"
      >
        <i className="ti ti-search" style={{ fontSize: 14, color: '#a8a49c' }} aria-hidden="true"></i>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar"
          aria-label="Buscar en GovTalent"
          enterKeyHint="search"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              inputRef.current?.focus();
            }}
            aria-label="Borrar la búsqueda"
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: 'pointer',
              color: '#a8a49c',
              display: 'inline-flex',
              flexShrink: 0,
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 13 }}></i>
          </button>
        )}
      </form>

      <button
        type="button"
        className="gt-buscador-lupa"
        onClick={() => {
          setAbiertoMovil(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        aria-label="Buscar"
      >
        <i className="ti ti-search" style={{ fontSize: 19 }}></i>
      </button>
    </>
  );
}
