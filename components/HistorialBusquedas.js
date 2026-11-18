'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Historial de búsquedas de AI Finder (18-11-2026), calcado del de Enginy:
 * un panel a la derecha de la home, con un buscador y las búsquedas de
 * personas del usuario, la más reciente primero. Pulsar una la repite.
 */
export default function HistorialBusquedas({ onElegir, onCerrar }) {
  const [busquedas, setBusquedas] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let vivo = true;
    fetch('/api/contactos/historial')
      .then((r) => (r.ok ? r.json() : { busquedas: [] }))
      .then((j) => vivo && setBusquedas(Array.isArray(j.busquedas) ? j.busquedas : []))
      .catch(() => vivo && setBusquedas([]));
    return () => {
      vivo = false;
    };
  }, []);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (busquedas || []).filter((b) => !t || b.consulta.toLowerCase().includes(t));
  }, [busquedas, q]);

  return (
    <aside className="gt-hist" aria-label="Historial de búsquedas">
      <style>{`
        .gt-hist {
          width: 320px; flex-shrink: 0; border-left: 1px solid #e5e4de; background: #f7f6f2;
          display: flex; flex-direction: column; min-height: 100vh; max-height: 100vh; position: sticky; top: 0;
        }
        .gt-hist-cab { display: flex; align-items: center; gap: 9px; padding: 18px 16px 12px; font-size: 14px; color: #57534e; }
        .gt-hist-cab i { font-size: 17px; color: #8b8780; }
        .gt-hist-cerrar {
          margin-left: auto; width: 32px; height: 32px; border: none; background: none; border-radius: 8px;
          display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #57534e;
        }
        .gt-hist-cerrar:hover { background: rgba(26,26,24,.06); }
        .gt-hist-buscar {
          display: flex; align-items: center; gap: 8px; margin: 0 14px; padding: 0 11px; height: 36px;
          background: #fff; border: 1px solid #e0dfd8; border-radius: 9px;
        }
        .gt-hist-buscar i { font-size: 16px; color: #8b8780; }
        .gt-hist-buscar input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font: inherit; font-size: 13.5px; color: #1a1a18; }
        .gt-hist-buscar input::placeholder { color: #a8a49c; }
        .gt-hist-buscar:focus-within { border-color: #c9c7bd; }
        .gt-hist-sec { font-size: 12.5px; color: #8b8780; padding: 16px 16px 6px; }
        .gt-hist-lista { flex: 1; overflow-y: auto; padding: 0 8px 16px; display: flex; flex-direction: column; }
        .gt-hist-it {
          border: none; background: none; text-align: left; font: inherit; font-size: 13.5px; color: #3d3a35;
          padding: 9px 8px; border-radius: 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .gt-hist-it:hover { background: rgba(26,26,24,.05); color: #1a1a18; }
        .gt-hist-it:focus-visible, .gt-hist-cerrar:focus-visible { outline: 2px solid #6d5aef; outline-offset: 1px; }
        .gt-hist-vacio { font-size: 13px; color: #8b8780; padding: 8px; line-height: 1.5; }
        @media (max-width: 900px) {
          .gt-hist { position: fixed; right: 0; top: 0; z-index: 60; width: min(320px, 88vw); box-shadow: -8px 0 30px rgba(26,26,24,.14); }
        }
      `}</style>
      <div className="gt-hist-cab">
        <i className="ti ti-clock" aria-hidden="true"></i>
        Historial de búsquedas
        <button type="button" className="gt-hist-cerrar" onClick={onCerrar} aria-label="Cerrar el historial">
          <i className="ti ti-arrow-bar-right" aria-hidden="true"></i>
        </button>
      </div>
      <label className="gt-hist-buscar">
        <i className="ti ti-search" aria-hidden="true"></i>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar en el historial" />
      </label>
      <div className="gt-hist-sec">Historial de búsquedas</div>
      <div className="gt-hist-lista">
        {busquedas === null ? (
          <div className="spinner"></div>
        ) : visibles.length === 0 ? (
          <div className="gt-hist-vacio">{busquedas.length === 0 ? 'Aquí aparecerán las búsquedas que hagas.' : 'Ninguna búsqueda coincide.'}</div>
        ) : (
          visibles.map((b) => (
            <button key={b.consulta} type="button" className="gt-hist-it" title={b.consulta} onClick={() => onElegir(b.consulta)}>
              {b.consulta}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
