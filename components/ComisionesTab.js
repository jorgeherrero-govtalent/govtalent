'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { colorSigla, nombreSigla } from '@/lib/grupos';
import MultiSelectFilter from '@/components/MultiSelectFilter';

/**
 * Comisiones del Congreso.
 *
 * Vive en Instituciones porque una comisión es un ÓRGANO, igual que un
 * grupo parlamentario. No lleva contadores de iniciativas ni enlaces al
 * Regulatorio: ese cruce va en sentido contrario, dentro de la ficha de
 * cada norma en la pestaña de Actores.
 */

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function nombreLegible(oficial) {
  const [ap, nom] = (oficial || '').split(',').map((s) => s.trim());
  return nom ? `${nom} ${ap}` : oficial;
}

function iniciales(n) {
  const [ap, nom] = (n || '').split(',').map((s) => s.trim());
  return `${(nom || '')[0] || ''}${(ap || '')[0] || ''}`.toUpperCase();
}

// La etiqueta viene de la vista, que sabe si una permanente es
// legislativa. Aquí solo se sabía el kind, y "Permanente" juntaba las 23
// que tramitan leyes con Reglamento, Peticiones o Estatuto, que no. Para
// alguien de asuntos públicos son cosas distintas: en unas hay enmiendas
// y plazos, en otras no hay nada que influir.

function Avatar({ nombre, url, size = 30, borde }) {
  const [falla, setFalla] = useState(false);
  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    background: '#e8f4f0',
    border: borde ? '2px solid #fff' : 'none',
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

export default function ComisionesTab() {
  const supabase = createClient();

  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [grupoFilter, setGrupoFilter] = useState(new Set());
  const [tipoFilter, setTipoFilter] = useState(new Set());

  useEffect(() => {
    supabase
      .from('es_committees_directory')
      .select('*')
      .order('n_members', { ascending: false })
      .then(({ data }) => setItems(data || []));
  }, []);

  // Los grupos salen de las propias comisiones, así el filtro nunca
  // ofrece opciones sin resultados.
  const grupos = useMemo(() => {
    const cuenta = new Map();
    for (const c of items || []) {
      if (c.kind === 'gobierno') continue;
      for (const g of c.grupos || []) if (!g.startsWith('SGP')) cuenta.set(g, (cuenta.get(g) || 0) + 1);
    }
    // Con el recuento al lado se ve de un vistazo qué grupos están en
    // todas las comisiones y cuáles solo en unas pocas.
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([g, n]) => ({ value: g, label: `${nombreSigla(g)} (${n})` }));
  }, [items]);

  // Ordenados por número de comisiones: las legislativas primero, que son
  // las que se buscan.
  const tipos = useMemo(() => {
    const cuenta = new Map();
    for (const c of items || []) {
      if (!c.tipo_label || c.kind === 'gobierno') continue;
      cuenta.set(c.tipo_label, (cuenta.get(c.tipo_label) || 0) + 1);
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => ({ value: t, label: `${t} (${n})` }));
  }, [items]);

  const filtered = useMemo(() => {
    // Mesa, Junta de Portavoces y Diputación Permanente tienen pestaña
    // propia: no se comparan con una comisión legislativa.
    let l = (items || []).filter((c) => c.kind !== 'gobierno');
    if (search) {
      const q = normalize(search);
      l = l.filter((c) => normalize(c.name).includes(q) || normalize(c.presidente || '').includes(q));
    }
    // Varios grupos o varios tipos suman resultados: se busca "las
    // comisiones donde está ERC o Junts", no la intersección de ambos.
    if (grupoFilter.size > 0) l = l.filter((c) => (c.grupos || []).some((g) => grupoFilter.has(g)));
    if (tipoFilter.size > 0) l = l.filter((c) => tipoFilter.has(c.tipo_label));
    return l;
  }, [items, search, grupoFilter, tipoFilter]);

  return (
    <>
      <div style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 22,
            padding: '8px 15px',
            flex: '1 1 220px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar comisión o quien la preside..."
            aria-label="Buscar comisión"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>

        <MultiSelectFilter label="Grupo" values={grupos} selected={grupoFilter} onApply={setGrupoFilter} />
        <MultiSelectFilter label="Tipo" values={tipos} selected={tipoFilter} onApply={setTipoFilter} />

        {(grupoFilter.size > 0 || tipoFilter.size > 0 || search) && (
          <span
            onClick={() => {
              setGrupoFilter(new Set());
              setTipoFilter(new Set());
              setSearch('');
            }}
            style={{ fontSize: 11.5, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Limpiar
          </span>
        )}
      </div>

      {(grupoFilter.size > 0 || tipoFilter.size > 0) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...grupoFilter].map((v) => (
            <span key={`g${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {nombreSigla(v)}
            </span>
          ))}
          {[...tipoFilter].map((v) => (
            <span key={`t${v}`} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          <span style={{ fontSize: 11, color: '#888' }}>{filtered.length} comisiones</span>
        </div>
      )}

      {items === null ? (
        <div className="spinner"></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-users-off"></i>
            No hay comisiones con estos filtros.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12 }}>
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={`/institutions/comisiones/${c.slug}`}
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
                  {/* El tipo sube a distintivo: legislativa o no es la
                      primera pregunta, no una coletilla del recuento. */}
                  {c.tipo_label && (
                    <div
                      style={{
                        display: 'inline-block',
                        fontSize: 10.5,
                        borderRadius: 20,
                        padding: '2px 9px',
                        marginBottom: 8,
                        background: c.legislativa ? '#f0eefe' : '#f0f0eb',
                        color: c.legislativa ? '#3c3489' : '#7a736b',
                      }}
                    >
                      {c.tipo_label}
                    </div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{c.name}</div>

                  {/* El reparto por grupos: dice dónde están los votos, que
                      es lo que se viene a mirar. Sin los del Senado, que en
                      una mixta desvirtúan el peso de lo que se vota aquí. */}
                  {Array.isArray(c.reparto) && c.reparto.length > 0 && (
                    <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 11 }}>
                      {c.reparto.map((g) => (
                        <span
                          key={g.sigla}
                          title={`${nombreSigla(g.sigla)} · ${g.n}`}
                          style={{
                            background: colorSigla(g.sigla),
                            width: `${(g.n / c.reparto.reduce((t, x) => t + x.n, 0)) * 100}%`,
                          }}
                        ></span>
                      ))}
                    </div>
                  )}
                </div>

                {c.presidente && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '9px 0',
                      borderTop: '.5px solid #f0f0eb',
                    }}
                  >
                    <Avatar nombre={c.presidente} url={c.presidente_foto} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{nombreLegible(c.presidente)}</div>
                      <div style={{ fontSize: 10, color: '#999' }}>Preside</div>
                    </div>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 2,
                        background: colorSigla(c.presidente_grupo),
                        flexShrink: 0,
                      }}
                      title={nombreSigla(c.presidente_grupo)}
                    ></span>
                  </div>
                )}

                {c.n_portavoces > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#999',
                        textTransform: 'uppercase',
                        letterSpacing: '.3px',
                        margin: '10px 0 8px',
                      }}
                    >
                      Portavoces · {c.n_portavoces}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {(c.portavoces_muestra || []).map((p, i) => (
                        <span key={p.nombre} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                          <Avatar nombre={p.nombre} url={p.foto} size={28} borde />
                        </span>
                      ))}
                      {c.n_portavoces > (c.portavoces_muestra || []).length && (
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: '#f0efe9',
                            border: '2px solid #fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            color: '#8d8b83',
                            marginLeft: -8,
                            flexShrink: 0,
                          }}
                        >
                          +{c.n_portavoces - (c.portavoces_muestra || []).length}
                        </span>
                      )}
                      <span style={{ fontSize: 11.5, color: '#1d6f5c', marginLeft: 11 }}>Ver comisión →</span>
                    </div>
                  </>
                )}
              </Link>
            ))}
          </div>

          <div style={{ fontSize: 11.5, color: '#888', marginTop: 16 }}>
            {filtered.length === items.length
              ? `${items.length} comisiones`
              : `${filtered.length} de ${items.length} comisiones`}
          </div>
        </>
      )}
    </>
  );
}
