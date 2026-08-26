'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { nombreSigla } from '@/lib/grupos';
import MultiSelectFilter from '@/components/MultiSelectFilter';

/**
 * Órganos de gobierno del Congreso: Mesa, Junta de Portavoces y
 * Diputación Permanente.
 *
 * Un bloque por órgano en vez de un bloque por cargo —que es como lo
 * resuelve el Parlamento Europeo— porque aquí los tres cuerpos tienen
 * composición propia y no comparten roles entre sí.
 *
 * La Mesa se abre por defecto y los otros dos van plegados: con nueve,
 * diez y sesenta y seis miembros, abrirlos todos entierra la Mesa, que
 * es la que se consulta.
 */

// El Congreso devuelve el ordinal en palabra ("Vicepresidente Primero").
// Escrito así descuadra la columna de cargos; se abrevia solo al
// mostrar, el dato guardado no se toca.
const ORDINALES = {
  primero: '1.º', primera: '1.ª',
  segundo: '2.º', segunda: '2.ª',
  tercero: '3.º', tercera: '3.ª',
  cuarto: '4.º', cuarta: '4.ª',
  quinto: '5.º', quinta: '5.ª',
};

function cargoCorto(cargo) {
  const c = (cargo || '').trim();
  // En la Junta de Portavoces el cargo llega en plural para todos, que
  // es cómo lo publica el Congreso, pero cada fila es una persona.
  if (/^portavoces titulares$/i.test(c)) return 'Portavoz';
  if (/^portavoces adjunt/i.test(c)) return 'Portavoz adjunto';
  if (/^portavoces suplent/i.test(c)) return 'Portavoz suplente';
  return c.replace(
    /\s+(Primer[oa]|Segund[oa]|Tercer[oa]|Cuart[oa]|Quint[oa])$/i,
    (_, w) => ` ${ORDINALES[w.toLowerCase()] || w}`
  );
}

// Las siglas se resuelven con lib/grupos, que es el modulo canonico:
// duplicar el mapa aqui ya me hizo escribir GJ y GV cuando los valores
// reales son GJxCAT y GV (EAJ-PNV).
const sigla = (g) => nombreSigla(g) || '—';

// Familia de cargo derivada del peso, no del texto: "Vicepresidente
// Primero" y "Vicepresidenta Cuarta" son el mismo filtro.
const FAMILIAS = {
  1: 'Presidencia',
  2: 'Vicepresidencia',
  3: 'Secretaría',
  4: 'Portavocía',
  5: 'Portavocía adjunta',
  6: 'Vocalía',
};

const familia = (orden) => FAMILIAS[orden] || 'Otros';

function normalizar(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function iniciales(n) {
  const [ap, nom] = (n || '').split(',').map((s) => s.trim());
  return `${(nom || '')[0] || ''}${(ap || '')[0] || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

// "Armengol Socias, Francina" -> "Francina Armengol Socias"
function nombreNatural(oficial) {
  const [ap, nom] = (oficial || '').split(',').map((s) => s.trim());
  return nom ? `${nom} ${ap}` : oficial || '';
}

function Avatar({ nombre, url, size = 30 }) {
  const [falla, setFalla] = useState(false);
  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    background: '#e8f4f0',
  };
  if (url && !falla) {
    return <img src={url} alt="" width={size} height={size} style={base} onError={() => setFalla(true)} />;
  }
  return (
    <div
      style={{
        ...base,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#1d6f5c',
        fontSize: Math.round(size * 0.33),
        fontWeight: 700,
      }}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </div>
  );
}

function Miembro({ m, ultimo }) {
  const preside = m.orden_cargo === 1;
  const fila = (
    <>
      <Avatar nombre={m.nombre} url={m.photo_url} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nombreNatural(m.nombre)}</div>
        <div style={{ fontSize: 11, color: '#999' }}>{sigla(m.grupo)}</div>
      </div>
      {preside ? (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            background: '#e8f4f0',
            color: '#1d6f5c',
            padding: '2px 9px',
            borderRadius: 10,
            whiteSpace: 'nowrap',
          }}
        >
          {cargoCorto(m.cargo)}
        </span>
      ) : (
        <span style={{ fontSize: 10.5, color: '#888', whiteSpace: 'nowrap' }}>{cargoCorto(m.cargo)}</span>
      )}
    </>
  );

  const estilo = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: ultimo ? 'none' : '.5px solid #f0f0eb',
    textDecoration: 'none',
    color: 'inherit',
  };

  // Solo enlaza si el miembro está cruzado con el directorio. Sin slug
  // el enlace llevaría a un 404.
  return m.slug ? (
    <Link href={`/institutions/deputies/${m.slug}`} style={estilo}>
      {fila}
    </Link>
  ) : (
    <div style={estilo}>{fila}</div>
  );
}

export default function OrganosGobiernoTab() {
  const supabase = createClient();

  const [organos, setOrganos] = useState(null);
  const [miembros, setMiembros] = useState({});
  const [abiertos, setAbiertos] = useState(new Set());
  const [search, setSearch] = useState('');
  const [grupoFilter, setGrupoFilter] = useState(new Set());
  const [cargoFilter, setCargoFilter] = useState(new Set());

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: orgs } = await supabase
      .from('es_committees_directory')
      .select('id, suborgano_id, name, slug, n_members, fecha_constitucion')
      .eq('kind', 'gobierno')
      .order('n_members', { ascending: true });

    const lista = orgs || [];
    setOrganos(lista);
    // La Mesa —la más pequeña— abierta de entrada.
    if (lista[0]) setAbiertos(new Set([lista[0].id]));

    if (lista.length === 0) return;

    const ids = lista.map((o) => o.id);
    const [{ data: mem }, { data: dips }] = await Promise.all([
      supabase
        .from('es_committee_members')
        .select('committee_id, nombre, cargo, grupo, orden_cargo, id_cargo, deputy_id')
        .in('committee_id', ids)
        .is('fecha_baja', null),
      supabase.from('deputies').select('id, slug, photo_url').eq('active', true),
    ]);

    // Se resuelve la foto y el slug con un mapa en vez de un join
    // embebido: deputy_id puede venir a null cuando el cruce por nombre
    // no encontró al diputado, y el embed se complica sin aportar nada.
    const porId = new Map((dips || []).map((d) => [d.id, d]));

    const agrupado = {};
    for (const m of mem || []) {
      const d = m.deputy_id ? porId.get(m.deputy_id) : null;
      if (!agrupado[m.committee_id]) agrupado[m.committee_id] = [];
      agrupado[m.committee_id].push({ ...m, slug: d?.slug || null, photo_url: d?.photo_url || null });
    }

    // Por peso del cargo y, dentro del mismo peso, por id_cargo: las
    // cuatro vicepresidencias comparten orden_cargo y solo id_cargo las
    // pone en su orden real (Primera, Segunda, Tercera, Cuarta).
    for (const k of Object.keys(agrupado)) {
      agrupado[k].sort(
        (a, b) =>
          (a.orden_cargo ?? 99) - (b.orden_cargo ?? 99) ||
          (a.id_cargo ?? 999) - (b.id_cargo ?? 999) ||
          (a.nombre || '').localeCompare(b.nombre || '')
      );
    }
    setMiembros(agrupado);
  }

  function alternar(id) {
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const grupoOptions = useMemo(() => {
    const cuenta = new Map();
    for (const l of Object.values(miembros)) for (const m of l) if (m.grupo) cuenta.set(m.grupo, (cuenta.get(m.grupo) || 0) + 1);
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([g, n]) => ({ value: g, label: `${nombreSigla(g)} (${n})` }));
  }, [miembros]);

  const cargoOptions = useMemo(() => {
    const cuenta = new Map();
    for (const l of Object.values(miembros)) {
      for (const m of l) {
        const f = familia(m.orden_cargo);
        cuenta.set(f, (cuenta.get(f) || 0) + 1);
      }
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => ({ value: f, label: `${f} (${n})` }));
  }, [miembros]);

  const filtrando = grupoFilter.size > 0 || cargoFilter.size > 0 || !!search;

  // Se filtra dentro de cada organo y los que se quedan sin nadie se
  // ocultan: un bloque vacio prometeria una composicion que el filtro ya
  // ha descartado.
  const visibles = useMemo(() => {
    const q = normalizar(search);
    const out = {};
    for (const [id, lista] of Object.entries(miembros)) {
      out[id] = lista.filter((m) => {
        if (grupoFilter.size > 0 && !grupoFilter.has(m.grupo)) return false;
        if (cargoFilter.size > 0 && !cargoFilter.has(familia(m.orden_cargo))) return false;
        if (q && !normalizar(m.nombre).includes(q)) return false;
        return true;
      });
    }
    return out;
  }, [miembros, grupoFilter, cargoFilter, search]);

  const total = useMemo(
    () => Object.values(visibles).reduce((s, l) => s + l.length, 0),
    [visibles]
  );

  function limpiar() {
    setSearch('');
    setGrupoFilter(new Set());
    setCargoFilter(new Set());
  }

  if (organos === null) return <div className="spinner"></div>;

  if (organos.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <i className="ti ti-building-bank"></i>
          Todavía no hay órganos de gobierno cargados.
        </div>
      </div>
    );
  }

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
            placeholder="Buscar por nombre..."
            aria-label="Buscar miembro de un órgano de gobierno"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <MultiSelectFilter label="Grupo" values={grupoOptions} selected={grupoFilter} onApply={setGrupoFilter} />
        <MultiSelectFilter label="Cargo" values={cargoOptions} selected={cargoFilter} onApply={setCargoFilter} />
      </div>

      {(grupoFilter.size > 0 || cargoFilter.size > 0) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...grupoFilter].map((v) => (
            <span key={`g${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {nombreSigla(v)}
            </span>
          ))}
          {[...cargoFilter].map((v) => (
            <span key={`c${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          <span onClick={limpiar} style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}>
            Limpiar filtros
          </span>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: '#888', margin: '0 0 12px' }}>
        {filtrando ? `${total} cargos con estos filtros` : `${organos.length} órganos · ${total} cargos · XV Legislatura`}
      </p>

      {filtrando && total === 0 && (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            Nadie coincide con estos filtros.
            <div style={{ marginTop: 10 }}>
              <button className="btn-o" onClick={limpiar}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {organos.map((o) => {
        const lista = visibles[o.id] || [];
        // Filtrando, los bloques con resultados se abren solos: dejarlos
        // plegados hara creer que el filtro no ha encontrado nada.
        const abierto = filtrando ? lista.length > 0 : abiertos.has(o.id);
        if (filtrando && lista.length === 0) return null;
        return (
          <div key={o.id} className="card" style={{ padding: '16px 18px', marginBottom: 10 }}>
            <div
              onClick={() => alternar(o.id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 12 }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: '#999',
                    textTransform: 'uppercase',
                    letterSpacing: '.3px',
                  }}
                >
                  {o.name} · {filtrando ? lista.length : o.n_members}
                </div>
                {o.fecha_constitucion && !abierto && (
                  <div style={{ fontSize: 11.5, color: '#888', marginTop: 4 }}>
                    Constituida el {o.fecha_constitucion.split('-').reverse().join('/')}
                  </div>
                )}
              </div>
              <i
                className={`ti ${abierto ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                style={{ color: '#999', fontSize: 16, flexShrink: 0 }}
              ></i>
            </div>

            {abierto && (
              <div style={{ marginTop: 12 }}>
                {lista.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: '#aaa', padding: '8px 0' }}>Sin composición cargada.</div>
                ) : (
                  lista.map((m, i) => (
                    <Miembro key={`${m.committee_id}-${m.nombre}-${i}`} m={m} ultimo={i === lista.length - 1} />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
