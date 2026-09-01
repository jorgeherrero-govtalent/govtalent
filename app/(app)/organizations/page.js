'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { TYPE_LABELS, ORG_TYPES, SECTOR_LABELS, SECTORS } from '@/lib/orgTaxonomy';
import UpgradeModal from '@/components/UpgradeModal';
import HoverTooltip from '@/components/HoverTooltip';
import MultiSelectFilter from '@/components/MultiSelectFilter';

const PAGE_SIZES = [20, 50, 100, 200];

const chipStyle = {
  fontSize: 11.5,
  background: '#f0efe9',
  color: '#666',
  padding: '4px 10px',
  borderRadius: 14,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
};

const chipXStyle = { fontSize: 10, cursor: 'pointer', color: '#999' };

function removeFromSet(setter, value) {
  setter((prev) => {
    const next = new Set(prev);
    next.delete(value);
    return next;
  });
}

export default function OrganizationsDirectory() {
  const supabase = createClient();
  const [orgs, setOrgs] = useState(null);
  const [name, setName] = useState('');
  const [typeFilter, setTypeFilter] = useState(new Set());
  const [sectorFilter, setSectorFilter] = useState(new Set());
  const [locationFilter, setLocationFilter] = useState(new Set());
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);
  const [upgradeModal, setUpgradeModal] = useState(null);

  // Se retiró el conmutador Tarjetas/Listado y con él su estado y lo
  // que guardaba en localStorage. Había dos vistas del mismo directorio
  // manteniéndose por duplicado; ahora hay una.

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase.from('organizations').select('*').order('created_at', { ascending: false }).limit(5000);
    setOrgs(data || []);
  }

  const locationOptions = useMemo(() => {
    if (!orgs) return [];
    const unique = [...new Set(orgs.map((o) => o.location).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return unique.map((l) => ({ value: l, label: l }));
  }, [orgs]);

  const filtered = useMemo(() => {
    if (!orgs) return [];
    let list = orgs.filter((o) => o.name.toLowerCase().includes(name.toLowerCase()));
    if (typeFilter.size > 0) list = list.filter((o) => typeFilter.has(o.org_type));
    if (sectorFilter.size > 0) list = list.filter((o) => sectorFilter.has(o.sector));
    if (locationFilter.size > 0) list = list.filter((o) => locationFilter.has(o.location));
    return [...list].sort((a, b) => (b.verified === a.verified ? a.name.localeCompare(b.name) : b.verified - a.verified));
  }, [orgs, name, typeFilter, sectorFilter, locationFilter]);

  useEffect(() => {
    setPage(0);
  }, [name, typeFilter, sectorFilter, locationFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = filtered.length === 0 ? 0 : currentPage * pageSize + 1;
  const pageEnd = Math.min(filtered.length, (currentPage + 1) * pageSize);
  const paginated = useMemo(
    () => filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    [filtered, currentPage, pageSize]
  );

  // Mismo cálculo que en Diputados, Organismos y el resto de listados
  // largos: primera, actual, última y puntos suspensivos.
  const pageNumbers = useMemo(() => {
    const actual = currentPage + 1;
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (actual <= 3) return [1, 2, 3, '…', totalPages];
    if (actual >= totalPages - 2) return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', actual, '…', totalPages];
  }, [currentPage, totalPages]);

  function cambiarFilas(n) {
    setPageSize(n);
    setPage(0); // sin esto, estar en la página 15 con 20 filas y saltar a 200 deja la lista vacía
  }

  return (
    <div className="sec">
      {/* Cabecera como la del resto de la plataforma.
          Había una portada centrada con un eslogan a dos tamaños y el
          buscador metido dentro de una tarjeta. Era la única página con
          su propio sistema visual —47 reglas dir-*— y por eso se veía
          de otro producto. */}
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Organizaciones</h1>
        <p style={{ fontSize: 12.5, color: '#888', margin: '3px 0 0' }}>
          Patronales, consultoras y empresas que trabajan con la Administración.
        </p>
      </div>

      {/* La misma barra que Ministerios, Organismos y el Congreso. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '7px 14px',
            flex: '1 1 220px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Buscar organización..."
            aria-label="Buscar organización"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <MultiSelectFilter
          label="Tipo"
          values={ORG_TYPES.map(([k, v]) => ({ value: k, label: v }))}
          selected={typeFilter}
          onApply={setTypeFilter}
        />
        <MultiSelectFilter
          label="Sector"
          values={SECTORS.map(([k, v]) => ({ value: k, label: v }))}
          selected={sectorFilter}
          onApply={setSectorFilter}
        />
        <MultiSelectFilter
          label="Ubicación"
          values={locationOptions}
          selected={locationFilter}
          onApply={setLocationFilter}
        />
      </div>

      {(typeFilter.size > 0 || sectorFilter.size > 0 || locationFilter.size > 0) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...typeFilter].map((v) => (
            <span key={`t-${v}`} style={chipStyle}>
              {TYPE_LABELS[v] || v}
              <i className="ti ti-x" style={chipXStyle} onClick={() => removeFromSet(setTypeFilter, v)}></i>
            </span>
          ))}
          {[...sectorFilter].map((v) => (
            <span key={`s-${v}`} style={chipStyle}>
              {SECTOR_LABELS[v] || v}
              <i className="ti ti-x" style={chipXStyle} onClick={() => removeFromSet(setSectorFilter, v)}></i>
            </span>
          ))}
          {[...locationFilter].map((v) => (
            <span key={`l-${v}`} style={chipStyle}>
              {v}
              <i className="ti ti-x" style={chipXStyle} onClick={() => removeFromSet(setLocationFilter, v)}></i>
            </span>
          ))}
          <span
            onClick={() => {
              setTypeFilter(new Set());
              setSectorFilter(new Set());
              setLocationFilter(new Set());
            }}
            style={{ fontSize: 11.5, color: '#999', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Limpiar filtros
          </span>
        </div>
      )}

      {orgs === null ? (
        <div className="spinner"></div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 12, color: '#888' }}>
              <b style={{ color: '#1a1a18' }}>{filtered.length.toLocaleString('es-ES')}</b>{' '}
              organización{filtered.length === 1 ? '' : 'es'}
            </span>
            {/* Los dos botones de Pro se quedan, pero como enlaces
                discretos: eran dos pastillas grandes compitiendo con los
                filtros de verdad. */}
            <span style={{ display: 'flex', gap: 14 }}>
              <span
                onClick={() =>
                  setUpgradeModal({
                    title: 'Filtros avanzados',
                    message:
                      'Cruza filtros de actividad, tamaño y más para encontrar exactamente lo que buscas. Disponible en el plan Pro.',
                  })
                }
                style={{ fontSize: 11.5, color: '#6d5aef', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <i className="ti ti-adjustments" style={{ fontSize: 13 }}></i> Filtros avanzados
              </span>
              <span
                onClick={() =>
                  setUpgradeModal({
                    title: 'Exportar datos',
                    message: 'Descarga el directorio completo en Excel, con filtros aplicados. Disponible en el plan Pro.',
                  })
                }
                style={{ fontSize: 11.5, color: '#6d5aef', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <i className="ti ti-download" style={{ fontSize: 13 }}></i> Exportar
              </span>
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <i className="ti ti-building-off"></i>
                No hay organizaciones con estos filtros.
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, overflow: 'hidden' }}>
              {paginated.map((o, i) => {
                {/* Tipo, ubicación y tamaño en una sola línea separada
                    por puntos, que es como escribe el resto de la
                    aplicación. Los que faltan simplemente no aparecen,
                    en vez de dejar una raya. */}
                const contexto = [
                  TYPE_LABELS[o.org_type] || o.org_type,
                  o.location,
                  o.size_range ? `${o.size_range} empleados` : null,
                ].filter(Boolean);

                return (
                  <Link
                    key={o.id}
                    href={`/organizations/${o.slug}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 13,
                      padding: '13px 15px',
                      textDecoration: 'none',
                      color: 'inherit',
                      borderBottom: i < paginated.length - 1 ? '.5px solid #f0efe9' : 'none',
                    }}
                  >
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        background: '#f4f4f0',
                        color: '#a8a49c',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        overflow: 'hidden',
                      }}
                    >
                      {o.logo_url ? (
                        <img src={o.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <i className="ti ti-building" style={{ fontSize: 16 }}></i>
                      )}
                    </span>

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
                        {o.name}{' '}
                        {o.verified && (
                          <HoverTooltip label="Página verificada por la organización">
                            <i className="ti ti-circle-check-filled verified-tick"></i>
                          </HoverTooltip>
                        )}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11.5,
                          color: '#888',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {contexto.join(' · ')}
                      </span>
                    </span>

                    {/* Flecha y no "Ver página →", que es lo que hacen
                        los listados largos de la aplicación. Con nombres
                        cortos como "&Beyond" el enlace de texto quedaba
                        a un palmo del contenido y la fila se veía
                        partida en dos. */}
                    <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
                  </Link>
                );
              })}

              {/* Dentro de la caja de la lista y con el mismo aspecto
                  que en Diputados y Organismos: filas por página a la
                  izquierda, números a la derecha, sobre #fcfbf8. Antes
                  era un bloque suelto debajo, con otra maquetación. */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '11px 14px',
                  background: '#fcfbf8',
                  borderTop: '.5px solid #f0efe9',
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
                        onClick={() => cambiarFilas(n)}
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
                    {pageStart}–{pageEnd} de {filtered.length.toLocaleString('es-ES')}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span
                    onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                    style={{ border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: currentPage === 0 ? '#ccc' : '#555' }}
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
                        onClick={() => setPage(n - 1)}
                        style={{
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: 11.5,
                          cursor: 'pointer',
                          background: n === currentPage + 1 ? '#1d6f5c' : 'transparent',
                          color: n === currentPage + 1 ? '#fff' : '#555',
                          border: n === currentPage + 1 ? 'none' : '.5px solid #e0dfd8',
                        }}
                      >
                        {n}
                      </span>
                    )
                  )}
                  <span
                    onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))}
                    style={{ border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: currentPage >= totalPages - 1 ? '#ccc' : '#555' }}
                  >
                    <i className="ti ti-chevron-right" style={{ fontSize: 13 }}></i>
                  </span>
                </div>
              </div>
            </div>
          )}

        </>
      )}

      {upgradeModal && (
        <UpgradeModal
          title={upgradeModal.title}
          message={upgradeModal.message}
          onClose={() => setUpgradeModal(null)}
        />
      )}
    </div>
  );
}
