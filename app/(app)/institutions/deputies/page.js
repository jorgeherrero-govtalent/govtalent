'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';

// Color por grupo. Con 9 grupos la sigla sola no basta para reconocerlos
// de un vistazo; el cuadrito de color sí. Mismo criterio que en el
// Parlamento Europeo.
const GROUP_COLORS = {
  PP: '#378ADD',
  PSOE: '#E24B4A',
  VOX: '#639922',
  SUMAR: '#D4537E',
  ERC: '#BA7517',
  Junts: '#1D9E75',
  'EH Bildu': '#D85A30',
  PNV: '#7F77DD',
  Mixto: '#888780',
};

// El nombre oficial del grupo ("Grupo Parlamentario Popular en el
// Congreso") no cabe en una celda. La sigla se deriva del nombre y no de
// short_name para garantizar que siempre casa con GROUP_COLORS.
const GROUP_MATCHERS = [
  [/socialista/i, 'PSOE'],
  [/popular/i, 'PP'],
  [/vox/i, 'VOX'],
  [/sumar/i, 'SUMAR'],
  [/republicano|esquerra/i, 'ERC'],
  [/junts/i, 'Junts'],
  [/bildu/i, 'EH Bildu'],
  [/vasco|eaj|pnv/i, 'PNV'],
  [/mixto/i, 'Mixto'],
];

const PAGE_SIZES = [20, 50, 100, 200];

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function groupCode(g) {
  if (!g) return null;
  const hit = GROUP_MATCHERS.find(([re]) => re.test(g.name || ''));
  return hit ? hit[1] : g.short_name || (g.name || '').replace(/^Grupo Parlamentario\s*/i, '') || null;
}

// "Abades Martínez, Cristina" -> "Cristina Abades Martínez"
function fullNameDisplay(officialName) {
  const [last, first] = (officialName || '').split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName || '';
}

// El prefijo del nombre oficial de la comisión se repite en las 40 filas
// de la columna y no aporta nada. La versión anterior de esta expresión
// solo contemplaba "de|del|para" y dejaba fragmentos rotos: "Comisión
// sobre Seguridad Vial" salía como "sobre Seguridad Vial" y "Comisión
// para el Estudio de los Problemas de las Adicciones" como "el Estudio
// de los Problemas...". Se contemplan también "sobre" y el artículo que
// puede seguir a la preposición.
function cleanCommittee(name) {
  return (name || '')
    .replace(/^Comisi[oó]n\s+(Mixta\s+)?(?:(?:de|del|para|sobre)\s+(?:el|la|los|las)\s+|(?:de|del|para|sobre)\s+)?/i, '')
    .trim();
}

// El cargo de más peso que alguien puede tener en una comisión. Presidir
// pesa más que una portavocía, y esta más que una vocalía: es el orden en
// que alguien de asuntos públicos busca a un diputado. Los vocales no
// llevan etiqueta —son la mayoría de los 350 y repetir "Vocal" en casi
// todas las filas taparía a los que sí tienen un cargo relevante.
const PESO = [
  [/^presidenc?i|^president/i, 1, 'Presidencia'],
  [/^vicepresiden/i, 2, 'Vicepresidencia'],
  [/^secretari/i, 3, 'Secretaría'],
  [/^portavoc/i, 4, 'Portavocía'],
];

function pesoDe(cargo) {
  const hit = PESO.find(([re]) => re.test((cargo || '').trim()));
  return hit ? { peso: hit[1], label: hit[2] } : { peso: 99, label: null };
}

// Foto con reserva de espacio y respaldo a iniciales: sin width/height
// fijos las filas bailan mientras cargan, y alguna URL acabará dando 404
// antes o después.
function Photo({ url, name, size = 36, radius = 8 }) {
  const [failed, setFailed] = useState(false);
  const initials = normalize(name)
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const base = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    objectFit: 'cover',
    background: '#ece9e2',
  };

  if (!url || failed) {
    return (
      <div
        style={{
          ...base,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8d8b83',
          fontSize: Math.round(size * 0.32),
          fontWeight: 600,
        }}
        aria-hidden="true"
      >
        {initials}
      </div>
    );
  }
  return <img src={url} alt="" width={size} height={size} style={base} onError={() => setFailed(true)} />;
}

function GroupTag({ code }) {
  if (!code) return <span style={{ fontSize: 11.5, color: '#aaa' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 2,
          background: GROUP_COLORS[code] || '#888780',
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11.5, color: '#555' }}>{code}</span>
    </span>
  );
}

// Máximo 2 comisiones por fila: con 4 o 5 la tabla se descuadra. Las que
// llevan cargo van primero y en tono fuerte.
function Committees({ list }) {
  if (!list || list.length === 0) return <span style={{ fontSize: 11.5, color: '#ccc' }}>—</span>;
  const shown = list.slice(0, 2);
  const rest = list.length - shown.length;
  return (
    <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>
      {shown.map((c, i) => (
        <div key={i} style={{ color: c.label ? '#555' : '#999' }}>
          {c.nombre}
          {c.label ? <span style={{ color: '#aaa' }}> · {c.label}</span> : ''}
        </div>
      ))}
      {rest > 0 && <div style={{ color: '#aaa' }}>+{rest} más</div>}
    </div>
  );
}

const GRID = '1.7fr .9fr 1.5fr 28px';

function DeputiesDirectoryInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [deputies, setDeputies] = useState(null);
  const [groups, setGroups] = useState([]);
  const [comisionesPorDiputado, setComisionesPorDiputado] = useState({});

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [groupFilter, setGroupFilter] = useState(new Set());
  const [constituencyFilter, setConstituencyFilter] = useState(new Set());
  const [comisionFilter, setComisionFilter] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    load();
    const saved = parseInt(window.localStorage.getItem('gt_page_size') || '20', 10);
    if (PAGE_SIZES.includes(saved)) setPageSize(saved);
  }, []);

  function changePageSize(n) {
    setPageSize(n);
    setPage(1); // sin esto, estar en la página 15 con 20 filas y saltar a 200 deja la tabla vacía
    try {
      window.localStorage.setItem('gt_page_size', String(n));
    } catch {}
  }

  async function load() {
    const [{ data: deputiesData }, { data: groupsData }, { data: comisionesData }] = await Promise.all([
      supabase
        .from('deputies')
        .select('id, full_name, first_name, last_name, slug, constituency, photo_url, parliamentary_group_id')
        .eq('active', true)
        .order('last_name', { ascending: true }),
      supabase
        .from('parliamentary_groups')
        .select('id, name, short_name')
        .eq('active', true)
        .order('member_count', { ascending: false }),
      // Las comisiones vienen de es_committee_people, no de
      // parliamentary_bodies: esa tabla se diseñó para esto pero nunca se
      // llegó a cargar.
      traerTodas(),
    ]);

    setDeputies(deputiesData || []);
    setGroups(groupsData || []);

    // Una sola estructura por diputado: la lista de comisiones ya
    // limpia, deduplicada y ordenada por peso del cargo. Antes había dos
    // (rolesByDeputy y comisionesPorDiputado) y la tarjeta pintaba el
    // cargo de una y un elemento arbitrario de la otra, repitiendo la
    // misma comisión dos veces.
    const porDiputado = {};
    for (const c of comisionesData || []) {
      const nombre = cleanCommittee(c.committee_name);
      if (!nombre) continue;
      if (!porDiputado[c.deputy_id]) porDiputado[c.deputy_id] = new Map();
      const mapa = porDiputado[c.deputy_id];
      const { peso, label } = pesoDe(c.cargo_norm);
      const previo = mapa.get(nombre);
      // Alguien puede aparecer dos veces en la misma comisión; se queda
      // el cargo de más peso.
      if (!previo || peso < previo.peso) mapa.set(nombre, { nombre, peso, label });
    }

    const listas = {};
    for (const [id, mapa] of Object.entries(porDiputado)) {
      listas[id] = [...mapa.values()].sort((a, b) => a.peso - b.peso || a.nombre.localeCompare(b.nombre));
    }
    setComisionesPorDiputado(listas);
  }

  // Supabase corta en 1.000 filas por consulta y aquí hay más de dos mil.
  // Se piden por bloques hasta que uno vuelve incompleto.
  async function traerTodas() {
    const TAM = 1000;
    const todas = [];
    for (let desde = 0; ; desde += TAM) {
      const { data, error } = await supabase
        .from('es_committee_people')
        .select('deputy_id, committee_name, cargo_norm')
        .not('deputy_id', 'is', null)
        .range(desde, desde + TAM - 1);
      if (error || !data?.length) break;
      todas.push(...data);
      if (data.length < TAM) break;
    }
    return { data: todas };
  }

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const codeById = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, groupCode(g)])),
    [groups]
  );

  const groupOptions = useMemo(
    () => groups.map((g) => ({ value: g.id, label: groupCode(g) || g.name })),
    [groups]
  );

  const constituencyOptions = useMemo(() => {
    if (!deputies) return [];
    const unique = [...new Set(deputies.map((d) => d.constituency).filter(Boolean))];
    return unique.sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c }));
  }, [deputies]);

  // Solo las comisiones que tienen miembros entre los diputados cargados,
  // para no ofrecer opciones sin resultados.
  const comisionOptions = useMemo(() => {
    const cuenta = new Map();
    for (const lista of Object.values(comisionesPorDiputado)) {
      for (const c of lista) cuenta.set(c.nombre, (cuenta.get(c.nombre) || 0) + 1);
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, n]) => ({ value: nombre, label: `${nombre} (${n})` }));
  }, [comisionesPorDiputado]);

  const filtered = useMemo(() => {
    if (!deputies) return [];
    let list = deputies;
    if (search) {
      const q = normalize(search);
      list = list.filter(
        (d) =>
          normalize(d.full_name).includes(q) ||
          normalize(d.constituency).includes(q) ||
          normalize(groupById[d.parliamentary_group_id]?.name).includes(q) ||
          normalize(codeById[d.parliamentary_group_id]).includes(q)
      );
    }
    if (groupFilter.size > 0) list = list.filter((d) => groupFilter.has(d.parliamentary_group_id));
    if (constituencyFilter.size > 0) list = list.filter((d) => constituencyFilter.has(d.constituency));
    if (comisionFilter.size > 0) {
      list = list.filter((d) => (comisionesPorDiputado[d.id] || []).some((c) => comisionFilter.has(c.nombre)));
    }
    return list;
  }, [deputies, search, groupFilter, constituencyFilter, comisionFilter, comisionesPorDiputado, groupById, codeById]);

  useEffect(() => {
    setPage(1);
  }, [search, groupFilter, constituencyFilter, comisionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);
  const from = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, filtered.length);

  const activeCount = groupFilter.size + constituencyFilter.size + comisionFilter.size;

  function clearFilters() {
    setSearch('');
    setGroupFilter(new Set());
    setConstituencyFilter(new Set());
    setComisionFilter(new Set());
  }

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, '…', totalPages];
    if (current >= totalPages - 2) return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', current, '…', totalPages];
  }, [current, totalPages]);

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Diputados</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>
          {deputies ? deputies.length : '—'} diputados · {groups.length} grupos · XV Legislatura
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1d6f5c', borderBottom: '2px solid #1d6f5c', paddingBottom: 8 }}>
          Diputados
        </span>
        <Link href="/institutions/groups" style={{ fontSize: 13, color: '#999', paddingBottom: 8, textDecoration: 'none' }}>
          Grupos parlamentarios
        </Link>
        <Link href="/institutions/comisiones" style={{ fontSize: 13, color: '#999', paddingBottom: 8, textDecoration: 'none' }}>
          Comisiones
        </Link>
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
            padding: '7px 14px',
            flex: '1 1 180px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            aria-label="Buscar diputado por nombre"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <MultiSelectFilter label="Grupo" values={groupOptions} selected={groupFilter} onApply={setGroupFilter} />
        <MultiSelectFilter
          label="Circunscripción"
          values={constituencyOptions}
          selected={constituencyFilter}
          onApply={setConstituencyFilter}
        />
        <MultiSelectFilter label="Comisión" values={comisionOptions} selected={comisionFilter} onApply={setComisionFilter} />
      </div>

      {activeCount > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...groupFilter].map((v) => (
            <span key={`g${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {codeById[v] || groupById[v]?.name || v}
            </span>
          ))}
          {[...constituencyFilter].map((v) => (
            <span key={`c${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          {[...comisionFilter].map((v) => (
            <span key={`k${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          <span onClick={clearFilters} style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}>
            Limpiar filtros
          </span>
        </div>
      )}

      {deputies === null ? (
        <div className="spinner"></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hay diputados con estos filtros.
            <div style={{ marginTop: 10 }}>
              <button className="btn-o" onClick={clearFilters}>
                Limpiar filtros
              </button>
            </div>
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
            <div>Diputado</div>
            <div>Grupo</div>
            <div>Comisiones</div>
            <div></div>
          </div>

          {slice.map((d) => (
            <Link
              key={d.id}
              href={`/institutions/deputies/${d.slug}`}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                padding: '10px 14px',
                borderBottom: '.5px solid #f0f0eb',
                alignItems: 'center',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Photo url={d.photo_url} name={fullNameDisplay(d.full_name)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{fullNameDisplay(d.full_name)}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{d.constituency || '—'}</div>
                </div>
              </div>
              <div>
                <GroupTag code={codeById[d.parliamentary_group_id]} />
              </div>
              <Committees list={comisionesPorDiputado[d.id]} />
              <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14 }}></i>
            </Link>
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
                  <span key={`e${i}`} style={{ fontSize: 11.5, color: '#aaa', padding: '0 3px' }}>
                    …
                  </span>
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
    </div>
  );
}

export default function DeputiesDirectoryPage() {
  return (
    <Suspense fallback={<div className="spinner"></div>}>
      <DeputiesDirectoryInner />
    </Suspense>
  );
}
