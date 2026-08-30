'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import BackLink from '@/components/BackLink';

/**
 * Organismos y reguladores de la Administración General del Estado.
 *
 * Los datos vienen de age_units, cargada desde DIR3 —el Directorio
 * Común de Unidades Orgánicas, que publica el Ministerio de Hacienda y
 * se actualiza cada mes.
 *
 * Aquí solo entran los entes con personalidad jurídica propia:
 * organismos autónomos, agencias estatales y entidades de derecho
 * público. Las direcciones generales y demás estructura ministerial
 * están en la sección de Ministerios, porque no son lo mismo: la CNMC
 * no es una unidad de un ministerio sino una autoridad independiente, y
 * para asuntos públicos esa distinción cambia cómo se trata.
 */

const MORADO = '#6d5aef';
const PAGE_SIZES = [20, 50, 100, 200];
const BORDE = '#e0dfd8';

const CATEGORIAS = [
  { v: 'organismo_autonomo', label: 'Organismos autónomos' },
  { v: 'agencia_estatal', label: 'Agencias estatales' },
  { v: 'entidad_derecho_publico', label: 'Entidades de derecho público' },
  { v: 'entidad_gestora', label: 'Entidades gestoras' },
  { v: 'consorcio', label: 'Consorcios' },
  { v: 'fundacion', label: 'Fundaciones públicas' },
  // RTVE, ENRESA e INCIBE son sociedades mercantiles estatales y reciben
  // lobby de verdad en sus sectores: sin esta entrada saldrían con la
  // categoría en crudo.
  { v: 'sociedad_mercantil', label: 'Sociedades estatales' },
];

const ETIQUETA_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.v, c.label]));

/**
 * Los reguladores primero.
 *
 * De los 415 organismos, en asuntos públicos importan un puñado: los que
 * dictan normas o resuelven expedientes que afectan a un sector. La CNMC,
 * la AEPD o la CNMV pesan mucho más que el Consejo Escolar del Estado,
 * pero alfabéticamente quedaban dispersos entre museos y mutualidades.
 *
 * Se identifican por el nombre y no por una lista cerrada: DIR3 no
 * distingue reguladores del resto, y mantener a mano una lista de treinta
 * envejece mal.
 */
const RE_REGULADOR = /^(comisi[oó]n nacional|agencia espa[ñn]ola de protecci[oó]n de datos|autoridad|consejo de seguridad nuclear|banco de espa[ñn]a|comisi[oó]n del mercado)/i;

// Y después las agencias y organismos con capacidad normativa o de
// supervisión, antes que los de gestión y los culturales.
const PESO_CATEGORIA = {
  entidad_derecho_publico: 1,
  agencia_estatal: 2,
  organismo_autonomo: 3,
  entidad_gestora: 4,
  consorcio: 5,
  fundacion: 6,
};

function peso(u) {
  if (RE_REGULADOR.test(u.nombre || '')) return 0;
  return PESO_CATEGORIA[u.categoria] ?? 9;
}

// Sin el punto final ni el ", O.A." que DIR3 arrastra en algunos
// nombres: "Instituto Nacional de Administración Pública, O.A." se lee
// mejor sin la coletilla.
function iniciales(n) {
  const p = (n || '').replace(',', '').trim().split(/\s+/);
  return `${p[0]?.[0] || ''}${p[1]?.[0] || ''}`.toUpperCase();
}

function limpiar(nombre) {
  return (nombre || '').replace(/,?\s*O\.\s?A\.\s*$/i, '').trim();
}

/**
 * La paginación, compartida por las dos vistas.
 *
 * Estaba escrita dentro de la tarjeta de la lista, y al añadirla también
 * a la cuadrícula habría quedado duplicada: el mismo bloque de setenta
 * líneas en dos sitios que hay que mantener a la vez.
 */
function Paginacion({ pageSize, changePageSize, from, to, total, current, totalPages, setPage, pageNumbers, dentro }) {
  if (total === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: dentro ? '11px 14px' : '13px 2px 0',
        background: dentro ? '#fcfbf8' : 'transparent',
        flexWrap: 'wrap',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 11.5, color: '#888' }}>Filas</span>
        <div style={{ display: 'flex', gap: 2, background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 7, padding: 2 }}>
          {PAGE_SIZES.map((n) => (
            <span
              key={n}
              onClick={() => changePageSize(n)}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 5,
                cursor: 'pointer',
                background: pageSize === n ? '#1d6f5c' : 'transparent',
                color: pageSize === n ? '#fff' : '#666',
              }}
            >
              {n}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 11.5, color: '#888' }}>
          {from}–{to} de {total}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          onClick={() => setPage(Math.max(1, current - 1))}
          style={{ border: `.5px solid ${BORDE}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: current === 1 ? '#ccc' : '#555' }}
        >
          <i className="ti ti-chevron-left" style={{ fontSize: 13 }}></i>
        </span>
        {pageNumbers.map((n, k) =>
          n === '…' ? (
            <span key={`e${k}`} style={{ fontSize: 11.5, color: '#aaa', padding: '0 3px' }}>…</span>
          ) : (
            <span
              key={n}
              onClick={() => setPage(n)}
              style={{
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11.5,
                cursor: 'pointer',
                background: n === current ? '#1d6f5c' : 'transparent',
                color: n === current ? '#fff' : '#555',
                border: n === current ? 'none' : `.5px solid ${BORDE}`,
              }}
            >
              {n}
            </span>
          )
        )}
        <span
          onClick={() => setPage(Math.min(totalPages, current + 1))}
          style={{ border: `.5px solid ${BORDE}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: current === totalPages ? '#ccc' : '#555' }}
        >
          <i className="ti ti-chevron-right" style={{ fontSize: 13 }}></i>
        </span>
      </div>
    </div>
  );
}

export default function OrganismosPage() {
  const supabase = createClient();

  const [unidades, setUnidades] = useState([]);
  const [titulares, setTitulares] = useState({});
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [cats, setCats] = useState(new Set());
  const [mins, setMins] = useState(new Set());
  const [vista, setVista] = useState('tarjetas');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Mismo tamaño de página que el resto de directorios.
  useEffect(() => {
    const saved = parseInt(window.localStorage.getItem('gt_page_size') || '20', 10);
    if (PAGE_SIZES.includes(saved)) setPageSize(saved);
  }, []);

  function changePageSize(n) {
    setPageSize(n);
    setPage(1);
    try {
      window.localStorage.setItem('gt_page_size', String(n));
    } catch {}
  }

  const cargar = useCallback(async () => {
    const [{ data: u }, { data: p }] = await Promise.all([
      supabase
        .from('age_units')
        .select('dir3_code, nombre, categoria, raiz_nombre, cif')
        .eq('activo', true)
        // Solo los marcados como relevantes: filtrar por categoría de
        // DIR3 mezclaba el Museo del Prado con la CNMV —ambos son
        // "entidad de derecho público"— y colaba las direcciones
        // internas de cada organismo como si fueran organismos hermanos.
        .eq('relevante', true),
      // El titular, cuando lo hay: no todos los organismos lo tienen
      // cargado todavía.
      supabase
        .from('government_officials')
        .select('dir3_code, full_name, role, slug')
        .eq('active', true)
        .not('dir3_code', 'is', null),
    ]);

    // El orden se hace aquí y no en la consulta: depende del nombre y de
    // la categoría a la vez, y Postgres no lo resolvería sin un CASE.
    setUnidades(
      [...(u || [])].sort((a, b) => {
        const d = peso(a) - peso(b);
        return d !== 0 ? d : (a.nombre || '').localeCompare(b.nombre || '');
      })
    );
    const porUnidad = {};
    for (const x of p || []) {
      if (!porUnidad[x.dir3_code]) porUnidad[x.dir3_code] = x;
    }
    setTitulares(porUnidad);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const ministerios = useMemo(() => {
    const set = new Map();
    for (const u of unidades) {
      if (u.raiz_nombre) set.set(u.raiz_nombre, (set.get(u.raiz_nombre) || 0) + 1);
    }
    return [...set.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([nombre, n]) => ({ value: nombre, label: `${nombre} (${n})` }));
  }, [unidades]);

  const categorias = useMemo(() => {
    const n = {};
    for (const u of unidades) n[u.categoria] = (n[u.categoria] || 0) + 1;
    return CATEGORIAS.filter((c) => n[c.v]).map((c) => ({ value: c.v, label: `${c.label} (${n[c.v]})` }));
  }, [unidades]);

  const filtradas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return unidades.filter((u) => {
      if (cats.size > 0 && !cats.has(u.categoria)) return false;
      if (mins.size > 0 && !mins.has(u.raiz_nombre)) return false;
      if (!texto) return true;
      return (
        (u.nombre || '').toLowerCase().includes(texto) ||
        (u.raiz_nombre || '').toLowerCase().includes(texto)
      );
    });
  }, [unidades, q, cats, mins]);

  // Al filtrar, volver a la primera página: si no, filtrar estando en la
  // 6 deja la lista vacía sin explicación.
  useEffect(() => {
    setPage(1);
  }, [q, cats, mins, vista]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = filtradas.slice((current - 1) * pageSize, current * pageSize);
  const from = filtradas.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, filtradas.length);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, '…', totalPages];
    if (current >= totalPages - 2) return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', current, '…', totalPages];
  }, [current, totalPages]);

  return (
    <div className="sec">
      <div style={{ marginBottom: 6 }}>
        <BackLink fallbackHref="/institutions" fallbackLabel="Directorio institucional" />
      </div>

      <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Organismos y reguladores</h1>
      <p style={{ fontSize: 12.5, color: '#888', margin: '3px 0 16px', lineHeight: 1.55 }}>
        Organismos autónomos, agencias estatales y entidades de derecho público de la Administración
        General del Estado.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            minWidth: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: `.5px solid ${BORDE}`,
            borderRadius: 20,
            padding: '9px 16px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 15 }}></i>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar organismo…"
            aria-label="Buscar organismo"
            style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12.5, background: 'transparent' }}
          />
        </div>
        <MultiSelectFilter
          label="Tipo"
          values={categorias}
          selected={cats}
          onApply={(s) => setCats(new Set(s))}
        />
        <MultiSelectFilter
          label="Ministerio"
          values={ministerios}
          selected={mins}
          onApply={(s) => setMins(new Set(s))}
        />

        {/* Dos vistas: la lista para buscar algo concreto, las tarjetas
            para hacerse una idea del conjunto. Mismo patrón que en
            Comisiones del Congreso. */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            background: '#fff',
            border: `.5px solid ${BORDE}`,
            borderRadius: 8,
            padding: 2,
          }}
        >
          {[
            { v: 'lista', icono: 'list' },
            { v: 'tarjetas', icono: 'layout-grid' },
          ].map((o) => (
            <span
              key={o.v}
              onClick={() => setVista(o.v)}
              aria-label={o.v === 'lista' ? 'Ver como lista' : 'Ver como tarjetas'}
              style={{
                padding: '5px 9px',
                borderRadius: 6,
                cursor: 'pointer',
                background: vista === o.v ? '#f0eefe' : 'transparent',
                color: vista === o.v ? MORADO : '#999',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <i className={`ti ti-${o.icono}`} style={{ fontSize: 15 }}></i>
            </span>
          ))}
        </div>
      </div>

      {(cats.size > 0 || mins.size > 0) && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          {[...cats].map((c) => (
            <span
              key={c}
              onClick={() => setCats((prev) => new Set([...prev].filter((x) => x !== c)))}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 12,
                background: '#f0eefe',
                color: MORADO,
                cursor: 'pointer',
              }}
            >
              {ETIQUETA_CATEGORIA[c] || c} ×
            </span>
          ))}
          {[...mins].map((m) => (
            <span
              key={m}
              onClick={() => setMins((prev) => new Set([...prev].filter((x) => x !== m)))}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 12,
                background: '#f5f4f1',
                color: '#666',
                cursor: 'pointer',
              }}
            >
              {m} ×
            </span>
          ))}
        </div>
      )}

      {cargando ? (
        <div className="spinner"></div>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
            {filtradas.length} {filtradas.length === 1 ? 'organismo' : 'organismos'}
          </div>

          {filtradas.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <i className="ti ti-search-off"></i>
                Nada con esos criterios.
              </div>
            </div>
          ) : vista === 'lista' ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {slice.map((u, i) => {
                const t = titulares[u.dir3_code];
                const esRegulador = RE_REGULADOR.test(u.nombre || '');
                return (
                  <Link
                    key={u.dir3_code}
                    href={`/institutions/organismos/${u.dir3_code}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      textDecoration: 'none',
                      color: 'inherit',
                      borderBottom: i === slice.length - 1 ? 'none' : '.5px solid #f0f0eb',
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: '#f5f4f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <i
                        className="ti ti-scale"
                        style={{ fontSize: 14, color: esRegulador ? '#6d5aef' : '#888' }}
                      ></i>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {limpiar(u.nombre)}
                        {esRegulador && (
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 600,
                              letterSpacing: '.3px',
                              padding: '2px 7px',
                              borderRadius: 10,
                              background: '#f0eefe',
                              color: MORADO,
                              marginLeft: 7,
                              verticalAlign: 1,
                            }}
                          >
                            REGULADOR
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#a8a49c',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {[ETIQUETA_CATEGORIA[u.categoria], u.raiz_nombre].filter(Boolean).join(' · ')}
                      </div>
                    </div>

                    {/* El titular solo cuando se conoce. La mayoría de los
                        organismos aún no lo tienen: el BOE los irá
                        rellenando conforme haya nombramientos. */}
                    {t && (
                      <div style={{ flexShrink: 0, textAlign: 'right', maxWidth: 220 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: '#3d3a35',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.full_name}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#a8a49c' }}>{t.role}</div>
                      </div>
                    )}
                    <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
                  </Link>
                );
              })}
            
              <Paginacion
                  pageSize={pageSize}
                  changePageSize={changePageSize}
                  from={from}
                  to={to}
                  total={filtradas.length}
                  current={current}
                  totalPages={totalPages}
                  setPage={setPage}
                  pageNumbers={pageNumbers}
                  dentro
                />
            </div>
          ) : (
            <>
            {/* auto-fill con 215px de mínimo: cuatro por fila en pantallas
                anchas. Con los 290px de Comisiones salían tres y sobraba
                aire a los lados, porque aquí las tarjetas llevan menos
                contenido. */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
                gap: 12,
              }}
            >
              {slice.map((u) => {
                const t = titulares[u.dir3_code];
                const esRegulador = RE_REGULADOR.test(u.nombre || '');
                return (
                  <Link
                    key={u.dir3_code}
                    href={`/institutions/organismos/${u.dir3_code}`}
                    style={{
                      background: '#fff',
                      borderRadius: 12,
                      padding: 17,
                      textDecoration: 'none',
                      color: 'inherit',
                      display: 'block',
                    }}
                  >
                    <div style={{ marginBottom: 13 }}>
                      <div
                        style={{
                          display: 'inline-block',
                          fontSize: 10.5,
                          borderRadius: 20,
                          padding: '2px 9px',
                          marginBottom: 8,
                          background: esRegulador ? '#f0eefe' : '#f0f0eb',
                          color: esRegulador ? '#3c3489' : '#7a736b',
                        }}
                      >
                        {esRegulador ? 'Regulador' : ETIQUETA_CATEGORIA[u.categoria] || u.categoria}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{limpiar(u.nombre)}</div>
                      <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 5, lineHeight: 1.45 }}>
                        {u.raiz_nombre}
                      </div>
                    </div>

                    {t ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 9,
                          paddingTop: 11,
                          borderTop: '.5px solid #f0f0eb',
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: '#f5f4f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontSize: 10.5,
                            color: '#888',
                            fontWeight: 600,
                          }}
                        >
                          {iniciales(t.full_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t.full_name}
                          </div>
                          <div style={{ fontSize: 10, color: '#999' }}>{t.role}</div>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          paddingTop: 11,
                          borderTop: '.5px solid #f0f0eb',
                          fontSize: 10.5,
                          color: '#c2beb6',
                        }}
                      >
                        Titular pendiente de publicarse
                      </div>
                    )}
                  </Link>
                );
              })}
              </div>
              <Paginacion
                  pageSize={pageSize}
                  changePageSize={changePageSize}
                  from={from}
                  to={to}
                  total={filtradas.length}
                  current={current}
                  totalPages={totalPages}
                  setPage={setPage}
                  pageNumbers={pageNumbers}
              />
            </>
          )}

          <p style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 14, lineHeight: 1.6 }}>
            Fuente: Directorio Común de Unidades Orgánicas y Oficinas (DIR3), del Ministerio de Hacienda.
            Los titulares se actualizan con los nombramientos publicados en el BOE.
          </p>
        </>
      )}
    </div>
  );
}
