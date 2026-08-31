'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import UpgradeModal from '@/components/UpgradeModal';
import usePlanPro from '@/lib/usePlanPro';

const PAGE_SIZES = [20, 50, 100, 200];

const NIVELES = {
  comisario: 'Comisario/a',
  gabinete: 'Gabinete',
  dg: 'Dirección general',
  director: 'Director/a',
  jefe_unidad: 'Jefe/a de unidad',
  asesor: 'Asesor/a',
  otro: 'Otros',
};

// Orden jerárquico, no alfabético: el filtro debe leerse de arriba abajo.
const ORDEN_NIVELES = ['comisario', 'gabinete', 'dg', 'director', 'jefe_unidad', 'asesor', 'otro'];

const RANGOS = {
  presidenta: 'Presidenta',
  presidente: 'Presidente',
  vicepresidenta_ejecutiva: 'Vicepresidenta ejecutiva',
  vicepresidente_ejecutivo: 'Vicepresidente ejecutivo',
  alta_representante: 'Alta representante',
  alto_representante: 'Alto representante',
  comisario: 'Comisario',
  comisaria: 'Comisaria',
};

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function FlagEU() {
  return (
    <span
      role="img"
      aria-label="Bandera de la Unión Europea"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 14,
        borderRadius: 3,
        background: '#003399',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #FFCC00' }} />
    </span>
  );
}

function Photo({ url, name, size = 56, radius = 10 }) {
  const [failed, setFailed] = useState(false);
  const base = { width: size, height: size, borderRadius: radius, flexShrink: 0, objectFit: 'cover', background: '#ece9e2' };

  if (!url || failed) {
    return (
      <div
        style={{
          ...base,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8d8b83',
          fontSize: Math.round(size * 0.3),
          fontWeight: 700,
        }}
        aria-hidden="true"
      >
        {initials(name)}
      </div>
    );
  }
  return <img src={url} alt="" width={size} height={size} style={base} onError={() => setFailed(true)} />;
}

/* ------------------------------------------------------------------ */
/* Pestaña — Comisarios                                                */
/* ------------------------------------------------------------------ */
function ComisariosTab({ comisarios }) {
  const [soloES, setSoloES] = useState(false);
  const [paisFilter, setPaisFilter] = useState(new Set());

  const paisOptions = useMemo(() => {
    const vistos = new Map();
    for (const c of comisarios) {
      if (c.country_code && !vistos.has(c.country_code)) vistos.set(c.country_code, c.country_name);
    }
    return [...vistos.entries()]
      .map(([code, name]) => ({ value: code, label: name || code }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [comisarios]);

  const lista = useMemo(() => {
    let l = comisarios;
    if (soloES) l = l.filter((c) => c.country_code === 'ES');
    if (paisFilter.size > 0) l = l.filter((c) => paisFilter.has(c.country_code));
    return l;
  }, [comisarios, soloES, paisFilter]);

  const presidencia = lista.filter((c) => c.rank === 'presidenta' || c.rank === 'presidente');
  const vices = lista.filter((c) => c.rank.startsWith('vicepresident') || c.rank.startsWith('alt'));
  const resto = lista.filter(
    (c) => !c.rank.startsWith('presidente') && !c.rank.startsWith('presidenta') && !c.rank.startsWith('vicepresident') && !c.rank.startsWith('alt')
  );

  const Bloque = ({ titulo, lista }) =>
    lista.length === 0 ? null : (
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.3px' }}>
            {titulo}
          </span>
          <div style={{ flex: 1, height: '.5px', background: '#e0dfd8' }}></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          {lista.map((c) => (
            <Link
              key={c.id}
              href={`/institutions/eu-commission/comisarios/${c.slug}`}
              className="card"
              style={{ padding: 14, textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Photo url={c.photo_url} name={c.full_name} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{c.full_name}</div>
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>
                    {RANGOS[c.rank] || c.rank}
                    {c.country_name ? ` · ${c.country_name}` : ''}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#666', marginTop: 6, lineHeight: 1.45 }}>{c.portfolio_es}</div>
                </div>
              </div>
              {/* El perfil oficial queda como acción secundaria: la
                  tarjeta lleva a la ficha, que es lo esperable. */}
              <div style={{ fontSize: 11.5, color: '#6d5aef', marginTop: 11 }}>Ver su ficha →</div>
            </Link>
          ))}
        </div>
      </div>
    );

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span
          onClick={() => {
            setSoloES((v) => !v);
            setPaisFilter(new Set());
          }}
          style={{
            background: soloES ? '#e8f4f0' : '#fff',
            border: `.5px solid ${soloES ? '#1d6f5c' : '#e0dfd8'}`,
            color: soloES ? '#1d6f5c' : '#555',
            borderRadius: 20,
            padding: '7px 12px',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Solo España {soloES && <i className="ti ti-x" style={{ fontSize: 11 }}></i>}
        </span>
        <MultiSelectFilter label="País" values={paisOptions} selected={paisFilter} onApply={setPaisFilter} />
        {lista.length !== comisarios.length && (
          <span style={{ fontSize: 11.5, color: '#888', alignSelf: 'center' }}>
            {lista.length} de {comisarios.length}
          </span>
        )}
      </div>

      {lista.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hay comisarios con estos filtros.
          </div>
        </div>
      ) : (
        <>
          <Bloque titulo="Presidencia" lista={presidencia} />
          <Bloque titulo="Vicepresidencias ejecutivas y Alta Representante" lista={vices} />
          <Bloque titulo="Comisarios" lista={resto} />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña — Direcciones generales                                     */
/* ------------------------------------------------------------------ */
function UnidadesTab({ bodies, onSelect }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let l = bodies;
    if (search) {
      const q = normalize(search);
      l = l.filter((b) => normalize(b.name).includes(q) || normalize(b.code).includes(q));
    }
    return [...l].sort((a, b) => b.total_personas - a.total_personas);
  }, [bodies, search]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#fff',
          border: '.5px solid #e0dfd8',
          borderRadius: 20,
          padding: '7px 14px',
          marginBottom: 14,
          maxWidth: 340,
        }}
      >
        <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar dirección general..."
          aria-label="Buscar dirección general"
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-search-off"></i>
            No hay direcciones generales con esa búsqueda.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          {filtered.map((b) => (
            <Link
              key={b.code}
              href={`/institutions/eu-commission/${b.code}`}
              className="card"
              style={{ padding: 14, textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: '#EEEDFE',
                    color: '#3C3489',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: b.code.length > 4 ? 9 : 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {b.code}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{b.name}</div>
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>{b.total_personas} personas</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5, borderTop: '.5px solid #f0f0eb', paddingTop: 9 }}>
                {b.director_general && (
                  <div>
                    <i className="ti ti-user-star" style={{ fontSize: 12, verticalAlign: -1, color: '#aaa' }}></i>{' '}
                    {b.director_general}
                  </div>
                )}
                <div style={{ marginTop: 3 }}>
                  <i className="ti ti-layout-grid" style={{ fontSize: 12, verticalAlign: -1, color: '#aaa' }}></i>{' '}
                  {b.unidades} unidades · {b.jefes_unidad} jefaturas
                </div>
                {/* Se conserva el filtrado que hacía la tarjeta antes,
                    ahora como acción secundaria: pulsar la tarjeta abre
                    la ficha, que es lo esperable. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(b.code);
                  }}
                  style={{
                    fontSize: 11,
                    color: '#6d5aef',
                    background: 'none',
                    border: 'none',
                    padding: '7px 0 0',
                    cursor: 'pointer',
                  }}
                >
                  Ver sus personas →
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pestaña — Personas                                                  */
/* ------------------------------------------------------------------ */
/**
 * Una celda de la tabla de personas que puede estar bloqueada.
 *
 * Con plan enseña el valor. Sin él, texto de relleno difuminado que se
 * puede pulsar. El relleno es inventado a propósito: difuminar el valor
 * real con CSS no lo oculta, solo lo despeina, y aquí hay correos de
 * funcionarios.
 *
 * Mientras `esPro` es null no se pinta nada en el hueco. Son unas
 * décimas, y evita que a un usuario Pro le parpadee un candado que no
 * le corresponde.
 */
function Celda({ valor, relleno, esPro, onUpsell, atenuado, partirPalabra }) {
  const base = {
    fontSize: atenuado ? 11 : 11.5,
    color: atenuado ? '#999' : '#666',
    minWidth: 0,
    wordBreak: partirPalabra ? 'break-all' : 'normal',
  };

  if (esPro === null) return <div style={base}></div>;
  if (esPro) return <div style={base}>{valor || '—'}</div>;

  // Sin valor real no hay nada que vender: se deja la raya y no se
  // promete un dato que tampoco existe con plan.
  if (!valor) return <div style={base}>—</div>;

  return (
    <button
      type="button"
      onClick={onUpsell}
      style={{
        ...base,
        border: 'none',
        background: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        filter: 'blur(3.5px)',
        userSelect: 'none',
      }}
      aria-label="Ver este dato con el plan Pro"
    >
      {relleno}
    </button>
  );
}

function PersonasTab({ people, bodies, bodyFilter, setBodyFilter }) {
  const esPro = usePlanPro();
  const [upsell, setUpsell] = useState(null);

  function abrirUpsellFila() {
    setUpsell({
      title: 'Cargo, unidad y correo',
      message:
        'Quién hace qué dentro de cada dirección general y cómo escribirle, sin buscar a nadie uno a uno. Disponible en el plan Pro.',
    });
  }
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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

  const bodyOptions = useMemo(
    () =>
      [...bodies]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` })),
    [bodies]
  );

  const levelOptions = useMemo(() => {
    const presentes = new Set(people.map((p) => p.level));
    return ORDEN_NIVELES.filter((l) => presentes.has(l)).map((l) => ({ value: l, label: NIVELES[l] }));
  }, [people]);

  const filtered = useMemo(() => {
    let l = people;
    if (search) {
      const q = normalize(search);
      l = l.filter(
        (p) =>
          normalize(p.full_name).includes(q) ||
          normalize(p.role).includes(q) ||
          normalize(p.unit).includes(q)
      );
    }
    if (bodyFilter.size > 0) l = l.filter((p) => bodyFilter.has(p.body_code));
    if (levelFilter.size > 0) l = l.filter((p) => levelFilter.has(p.level));
    return l;
  }, [people, search, bodyFilter, levelFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, bodyFilter, levelFilter]);

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

  const activeCount = bodyFilter.size + levelFilter.size;
  // El correo ocupa columna propia: se muestra completo, no como icono.
  const GRID = '1.7fr 1fr 1.2fr 1.4fr';

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '7px 14px',
            flex: '1 1 180px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, cargo o unidad..."
            aria-label="Buscar persona"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <MultiSelectFilter
          label="Dirección general"
          values={bodyOptions}
          selected={bodyFilter}
          onApply={setBodyFilter}
          bloqueado={esPro === false}
          onBloqueado={() =>
            setUpsell({
              title: 'Filtrar por dirección general',
              message: 'Quédate con las personas de las direcciones que te tocan. Disponible en el plan Pro.',
            })
          }
        />
        <MultiSelectFilter
          label="Nivel"
          values={levelOptions}
          selected={levelFilter}
          onApply={setLevelFilter}
          bloqueado={esPro === false}
          onBloqueado={() =>
            setUpsell({
              title: 'Filtrar por nivel',
              message: 'Separa a la dirección de los jefes de unidad y del resto del equipo. Disponible en el plan Pro.',
            })
          }
        />
      </div>

      {activeCount > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...bodyFilter].map((v) => (
            <span key={`b${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          {[...levelFilter].map((v) => (
            <span key={`l${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {NIVELES[v] || v}
            </span>
          ))}
          <span
            onClick={() => {
              setSearch('');
              setBodyFilter(new Set());
              setLevelFilter(new Set());
            }}
            style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Limpiar filtros
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hay personas con estos filtros.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              padding: '10px 14px',
              borderBottom: '.5px solid #f0f0eb',
              fontSize: 10.5,
              fontWeight: 700,
              color: '#999',
              textTransform: 'uppercase',
            }}
          >
            <div>Persona</div>
            <div>Cargo</div>
            <div>Unidad</div>
            <div>Correo</div>
          </div>

          {slice.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                padding: '11px 14px',
                borderBottom: '.5px solid #f0f0eb',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: '#ece9e2',
                    color: '#8d8b83',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  {initials(p.full_name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.full_name}</div>
                  <div style={{ fontSize: 10.5, color: '#999' }}>
                    {p.body_code ? `${p.body_code} · ${p.body_name}` : p.cabinet || '—'}
                  </div>
                </div>
              </div>

              {/* Cargo, unidad y correo son lo que se compra: el nombre
                  y la dirección general se quedan a la vista para que la
                  tabla siga sirviendo de índice.

                  Lo borroso es texto de relleno, no el dato real tapado:
                  un blur de CSS deja el original legible en el
                  inspector. */}
              <Celda valor={p.role} relleno="Head of Unit" esPro={esPro} onUpsell={abrirUpsellFila} />
              <Celda
                valor={p.unit || p.directorate}
                relleno="Unidad A.1 — Coordinación"
                esPro={esPro}
                onUpsell={abrirUpsellFila}
                atenuado
              />
              <Celda
                valor={p.email}
                relleno="nombre.apellido@ec.europa.eu"
                esPro={esPro}
                onUpsell={abrirUpsellFila}
                atenuado
                partirPalabra
              />
            </div>
          ))}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '11px 14px',
              background: '#fcfbf8',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 11.5, color: '#888' }}>Filas</span>
              <div style={{ display: 'flex', gap: 2, background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 7, padding: 2 }}>
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
                {from}–{to} de {filtered.length}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                onClick={() => setPage(Math.max(1, current - 1))}
                style={{ border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: current === 1 ? '#ccc' : '#555' }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 13 }}></i>
              </span>
              {pageNumbers.map((n, i) =>
                n === '…' ? (
                  <span key={`e${i}`} style={{ fontSize: 11.5, color: '#aaa', padding: '0 3px' }}>…</span>
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
        <UpgradeModal title={upsell.title} message={upsell.message} onClose={() => setUpsell(null)} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */
export default function EuCommissionPage() {
  const supabase = createClient();
  const [tab, setTab] = useState('comisarios');
  const [comisarios, setComisarios] = useState(null);
  const [bodies, setBodies] = useState([]);
  const [people, setPeople] = useState([]);
  const [bodyFilter, setBodyFilter] = useState(new Set());

  useEffect(() => {
    Promise.all([
      supabase.from('ec_commissioners').select('*').eq('active', true).order('order_index'),
      supabase.from('ec_bodies_directory').select('*'),
      supabase.from('ec_people_directory').select('*').order('full_name'),
    ]).then(([c, b, p]) => {
      setComisarios(c.data || []);
      setBodies(b.data || []);
      setPeople(p.data || []);
    });
  }, []);

  // Al pinchar una dirección general se salta a Personas con el filtro ya
  // puesto: es lo que el usuario espera, y evita una pantalla intermedia.
  function seleccionarUnidad(code) {
    setBodyFilter(new Set([code]));
    setTab('personas');
  }

  const tabs = [
    { id: 'comisarios', label: `Comisarios${comisarios ? ` (${comisarios.length})` : ''}` },
    { id: 'unidades', label: `Direcciones generales${bodies.length ? ` (${bodies.length})` : ''}` },
    { id: 'personas', label: `Personas${people.length ? ` (${people.length})` : ''}` },
  ];

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
          <FlagEU />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Comisión Europea</h1>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {people.length ? `${people.length} personas` : '—'} · {comisarios ? comisarios.length : '—'} comisarios ·{' '}
          {bodies.length} direcciones generales
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14, overflowX: 'auto' }}>
        {tabs.map((t) => (
          <span
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontSize: 13,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#1d6f5c' : '#999',
              borderBottom: tab === t.id ? '2px solid #1d6f5c' : '2px solid transparent',
              paddingBottom: 8,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {comisarios === null ? (
        <div className="spinner"></div>
      ) : tab === 'comisarios' ? (
        <ComisariosTab comisarios={comisarios} />
      ) : tab === 'unidades' ? (
        <UnidadesTab bodies={bodies} onSelect={seleccionarUnidad} />
      ) : (
        <PersonasTab people={people} bodies={bodies} bodyFilter={bodyFilter} setBodyFilter={setBodyFilter} />
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Comisarios: Comisión Europea. Personal: EU Whoiswho, edición de agosto de 2026 — actualización anual.
      </div>
    </div>
  );
}
