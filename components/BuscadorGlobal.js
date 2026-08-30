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
 * LISTA PLANA, NO AGRUPADA. Antes llevaba cabeceras por grupo. Ocupaban
 * una línea cada una, y con ocho resultados repartidos en cuatro grupos
 * la mitad del panel eran títulos. El tipo se dice dentro de la propia
 * fila, junto al contexto: el resultado se identifica solo, sin que
 * haga falta una cabecera encima.
 *
 * UNA LÍNEA POR FILA. Los títulos del BOE son larguísimos y a dos
 * líneas cada resultado ocupaba lo que ocupan tres. Se recorta con
 * puntos suspensivos: en un desplegable se reconoce algo que ya se está
 * buscando, no se lee.
 *
 * SE ESPERA A QUE PARE DE ESCRIBIR: 220ms sin teclear antes de
 * consultar. Sin eso, escribir «competencia» son once consultas de las
 * que solo importa la última.
 */

const MORADO = '#6d5aef';

// El tipo que se enseña en cada fila. Las claves que no estén aquí
// —las de regulatorio_search, que son muchas y cambian— caen al nombre
// del grupo, que para ellas es "Normativa".
const ETIQUETA_TIPO = {
  diputado: 'Diputado',
  'miembro-gobierno': 'Gobierno',
  'alto-cargo': 'Alto cargo',
  eurodiputado: 'Eurodiputado',
  comisario: 'Comisario',
  'persona-comision-ue': 'Comisión Europea',
  organismo: 'Organismo',
  'direccion-general-ue': 'Dirección general',
  comision: 'Comisión',
  'comision-ue': 'Comisión del PE',
  'grupo-parlamentario': 'Grupo parlamentario',
  organizacion: 'Organización',
  oferta: 'Oferta',
};

// El icono del hueco cuando no hay foto. No todas las fuentes la
// tienen: los altos cargos, los organismos y la normativa van sin ella.
const ICONO_TIPO = {
  diputado: 'ti-user',
  'miembro-gobierno': 'ti-user',
  'alto-cargo': 'ti-user',
  eurodiputado: 'ti-user',
  comisario: 'ti-user',
  'persona-comision-ue': 'ti-user',
  organismo: 'ti-building-bank',
  'direccion-general-ue': 'ti-building-bank',
  comision: 'ti-users-group',
  'comision-ue': 'ti-users-group',
  'grupo-parlamentario': 'ti-users-group',
  organizacion: 'ti-building-store',
  oferta: 'ti-briefcase',
};

const ES_PERSONA = new Set([
  'diputado',
  'miembro-gobierno',
  'alto-cargo',
  'eurodiputado',
  'comisario',
  'persona-comision-ue',
]);

function iniciales(nombre) {
  const ws = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (ws.length === 0) return '?';
  return (ws[0][0] + (ws[1]?.[0] || '')).toUpperCase();
}

/**
 * El hueco de la izquierda de cada fila.
 *
 * Tres casos, y el orden importa: si hay foto se pone; si no la hay
 * pero es una persona, sus iniciales, que dicen más que un monigote
 * genérico repetido diez veces; y si no es una persona, el icono de su
 * tipo, porque las iniciales de un organismo no significan nada.
 */
function Avatar({ fila }) {
  const persona = ES_PERSONA.has(fila.kind);
  const base = {
    width: 32,
    height: 32,
    borderRadius: persona ? '50%' : 7,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: '#f0eefe',
    color: MORADO,
  };

  if (fila.imagen) {
    return (
      <span style={base}>
        <img src={fila.imagen} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
    );
  }

  if (persona) {
    return <span style={{ ...base, fontSize: 11, fontWeight: 600 }}>{iniciales(fila.titulo)}</span>;
  }

  return (
    <span style={base}>
      <i
        className={`ti ${ICONO_TIPO[fila.kind] || 'ti-file-text'}`}
        style={{ fontSize: 16 }}
        aria-hidden="true"
      ></i>
    </span>
  );
}

export default function BuscadorGlobal() {
  const router = useRouter();
  const supabase = createClient();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [abiertoMovil, setAbiertoMovil] = useState(false);
  const [marcada, setMarcada] = useState(-1);
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
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
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
      const { data, error } = await supabase.rpc('buscar_global', { q: t, limite: 8 });
      // La petición que vuelve puede no ser la última que se lanzó. Sin
      // esta comprobación, una consulta lenta de hace tres letras pisa
      // los resultados de la actual.
      if (ultimaRef.current !== t) return;
      setResultados(error ? [] : data || []);
      setCargando(false);
    },
    [supabase]
  );

  useEffect(() => {
    ultimaRef.current = q.trim();
    setMarcada(-1);
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

  function verTodos() {
    const t = q.trim();
    if (t.length < 2) return;
    setAbierto(false);
    setAbiertoMovil(false);
    inputRef.current?.blur();
    router.push(`/buscar?q=${encodeURIComponent(t)}`);
  }

  function buscar(e) {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    // Con una fila marcada por teclado, Enter va a ella. Sin marcar,
    // Enter lleva a la página de resultados y no al primero: quien
    // escribe y pulsa Enter sin mirar quiere ver la lista, no saltar a
    // una ficha que no ha elegido.
    if (marcada >= 0 && resultados[marcada]) return irA(resultados[marcada].ruta);
    verTodos();
  }

  function teclas(e) {
    if (e.key === 'Escape') {
      setAbierto(false);
      inputRef.current?.blur();
      return;
    }
    if (!abierto || resultados.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMarcada((i) => (i + 1) % resultados.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMarcada((i) => (i <= 0 ? resultados.length - 1 : i - 1));
    }
  }

  return (
    <>
      <style>{`
        .gt-buscador-caja { position: relative; display: flex; flex-shrink: 0; margin-right: 8px; }
        .gt-buscador {
          display: flex;
          align-items: center;
          gap: 7px;
          background: #faf9f6;
          border: .5px solid #e0dfd8;
          border-radius: 20px;
          padding: 7px 13px;
          width: 300px;
          flex-shrink: 0;
        }
        .gt-buscador:focus-within { background: #fff; border-color: #c9c7bd; }
        .gt-buscador input {
          border: none; outline: none; background: transparent;
          font-family: inherit; font-size: 12.5px; width: 100%; color: #1a1a18;
        }
        .gt-buscador-lupa { display: none; }

        /* Más ancho que la caja, como en LinkedIn: los títulos del BOE
           no caben en 300px y recortados a la mitad no se reconocen. */
        .gt-buscador-panel {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          width: 460px;
          max-height: 440px;
          overflow-y: auto;
          background: #fff;
          border: .5px solid #e0dfd8;
          border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0,0,0,.13);
          padding: 5px 0;
          z-index: 300;
        }
        .gt-buscador-fila {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          text-align: left;
          padding: 7px 13px;
          border: none;
          background: none;
          cursor: pointer;
          font-family: inherit;
        }
        .gt-buscador-fila:hover, .gt-buscador-fila.marcada { background: #f6f5fe; }
        .gt-buscador-linea {
          min-width: 0;
          flex: 1;
          display: flex;
          align-items: baseline;
          gap: 6px;
          overflow: hidden;
          white-space: nowrap;
        }
        .gt-buscador-titulo {
          font-size: 12.5px;
          color: #1a1a18;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 1;
          min-width: 0;
        }
        .gt-buscador-ctx {
          font-size: 11.5px;
          color: #8b8780;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 2;
          min-width: 0;
        }
        .gt-buscador-pie {
          display: block;
          width: 100%;
          text-align: center;
          padding: 9px 13px 4px;
          margin-top: 4px;
          border-top: .5px solid #f0f0eb;
          border-left: none; border-right: none; border-bottom: none;
          background: none;
          cursor: pointer;
          font-family: inherit;
          font-size: 12.5px;
          font-weight: 600;
          color: #6d5aef;
        }

        @media (max-width: 1080px) {
          .gt-buscador { width: 200px; }
          .gt-buscador-panel { width: 380px; }
        }
        @media (max-width: 720px) {
          .gt-buscador-caja { display: none; }
          .gt-buscador-lupa {
            display: inline-flex; align-items: center; justify-content: center;
            width: 34px; height: 34px; border: none; background: none;
            color: #767670; cursor: pointer; flex-shrink: 0;
          }
          .gt-buscador-caja.abierto { display: flex; flex: 1; margin: 0 6px; }
          .gt-buscador-caja.abierto .gt-buscador { width: 100%; }
          .gt-buscador-caja.abierto .gt-buscador-panel { width: 100%; }
          .gt-buscador-caja.abierto + .gt-buscador-lupa { display: none; }
        }
      `}</style>

      <div ref={cajaRef} className={`gt-buscador-caja${abiertoMovil ? ' abierto' : ''}`}>
        <form onSubmit={buscar} className="gt-buscador" role="search">
          <i className="ti ti-search" style={{ fontSize: 14, color: '#a8a49c' }} aria-hidden="true"></i>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            onKeyDown={teclas}
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
              <div style={{ padding: 13, fontSize: 12, color: '#a8a49c' }}>Buscando…</div>
            ) : resultados.length === 0 ? (
              <div style={{ padding: 13, fontSize: 12, color: '#a8a49c' }}>Nada para «{q.trim()}».</div>
            ) : (
              <>
                {resultados.map((r, i) => (
                  <button
                    key={`${r.kind}-${r.ref_id}`}
                    type="button"
                    role="option"
                    aria-selected={i === marcada}
                    onMouseEnter={() => setMarcada(i)}
                    onClick={() => irA(r.ruta)}
                    className={`gt-buscador-fila${i === marcada ? ' marcada' : ''}`}
                  >
                    <Avatar fila={r} />
                    <span className="gt-buscador-linea">
                      <span className="gt-buscador-titulo">{r.titulo}</span>
                      <span className="gt-buscador-ctx">
                        · {[ETIQUETA_TIPO[r.kind] || r.grupo, r.contexto].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                ))}
                <button type="button" className="gt-buscador-pie" onClick={verTodos}>
                  Ver todos los resultados
                </button>
              </>
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
