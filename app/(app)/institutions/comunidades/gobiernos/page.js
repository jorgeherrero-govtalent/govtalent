'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import CampoBusqueda from '@/components/CampoBusqueda';
import BanderaCcaa from '@/components/BanderaCcaa';
import PestanasComunidades from '@/components/PestanasComunidades';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import { norm } from '@/lib/ccaa/gobiernos';

// =====================================================================
// Instituciones › Comunidades autónomas › Gobiernos
//
// Maqueta B (21-11-2026): una tarjeta por gobierno, como la pestaña
// Ministerios: bandera y nombre arriba, filete, y debajo el presidente,
// las consejerías, los contactos y «Ver organigrama →». Buscador y filtro
// por comunidad, como Parlamentos. Los datos, de
// /api/instituciones/gobiernos-ccaa (lib/ccaa/gobiernos.js).
// =====================================================================

const cuenta = (n, uno, varios) => `${n.toLocaleString('es-ES')} ${n === 1 ? uno : varios}`;

const ICONO = { fontSize: 12, verticalAlign: -1, color: '#aaa' };
const CHIP = { fontSize: 11, padding: '3px 10px', borderRadius: 12, background: '#f5f4f1', color: '#666', border: 'none', cursor: 'pointer' };

function Tarjeta({ g }) {
  return (
    <Link
      href={`/institutions/comunidades/gobiernos/${g.slug}`}
      className="card"
      style={{ padding: 14, textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
        <BanderaCcaa ccaa={g.ccaa} ancho={30} />
        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, minWidth: 0 }}>{g.nombre}</div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: '#666',
          lineHeight: 1.6,
          borderTop: '.5px solid #f0f0eb',
          paddingTop: 9,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {g.presidente ? (
          <div>
            <i className="ti ti-user-star" style={ICONO} aria-hidden="true"></i> {g.presidente}
          </div>
        ) : null}
        <div>
          <i className="ti ti-sitemap" style={ICONO} aria-hidden="true"></i>{' '}
          {g.organigrama && g.consejerias > 0 ? cuenta(g.consejerias, 'consejería', 'consejerías') : 'Organigrama en preparación'}
        </div>
        <div>
          <i className="ti ti-address-book" style={ICONO} aria-hidden="true"></i> {cuenta(g.personas, 'contacto', 'contactos')}
        </div>
        <div style={{ color: '#6d5aef', marginTop: 4 }}>{g.organigrama ? 'Ver organigrama →' : 'Ver gobierno →'}</div>
      </div>
    </Link>
  );
}

export default function GobiernosPage() {
  const [gobiernos, setGobiernos] = useState(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [comunidades, setComunidades] = useState(new Set());

  useEffect(() => {
    let vivo = true;
    fetch('/api/instituciones/gobiernos-ccaa?vista=listado')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => vivo && setGobiernos(d.gobiernos || []))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, []);

  // Por orden alfabético de la comunidad. Se busca por gobierno, comunidad
  // y presidente a la vez; el filtro, por comunidad (21-11-2026: sin
  // «A–Z» ni «Equipo más grande»).
  const valoresComunidad = useMemo(
    () =>
      [...(gobiernos || [])]
        .sort((a, b) => a.ccaa.localeCompare(b.ccaa, 'es'))
        .map((g) => ({ value: g.ccaa, label: g.ccaa })),
    [gobiernos]
  );
  const visibles = useMemo(() => {
    const t = norm(q.trim());
    return (gobiernos || [])
      .filter((g) => comunidades.size === 0 || comunidades.has(g.ccaa))
      .filter((g) => !t || norm(`${g.nombre} ${g.ccaa} ${g.presidente || ''}`).includes(t))
      .sort((a, b) => a.ccaa.localeCompare(b.ccaa, 'es'));
  }, [gobiernos, q, comunidades]);

  return (
    <div className="sec">
      <div style={{ marginBottom: 6 }}>
        <BackLink fallbackHref="/institutions" fallbackLabel="Instituciones" />
      </div>
      <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 16px' }}>Comunidades autónomas</h1>
      <PestanasComunidades activa="Gobiernos" />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <CampoBusqueda
          estilo={{ flex: '1 1 320px', minWidth: 200 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar gobierno o presidente…"
          aria-label="Buscar en los gobiernos autonómicos"
        />
        {valoresComunidad.length > 1 ? (
          <MultiSelectFilter label="Comunidad" values={valoresComunidad} selected={comunidades} onApply={(s) => setComunidades(new Set(s))} />
        ) : null}
      </div>

      {comunidades.size > 0 ? (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
          {[...comunidades].map((c) => (
            <button key={c} type="button" onClick={() => setComunidades(new Set([...comunidades].filter((x) => x !== c)))} style={CHIP}>
              {c} ×
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-cloud-off" aria-hidden="true"></i>
            No se han podido cargar los gobiernos. Prueba de nuevo en un momento.
          </div>
        </div>
      ) : gobiernos === null ? (
        <div className="spinner"></div>
      ) : visibles.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-search-off" aria-hidden="true"></i>
            Ningún gobierno con esa búsqueda.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
          {visibles.map((g) => (
            <Tarjeta key={g.slug} g={g} />
          ))}
        </div>
      )}
    </div>
  );
}
