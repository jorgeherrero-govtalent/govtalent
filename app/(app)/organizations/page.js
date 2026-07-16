'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const TYPE_LABELS = {
  empresa: 'Empresa',
  consultora_public_affairs: 'Consultora',
  tercer_sector_ong: 'ONG / Tercer sector',
  partido_politico: 'Partido político',
  institucion_publica: 'Institución pública',
  think_tank_fundacion: 'Think tank',
  medios_comunicacion: 'Medios',
  universidad_centro_educativo: 'Centro educativo',
  asociacion_profesional: 'Asociación profesional',
  otro: 'Otro',
};

const SORTS = {
  recientes: { label: 'Más recientes', fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
  az: { label: 'Nombre A-Z', fn: (a, b) => a.name.localeCompare(b.name) },
  tamano: { label: 'Nº de empleados', fn: (a, b) => sizeRank(b.size_range) - sizeRank(a.size_range) },
};

function sizeRank(r) {
  return { '1-10': 1, '11-50': 2, '50-200': 3, '200-1000': 4, '+1000': 5 }[r] || 0;
}

export default function OrganizationsDirectory() {
  const supabase = createClient();
  const [orgs, setOrgs] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('recientes');
  const [onlyPending, setOnlyPending] = useState(false);
  const [view, setView] = useState('grid');

  useEffect(() => {
    const saved = localStorage.getItem('gt_dir_view');
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem('gt_dir_view', view);
  }, [view]);

  useEffect(() => {
    load();
  }, [type]);

  async function load() {
    let q = supabase.from('organizations').select('*').order('created_at', { ascending: false });
    if (type) q = q.eq('org_type', type);
    const { data } = await q;
    setOrgs(data || []);
  }

  const filtered = useMemo(() => {
    if (!orgs) return [];
    let list = orgs.filter((o) => o.name.toLowerCase().includes(name.toLowerCase()));
    if (onlyPending) list = list.filter((o) => !o.verified);
    return [...list].sort((a, b) => (b.verified === a.verified ? SORTS[sort].fn(a, b) : b.verified - a.verified));
  }, [orgs, name, onlyPending, sort]);

  const pendingCount = orgs?.filter((o) => !o.verified).length || 0;

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
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div className="form-g" style={{ marginBottom: 0 }}>
              <label>Nombre</label>
              <input
                placeholder="Nombre de la organización"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-g" style={{ marginBottom: 0 }}>
              <label>Tipo de organización</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Todos los tipos</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {orgs === null ? (
        <div className="spinner"></div>
      ) : (
        <>
          <div className="dir-toolbar">
            <div className="dir-count">
              <b>{filtered.length}</b> organización{filtered.length === 1 ? '' : 'es'}
            </div>
            <div className="dir-chips">
              <label className="dir-chip">
                <i className="ti ti-arrows-sort"></i>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {Object.entries(SORTS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              {pendingCount > 0 && (
                <button
                  type="button"
                  className={`dir-chip ${onlyPending ? 'on' : ''}`}
                  onClick={() => setOnlyPending((v) => !v)}
                >
                  <i className="ti ti-clock"></i> No verificadas ({pendingCount})
                </button>
              )}
              <button
                type="button"
                className="dir-chip premium"
                onClick={() => toast('Filtros avanzados — disponible próximamente en GovTalent Premium')}
              >
                <i className="ti ti-adjustments"></i> Filtros avanzados <span className="premium-tag">PRO</span>
              </button>
              <button
                type="button"
                className="dir-chip premium"
                onClick={() => toast('Exportar datos — disponible próximamente en GovTalent Premium')}
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
              {filtered.map((o) => (
                <Link href={`/organizations/${o.slug}`} className="dir-card" key={o.id}>
                  <div className="dir-card-top">
                    <div className="dir-logo">
                      {o.logo_url ? <img src={o.logo_url} alt="" /> : <i className="ti ti-building"></i>}
                    </div>
                    <div>
                      <div className="dir-name">
                        {o.name}{' '}
                        {o.verified && (
                          <span className="tt">
                            <i className="ti ti-circle-check-filled verified-tick"></i>
                            <span className="tt-bubble">Página verificada por la organización</span>
                          </span>
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
                    <div className="dir-tag">
                      <i className="ti ti-briefcase"></i> {TYPE_LABELS[o.org_type]}
                    </div>
                    {o.sector && <div className="dir-tag">{o.sector}</div>}
                  </div>
                  <button className="dir-btn">Ver página</button>
                </Link>
              ))}
            </div>
          ) : (
            <div className="dir-list">
              <div className="dir-list-head">
                <span>Organización</span>
                <span>Ubicación</span>
                <span>Tipo / Sector</span>
                <span>Empleados</span>
                <span></span>
                <span></span>
              </div>
              {filtered.map((o) => (
                <Link href={`/organizations/${o.slug}`} className="dir-row" key={o.id}>
                  <div className="dir-row-main">
                    <div className="dir-row-logo">
                      {o.logo_url ? <img src={o.logo_url} alt="" /> : <i className="ti ti-building"></i>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="dir-row-name">
                        {o.name}
                        {o.verified && (
                          <span className="tt">
                            <i className="ti ti-circle-check-filled verified-tick"></i>
                            <span className="tt-bubble">Página verificada por la organización</span>
                          </span>
                        )}
                      </div>
                      {!o.verified && (
                        <div className="badge bgr" style={{ marginTop: 3 }}>
                          <i className="ti ti-clock" style={{ fontSize: 10 }}></i> No verificada
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="dir-row-loc">{o.location || '—'}</div>
                  <div className="dir-row-meta">
                    {TYPE_LABELS[o.org_type]}
                    {o.sector ? ` · ${o.sector}` : ''}
                  </div>
                  <div className="dir-row-size">{o.size_range ? `${o.size_range} emp.` : '—'}</div>
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
        </>
      )}
    </div>
  );
}
