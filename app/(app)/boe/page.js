'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Directorio del BOE.
 *
 * Se cargan las disposiciones generales, otras disposiciones y los
 * nombramientos de altos cargos. Quedan fuera oposiciones y anuncios:
 * medido en tres semanas, las oposiciones eran el 39% de toda la
 * clasificación y no aportan nada a asuntos públicos.
 *
 * El filtro por sector usa las alertas del BOE, que son categorías
 * legibles —Energía, Transportes, Industria— y permiten responder "qué
 * me afecta" desde el primer día, sin que el usuario siga nada.
 */

const PAGE_SIZES = [25, 50, 100];

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

function esHoy(iso) {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function BoePage() {
  return (
    <Suspense
      fallback={
        <div className="sec" style={{ maxWidth: 1000 }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <Boe />
    </Suspense>
  );
}

function Boe() {
  const supabase = createClient();

  const [items, setItems] = useState(null);
  const [sectores, setSectores] = useState([]);
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('');
  const [seccion, setSeccion] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    Promise.all([
      supabase
        .from('boe_directory')
        .select(
          'id, slug, titulo, fecha_publicacion, seccion, seccion_nombre, departamento, rango, sector, sectores, n_referencias'
        )
        .order('fecha_publicacion', { ascending: false })
        .limit(2000),
      supabase.from('boe_sectors').select('*').order('n_documentos', { ascending: false }),
    ]).then(([{ data }, { data: s }]) => {
      setItems(data || []);
      setSectores(s || []);
    });
  }, []);

  const filtrados = useMemo(() => {
    let l = items || [];
    if (seccion) l = l.filter((i) => i.seccion === seccion);
    if (sector) l = l.filter((i) => (i.sectores || []).includes(sector));
    if (search) {
      const q = normalize(search);
      l = l.filter((i) => normalize(i.titulo).includes(q) || normalize(i.departamento || '').includes(q));
    }
    return l;
  }, [items, search, sector, seccion]);

  useEffect(() => {
    setPage(1);
  }, [search, sector, seccion]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = filtrados.slice((current - 1) * pageSize, current * pageSize);

  const hoy = (items || []).filter((i) => esHoy(i.fecha_publicacion)).length;

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
    <div className="sec" style={{ maxWidth: 1000 }}>
      <div style={{ fontSize: 11.5, color: '#a8a49c', marginBottom: 10 }}>
        <Link href="/regulatorio" style={{ color: '#a8a49c', textDecoration: 'none' }}>
          Regulatorio
        </Link>
        {' › '}
        <span style={{ color: '#8b8780' }}>BOE</span>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <span
            role="img"
            aria-label="España"
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 18,
              height: 13,
              borderRadius: 2,
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <span style={{ height: '25%', background: '#C60B1E' }} />
            <span style={{ height: '50%', background: '#FFC400' }} />
            <span style={{ height: '25%', background: '#C60B1E' }} />
          </span>
          <h1 style={{ fontSize: 19, fontWeight: 500, margin: 0, letterSpacing: '-.3px' }}>
            Boletín Oficial del Estado
          </h1>
        </div>
        <p style={{ fontSize: 12.5, color: '#8b8780', margin: 0 }}>
          {items === null
            ? '—'
            : `${items.length.toLocaleString('es-ES')} disposiciones${hoy > 0 ? ` · ${hoy} publicadas hoy` : ''}`}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '8px 15px',
            flex: '1 1 220px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#a8a49c', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título o ministerio..."
            aria-label="Buscar en el BOE"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>

        {sectores.length > 0 && (
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            aria-label="Filtrar por sector"
            style={{
              ...chip(!!sector),
              appearance: 'none',
              paddingRight: 28,
              border: `.5px solid ${sector ? '#6d5aef' : '#e0dfd8'}`,
              background: sector ? '#f0eefe' : '#fff',
              borderRadius: 20,
              padding: '8px 26px 8px 14px',
            }}
          >
            <option value="">Todos los sectores</option>
            {sectores.map((s) => (
              <option key={s.codigo} value={s.sector}>
                {s.sector} ({s.n_documentos})
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setSeccion('')} style={chip(seccion === '')}>
          Todo
        </button>
        <button type="button" onClick={() => setSeccion('1')} style={chip(seccion === '1')}>
          Disposiciones generales
        </button>
        <button type="button" onClick={() => setSeccion('3')} style={chip(seccion === '3')}>
          Otras disposiciones
        </button>
        <button type="button" onClick={() => setSeccion('2A')} style={chip(seccion === '2A')}>
          Altos cargos
        </button>
      </div>

      {items === null ? (
        <div className="spinner"></div>
      ) : filtrados.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 10, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 12.5, color: '#8b8780' }}>No hay disposiciones con estos filtros.</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
          {slice.map((i, idx) => (
            <Link
              key={i.id}
              href={`/boe/${i.slug}`}
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
              <span
                style={{
                  fontSize: 10.5,
                  color: '#a8a49c',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  minWidth: 46,
                  paddingTop: 2,
                }}
              >
                {fechaCorta(i.fecha_publicacion)}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                {i.sector && (
                  <span
                    style={{
                      fontSize: 10.5,
                      color: '#3C3489',
                      background: '#f0eefe',
                      padding: '3px 9px',
                      borderRadius: 12,
                      display: 'inline-block',
                      marginBottom: 6,
                    }}
                  >
                    {i.sector}
                  </span>
                )}
                <div style={{ fontSize: 13, lineHeight: 1.45, letterSpacing: '-.1px' }}>{i.titulo}</div>
                <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 4 }}>
                  {[i.departamento, i.rango].filter(Boolean).join(' · ')}
                </div>
              </div>

              <i className="ti ti-chevron-right" style={{ color: '#d6d2ca', fontSize: 15, flexShrink: 0, marginTop: 3 }}></i>
            </Link>
          ))}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '11px 18px',
              background: '#fdfcfa',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ display: 'flex', gap: 2 }}>
                {PAGE_SIZES.map((n) => (
                  <span
                    key={n}
                    onClick={() => {
                      setPageSize(n);
                      setPage(1);
                    }}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 5,
                      cursor: 'pointer',
                      background: pageSize === n ? '#f0eefe' : 'transparent',
                      color: pageSize === n ? '#6d5aef' : '#8b8780',
                    }}
                  >
                    {n}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 11.5, color: '#a8a49c' }}>
                {filtrados.length.toLocaleString('es-ES')} disposiciones
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                onClick={() => setPage(Math.max(1, current - 1))}
                style={{ padding: '4px 8px', cursor: 'pointer', color: current === 1 ? '#d6d2ca' : '#8b8780' }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 14 }}></i>
              </span>
              <span style={{ fontSize: 11.5, color: '#8b8780' }}>
                {current} de {totalPages}
              </span>
              <span
                onClick={() => setPage(Math.min(totalPages, current + 1))}
                style={{ padding: '4px 8px', cursor: 'pointer', color: current === totalPages ? '#d6d2ca' : '#8b8780' }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 14 }}></i>
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 11, color: '#a8a49c', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos abiertos del Boletín Oficial del Estado.
      </div>
    </div>
  );
}
