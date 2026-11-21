'use client';

import { useEffect, useMemo, useState } from 'react';
import BackLink from '@/components/BackLink';
import CampoBusqueda from '@/components/CampoBusqueda';
import BanderaCcaa from '@/components/BanderaCcaa';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import Paginacion, { usePaginacion } from '@/components/Paginacion';
import UpgradeModal from '@/components/UpgradeModal';
import CorreoCargo from '@/components/CorreoCargo';
import { useCorreosEncontrados } from '@/components/BuscarCorreo';
import useDirectorio from '@/lib/useDirectorio';
import { norm, siglas, NIVELES } from '@/lib/ccaa/gobiernos';

// =====================================================================
// Ficha de un gobierno autonómico
// Instituciones › Comunidades autónomas › Gobiernos › <gobierno>
//
// Como Ministerios (21-11-2026): pestañas Organigrama (presidencia,
// vicepresidencias y una tarjeta por consejero), Consejerías (una tarjeta
// por consejería, como la pestaña Ministerios) y Personas (todos los
// cargos cargados, con buscador, filtros y paginación).
//
// Los correos llegan solo con el Directorio (lo decide el servidor); sin
// él, el difuminado de siempre, que abre la suscripción.
// =====================================================================

const MORADO = '#6d5aef';
const TABS = [
  { id: 'organigrama', label: 'Organigrama' },
  { id: 'consejerias', label: 'Consejerías' },
  { id: 'personas', label: 'Personas' },
];

function iniciales(nombre) {
  const p = String(nombre || '')
    .split(/\s+/)
    .filter((w) => /^[A-ZÁÉÍÓÚÑÀÈÒ]/.test(w));
  return `${p[0]?.[0] || ''}${p[1]?.[0] || ''}`.toUpperCase();
}

function Foto({ nombre }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 56,
        height: 56,
        borderRadius: 10,
        flexShrink: 0,
        background: '#ece9e2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8d8b83',
        fontSize: 17,
        fontWeight: 700,
      }}
    >
      {iniciales(nombre)}
    </div>
  );
}

/** Tarjeta del organigrama, la de Ministerios con el correo al pie. */
function TarjetaCargo({ nombre, rol, detalle, correo }) {
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1 }}>
        <Foto nombre={nombre} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{nombre}</div>
          {rol ? <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>{rol}</div> : null}
          {detalle ? <div style={{ fontSize: 11.5, color: '#666', marginTop: 6, lineHeight: 1.45 }}>{detalle}</div> : null}
        </div>
      </div>
      {correo ? <div style={{ marginTop: 11, minWidth: 0 }}>{correo}</div> : null}
    </div>
  );
}

function Bloque({ titulo, children, vacio }) {
  if (vacio) return null;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.3px' }}>{titulo}</span>
        <div style={{ flex: 1, height: '.5px', background: '#e0dfd8' }}></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>{children}</div>
    </div>
  );
}

export default function GobiernoAutonomicoPage({ params }) {
  const slug = params?.g;
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('organigrama');
  const [upsell, setUpsell] = useState(false);
  const acceso = useDirectorio();

  // Organigrama
  const [qOrg, setQOrg] = useState('');
  // Personas
  const [q, setQ] = useState('');
  const [niveles, setNiveles] = useState(new Set());
  const [consejerias, setConsejerias] = useState(new Set());

  useEffect(() => {
    let vivo = true;
    fetch(`/api/instituciones/gobiernos-ccaa?vista=ficha&g=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(e.message === '404' ? 'nofound' : 'error'));
    return () => {
      vivo = false;
    };
  }, [slug]);

  // «Buscar correo» para quien no lo tiene publicado (con el Directorio).
  const sinCorreo = useMemo(
    () => (acceso === true && datos ? datos.personas.filter((p) => !p.email).map((p) => p.id) : []),
    [acceso, datos]
  );
  const { encontrados, probables, apuntar } = useCorreosEncontrados(sinCorreo, acceso === true);
  const correoDe = (p, cargo) => (
    <CorreoCargo
      acceso={acceso}
      email={p.email}
      persona={{ id: p.id, nombre: p.nombre, cargo: [cargo || p.cargo, datos?.gobierno?.nombre].filter(Boolean).join(', ') }}
      encontrado={encontrados[p.id]}
      probable={probables[p.id]}
      onResultado={(r) => apuntar(p.id, r)}
      onUpsell={() => setUpsell(true)}
      alinear="left"
    />
  );

  // --- Organigrama ----------------------------------------------------
  const org = useMemo(() => {
    if (!datos) return null;
    const t = norm(qOrg.trim());
    const pasa = (...campos) => !t || norm(campos.join(' ')).includes(t);
    const vices = [
      ...datos.vicepresidentes.map((v) => ({ ...v, rol: v.cargo, detalle: null })),
      ...datos.consejeros.filter((c) => c.vicepresidencia).map((c) => ({ ...c, detalle: c.consejeria })),
    ].filter((v) => pasa(v.nombre, v.cargo, v.detalle));
    const consejeros = datos.consejeros.filter((c) => !c.vicepresidencia).filter((c) => pasa(c.nombre, c.cargo, c.consejeria));
    const presidente = datos.presidente && pasa(datos.presidente.nombre, datos.presidente.cargo) ? datos.presidente : null;
    return { presidente, vices, consejeros };
  }, [datos, qOrg]);

  // --- Personas -------------------------------------------------------
  const valoresNivel = useMemo(() => {
    const n = {};
    for (const p of datos?.personas || []) n[p.nivel] = (n[p.nivel] || 0) + 1;
    return NIVELES.filter((v) => n[v.value]).map((v) => ({ value: v.value, label: `${v.label} (${n[v.value]})` }));
  }, [datos]);
  const valoresConsejeria = useMemo(() => {
    const n = {};
    for (const p of datos?.personas || []) if (p.departamento) n[p.departamento] = (n[p.departamento] || 0) + 1;
    return Object.entries(n)
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([v, k]) => ({ value: v, label: `${v} (${k})` }));
  }, [datos]);
  const personas = useMemo(() => {
    const t = norm(q.trim());
    return (datos?.personas || []).filter(
      (p) =>
        (niveles.size === 0 || niveles.has(p.nivel)) &&
        (consejerias.size === 0 || consejerias.has(p.departamento)) &&
        (!t || norm(`${p.nombre} ${p.cargo} ${p.unidad || ''} ${p.departamento || ''}`).includes(t))
    );
  }, [datos, q, niveles, consejerias]);
  const pag = usePaginacion(personas.length, [q, niveles, consejerias]);

  if (error) {
    return (
      <div className="sec">
        <BackLink fallbackHref="/institutions/comunidades/gobiernos" fallbackLabel="Gobiernos" />
        <div className="card" style={{ marginTop: 14 }}>
          <div className="empty-state">
            <i className="ti ti-cloud-off" aria-hidden="true"></i>
            {error === 'nofound' ? 'No encontramos ese gobierno.' : 'No se ha podido cargar este gobierno. Prueba de nuevo en un momento.'}
          </div>
        </div>
      </div>
    );
  }
  if (!datos) return <div className="spinner"></div>;

  const g = datos.gobierno;

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 6 }}>
        <BackLink fallbackHref="/institutions/comunidades/gobiernos" fallbackLabel="Gobiernos" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <BanderaCcaa ccaa={g.ccaa} ancho={26} />
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{g.nombre}</h1>
        {g.web ? (
          <a
            href={/^https?:\/\//i.test(g.web) ? g.web : `https://${g.web}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Web de ${g.nombre}`}
            style={{ marginLeft: 4, color: '#a8a49c' }}
          >
            <i className="ti ti-external-link" style={{ fontSize: 15 }} aria-hidden="true"></i>
          </a>
        ) : null}
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14 }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              style={{
                fontSize: 13,
                fontWeight: on ? 600 : 400,
                color: on ? '#1a1a18' : '#999',
                padding: '0 0 8px',
                background: 'none',
                borderTop: 0,
                borderLeft: 0,
                borderRight: 0,
                borderBottom: on ? '2px solid #1a1a18' : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'organigrama' && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <CampoBusqueda
              estilo={{ flex: '1 1 320px', minWidth: 200 }}
              value={qOrg}
              onChange={(e) => setQOrg(e.target.value)}
              placeholder="Buscar persona o cargo en el organigrama…"
              aria-label="Buscar en el organigrama"
            />
          </div>

          <Bloque titulo="Presidencia" vacio={!org.presidente}>
            {org.presidente ? (
              <TarjetaCargo
                nombre={org.presidente.nombre}
                rol={org.presidente.cargo}
                detalle={g.nombre}
                correo={correoDe(org.presidente)}
              />
            ) : null}
          </Bloque>
          <Bloque titulo="Vicepresidencias" vacio={org.vices.length === 0}>
            {org.vices.map((v) => (
              <TarjetaCargo key={v.id} nombre={v.nombre} rol={v.rol} detalle={v.detalle} correo={correoDe(v, v.cargo)} />
            ))}
          </Bloque>
          <Bloque titulo="Consejerías" vacio={org.consejeros.length === 0}>
            {org.consejeros.map((c) => (
              <TarjetaCargo key={c.id} nombre={c.nombre} rol={c.rol} detalle={c.consejeria} correo={correoDe(c, c.cargo)} />
            ))}
          </Bloque>

          {!datos.organigrama ? (
            <div className="card">
              <div className="empty-state">
                <i className="ti ti-sitemap" aria-hidden="true"></i>
                El organigrama de este gobierno está en preparación.
              </div>
            </div>
          ) : !org.presidente && org.vices.length === 0 && org.consejeros.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <i className="ti ti-user-off" aria-hidden="true"></i>
                Nadie con esa búsqueda en el organigrama.
              </div>
            </div>
          ) : null}
        </>
      )}

      {tab === 'consejerias' &&
        (datos.consejerias.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <i className="ti ti-building-off" aria-hidden="true"></i>
              Las consejerías de este gobierno están en preparación.
            </div>
          </div>
        ) : (
          /* Mismo formato que la pestaña Ministerios: siglas en un
             cuadrado, nombre al lado y, tras un filete, el titular, las
             personas y el enlace a su equipo en Personas. */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {datos.consejerias.map((c) => (
              <button
                key={c.nombre}
                type="button"
                className="card"
                onClick={() => {
                  setConsejerias(new Set([c.nombre]));
                  setNiveles(new Set());
                  setQ('');
                  setTab('personas');
                }}
                style={{ padding: 14, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', display: 'block', width: '100%' }}
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
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {siglas(c.nombre)}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, minWidth: 0 }}>{c.nombre}</div>
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
                  <div>
                    <i className="ti ti-user-star" style={{ fontSize: 12, verticalAlign: -1, color: '#aaa' }} aria-hidden="true"></i> {c.titular}
                  </div>
                  <div>
                    <i className="ti ti-address-book" style={{ fontSize: 12, verticalAlign: -1, color: '#aaa' }} aria-hidden="true"></i>{' '}
                    {c.personas.toLocaleString('es-ES')} {c.personas === 1 ? 'contacto' : 'contactos'}
                  </div>
                  <div style={{ color: MORADO, marginTop: 4 }}>Ver equipo →</div>
                </div>
              </button>
            ))}
          </div>
        ))}

      {tab === 'personas' && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <CampoBusqueda
              estilo={{ flex: '1 1 320px', minWidth: 200 }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar persona, cargo o unidad…"
              aria-label="Buscar personas"
            />
            {valoresConsejeria.length > 1 ? (
              <MultiSelectFilter label="Consejería" values={valoresConsejeria} selected={consejerias} onApply={(s) => setConsejerias(new Set(s))} />
            ) : null}
            {valoresNivel.length > 1 ? (
              <MultiSelectFilter label="Nivel" values={valoresNivel} selected={niveles} onApply={(s) => setNiveles(new Set(s))} />
            ) : null}
          </div>

          {consejerias.size > 0 || niveles.size > 0 ? (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
              {[...consejerias].map((c) => (
                <button key={c} type="button" onClick={() => setConsejerias(new Set([...consejerias].filter((x) => x !== c)))} style={CHIP}>
                  {c} ×
                </button>
              ))}
              {[...niveles].map((n) => (
                <button key={n} type="button" onClick={() => setNiveles(new Set([...niveles].filter((x) => x !== n)))} style={CHIP}>
                  {NIVELES.find((v) => v.value === n)?.label || n} ×
                </button>
              ))}
            </div>
          ) : null}

          <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
            {personas.length.toLocaleString('es-ES')} {personas.length === 1 ? 'persona' : 'personas'}
          </div>

          {personas.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <i className="ti ti-search-off" aria-hidden="true"></i>
                Nadie con esos criterios.
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 760 }}>
                  <div style={{ ...FILA, background: '#fcfbf8', fontSize: 10.5, fontWeight: 600, color: '#8a8780', textTransform: 'uppercase', letterSpacing: '.3px' }}>
                    <div>Nombre</div>
                    <div>Cargo</div>
                    <div>Unidad</div>
                    <div>Contacto</div>
                  </div>
                  {personas.slice(pag.desde, pag.hasta).map((p) => (
                    <div key={p.id} style={FILA}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div
                          aria-hidden="true"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            background: '#ece9e2',
                            color: '#8d8b83',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {iniciales(p.nombre)}
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0 }}>{p.nombre}</div>
                      </div>
                      <div style={{ fontSize: 12, color: '#3d3a35', minWidth: 0 }}>{p.cargo}</div>
                      <div style={{ fontSize: 11.5, color: '#8a8780', minWidth: 0 }}>{p.unidad || p.departamento || ''}</div>
                      <div style={{ minWidth: 0 }}>{correoDe(p)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <Paginacion pag={pag} dentro />
            </div>
          )}
        </>
      )}

      <div style={{ fontSize: 11, color: '#aaa', marginTop: 18 }}>Datos obtenidos de La Moncloa, DIR3, organigrama y fuentes oficiales.</div>

      {upsell && (
        <UpgradeModal
          title="Disponible con suscripción"
          message="El correo de cada cargo, y «Buscar correo» para quien no lo tenga publicado. Con el Directorio."
          href="/precios"
          onClose={() => setUpsell(false)}
        />
      )}
    </div>
  );
}

const FILA = {
  display: 'grid',
  gridTemplateColumns: '1.5fr 1.6fr 1.3fr 1.4fr',
  gap: 12,
  alignItems: 'center',
  padding: '10px 16px',
  borderBottom: '.5px solid #f0f0eb',
};

const CHIP = { fontSize: 11, padding: '3px 10px', borderRadius: 12, background: '#f5f4f1', color: '#666', border: 'none', cursor: 'pointer' };
