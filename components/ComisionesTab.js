'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { colorSigla, nombreSigla } from '@/lib/grupos';

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

const TIPOS = {
  permanente: 'Permanente',
  mixta: 'Mixta con el Senado',
  investigacion: 'De investigación',
  seguimiento: 'De seguimiento',
};

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
  const [grupoFilter, setGrupoFilter] = useState(null);
  const [tipoFilter, setTipoFilter] = useState(null);

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
    const set = new Set();
    for (const c of items || []) for (const g of c.grupos || []) if (!g.startsWith('SGP')) set.add(g);
    return [...set].sort();
  }, [items]);

  const tipos = useMemo(() => [...new Set((items || []).map((c) => c.kind).filter(Boolean))], [items]);

  const filtered = useMemo(() => {
    let l = items || [];
    if (search) {
      const q = normalize(search);
      l = l.filter((c) => normalize(c.name).includes(q) || normalize(c.presidente || '').includes(q));
    }
    if (grupoFilter) l = l.filter((c) => (c.grupos || []).includes(grupoFilter));
    if (tipoFilter) l = l.filter((c) => c.kind === tipoFilter);
    return l;
  }, [items, search, grupoFilter, tipoFilter]);

  const chip = (activo) => ({
    background: activo ? '#e8f4f0' : '#fff',
    border: `.5px solid ${activo ? '#1d6f5c' : '#e0dfd8'}`,
    color: activo ? '#1d6f5c' : '#555',
    borderRadius: 22,
    padding: '8px 14px',
    fontSize: 12.5,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

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

        <select
          value={grupoFilter || ''}
          onChange={(e) => setGrupoFilter(e.target.value || null)}
          aria-label="Filtrar por grupo"
          style={{ ...chip(!!grupoFilter), appearance: 'none', paddingRight: 30 }}
        >
          <option value="">Grupo</option>
          {grupos.map((g) => (
            <option key={g} value={g}>
              {nombreSigla(g)}
            </option>
          ))}
        </select>

        <select
          value={tipoFilter || ''}
          onChange={(e) => setTipoFilter(e.target.value || null)}
          aria-label="Filtrar por tipo"
          style={{ ...chip(!!tipoFilter), appearance: 'none', paddingRight: 30 }}
        >
          <option value="">Tipo</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {TIPOS[t] || t}
            </option>
          ))}
        </select>

        {(grupoFilter || tipoFilter || search) && (
          <span
            onClick={() => {
              setGrupoFilter(null);
              setTipoFilter(null);
              setSearch('');
            }}
            style={{ fontSize: 11.5, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Limpiar
          </span>
        )}
      </div>

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
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
                    {c.n_members} miembros · {TIPOS[c.kind] || c.kind}
                    {c.n_senadores > 0 && ` · ${c.n_senadores} del Senado`}
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
