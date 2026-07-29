'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Popover de filtro multi-selección estilo Airtable/Notion para cabeceras de
// tabla: permite ordenar A-Z/Z-A y filtrar por una selección de valores.
// Usa un portal para no quedar recortado por contenedores con overflow:hidden.
export default function FilterableHeader({ label, columnKey, values, selected, onApply, sortConfig, onSort, isOpen, onToggle, onClose }) {
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [draft, setDraft] = useState(selected);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraft(new Set(selected));
      setSearch('');
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
  }, [isOpen]);

  const visibleValues = (values || []).filter((v) => v.label.toLowerCase().includes(search.toLowerCase()));
  const active = selected.size > 0 || sortConfig.key === columnKey;

  function toggleValue(v) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          border: 'none',
          background: 'transparent',
          fontWeight: 700,
          fontSize: 11,
          color: active ? '#1d6f5c' : '#666',
          textTransform: 'uppercase',
          letterSpacing: '.03em',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {label}
        <i className={`ti ${active ? 'ti-filter-filled' : 'ti-chevron-down'}`} style={{ fontSize: 11 }}></i>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300 }}></div>
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
              <div style={{ display: 'flex', gap: 6, padding: 10, borderBottom: '.5px solid #e0dfd8' }}>
                <button
                  type="button"
                  onClick={() => {
                    onSort(columnKey, 'asc');
                    onClose();
                  }}
                  style={{
                    flex: 1,
                    fontSize: 11.5,
                    padding: '7px 6px',
                    borderRadius: 7,
                    border: '.5px solid #e0dfd8',
                    background: sortConfig.key === columnKey && sortConfig.dir === 'asc' ? '#f0f8f5' : '#fff',
                    color: sortConfig.key === columnKey && sortConfig.dir === 'asc' ? '#1d6f5c' : '#555',
                  }}
                >
                  A→Z
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSort(columnKey, 'desc');
                    onClose();
                  }}
                  style={{
                    flex: 1,
                    fontSize: 11.5,
                    padding: '7px 6px',
                    borderRadius: 7,
                    border: '.5px solid #e0dfd8',
                    background: sortConfig.key === columnKey && sortConfig.dir === 'desc' ? '#f0f8f5' : '#fff',
                    color: sortConfig.key === columnKey && sortConfig.dir === 'desc' ? '#1d6f5c' : '#555',
                  }}
                >
                  Z→A
                </button>
              </div>

              <div style={{ padding: 10, borderBottom: '.5px solid #e0dfd8' }}>
                <input
                  autoFocus
                  placeholder={`Buscar ${label.toLowerCase()}...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    border: '.5px solid #e0dfd8',
                    borderRadius: 7,
                    fontSize: 12.5,
                    outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11, color: '#1d6f5c' }}>
                  <button type="button" onClick={() => setDraft(new Set(values.map((v) => v.value)))} style={{ background: 'none', border: 'none', color: '#1d6f5c', cursor: 'pointer', padding: 0 }}>
                    Seleccionar todos
                  </button>
                  <button type="button" onClick={() => setDraft(new Set())} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: 0 }}>
                    Ninguno
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: 220, overflowY: 'auto', padding: 6 }}>
                {visibleValues.length === 0 && (
                  <div style={{ padding: 10, fontSize: 12, color: '#999', textAlign: 'center' }}>Sin resultados</div>
                )}
                {visibleValues.map((v) => (
                  <label
                    key={v.value}
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
                    <input type="checkbox" checked={draft.has(v.value)} onChange={() => toggleValue(v.value)} style={{ cursor: 'pointer' }} />
                    {v.label}
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '.5px solid #e0dfd8' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ flex: 1, padding: '7px 8px', borderRadius: 7, border: '.5px solid #e0dfd8', background: '#fff', fontSize: 12.5, color: '#666' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(draft);
                    onClose();
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
