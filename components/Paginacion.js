'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * La paginación de los directorios, la misma que Organismos y Ministerios:
 * selector de filas (20, 50, 100, 200) en verde, «1–20 de N», números de
 * página con elipsis y flechas.
 *
 * Copiada de app/(app)/institutions/organismos/page.js, que la tiene
 * dentro. Aquí está como componente para los listados nuevos del
 * directorio; las páginas antiguas pueden pasarse a este cuando se toquen.
 *
 * El tamaño de página se recuerda en este navegador con la misma clave
 * (gt_page_size), así que elegir 50 en Organismos vale también aquí.
 */

const BORDE = '#e0dfd8';
const VERDE = '#1d6f5c';
export const PAGE_SIZES = [20, 50, 100, 200];

/** Estado de la paginación de una lista ya filtrada. */
export function usePaginacion(total, reinicio = []) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    try {
      const saved = parseInt(window.localStorage.getItem('gt_page_size') || '20', 10);
      if (PAGE_SIZES.includes(saved)) setPageSize(saved);
    } catch {}
  }, []);

  // Al filtrar, volver a la primera página.
  useEffect(() => {
    setPage(1);
  }, reinicio); // eslint-disable-line react-hooks/exhaustive-deps

  function changePageSize(n) {
    setPageSize(n);
    setPage(1);
    try {
      window.localStorage.setItem('gt_page_size', String(n));
    } catch {}
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, '…', totalPages];
    if (current >= totalPages - 2) return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', current, '…', totalPages];
  }, [current, totalPages]);

  return {
    pageSize,
    changePageSize,
    current,
    totalPages,
    setPage,
    from,
    to,
    total,
    pageNumbers,
    desde: (current - 1) * pageSize,
    hasta: current * pageSize,
  };
}

const BOTON = { border: 'none', background: 'transparent', fontFamily: 'inherit', cursor: 'pointer' };

export default function Paginacion({ pag, dentro }) {
  const { pageSize, changePageSize, from, to, total, current, totalPages, setPage, pageNumbers } = pag;
  if (total === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: dentro ? '11px 14px' : '13px 2px 0',
        background: dentro ? '#fcfbf8' : 'transparent',
        borderTop: dentro ? '.5px solid #f0f0eb' : 'none',
        flexWrap: 'wrap',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 11.5, color: '#888' }}>Filas</span>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 7, padding: 2 }}>
          {PAGE_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => changePageSize(n)}
              aria-pressed={pageSize === n}
              style={{
                ...BOTON,
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 5,
                background: pageSize === n ? VERDE : 'transparent',
                color: pageSize === n ? '#fff' : '#666',
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11.5, color: '#888' }}>
          {from}–{to} de {total.toLocaleString('es-ES')}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <button
          type="button"
          aria-label="Página anterior"
          disabled={current === 1}
          onClick={() => setPage(Math.max(1, current - 1))}
          style={{ ...BOTON, border: `.5px solid ${BORDE}`, borderRadius: 6, padding: '4px 8px', color: current === 1 ? '#ccc' : '#555' }}
        >
          <i className="ti ti-chevron-left" style={{ fontSize: 13 }} aria-hidden="true"></i>
        </button>
        {pageNumbers.map((n, k) =>
          n === '…' ? (
            <span key={`e${k}`} style={{ fontSize: 11.5, color: '#aaa', padding: '0 3px' }}>
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              aria-current={n === current ? 'page' : undefined}
              style={{
                ...BOTON,
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11.5,
                background: n === current ? VERDE : 'transparent',
                color: n === current ? '#fff' : '#555',
                border: n === current ? 'none' : `.5px solid ${BORDE}`,
              }}
            >
              {n}
            </button>
          )
        )}
        <button
          type="button"
          aria-label="Página siguiente"
          disabled={current === totalPages}
          onClick={() => setPage(Math.min(totalPages, current + 1))}
          style={{ ...BOTON, border: `.5px solid ${BORDE}`, borderRadius: 6, padding: '4px 8px', color: current === totalPages ? '#ccc' : '#555' }}
        >
          <i className="ti ti-chevron-right" style={{ fontSize: 13 }} aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}
