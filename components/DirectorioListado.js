'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import Paginacion, { usePaginacion } from '@/components/Paginacion';
import { seccionPorSlug } from '@/lib/directorio';
import { SECTOR_LABELS } from '@/lib/orgTaxonomy';

/**
 * Listado de una sección del directorio (prensa, partidos, comunidades
 * autónomas…), con el mismo diseño que Organismos y reguladores: buscador
 * redondo, filtros, una fila por organización con su titular a la derecha
 * y la paginación de los directorios. Cada fila abre la ficha.
 *
 * Maqueta A, elegida el 05-10-2026.
 *
 * Todo se filtra en el navegador: la sección más grande (prensa) son
 * ~600 organizaciones.
 */

const BORDE = '#e0dfd8';

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

function contar(items, campo, etiqueta = (v) => v) {
  const n = {};
  for (const it of items) if (it[campo]) n[it[campo]] = (n[it[campo]] || 0) + 1;
  return Object.entries(n)
    .sort((a, b) => b[1] - a[1])
    .map(([v, k]) => ({ value: v, label: `${etiqueta(v)} (${k})` }));
}

function Icono({ nombre }) {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: '#f5f4f1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <i className={`ti ${nombre}`} style={{ fontSize: 14, color: '#888' }} aria-hidden="true"></i>
    </div>
  );
}

function Fila({ it, seccion, base, ultima }) {
  const meta = [
    it.tipo,
    it.ccaa && it.ccaa !== it.ciudad ? it.ccaa : null,
    it.ciudad,
    it.personas ? `${it.personas} ${it.personas === 1 ? 'persona' : 'personas'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      href={`${base}/${it.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        textDecoration: 'none',
        color: 'inherit',
        borderBottom: ultima ? 'none' : '.5px solid #f0f0eb',
      }}
    >
      <Icono nombre={seccion.icono} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{it.organizacion}</div>
        {meta ? (
          <div
            style={{ fontSize: 11, color: '#a8a49c', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {meta}
          </div>
        ) : null}
      </div>
      {it.titular ? (
        <div style={{ flexShrink: 1, minWidth: 0, textAlign: 'right', maxWidth: 240 }}>
          <div style={{ fontSize: 12, color: '#3d3a35', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {it.titular.nombre}
          </div>
          <div style={{ fontSize: 10.5, color: '#a8a49c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {it.titular.cargo}
          </div>
        </div>
      ) : null}
      <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }} aria-hidden="true"></i>
    </Link>
  );
}

// Las asociaciones salen del directorio de organizaciones y no tienen ficha
// aquí: la fila lleva su web.
function FilaAsociacion({ it, seccion, ultima }) {
  const web = urlWeb(it.web);
  const meta = [SECTOR_LABELS[it.sector] || null, it.ciudad].filter(Boolean).join(' · ');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: ultima ? 'none' : '.5px solid #f0f0eb',
      }}
    >
      <Icono nombre={seccion.icono} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{it.organizacion}</div>
        {meta ? <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 2 }}>{meta}</div> : null}
      </div>
      {web ? (
        <a href={web} target="_blank" rel="noreferrer" aria-label={`Web de ${it.organizacion}`} style={{ flexShrink: 0 }}>
          <i className="ti ti-external-link" style={{ fontSize: 15, color: '#a8a49c' }} aria-hidden="true"></i>
        </a>
      ) : null}
    </div>
  );
}

const CHIP = { fontSize: 11, padding: '3px 10px', borderRadius: 12, background: '#f5f4f1', color: '#666', border: 'none', cursor: 'pointer' };

export default function DirectorioListado({ slug, base, volverA, volverEtiqueta }) {
  const seccion = seccionPorSlug(slug);
  const esAsociaciones = slug === 'asociaciones';
  const esCcaa = slug === 'comunidades';

  const [items, setItems] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [q, setQ] = useState('');
  const [tipos, setTipos] = useState(new Set());
  const [lugares, setLugares] = useState(new Set());

  useEffect(() => {
    let vivo = true;
    setEstado('cargando');
    fetch(`/api/directorio?vista=listado&s=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!vivo) return;
        setItems(d.items || []);
        setEstado('listo');
      })
      .catch(() => {
        if (vivo) setEstado('error');
      });
    return () => {
      vivo = false;
    };
  }, [slug]);

  // Primer filtro: el tipo (o el sector en las asociaciones). Segundo: la
  // comunidad en Comunidades autónomas y la provincia en el resto.
  const campoTipo = esAsociaciones ? 'sector' : 'tipo';
  const campoLugar = esCcaa ? 'ccaa' : 'provincia';
  const valoresTipo = useMemo(
    () => contar(items, campoTipo, esAsociaciones ? (v) => SECTOR_LABELS[v] || v : undefined),
    [items, campoTipo, esAsociaciones]
  );
  const valoresLugar = useMemo(() => contar(items, campoLugar), [items, campoLugar]);

  const filtradas = useMemo(() => {
    const texto = norm(q.trim());
    return items.filter((it) => {
      if (tipos.size > 0 && !tipos.has(it[campoTipo])) return false;
      if (lugares.size > 0 && !lugares.has(it[campoLugar])) return false;
      if (!texto) return true;
      return norm(it.organizacion).includes(texto) || norm(it.titular?.nombre).includes(texto) || norm(it.ciudad).includes(texto);
    });
  }, [items, q, tipos, lugares, campoTipo, campoLugar]);

  const pag = usePaginacion(filtradas.length, [q, tipos, lugares]);
  const slice = filtradas.slice(pag.desde, pag.hasta);

  if (!seccion) return null;

  return (
    <div className="sec">
      <div style={{ marginBottom: 6 }}>
        <BackLink fallbackHref={volverA} fallbackLabel={volverEtiqueta} />
      </div>

      <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{seccion.titulo}</h1>
      <p style={{ fontSize: 12.5, color: '#888', margin: '3px 0 16px', lineHeight: 1.55 }}>{seccion.descripcion}</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            minWidth: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: `.5px solid ${BORDE}`,
            borderRadius: 20,
            padding: '9px 16px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 15 }} aria-hidden="true"></i>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Buscar en ${seccion.titulo.toLowerCase()}…`}
            aria-label={`Buscar en ${seccion.titulo}`}
            style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12.5, background: 'transparent' }}
          />
        </div>
        {valoresTipo.length > 1 ? (
          <MultiSelectFilter
            label={esAsociaciones ? 'Sector' : 'Tipo'}
            values={valoresTipo}
            selected={tipos}
            onApply={(s) => setTipos(new Set(s))}
          />
        ) : null}
        {valoresLugar.length > 1 ? (
          <MultiSelectFilter
            label={esCcaa ? 'Comunidad' : 'Provincia'}
            values={valoresLugar}
            selected={lugares}
            onApply={(s) => setLugares(new Set(s))}
          />
        ) : null}
      </div>

      {(tipos.size > 0 || lugares.size > 0) && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          {[...tipos].map((t) => (
            <button key={`t-${t}`} type="button" onClick={() => setTipos((prev) => new Set([...prev].filter((x) => x !== t)))} style={CHIP}>
              {esAsociaciones ? SECTOR_LABELS[t] || t : t} ×
            </button>
          ))}
          {[...lugares].map((l) => (
            <button key={`l-${l}`} type="button" onClick={() => setLugares((prev) => new Set([...prev].filter((x) => x !== l)))} style={CHIP}>
              {l} ×
            </button>
          ))}
        </div>
      )}

      {estado === 'cargando' ? (
        <div className="spinner"></div>
      ) : estado === 'error' ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-cloud-off" aria-hidden="true"></i>
            No se ha podido cargar esta sección. Prueba de nuevo en un momento.
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
            {filtradas.length.toLocaleString('es-ES')} {seccion.unidad}
          </div>

          {filtradas.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <i className="ti ti-search-off" aria-hidden="true"></i>
                Nada con esos criterios.
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {slice.map((it, i) =>
                esAsociaciones ? (
                  <FilaAsociacion key={it.id} it={it} seccion={seccion} ultima={i === slice.length - 1} />
                ) : (
                  <Fila key={it.id} it={it} seccion={seccion} base={base} ultima={i === slice.length - 1} />
                )
              )}
              <Paginacion pag={pag} dentro />
            </div>
          )}
        </>
      )}
    </div>
  );
}
