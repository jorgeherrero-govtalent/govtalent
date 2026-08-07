'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Misma familia visual que FilterableHeader (el filtro del Directorio
// Inteligente), pero pensado para una barra de filtros suelta en vez de una
// cabecera de tabla — sin A→Z/Z→A ni buscador, solo la lista de checkboxes.
export default function MultiSelectFilter({ label, values, selected, onApply }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(selected);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen) setDraft(new Set(selected));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function updatePos() {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const popoverWidth = 240;
      const margin = 12;
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - margin) {
        left = rect.right - popoverWidth;
      }
      left = Math.max(margin, left);
      setPos({ top: rect.bottom + 6, left });
    }
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [isOpen]);

  function toggleValue(v) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  const active = selected.size > 0;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: active ? '#f0f8f5' : '#faf9f5',
          border: `.5px solid ${active ? '#1d6f5c' : '#e0dfd8'}`,
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12.5,
          color: active ? '#1d6f5c' : '#666',
          fontWeight: active ? 600 : 400,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        {active ? ` (${selected.size})` : ''}
        <i className={`ti ${active ? 'ti-filter-filled' : 'ti-chevron-down'}`} style={{ fontSize: 12 }}></i>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div onClick={() => setIsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300 }}></div>
            <div
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                zIndex: 301,
                width: 240,
                background: '#fff',
                borderRadius: 12,
                boxShadow: '0 8px 28px rgba(0,0,0,.15)',
                border: '.5px solid #e0dfd8',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: 10, borderBottom: '.5px solid #e0dfd8', display: 'flex', gap: 10, fontSize: 11, color: '#1d6f5c' }}>
                <button
                  type="button"
                  onClick={() => setDraft(new Set(values.map((v) => v.value)))}
                  style={{ background: 'none', border: 'none', color: '#1d6f5c', cursor: 'pointer', padding: 0 }}
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(new Set())}
                  style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: 0 }}
                >
                  Ninguno
                </button>
              </div>

              <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
                {values.map((v) => (
                  <label
                    key={v.value}
                    title={v.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 8px',
                      borderRadius: 7,
                      fontSize: 12.5,
                      color: '#333',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f7f7f4')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <input
                      type="checkbox"
                      checked={draft.has(v.value)}
                      onChange={() => toggleValue(v.value)}
                      style={{ cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label}</span>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '.5px solid #e0dfd8' }}>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{ flex: 1, padding: '7px 8px', borderRadius: 7, border: '.5px solid #e0dfd8', background: '#fff', fontSize: 12.5, color: '#666' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(draft);
                    setIsOpen(false);
                  }}
                  style={{ flex: 1, padding: '7px 8px', borderRadius: 7, border: 'none', background: '#1d6f5c', color: '#fff', fontSize: 12.5, fontWeight: 600 }}
                >
                  Aplicar
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
