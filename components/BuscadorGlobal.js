'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * El buscador de la barra superior.
 *
 * Consulta el RPC buscar_global, que va contra la vista search_index:
 * normativa, personas de España y de la UE, organismos, comisiones,
 * grupos, organizaciones y ofertas. Proyectos queda fuera.
 *
 * LOS RESULTADOS VIENEN YA AGRUPADOS Y ORDENADOS DEL SERVIDOR. No se
 * reordena nada aquí: la función devuelve como mucho treinta filas y
 * ordenarlas otra vez en el cliente solo serviría para deshacer el
 * criterio de cercanía —lo que empieza por el término va primero— sobre
 * un conjunto ya recortado.
 *
 * SE ESPERA A QUE PARE DE ESCRIBIR: 220ms sin teclear antes de
 * consultar. Sin eso, escribir «competencia» son once consultas de las
 * que solo importa la última.
 *
 * EN MÓVIL SE PLIEGA A LUPA: a 720px la barra ya esconde los módulos
 * (los cubre BarraMovil), y una caja de texto de 240px ahí dentro
 * dejaría sin sitio al logo. Pulsando la lupa se despliega ocupando la
 * barra entera, que es lo que hacen las apps que caben en un pulgar.
 */

const VERDE = '#1d6f5c';

export default function BuscadorGlobal() {
  const router = useRouter();
  const supabase = createClient();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [abiertoMovil, setAbiertoMovil] = useState(false);
  const inputRef = useRef(null);
  const cajaRef = useRef(null);
  const ultimaRef = useRef('');

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

  // Cierre al pulsar fuera. Sobre el contenedor entero y no solo sobre
  // la lista: si no, pulsar en la propia caja para corregir una letra
  // cerraría los resultados que estás mirando.
  useEffect(() => {
    function fuera(e) {
      if (cajaRef.current && !cajaRef.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const consultar = useCallback(
    async (termino) => {
      const t = termino.trim();
      if (t.length < 2) {
        setResultados([]);
        setCargando(false);
        return;
      }
      setCargando(true);
      const { data, error } = await supabase.rpc('buscar_global', { q: t, limite: 24 });
      // La petición que vuelve puede no ser la última que se lanzó.
      // Sin esta comprobación, una consulta lenta de hace tres letras
      // pisa los resultados de la actual.
      if (ultimaRef.current !== t) return;
      setResultados(error ? [] : data || []);
      setCargando(false);
    },
    [supabase]
  );

  useEffect(() => {
    ultimaRef.current = q.trim();
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    const id = setTimeout(() => consultar(q), 220);
    return () => clearTimeout(id);
  }, [q, consultar]);

  function irA(ruta) {
    setAbierto(false);
    setAbiertoMovil(false);
    inputRef.current?.blur();
    router.push(ruta);
  }

  function buscar(e) {
    e?.preventDefault();
    const t = q.trim();
    if (t.length < 2) return;
    // Con el teclado, Enter lleva a lo primero de la lista. Es lo que
    // hace quien escribe «cnmc» y pulsa Enter sin mirar.
    if (resultados[0]) return irA(resultados[0].ruta);
  }

  // Se agrupa en el orden en que llegan: el servidor ya los mandó
  // ordenados por grupo, así que un Map conserva ese orden.
  const grupos = [];
  const indice = new Map();
  for (const r of resultados) {
    if (!indice.has(r.grupo)) {
      indice.set(r.grupo, grupos.length);
      grupos.push({ nombre: r.grupo, filas: [] });
    }
    grupos[indice.get(r.grupo)].filas.push(r);
  }

  const ICONO = {
    Normativa: 'ti-file-text',
    Personas: 'ti-user',
    Organismos: 'ti-building-bank',
    'Comisiones y grupos': 'ti-users-group',
    Organizaciones: 'ti-building-store',
    Ofertas: 'ti-briefcase',
  };

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

        /* El contenedor es el que ancla el panel. La caja de texto no
           puede serlo: es un flex de la barra y position:relative sobre
           ella dejaba el panel pegado al icono de la lupa. */
        .gt-buscador-caja { position: relative; display: flex; flex-shrink: 0; margin-right: 8px; }

        .gt-buscador-panel {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          width: 340px;
          max-height: 420px;
          overflow-y: auto;
          background: #fff;
          border: .5px solid #e0dfd8;
          border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0,0,0,.13);
          padding: 4px 0 6px;
          z-index: 300;
        }
        .gt-buscador-fila {
          display: flex;
          align-items: center;
          gap: 9px;
          width: 100%;
          text-align: left;
          padding: 6px 14px;
          border: none;
          background: none;
          cursor: pointer;
          font-family: inherit;
        }
        .gt-buscador-fila:hover { background: #f6f5fe; }
        .gt-buscador-titulo {
          display: block;
          font-size: 12.5px;
          color: #1a1a18;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .gt-buscador-ctx {
          display: block;
          font-size: 10.5px;
          color: #8b8780;
          margin-top: 1px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 900px) {
          .gt-buscador { width: 170px; }
          .gt-buscador-panel { width: 300px; }
        }
        @media (max-width: 720px) {
          /* Plegado: solo la lupa hasta que se pulsa. */
          .gt-buscador-caja { display: none; }
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
          .gt-buscador-caja.abierto {
            display: flex;
            flex: 1;
            margin: 0 6px;
          }
          .gt-buscador-caja.abierto .gt-buscador { width: 100%; }
          .gt-buscador-caja.abierto .gt-buscador-panel { width: 100%; }
          .gt-buscador-caja.abierto + .gt-buscador-lupa { display: none; }
        }
      `}</style>

      <div ref={cajaRef} className={`gt-buscador-caja${abiertoMovil ? ' abierto' : ''}`}>
      <form
        onSubmit={buscar}
        className={`gt-buscador${abiertoMovil ? ' abierto' : ''}`}
        role="search"
      >
        <i className="ti ti-search" style={{ fontSize: 14, color: '#a8a49c' }} aria-hidden="true"></i>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAbierto(false);
              inputRef.current?.blur();
            }
          }}
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

      {abierto && q.trim().length >= 2 && (
        <div className="gt-buscador-panel" role="listbox">
          {cargando && resultados.length === 0 ? (
            <div style={{ padding: '14px 14px', fontSize: 12, color: '#a8a49c' }}>Buscando…</div>
          ) : resultados.length === 0 ? (
            <div style={{ padding: '14px 14px', fontSize: 12, color: '#a8a49c' }}>
              Nada para «{q.trim()}».
            </div>
          ) : (
            grupos.map((g) => (
              <div key={g.nombre}>
                <div
                  style={{
                    fontSize: 10.5,
                    color: '#a8a49c',
                    letterSpacing: '.3px',
                    padding: '9px 14px 5px',
                  }}
                >
                  {g.nombre.toUpperCase()}
                </div>
                {g.filas.map((r) => (
                  <button
                    key={`${r.kind}-${r.ref_id}`}
                    type="button"
                    role="option"
                    onClick={() => irA(r.ruta)}
                    className="gt-buscador-fila"
                  >
                    <i
                      className={`ti ${ICONO[g.nombre] || 'ti-point'}`}
                      style={{ fontSize: 15, color: '#6d5aef', flexShrink: 0 }}
                      aria-hidden="true"
                    ></i>
                    <span style={{ minWidth: 0 }}>
                      <span className="gt-buscador-titulo">{r.titulo}</span>
                      {r.contexto && <span className="gt-buscador-ctx">{r.contexto}</span>}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
      </div>

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
