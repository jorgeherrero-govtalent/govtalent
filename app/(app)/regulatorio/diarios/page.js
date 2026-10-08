'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';

/**
 * Diarios oficiales autonómicos (08-10-2026).
 *
 * Calco de la página del BOE (/boe), con lo que cargan los lectores de
 * lib/diarios: disposiciones generales, otras disposiciones (sin actos
 * individuales, lib/ruidoNormativo.js), altos cargos e información
 * pública de proyectos normativos. Piloto: Galicia, Madrid, País Vasco y
 * Extremadura.
 *
 * Cada fila lleva a /regulatorio/diarios/[id], que de momento redirige a
 * la disposición en el diario oficial (la ficha propia, pendiente de
 * maquetas); por eso se abre en otra pestaña.
 */

const TIPOS = [
  ['', 'Todo'],
  ['disposicion_general', 'Disposiciones generales'],
  ['otra_disposicion', 'Otras disposiciones'],
  ['nombramiento', 'Altos cargos'],
  ['informacion_publica', 'Información pública'],
];

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

export default function DiariosPage() {
  return (
    <Suspense
      fallback={
        <div className="sec" style={{ maxWidth: 1000 }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <Diarios />
    </Suspense>
  );
}

function Diarios() {
  const supabase = createClient();

  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [ccaaFilter, setCcaaFilter] = useState(new Set());
  const [orgFilter, setOrgFilter] = useState(new Set());

  const [orden, setOrden] = useState('reciente');
  const [seccion, setSeccion] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    supabase
      .from('diarios_ccaa')
      .select('id, titulo, fecha, tipo, diario, comunidad, organo, rango')
      .order('fecha', { ascending: false })
      .limit(2000)
      .then(({ data }) => setItems(data || []));
  }, []);

  const filtrados = useMemo(() => {
    let l = items || [];
    if (seccion) l = l.filter((i) => i.tipo === seccion);
    if (ccaaFilter.size > 0) l = l.filter((i) => ccaaFilter.has(i.comunidad));
    if (search) {
      const q = normalize(search);
      l = l.filter((i) => normalize(i.titulo).includes(q) || normalize(i.organo || '').includes(q));
    }
    if (orgFilter.size > 0) l = l.filter((i) => orgFilter.has(i.organo));

    // El orden se aplica sobre una copia: sort muta el array original y
    // eso rompería el memo de la lista sin filtrar.
    return [...l].sort((a, b) =>
      orden === 'reciente' ? String(b.fecha).localeCompare(String(a.fecha)) : String(a.fecha).localeCompare(String(b.fecha))
    );
  }, [items, search, ccaaFilter, orgFilter, seccion, orden]);

  useEffect(() => {
    setPage(1);
  }, [search, ccaaFilter, orgFilter, seccion, orden]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = filtrados.slice((current - 1) * pageSize, current * pageSize);

  // Quién publica, con el recuento. Sale del propio listado y no de una
  // lista fija: así solo aparecen los que tienen algo publicado, y el
  // número dice de antemano cuánto vas a encontrar.
  // Quién publica y de qué comunidad, con el recuento. Sale del propio
  // listado: solo aparece lo que tiene algo publicado.
  const contar = (campo) => {
    const n = new Map();
    for (const i of items || []) if (i[campo]) n.set(i[campo], (n.get(i[campo]) || 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, total]) => ({ value: nombre, label: `${nombre} (${total})` }));
  };
  const orgOptions = useMemo(() => contar('organo'), [items]);
  const ccaaOptions = useMemo(() => contar('comunidad'), [items]);

  const hoy = (items || []).filter((i) => esHoy(i.fecha)).length;

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
        <Link href="/regulatorio/espana" style={{ color: '#a8a49c', textDecoration: 'none' }}>
          España
        </Link>
        {' › '}
        <span style={{ color: '#8b8780' }}>Boletines autonómicos</span>
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
            Boletines oficiales autonómicos
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
            placeholder="Buscar por título u organismo..."
            aria-label="Buscar en los boletines autonómicos"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>

        {ccaaOptions.length > 0 && (
          <MultiSelectFilter label="Comunidad" values={ccaaOptions} selected={ccaaFilter} onApply={setCcaaFilter} />
        )}

        {orgOptions.length > 0 && (
          <MultiSelectFilter
            label="Organismo"
            values={orgOptions}
            selected={orgFilter}
            onApply={setOrgFilter}
          />
        )}

        <button
          type="button"
          onClick={() => setOrden((o) => (o === 'reciente' ? 'antiguo' : 'reciente'))}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '8px 14px',
            fontSize: 12,
            color: '#57534e',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <i className={`ti ti-arrow-${orden === 'reciente' ? 'down' : 'up'}`} style={{ fontSize: 14 }}></i>
          {orden === 'reciente' ? 'Más recientes' : 'Más antiguas'}
        </button>

        {(ccaaFilter.size > 0 || orgFilter.size > 0 || search) && (
          <span
            onClick={() => {
              setCcaaFilter(new Set());
              setOrgFilter(new Set());
              setSearch('');
            }}
            style={{ fontSize: 11.5, color: '#a8a49c', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'center' }}
          >
            Limpiar
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 14, flexWrap: 'wrap' }}>
        {TIPOS.map(([valor, nombre]) => (
          <button key={valor || 'todo'} type="button" onClick={() => setSeccion(valor)} style={chip(seccion === valor)}>
            {nombre}
          </button>
        ))}
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
            <a
              key={i.id}
              href={`/regulatorio/diarios/${i.id}`}
              target="_blank"
              rel="noopener noreferrer"
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
                {fechaCorta(i.fecha)}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                {i.diario && (
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
                    {i.diario} · {i.comunidad}
                  </span>
                )}
                <div style={{ fontSize: 13, lineHeight: 1.45, letterSpacing: '-.1px' }}>{i.titulo}</div>
                <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 4 }}>
                  {[i.organo, i.rango].filter(Boolean).join(' · ')}
                </div>
              </div>

              <i className="ti ti-external-link" style={{ color: '#d6d2ca', fontSize: 15, flexShrink: 0, marginTop: 3 }}></i>
            </a>
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
        Boletines oficiales de Aragón, Asturias, Cantabria, Castilla y León, Cataluña, Extremadura, Galicia, La Rioja, la Comunidad de Madrid, Navarra y el País Vasco. El resto de comunidades, próximamente.
      </div>
    </div>
  );
}
