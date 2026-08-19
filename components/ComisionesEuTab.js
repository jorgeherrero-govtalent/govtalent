'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';

/**
 * Comisiones del Parlamento Europeo, con el mismo patrón que las del
 * Congreso: tarjetas con presidencia, avatares del resto de la mesa y
 * "Ver comisión →".
 *
 * Antes eran filas plegables, que es otro lenguaje. Si las dos cámaras
 * se ven distintas, parecen dos productos.
 *
 * DIFERENCIA CON EL CONGRESO: el PE no tiene portavoces por grupo, así
 * que en su lugar se muestra la mesa —presidencia y vicepresidencias—,
 * que es el órgano equivalente.
 */

const GRUPOS = {
  PPE: '#378ADD',
  'S&D': '#D4537E',
  Renew: '#F5C244',
  'Verts/ALE': '#5FA85F',
  Verts: '#5FA85F',
  ECR: '#3B7DB3',
  PfE: '#2B4C7E',
  ESN: '#4A5568',
  'The Left': '#B33A3A',
  GUE: '#B33A3A',
  NI: '#9A9A9A',
};

function colorGrupo(g) {
  return GRUPOS[g] || '#9A9A9A';
}

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function iniciales(n) {
  const p = (n || '').replace(',', '').trim().split(/\s+/);
  return `${p[0]?.[0] || ''}${p[p.length - 1]?.[0] || ''}`.toUpperCase();
}

function nombreLegible(n) {
  if (!n) return n;
  if (n.includes(',')) {
    const [ap, nom] = n.split(',').map((s) => s.trim());
    return nom ? `${nom} ${ap}` : n;
  }
  return n;
}

function Avatar({ nombre, url, size = 32, borde }) {
  const [falla, setFalla] = useState(false);
  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    background: '#e8f4f0',
    ...(borde ? { border: '2px solid #fff' } : {}),
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
        color: '#3C3489',
        fontSize: Math.round(size * 0.32),
        fontWeight: 600,
      }}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </div>
  );
}

export default function ComisionesEuTab() {
  const supabase = createClient();

  const [items, setItems] = useState(null);
  const [mesas, setMesas] = useState([]);
  const [search, setSearch] = useState('');
  const [grupoFilter, setGrupoFilter] = useState(new Set());
  const [minEspanoles, setMinEspanoles] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('eu_committee_profile').select('*').order('n_lidera', { ascending: false }),
      supabase.from('eu_committee_chairs').select('*').order('rank_order'),
    ]).then(([{ data }, { data: ch }]) => {
      setItems(data || []);
      setMesas(ch || []);
    });
  }, []);

  // La mesa de cada comisión, para los avatares
  const mesaDe = useMemo(() => {
    const m = new Map();
    for (const c of mesas) {
      if (!m.has(c.body_code)) m.set(c.body_code, []);
      m.get(c.body_code).push(c);
    }
    return m;
  }, [mesas]);

  const grupoOptions = useMemo(() => {
    const cuenta = new Map();
    for (const c of items || []) {
      if (c.presidente_grupo) cuenta.set(c.presidente_grupo, (cuenta.get(c.presidente_grupo) || 0) + 1);
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([g, n]) => ({ value: g, label: `${g} (${n})` }));
  }, [items]);

  const filtered = useMemo(() => {
    let l = items || [];
    // Con españoles: en un Parlamento de 27 países, saber dónde hay
    // representación propia es lo primero que se mira desde aquí.
    if (minEspanoles) l = l.filter((c) => (c.espanoles || 0) > 0);
    if (grupoFilter.size > 0) l = l.filter((c) => grupoFilter.has(c.presidente_grupo));
    if (search) {
      const q = normalize(search);
      l = l.filter(
        (c) =>
          normalize(c.short_name_es || c.name).includes(q) ||
          normalize(c.code).includes(q) ||
          normalize(c.presidente || '').includes(q)
      );
    }
    return l;
  }, [items, search, grupoFilter, minEspanoles]);

  if (items === null) return <div className="spinner"></div>;

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
            borderRadius: 20,
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
        {grupoOptions.length > 1 && (
          <MultiSelectFilter label="Grupo" values={grupoOptions} selected={grupoFilter} onApply={setGrupoFilter} />
        )}
        <button
          type="button"
          onClick={() => setMinEspanoles((v) => !v)}
          style={{
            background: minEspanoles ? '#e8f4f0' : '#fff',
            border: `.5px solid ${minEspanoles ? '#1d6f5c' : '#e0dfd8'}`,
            color: minEspanoles ? '#1d6f5c' : '#555',
            borderRadius: 20,
            padding: '8px 14px',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Con españoles
        </button>
        {(minEspanoles || search || grupoFilter.size > 0) && (
          <span
            onClick={() => {
              setMinEspanoles(false);
              setSearch('');
              setGrupoFilter(new Set());
            }}
            style={{ fontSize: 11.5, color: '#999', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'center' }}
          >
            Limpiar
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-users-off"></i>
            No hay comisiones con estos filtros.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12 }}>
            {filtered.map((c) => {
              const mesa = mesaDe.get(c.code) || [];
              const vices = mesa.filter((m) => m.role === 'CHAIR_VICE');
              return (
                <Link
                  key={c.code}
                  href={`/institutions/eu-parliament/comisiones/${c.code}`}
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
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>
                      {c.short_name_es || c.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
                      {[
                        c.code,
                        c.titulares ? `${c.titulares} titulares` : null,
                        c.espanoles > 0 ? `${c.espanoles} españoles` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
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
                        <div style={{ fontSize: 10, color: '#999' }}>
                          {['Preside', c.presidente_pais].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {c.presidente_grupo && (
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: 2,
                            background: colorGrupo(c.presidente_grupo),
                            flexShrink: 0,
                          }}
                          title={c.presidente_grupo}
                        ></span>
                      )}
                    </div>
                  )}

                  {/* El PE no tiene portavoces por grupo: la mesa es el
                      órgano equivalente. */}
                  {vices.length > 0 && (
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
                        Vicepresidencias · {vices.length}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {vices.slice(0, 4).map((v, i) => (
                          <span key={v.mep_id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                            <Avatar nombre={v.full_name} url={v.photo_url} size={28} borde />
                          </span>
                        ))}
                        {vices.length > 4 && (
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
                            +{vices.length - 4}
                          </span>
                        )}
                        <span style={{ fontSize: 11.5, color: '#1d6f5c', marginLeft: 11 }}>Ver comisión →</span>
                      </div>
                    </>
                  )}

                  {/* Lo que tramita: es lo que diferencia una comisión
                      activa de una que apenas se reúne. */}
                  {c.n_lidera_vivos > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#3C3489',
                        marginTop: 11,
                        paddingTop: 10,
                        borderTop: '.5px solid #f0f0eb',
                      }}
                    >
                      {c.n_lidera_vivos} {c.n_lidera_vivos === 1 ? 'procedimiento' : 'procedimientos'} en tramitación
                    </div>
                  )}
                </Link>
              );
            })}
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
