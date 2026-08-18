'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Buscador transversal de Regulatorio.
 *
 * Busca a la vez en las cinco fuentes: leyes y actividad del Congreso,
 * expedientes de la Comisión, procedimientos del Parlamento y BOE.
 *
 * Antes el buscador de la portada llevaba siempre a /congreso, así que
 * quien escribía "envases" veía las tres PNL españolas pero no el
 * expediente europeo sobre lo mismo — que es justo el que tenía plazo
 * abierto.
 */

const FUENTES = {
  Congreso: { color: '#6d5aef', orden: 1 },
  BOE: { color: '#6d5aef', orden: 2 },
  'Comisión Europea': { color: '#6d5aef', orden: 3 },
  'Parlamento Europeo': { color: '#6d5aef', orden: 4 },
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export default function BuscarPage() {
  return (
    <Suspense
      fallback={
        <div className="sec" style={{ maxWidth: 900 }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <Buscar />
    </Suspense>
  );
}

function Buscar() {
  const supabase = createClient();
  const sp = useSearchParams();
  const router = useRouter();

  const [q, setQ] = useState(sp?.get('q') || '');
  const [items, setItems] = useState(null);
  const [fuente, setFuente] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);

  const termino = sp?.get('q') || '';

  useEffect(() => {
    if (!termino || termino.trim().length < 3) {
      setItems([]);
      return;
    }
    setItems(null);
    supabase
      .from('regulatorio_search')
      .select('kind, ref_id, titulo, contexto, fuente, ruta, plazo, fecha, activo')
      .ilike('titulo', `%${termino.trim()}%`)
      .order('fecha', { ascending: false })
      .limit(300)
      .then(({ data }) => setItems(data || []));
  }, [termino]);

  const filtrados = useMemo(() => {
    let l = items || [];
    if (soloActivos) l = l.filter((i) => i.activo);
    if (fuente) l = l.filter((i) => i.fuente === fuente);
    // Lo que tiene plazo primero: es lo accionable
    return [...l].sort((a, b) => {
      if (!!a.plazo !== !!b.plazo) return a.plazo ? -1 : 1;
      return String(b.fecha || '').localeCompare(String(a.fecha || ''));
    });
  }, [items, fuente, soloActivos]);

  const porFuente = useMemo(() => {
    const c = new Map();
    for (const i of items || []) {
      if (soloActivos && !i.activo) continue;
      c.set(i.fuente, (c.get(i.fuente) || 0) + 1);
    }
    return [...c.entries()].sort((a, b) => (FUENTES[a[0]]?.orden || 9) - (FUENTES[b[0]]?.orden || 9));
  }, [items, soloActivos]);

  function buscar(e) {
    e?.preventDefault();
    if (q.trim().length >= 3) router.push(`/regulatorio/buscar?q=${encodeURIComponent(q.trim())}`);
  }

  const chip = (activo) => ({
    padding: '6px 12px',
    borderRadius: 7,
    fontSize: 12.5,
    cursor: 'pointer',
    border: 'none',
    background: activo ? '#f0eefe' : 'transparent',
    color: activo ? '#6d5aef' : '#8b8780',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 11.5, color: '#a8a49c', marginBottom: 12 }}>
        <Link href="/regulatorio" style={{ color: '#a8a49c', textDecoration: 'none' }}>
          Regulatorio
        </Link>
        {' › '}
        <span style={{ color: '#8b8780' }}>Buscar</span>
      </div>

      <div
        onKeyDown={(e) => e.key === 'Enter' && buscar(e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: '#fff',
          border: '.5px solid #e0dfd8',
          borderRadius: 22,
          padding: '10px 16px',
          marginBottom: 16,
        }}
      >
        <i className="ti ti-search" style={{ color: '#a8a49c', fontSize: 15 }}></i>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar una norma, un expediente o un procedimiento..."
          aria-label="Buscar en Regulatorio"
          autoFocus
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%' }}
        />
      </div>

      {termino && (
        <>
          <div style={{ display: 'flex', gap: 2, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => setFuente('')} style={chip(fuente === '')}>
              Todo {items ? `(${filtrados.length + (fuente ? 0 : 0)})` : ''}
            </button>
            {porFuente.map(([f, n]) => (
              <button key={f} type="button" onClick={() => setFuente(f)} style={chip(fuente === f)}>
                {f} ({n})
              </button>
            ))}
            <div style={{ flex: 1 }}></div>
            <button
              type="button"
              onClick={() => setSoloActivos((v) => !v)}
              style={{ ...chip(soloActivos), fontSize: 12 }}
            >
              {soloActivos ? 'Solo abiertos' : 'Todo, incluido lo cerrado'}
            </button>
          </div>

          {items === null ? (
            <div className="spinner"></div>
          ) : filtrados.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 10, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#8b8780' }}>
                No se ha encontrado nada con «{termino}».
              </div>
              {soloActivos && (
                <button
                  type="button"
                  onClick={() => setSoloActivos(false)}
                  style={{ fontSize: 12.5, color: '#6d5aef', background: 'none', border: 'none', cursor: 'pointer', marginTop: 10 }}
                >
                  Buscar también en lo ya cerrado
                </button>
              )}
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
              {filtrados.slice(0, 100).map((i, idx) => {
                const dias = diasHasta(i.plazo);
                return (
                  <Link
                    key={`${i.kind}-${i.ref_id}`}
                    href={i.ruta || '#'}
                    style={{
                      display: 'flex',
                      gap: 14,
                      padding: '14px 18px',
                      borderTop: idx === 0 ? 'none' : '.5px solid #f2f0ec',
                      alignItems: 'flex-start',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ width: 46, flexShrink: 0, textAlign: 'center', paddingTop: 2 }}>
                      {dias !== null && dias >= 0 ? (
                        <>
                          <div style={{ fontSize: 17, fontWeight: 500, color: '#1d6f5c', lineHeight: 1 }}>{dias}</div>
                          <div style={{ fontSize: 10, color: '#b8b4ac' }}>{dias === 1 ? 'día' : 'días'}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 10.5, color: '#b8b4ac' }}>{fechaCorta(i.fecha)?.slice(0, 6)}</div>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
                        <span
                          style={{ fontSize: 10, color: '#3C3489', background: '#f0eefe', padding: '3px 8px', borderRadius: 11 }}
                        >
                          {i.fuente}
                        </span>
                        {!i.activo && (
                          <span style={{ fontSize: 10, color: '#8b8780', background: '#f5f4f1', padding: '3px 8px', borderRadius: 11 }}>
                            Cerrado
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.45, letterSpacing: '-.1px' }}>{i.titulo}</div>
                      {i.contexto && (
                        <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 4 }}>{i.contexto}</div>
                      )}
                    </div>

                    <i className="ti ti-chevron-right" style={{ color: '#d6d2ca', fontSize: 15, flexShrink: 0, marginTop: 3 }}></i>
                  </Link>
                );
              })}

              {filtrados.length > 100 && (
                <div style={{ padding: '12px 18px', fontSize: 11.5, color: '#a8a49c', background: '#fdfcfa' }}>
                  Se muestran los 100 primeros de {filtrados.length}. Afina la búsqueda para ver menos.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!termino && (
        <div style={{ background: '#fff', borderRadius: 10, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#8b8780', lineHeight: 1.6 }}>
            Busca a la vez en el Congreso, el BOE, la Comisión Europea y el Parlamento Europeo.
          </div>
        </div>
      )}
    </div>
  );
}
