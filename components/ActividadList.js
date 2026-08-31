'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import UpgradeModal from '@/components/UpgradeModal';
import usePlanPro from '@/lib/usePlanPro';
import { groupColor, grupoCorto } from '@/lib/grupos';

/**
 * Listado de proposiciones no de ley y comparecencias.
 *
 * El mismo componente sirve para los dos tipos porque comparten
 * estructura: la fuente da lo mismo para ambos —título, fechas, autor y
 * situación— y solo cambia el subtipo.
 *
 * Vive aparte de las leyes, que sí tienen recorrido, plazos y ponentes.
 */

const PAGE_SIZES = [20, 50, 100];

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

// "Proposición no de ley ante el pleno" -> "Ante el pleno"
function subtipoCorto(label, kind) {
  if (!label) return null;
  return label
    .replace(/^Proposición no de ley\s*/i, '')
    .replace(/^Comparecencia\s*/i, '')
    .replace(/^Otras comparecencias\s*/i, 'Otras ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase()) || (kind === 'pnl' ? 'PNL' : 'Comparecencia');
}

export default function ActividadList({ kind }) {
  const esPro = usePlanPro();
  const [upsell, setUpsell] = useState(false);
  const supabase = createClient();

  const [items, setItems] = useState(null);
  const [grupos, setGrupos] = useState([]);
  // El buscador de la portada de Regulatorio llega con ?q=: se recoge
  // aquí para que la búsqueda continúe donde el usuario la dejó.
  const sp = useSearchParams();
  const [search, setSearch] = useState(sp?.get('q') || '');
  const [soloVivas, setSoloVivas] = useState(true);
  const [situacionFilter, setSituacionFilter] = useState(new Set());
  const [grupoFilter, setGrupoFilter] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setItems(null);
    setPage(1);
    Promise.all([
      // Solo las columnas que la lista pinta. Con select('*') se traía
      // también `raw` —el registro original en jsonb— que pesa 6 MB de
      // los 12 de la tabla y no se usa en ninguna parte de la interfaz.
      // Medido: lo visible son 1,8 MB frente a 12 MB del select entero.
      supabase
        .from('es_activity_directory')
        .select(
          'num_expediente, slug, kind, kind_label, cini, titulo, fecha_presentacion, situacion, resultado, is_closed, autores, group_ids, committee_slug'
        )
        .eq('kind', kind)
        .order('fecha_presentacion', { ascending: false, nullsFirst: false }),
      supabase.from('parliamentary_groups').select('id, name, slug').eq('active', true),
    ]).then(([{ data }, { data: g }]) => {
      setItems(data || []);
      setGrupos(g || []);
    });
  }, [kind]);

  const situacionOptions = useMemo(() => {
    const cuenta = new Map();
    for (const i of items || []) {
      if (soloVivas && i.is_closed) continue;
      const s = i.situacion || '(sin situación)';
      cuenta.set(s, (cuenta.get(s) || 0) + 1);
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => ({ value: v, label: `${v} (${n})` }));
  }, [items, soloVivas]);

  // El filtro de grupo se construye contando cuántos expedientes lleva
  // cada uno: así el usuario ve de entrada quién presenta más.
  const grupoOptions = useMemo(() => {
    const cuenta = new Map();
    for (const i of items || []) {
      if (soloVivas && i.is_closed) continue;
      for (const id of i.group_ids || []) cuenta.set(id, (cuenta.get(id) || 0) + 1);
    }
    const porId = new Map(grupos.map((g) => [g.id, g.name]));
    return [...cuenta.entries()]
      .filter(([id]) => porId.has(id))
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ value: id, label: `${grupoCorto(porId.get(id))} (${n})` }));
  }, [items, grupos, soloVivas]);

  const filtered = useMemo(() => {
    let l = items || [];
    if (soloVivas) l = l.filter((i) => !i.is_closed);
    if (search) {
      const q = normalize(search);
      l = l.filter((i) => normalize(i.titulo).includes(q) || normalize(i.num_expediente).includes(q));
    }
    if (situacionFilter.size > 0) l = l.filter((i) => situacionFilter.has(i.situacion || '(sin situación)'));
    if (grupoFilter.size > 0) l = l.filter((i) => (i.group_ids || []).some((g) => grupoFilter.has(g)));
    return l;
  }, [items, search, soloVivas, situacionFilter, grupoFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, soloVivas, situacionFilter, grupoFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);
  const from = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, filtered.length);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, '…', totalPages];
    if (current >= totalPages - 2) return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', current, '…', totalPages];
  }, [current, totalPages]);

  const vivas = (items || []).filter((i) => !i.is_closed).length;
  const activos = situacionFilter.size + grupoFilter.size;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 22,
            padding: '8px 15px',
            flex: '1 1 200px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título o expediente..."
            aria-label="Buscar"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>

        <span
          onClick={() => setSoloVivas((v) => !v)}
          style={{
            background: soloVivas ? '#EEEDFE' : '#fff',
            border: `.5px solid ${soloVivas ? '#6d5aef' : '#e0dfd8'}`,
            color: soloVivas ? '#3C3489' : '#555',
            borderRadius: 22,
            padding: '8px 13px',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          En trámite ({vivas.toLocaleString('es-ES')})
        </span>

        <MultiSelectFilter
          label="Situación"
          values={situacionOptions}
          selected={situacionFilter}
          onApply={setSituacionFilter}
          bloqueado={esPro === false}
          onBloqueado={() => setUpsell(true)}
        />
        <MultiSelectFilter label="Grupo" values={grupoOptions} selected={grupoFilter} onApply={setGrupoFilter} />
      </div>

      {activos > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: '#888' }}>{filtered.length.toLocaleString('es-ES')} resultados</span>
          <span
            onClick={() => {
              setSituacionFilter(new Set());
              setGrupoFilter(new Set());
            }}
            style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Limpiar filtros
          </span>
        </div>
      )}

      {items === null ? (
        <div className="spinner"></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-file-off"></i>
            No hay resultados con estos filtros.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {slice.map((i) => (
            <Link
              key={i.num_expediente}
              href={`/congreso/actividad/${i.slug}`}
              style={{
                display: 'flex',
                gap: 13,
                padding: '14px 16px',
                borderBottom: '.5px solid #f0f0eb',
                alignItems: 'flex-start',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              {/* Morado si sigue en trámite, gris si terminó: es lo que
                  permite escanear la lista de un vistazo. */}
              <div
                style={{
                  width: 3,
                  alignSelf: 'stretch',
                  background: i.is_closed ? '#d5d3c9' : '#6d5aef',
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              ></div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 9.5,
                      background: i.is_closed ? '#f0efe9' : '#EEEDFE',
                      color: i.is_closed ? '#8d8b83' : '#3C3489',
                      padding: '2px 8px',
                      borderRadius: 9,
                    }}
                  >
                    {subtipoCorto(i.kind_label, i.kind)}
                  </span>
                  <span style={{ fontSize: 10, color: '#999' }}>{i.num_expediente}</span>
                </div>

                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    lineHeight: 1.4,
                    color: i.is_closed ? '#666' : '#1a1a1a',
                  }}
                >
                  {i.titulo}
                </div>

                <div style={{ fontSize: 10.5, color: i.is_closed ? '#aaa' : '#999', marginTop: 5 }}>
                  {i.is_closed && i.resultado ? (
                    i.resultado
                  ) : (
                    <>
                      {i.situacion && <span style={{ color: '#bbb' }}>En </span>}
                      {[i.situacion, fechaCorta(i.fecha_presentacion) ? `presentada el ${fechaCorta(i.fecha_presentacion)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </>
                  )}
                </div>

                {(i.autores || []).length > 0 && (i.autores || []).length <= 5 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 7, flexWrap: 'wrap' }}>
                    {i.autores.map((a) => (
                      <span key={a.nombre} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: groupColor(a.nombre),
                            flexShrink: 0,
                          }}
                        ></span>
                        <span style={{ fontSize: 10.5, color: i.is_closed ? '#999' : '#666' }}>
                          {grupoCorto(a.nombre)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0, marginTop: 3 }}></i>
            </Link>
          ))}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '11px 16px',
              background: '#fcfbf8',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ display: 'flex', gap: 2, background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 7, padding: 2 }}>
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
                      background: pageSize === n ? '#6d5aef' : 'transparent',
                      color: pageSize === n ? '#fff' : '#666',
                    }}
                  >
                    {n}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 11.5, color: '#888' }}>
                {from.toLocaleString('es-ES')}–{to.toLocaleString('es-ES')} de {filtered.length.toLocaleString('es-ES')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                onClick={() => setPage(Math.max(1, current - 1))}
                style={{ border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: current === 1 ? '#ccc' : '#555' }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 13 }}></i>
              </span>
              {pageNumbers.map((n, idx) =>
                n === '…' ? (
                  <span key={`e${idx}`} style={{ fontSize: 11.5, color: '#aaa', padding: '0 3px' }}>…</span>
                ) : (
                  <span
                    key={n}
                    onClick={() => setPage(n)}
                    style={{
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      background: n === current ? '#6d5aef' : 'transparent',
                      color: n === current ? '#fff' : '#555',
                      border: n === current ? 'none' : '.5px solid #e0dfd8',
                    }}
                  >
                    {n}
                  </span>
                )
              )}
              <span
                onClick={() => setPage(Math.min(totalPages, current + 1))}
                style={{ border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: current === totalPages ? '#ccc' : '#555' }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 13 }}></i>
              </span>
            </div>
          </div>
        </div>
      )}

      {upsell && (
        <UpgradeModal
          title="Filtrar por situación"
          message="Separa lo que sigue vivo de lo que ya caducó o se retiró, sin recorrer la lista entera. Disponible en el plan Pro."
          onClose={() => setUpsell(false)}
        />
      )}
    </>
  );
}
