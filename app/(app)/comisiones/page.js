'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { colorSigla, nombreSigla } from '@/lib/grupos';

/**
 * Comisiones del Congreso.
 *
 * Una sola pantalla con acordeón en lugar de directorio + ficha: son 30
 * comisiones y lo que se consulta de cada una son sus portavoces, que
 * caben en el propio desplegable. Abrir una página por comisión añadiría
 * un clic sin dar más información.
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

function FlagES() {
  return (
    <span
      role="img"
      aria-label="España"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 20,
        height: 14,
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ height: '25%', background: '#C60B1E' }} />
      <span style={{ height: '50%', background: '#FFC400' }} />
      <span style={{ height: '25%', background: '#C60B1E' }} />
    </span>
  );
}

function Avatar({ nombre, url, size = 28 }) {
  const [falla, setFalla] = useState(false);
  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    background: '#ece9e2',
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
        color: '#8d8b83',
        fontSize: Math.round(size * 0.33),
        fontWeight: 700,
      }}
      aria-hidden="true"
    >
      {iniciales(nombre)}
    </div>
  );
}

function Persona({ p }) {
  const contenido = (
    <>
      <Avatar nombre={p.nombre} url={p.photo_url} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{nombreLegible(p.deputy_name || p.nombre)}</div>
        <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>
          {p.cargo_norm}
          {p.constituency ? ` · ${p.constituency}` : ''}
          {/* Los senadores y letrados no están en el directorio de
              diputados: sin esta marca parecerían un enlace roto. */}
          {p.es_senador && ' · Senado'}
        </div>
      </div>
      <span
        style={{ width: 9, height: 9, borderRadius: 2, background: colorSigla(p.grupo), flexShrink: 0 }}
        title={nombreSigla(p.grupo)}
      ></span>
      {p.deputy_slug && <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 13, flexShrink: 0 }}></i>}
    </>
  );

  const estilo = {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '7px 0',
    borderBottom: '.5px solid #f0f0eb',
    textDecoration: 'none',
    color: 'inherit',
  };

  return p.deputy_slug ? (
    <Link href={`/institutions/deputies/${p.deputy_slug}`} style={estilo}>
      {contenido}
    </Link>
  ) : (
    <div style={estilo}>{contenido}</div>
  );
}

export default function ComisionesPage() {
  const supabase = createClient();

  const [comisiones, setComisiones] = useState(null);
  const [miembros, setMiembros] = useState({});
  const [abierta, setAbierta] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [search, setSearch] = useState('');
  const [soloConIniciativas, setSoloConIniciativas] = useState(false);

  useEffect(() => {
    supabase
      .from('es_committees_directory')
      .select('*')
      .order('n_iniciativas', { ascending: false })
      .order('name')
      .then(({ data }) => setComisiones(data || []));
  }, []);

  // Los miembros se piden al desplegar, no al cargar: son 1.496 y solo
  // se miran los de una comisión cada vez.
  async function abrir(c) {
    if (abierta === c.id) {
      setAbierta(null);
      return;
    }
    setAbierta(c.id);
    if (miembros[c.id]) return;
    setCargando(true);
    const { data } = await supabase
      .from('es_committee_people')
      .select('*')
      .eq('committee_id', c.id)
      .order('orden_cargo')
      .order('nombre');
    setMiembros((m) => ({ ...m, [c.id]: data || [] }));
    setCargando(false);
  }

  const filtered = useMemo(() => {
    let l = comisiones || [];
    if (soloConIniciativas) l = l.filter((c) => c.n_iniciativas > 0);
    if (search) {
      const q = normalize(search);
      l = l.filter((c) => normalize(c.name).includes(q));
    }
    return l;
  }, [comisiones, search, soloConIniciativas]);

  const conIniciativas = (comisiones || []).filter((c) => c.n_iniciativas > 0).length;

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
        <Link href="/regulatorio" style={{ color: '#999', textDecoration: 'none' }}>
          Regulatorio
        </Link>
        {' › '}
        <Link href="/congreso" style={{ color: '#999', textDecoration: 'none' }}>
          Congreso
        </Link>
        {' › '}
        <span style={{ color: '#666' }}>Comisiones</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
          <FlagES />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Comisiones</h1>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {comisiones
            ? `${comisiones.length} órganos de la XV Legislatura · ${conIniciativas} tramitando iniciativas`
            : '—'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 13, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '7px 14px',
            flex: '1 1 190px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar comisión..."
            aria-label="Buscar comisión"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <span
          onClick={() => setSoloConIniciativas((v) => !v)}
          style={{
            background: soloConIniciativas ? '#EEEDFE' : '#fff',
            border: `.5px solid ${soloConIniciativas ? '#6d5aef' : '#e0dfd8'}`,
            color: soloConIniciativas ? '#3C3489' : '#555',
            borderRadius: 20,
            padding: '7px 12px',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Con iniciativas ({conIniciativas})
        </span>
      </div>

      {comisiones === null ? (
        <div className="spinner"></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-users-off"></i>
            No hay comisiones con estos filtros.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {filtered.map((c) => {
            const lista = miembros[c.id] || [];
            const mesa = lista.filter((p) => p.orden_cargo <= 3);
            const portavoces = lista.filter((p) => p.orden_cargo === 4);
            const resto = lista.filter((p) => p.orden_cargo > 4);
            return (
              <div key={c.id} style={{ borderBottom: '.5px solid #f0f0eb' }}>
                <button
                  type="button"
                  onClick={() => abrir(c)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '13px 16px',
                    width: '100%',
                    background: abierta === c.id ? '#fcfbf8' : 'none',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 3 }}>
                      {[
                        `${c.n_members} miembros`,
                        c.n_portavoces > 0 ? `${c.n_portavoces} portavoces` : null,
                        c.presidente ? `Preside ${nombreLegible(c.presidente)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>

                  {c.n_iniciativas > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        background: '#EEEDFE',
                        color: '#3C3489',
                        padding: '3px 9px',
                        borderRadius: 10,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {c.n_iniciativas} {c.n_iniciativas === 1 ? 'iniciativa' : 'iniciativas'}
                    </span>
                  )}

                  <i
                    className={`ti ti-chevron-${abierta === c.id ? 'up' : 'down'}`}
                    style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}
                  ></i>
                </button>

                {abierta === c.id && (
                  <div style={{ padding: '0 16px 14px' }}>
                    {cargando && lista.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#aaa', padding: '8px 0' }}>Cargando…</div>
                    ) : (
                      <>
                        {mesa.length > 0 && (
                          <>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.3px', margin: '4px 0 6px' }}>
                              Mesa
                            </div>
                            {mesa.map((p, i) => (
                              <Persona key={`m-${i}`} p={p} />
                            ))}
                          </>
                        )}

                        {portavoces.length > 0 && (
                          <>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.3px', margin: '14px 0 6px' }}>
                              Portavoces · uno por grupo
                            </div>
                            {portavoces.map((p, i) => (
                              <Persona key={`p-${i}`} p={p} />
                            ))}
                          </>
                        )}

                        {resto.length > 0 && (
                          <div style={{ fontSize: 11, color: '#888', marginTop: 12 }}>
                            Y {resto.length} miembros más entre portavoces adjuntos, vocales, adscritos y letrados.
                          </div>
                        )}

                        {c.n_iniciativas > 0 && (
                          <Link
                            href={`/congreso?comision=${encodeURIComponent(c.name)}`}
                            style={{ fontSize: 11.5, color: '#6d5aef', display: 'inline-block', marginTop: 12, textDecoration: 'none' }}
                          >
                            Ver sus {c.n_iniciativas} iniciativas →
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos abiertos del Congreso. Las comisiones mixtas incluyen senadores, que aún no están en el directorio.
      </div>
    </div>
  );
}
