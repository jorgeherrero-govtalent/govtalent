'use client';

import { useEffect, useMemo, useState } from 'react';
import BackLink from '@/components/BackLink';
import { seccionPorSlug, FUENTE_AGENDA } from '@/lib/directorio';
import { SECTOR_LABELS } from '@/lib/orgTaxonomy';

/**
 * Listado de una sección del directorio que sale de la Agenda de la
 * Comunicación (prensa, partidos, comunidades autónomas…) o de las
 * asociaciones ya cargadas.
 *
 * Una ficha plegable por organización con sus unidades y las personas,
 * solo nombre y cargo. Los correos y teléfonos no se enseñan aquí: son
 * la Base de datos, que es de pago.
 *
 * Todo se filtra en el navegador: la sección más grande (prensa) son
 * ~600 organizaciones y ~2.200 personas, y así la búsqueda es inmediata.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const POR_PAGINA = 25;

function norm(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function urlWeb(w) {
  if (!w) return null;
  const limpia = String(w).trim();
  return /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
}

function textoWeb(w) {
  return String(w || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

// Comunidades autónomas: una ficha por comunidad con sus tres instituciones
// como unidades, en vez de una ficha por institución.
function agruparPorComunidad(items) {
  const porCcaa = new Map();
  for (const it of items) {
    const k = it.ccaa || it.grupo || it.organizacion;
    if (!porCcaa.has(k)) porCcaa.set(k, { organizacion: k, subcategoria: null, web: null, unidades: [] });
    const g = porCcaa.get(k);
    if (!g.web && it.subcategoria === 'Gobierno' && it.web) g.web = it.web;
    g.unidades.push({
      nombre: it.organizacion,
      personas: it.unidades.flatMap((u) => u.personas),
      etiqueta: it.subcategoria,
    });
  }
  return [...porCcaa.values()];
}

function Ficha({ item }) {
  const personas = item.unidades.reduce((n, u) => n + u.personas.length, 0);
  const web = urlWeb(item.web);
  const meta = [item.subcategoria, item.unidades.length > 1 ? `${item.unidades.length} unidades` : null, personas ? `${personas} ${personas === 1 ? 'persona' : 'personas'}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <details style={{ background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 12, overflow: 'hidden' }}>
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ minWidth: 0, flex: '1 1 320px' }}>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: '#1a1a18' }}>{item.organizacion}</span>
          {meta ? <span style={{ display: 'block', fontSize: 12.5, color: '#8b8780', marginTop: 3 }}>{meta}</span> : null}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {web ? (
            <a
              href={web}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 12.5, color: '#3a3a36', textDecoration: 'none', borderBottom: `1px solid ${BORDE}` }}
            >
              {textoWeb(item.web)}
            </a>
          ) : null}
          <i className="ti ti-chevron-down" style={{ fontSize: 16, color: '#8b8780' }} aria-hidden="true"></i>
        </span>
      </summary>
      <div style={{ borderTop: `.5px solid ${BORDE}`, padding: '6px 18px 14px' }}>
        {item.unidades.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8b8780', padding: '8px 0' }}>La Agenda no recoge personas para esta organización.</div>
        ) : (
          item.unidades.map((u, i) => (
            <div key={i} style={{ paddingTop: 10 }}>
              {u.nombre ? (
                <div style={{ fontSize: 12, color: '#8b8780', fontWeight: 600, marginBottom: 4 }}>
                  {u.nombre}
                  {u.etiqueta && u.etiqueta !== u.nombre ? <span style={{ fontWeight: 400 }}> · {u.etiqueta}</span> : null}
                </div>
              ) : null}
              {u.personas.length === 0 ? (
                <div style={{ fontSize: 13, color: '#a8a49c' }}>Sin personas en la Agenda</div>
              ) : (
                u.personas.map((p, j) => (
                  <div key={j} style={{ fontSize: 13, lineHeight: 1.6, color: '#1a1a18' }}>
                    {p.nombre}
                    {p.cargo ? <span style={{ color: '#6f6b64' }}> · {p.cargo}</span> : null}
                  </div>
                ))
              )}
            </div>
          ))
        )}
      </div>
    </details>
  );
}

function FilaAsociacion({ item }) {
  const web = urlWeb(item.web);
  const meta = [SECTOR_LABELS[item.sector] || null, item.lugar].filter(Boolean).join(' · ');
  return (
    <div
      style={{
        background: '#fff',
        border: `.5px solid ${BORDE}`,
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ minWidth: 0, flex: '1 1 320px' }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{item.organizacion}</span>
        {meta ? <span style={{ display: 'block', fontSize: 12.5, color: '#8b8780', marginTop: 3 }}>{meta}</span> : null}
      </span>
      {web ? (
        <a
          href={web}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12.5, color: '#3a3a36', textDecoration: 'none', borderBottom: `1px solid ${BORDE}` }}
        >
          {textoWeb(item.web)}
        </a>
      ) : null}
    </div>
  );
}

export default function DirectorioListado({ slug, volverA, volverEtiqueta }) {
  const seccion = seccionPorSlug(slug);
  const [items, setItems] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('');
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let vivo = true;
    setEstado('cargando');
    fetch(`/api/directorio?vista=listado&s=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!vivo) return;
        const lista = d.items || [];
        setItems(slug === 'comunidades' ? agruparPorComunidad(lista) : lista);
        setEstado('listo');
      })
      .catch(() => {
        if (vivo) setEstado('error');
      });
    return () => {
      vivo = false;
    };
  }, [slug]);

  const esAsociaciones = slug === 'asociaciones';

  // Filtro por subcategoría (tipo de medio, corporación…) o por sector en
  // las asociaciones, solo si hay más de uno.
  const opciones = useMemo(() => {
    const valores = new Map();
    for (const it of items) {
      const v = esAsociaciones ? it.sector : it.subcategoria;
      if (!v) continue;
      valores.set(v, (valores.get(v) || 0) + 1);
    }
    return [...valores.entries()]
      .map(([v, n]) => ({ v, n, label: esAsociaciones ? SECTOR_LABELS[v] || v : v }))
      .sort((a, b) => b.n - a.n);
  }, [items, esAsociaciones]);

  const filtrados = useMemo(() => {
    const q = norm(busqueda.trim());
    return items.filter((it) => {
      if (filtro && (esAsociaciones ? it.sector : it.subcategoria) !== filtro) return false;
      if (!q) return true;
      if (norm(it.organizacion).includes(q)) return true;
      if (esAsociaciones) return norm(it.lugar).includes(q);
      return (it.unidades || []).some(
        (u) => norm(u.nombre).includes(q) || u.personas.some((p) => norm(p.nombre).includes(q) || norm(p.cargo).includes(q))
      );
    });
  }, [items, busqueda, filtro, esAsociaciones]);

  useEffect(() => setPagina(1), [busqueda, filtro]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visibles = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  if (!seccion) return null;

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <BackLink fallbackHref={volverA} fallbackLabel={volverEtiqueta} />
      <div style={{ margin: '10px 0 18px' }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>{seccion.titulo}</h1>
        <p style={{ fontSize: 13, color: '#8b8780', margin: '4px 0 0' }}>{seccion.descripcion}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <label style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420 }}>
          <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Buscar
          </span>
          <i
            className="ti ti-search"
            aria-hidden="true"
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#8b8780' }}
          ></i>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={esAsociaciones ? 'Buscar asociación o ciudad' : 'Buscar organización, persona o cargo'}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: `.5px solid ${BORDE}`,
              borderRadius: 9,
              padding: '9px 12px 9px 33px',
              fontSize: 13,
              fontFamily: 'inherit',
              background: '#fff',
            }}
          />
        </label>
        {opciones.length > 1 ? (
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            aria-label={esAsociaciones ? 'Sector' : 'Tipo'}
            style={{
              border: `.5px solid ${BORDE}`,
              borderRadius: 9,
              padding: '9px 12px',
              fontSize: 13,
              fontFamily: 'inherit',
              background: '#fff',
              color: '#3a3a36',
              maxWidth: '100%',
            }}
          >
            <option value="">{esAsociaciones ? 'Todos los sectores' : 'Todos los tipos'}</option>
            {opciones.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label} ({o.n})
              </option>
            ))}
          </select>
        ) : null}
        {estado === 'listo' ? (
          <span style={{ fontSize: 12.5, color: '#8b8780' }}>
            <span style={{ color: MORADO, fontWeight: 600 }}>{filtrados.length.toLocaleString('es-ES')}</span> {seccion.unidad}
          </span>
        ) : null}
      </div>

      {estado === 'cargando' ? (
        <div style={{ fontSize: 13, color: '#8b8780', padding: '24px 0' }}>Cargando…</div>
      ) : estado === 'error' ? (
        <div style={{ fontSize: 13, color: '#8b8780', padding: '24px 0' }}>No se ha podido cargar esta sección. Prueba de nuevo en un momento.</div>
      ) : filtrados.length === 0 ? (
        <div style={{ fontSize: 13, color: '#8b8780', padding: '24px 0' }}>Ningún resultado con esa búsqueda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibles.map((it, i) =>
            esAsociaciones ? <FilaAsociacion key={i} item={it} /> : <Ficha key={`${pagina}-${i}`} item={it} />
          )}
        </div>
      )}

      {estado === 'listo' && totalPaginas > 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 18 }}>
          <button
            type="button"
            className="btn-o"
            disabled={pagina === 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            style={{ opacity: pagina === 1 ? 0.4 : 1 }}
          >
            Anterior
          </button>
          <span style={{ fontSize: 12.5, color: '#8b8780' }}>
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            className="btn-o"
            disabled={pagina === totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            style={{ opacity: pagina === totalPaginas ? 0.4 : 1 }}
          >
            Siguiente
          </button>
        </div>
      ) : null}

      <div style={{ fontSize: 11.5, color: '#a8a49c', paddingTop: 18 }}>
        Fuente: {esAsociaciones ? 'directorio de organizaciones de GovTalent' : FUENTE_AGENDA}.
      </div>
    </div>
  );
}
