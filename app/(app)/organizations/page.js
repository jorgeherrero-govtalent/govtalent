'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { hasInterestGroupBadge } from '@/lib/interestGroupBadge';
import { TYPE_LABELS, ORG_TYPES, SECTOR_LABELS, SECTORS } from '@/lib/orgTaxonomy';
import UpgradeModal from '@/components/UpgradeModal';
import HoverTooltip from '@/components/HoverTooltip';
import MultiSelectFilter from '@/components/MultiSelectFilter';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

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
  const [pageSize, setPageSize] = useState(25);
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
                        {hasInterestGroupBadge(o) && (
                          <HoverTooltip
                            label={`Grupo de interés registrado${
                              o.interest_group_registry_number ? ` · ${o.interest_group_registry_number}` : ''
                            }`}
                          >
                            <i className="ti ti-shield-check" style={{ color: '#6d5aef' }}></i>
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

                    <span style={{ fontSize: 11.5, color: '#6d5aef', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      Ver página →
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {filtered.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                margin: '14px auto 0',
                padding: '12px 16px',
                background: '#fff',
                border: '.5px solid #e0dfd8',
                borderRadius: 12,
                fontSize: 12.5,
                color: '#888',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Mostrar
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  style={{ border: '.5px solid #e0dfd8', borderRadius: 7, padding: '4px 8px', fontSize: 12.5 }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>
                  Mostrando {pageStart}-{pageEnd} de {filtered.length}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      border: '.5px solid #e0dfd8',
                      background: '#fff',
                      color: currentPage === 0 ? '#ccc' : '#555',
                      cursor: currentPage === 0 ? 'default' : 'pointer',
                    }}
                  >
                    <i className="ti ti-chevron-left" style={{ fontSize: 13 }}></i>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      border: '.5px solid #e0dfd8',
                      background: '#fff',
                      color: currentPage >= totalPages - 1 ? '#ccc' : '#555',
                      cursor: currentPage >= totalPages - 1 ? 'default' : 'pointer',
                    }}
                  >
                    <i className="ti ti-chevron-right" style={{ fontSize: 13 }}></i>
                  </button>
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
