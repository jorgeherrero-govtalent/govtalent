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

export default function OrganizationsDirectory() {
  const supabase = createClient();
  const [orgs, setOrgs] = useState(null);
  const [name, setName] = useState('');
  const [typeFilter, setTypeFilter] = useState(new Set());
  const [sectorFilter, setSectorFilter] = useState(new Set());
  const [locationFilter, setLocationFilter] = useState(new Set());
  const [view, setView] = useState('grid');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [upgradeModal, setUpgradeModal] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('gt_dir_view');
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem('gt_dir_view', view);
  }, [view]);

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
      <div className="dir-hero">
        <h1>
          La mayor base de datos de <em>organizaciones de asuntos públicos y gobierno</em> de España
        </h1>
        <p style={{ fontSize: 14, color: '#777', marginBottom: 26 }}>
          Encuentra cualquier tipo de organización vinculada al sector de los asuntos públicos, la
          política y el gobierno
        </p>
        <div className="card" style={{ maxWidth: 1080, margin: '0 auto 26px', padding: '18px 20px', textAlign: 'left' }}>
          <div className="form-g" style={{ marginBottom: 12 }}>
            <label>Nombre</label>
            <input
              placeholder="Nombre de la organización"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <MultiSelectFilter
              label="Tipo de organización"
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
            <MultiSelectFilter label="Ubicación" values={locationOptions} selected={locationFilter} onApply={setLocationFilter} />
          </div>
        </div>
      </div>

      {orgs === null ? (
        <div className="spinner"></div>
      ) : (
        <>
          <div className="dir-toolbar">
            <div className="dir-count">
              <b>{filtered.length.toLocaleString('es-ES')}</b> organización{filtered.length === 1 ? '' : 'es'}
              <span style={{ color: '#999', fontWeight: 400 }}> · Actualizado semanalmente</span>
            </div>
            <div className="dir-chips">
              <button
                type="button"
                className="dir-chip premium"
                onClick={() =>
                  setUpgradeModal({
                    title: 'Filtros avanzados',
                    message: 'Cruza filtros de actividad, tamaño y más para encontrar exactamente lo que buscas. Disponible en el plan Pro.',
                  })
                }
              >
                <i className="ti ti-adjustments"></i> Filtros avanzados <span className="premium-tag">PRO</span>
              </button>
              <button
                type="button"
                className="dir-chip premium"
                onClick={() =>
                  setUpgradeModal({
                    title: 'Exportar datos',
                    message: 'Descarga el directorio completo en Excel, con filtros aplicados. Disponible en el plan Pro.',
                  })
                }
              >
                <i className="ti ti-download"></i> Exportar datos <span className="premium-tag">PRO</span>
              </button>
              <div className="view-toggle">
                <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>
                  <i className="ti ti-layout-grid"></i> Tarjetas
                </button>
                <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
                  <i className="ti ti-list"></i> Listado
                </button>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card" style={{ maxWidth: 1080, margin: '0 auto' }}>
              <div className="empty-state">
                <i className="ti ti-building-off"></i>
                Todavía no hay organizaciones que coincidan con tu búsqueda.
              </div>
            </div>
          ) : view === 'grid' ? (
            <div className="dir-grid">
              {paginated.map((o) => (
                <Link href={`/organizations/${o.slug}`} className="dir-card" key={o.id}>
                  <div className="dir-card-top">
                    <div className="dir-logo">
                      {o.logo_url ? <img src={o.logo_url} alt="" /> : <i className="ti ti-building"></i>}
                    </div>
                    <div>
                      <div className="dir-name">
                        {o.name}{' '}
                        {o.verified && (
                          <HoverTooltip label="Página verificada por la organización">
                            <i className="ti ti-circle-check-filled verified-tick"></i>
                          </HoverTooltip>
                        )}
                        {hasInterestGroupBadge(o) && (
                          <HoverTooltip
                            label={`Grupo de interés registrado${o.interest_group_registry_number ? ` · ${o.interest_group_registry_number}` : ''}`}
                          >
                            <i className="ti ti-shield-check" style={{ color: '#6d5aef' }}></i>
                          </HoverTooltip>
                        )}
                      </div>
                    </div>
                  </div>
                  {o.location && (
                    <div className="dir-loc">
                      <i className="ti ti-map-pin"></i> {o.location}
                    </div>
                  )}
                  {!o.verified && (
                    <div className="badge bgr" style={{ display: 'inline-flex', marginBottom: 8, width: 'fit-content' }}>
                      <i className="ti ti-clock" style={{ fontSize: 11 }}></i> No verificada
                    </div>
                  )}
                  <div className="dir-tags">
                    {o.org_type && (
                      <div className="dir-tag">
                        <i className="ti ti-briefcase"></i> {TYPE_LABELS[o.org_type] || o.org_type}
                      </div>
                    )}
                  </div>
                  <span className="dir-btn">Ver página</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="dir-list">
              <div className="dir-list-head">
                <span>Organización</span>
                <span>Tipo de organización</span>
                <span>Empleados</span>
                <span>Ubicación</span>
                <span></span>
                <span></span>
              </div>
              {paginated.map((o) => (
                <Link href={`/organizations/${o.slug}`} className="dir-row" key={o.id}>
                  <div className="dir-row-main">
                    <div className="dir-row-logo">
                      {o.logo_url ? <img src={o.logo_url} alt="" /> : <i className="ti ti-building"></i>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="dir-row-name">
                        {o.name}
                        {o.verified && (
                          <HoverTooltip label="Página verificada por la organización">
                            <i className="ti ti-circle-check-filled verified-tick"></i>
                          </HoverTooltip>
                        )}
                        {hasInterestGroupBadge(o) && (
                          <HoverTooltip
                            label={`Grupo de interés registrado${o.interest_group_registry_number ? ` · ${o.interest_group_registry_number}` : ''}`}
                          >
                            <i className="ti ti-shield-check" style={{ color: '#6d5aef' }}></i>
                          </HoverTooltip>
                        )}
                      </div>
                      {!o.verified && (
                        <div className="badge bgr" style={{ marginTop: 3 }}>
                          <i className="ti ti-clock" style={{ fontSize: 10 }}></i> No verificada
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="dir-row-meta">{TYPE_LABELS[o.org_type] || o.org_type || '—'}</div>
                  <div className="dir-row-size">{o.size_range ? `${o.size_range} emp.` : '—'}</div>
                  <div className="dir-row-loc">{o.location || '—'}</div>
                  <div className="dir-row-links" onClick={(e) => e.stopPropagation()}>
                    {o.website_url && (
                      <a href={o.website_url} target="_blank" rel="noreferrer" title="Sitio web">
                        <i className="ti ti-world"></i>
                      </a>
                    )}
                    {o.linkedin_url && (
                      <a href={o.linkedin_url} target="_blank" rel="noreferrer" title="LinkedIn">
                        <i className="ti ti-brand-linkedin"></i>
                      </a>
                    )}
                  </div>
                  <i className="ti ti-chevron-right dir-row-arrow"></i>
                </Link>
              ))}
            </div>
          )}

          {filtered.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                maxWidth: 1080,
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
