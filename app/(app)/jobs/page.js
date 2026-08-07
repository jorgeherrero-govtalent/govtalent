'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import ApplyModal from '@/components/ApplyModal';
import ShareJobModal from '@/components/ShareJobModal';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import HoverTooltip from '@/components/HoverTooltip';

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

const AREAS = [
  'Public Affairs',
  'Comunicación Política',
  'Relaciones Institucionales',
  'Asuntos Europeos',
  'Regulación',
  'Administración Pública',
];

const MODALITY_OPTIONS = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'hibrido', label: 'Híbrido' },
  { value: 'remoto', label: 'Remoto' },
];

const SECTIONS = [
  { id: 'sec-descripcion', label: 'Descripción' },
  { id: 'sec-responsabilidades', label: 'Responsabilidades' },
  { id: 'sec-requisitos', label: 'Requisitos' },
  { id: 'sec-empresa', label: 'Empresa' },
];

export default function JobsPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState(null);
  const [totalActiveCount, setTotalActiveCount] = useState(null);
  const [selected, setSelected] = useState(null);
  const [userId, setUserId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());
  const [appliedIds, setAppliedIds] = useState(new Set());
  const [applyingJob, setApplyingJob] = useState(null);
  const [followedOrgIds, setFollowedOrgIds] = useState(new Set());
  const [followLoading, setFollowLoading] = useState(false);
  const [alertKeys, setAlertKeys] = useState(new Set());
  const [sharingJob, setSharingJob] = useState(null);
  const [showCvBanner, setShowCvBanner] = useState(false);
  const detailRef = useRef(null);
  const viewedRef = useRef(new Set());

  const [areaFilter, setAreaFilter] = useState(new Set());
  const [modalityFilter, setModalityFilter] = useState(new Set());
  const [location, setLocation] = useState('');

  function selectJob(job) {
    setSelected(job);
    // Al cambiar de oferta, el panel de detalle vuelve arriba del todo — muy
    // largo si no, sobre todo con descripciones extensas.
    detailRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
    if (typeof window !== 'undefined' && window.innerWidth <= 720) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      supabase
        .from('organization_follows')
        .select('organization_id')
        .eq('user_id', data.user.id)
        .then(({ data: follows }) => setFollowedOrgIds(new Set((follows || []).map((f) => f.organization_id))));
    });
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'activa')
      .then(({ count }) => setTotalActiveCount(count || 0));
  }, []);

  useEffect(() => {
    loadJobs();
  }, [areaFilter, modalityFilter, location]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('saved_jobs')
      .select('job_id')
      .eq('user_id', userId)
      .then(({ data }) => data && setSavedIds(new Set(data.map((r) => r.job_id))));
    supabase
      .from('job_applications')
      .select('job_id')
      .eq('candidate_id', userId)
      .then(({ data }) => data && setAppliedIds(new Set(data.map((r) => r.job_id))));
    supabase
      .from('job_alerts')
      .select('area, location')
      .eq('user_id', userId)
      .then(({ data }) => data && setAlertKeys(new Set(data.map((r) => alertKey(r.area, r.location)))));
    checkProfileCompletion();
  }, [userId]);

  // Contador real de visitas: se cuenta una vez por oferta y por sesión de
  // navegador (viewedRef), no en cada re-render.
  useEffect(() => {
    if (!selected?.id || viewedRef.current.has(selected.id)) return;
    viewedRef.current.add(selected.id);
    const jobId = selected.id;
    supabase.rpc('increment_job_views', { p_job_id: jobId }).then(() => {
      setSelected((s) => (s && s.id === jobId ? { ...s, views_count: (s.views_count || 0) + 1 } : s));
    });
  }, [selected?.id]);

  async function checkProfileCompletion() {
    if (typeof window !== 'undefined' && sessionStorage.getItem('gt_cv_banner_dismissed') === '1') return;

    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return;

    const [{ data: user }, { data: profile }, { data: exp }, { data: edu }, { data: skills }] = await Promise.all([
      supabase.from('users').select('avatar_url, professional_title').eq('id', uid).single(),
      supabase.from('candidate_profiles').select('cover_url, cv_url, bio, website_url, linkedin_url').eq('user_id', uid).single(),
      supabase.from('experiences').select('id').eq('user_id', uid).limit(1),
      supabase.from('education').select('id').eq('user_id', uid).limit(1),
      supabase.from('skills').select('id').eq('user_id', uid).limit(1),
    ]);

    const items = [
      !!user?.avatar_url,
      !!profile?.cover_url,
      !!profile?.cv_url,
      !!profile?.bio,
      !!user?.professional_title,
      !!(profile?.website_url || profile?.linkedin_url),
      (exp || []).length > 0,
      (edu || []).length > 0,
      (skills || []).length > 0,
    ];
    const pct = Math.round((items.filter(Boolean).length / items.length) * 100);
    if (pct < 100) setShowCvBanner(true);
  }

  function dismissCvBanner() {
    setShowCvBanner(false);
    if (typeof window !== 'undefined') sessionStorage.setItem('gt_cv_banner_dismissed', '1');
  }

  function alertKey(area, loc) {
    return `${area}|||${loc || ''}`;
  }

  async function toggleAlert(job) {
    if (!userId) return;
    const key = alertKey(job.area, job.location);
    if (alertKeys.has(key)) {
      await supabase.from('job_alerts').delete().eq('user_id', userId).eq('area', job.area).eq('location', job.location);
      setAlertKeys((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
      toast('Alerta desactivada');
    } else {
      const { error } = await supabase.from('job_alerts').insert({ user_id: userId, area: job.area, location: job.location });
      if (error) {
        toast('No se pudo crear la alerta');
        return;
      }
      setAlertKeys((prev) => new Set(prev).add(key));
      toast(`Alerta activada para "${job.area}" en ${job.location} ✓`);
    }
  }

  async function toggleFollowOrg(orgId, orgName) {
    if (!userId) {
      toast('Inicia sesión para seguir organizaciones');
      return;
    }
    setFollowLoading(true);
    const isFollowing = followedOrgIds.has(orgId);
    if (isFollowing) {
      await supabase.from('organization_follows').delete().eq('user_id', userId).eq('organization_id', orgId);
      setFollowedOrgIds((prev) => {
        const n = new Set(prev);
        n.delete(orgId);
        return n;
      });
      toast(`Has dejado de seguir a ${orgName}`);
    } else {
      await supabase.from('organization_follows').insert({ user_id: userId, organization_id: orgId });
      setFollowedOrgIds((prev) => new Set(prev).add(orgId));
      toast(`Ahora sigues a ${orgName}`);
    }
    setFollowLoading(false);
  }

  async function loadJobs() {
    let q = supabase
      .from('jobs')
      .select(
        `id, title, area, location, modality, employment_type, salary_min, salary_max,
         description, is_featured, created_at, views_count, application_mode, external_apply_url,
         organizations ( id, name, logo_url, slug, org_type, verified ),
         job_tags ( tag ),
         job_requirements ( content, sort_order ),
         job_responsibilities ( content, sort_order )`
      )
      .eq('status', 'activa')
      .order('created_at', { ascending: false });

    if (areaFilter.size > 0) q = q.in('area', [...areaFilter]);
    if (modalityFilter.size > 0) q = q.in('modality', [...modalityFilter]);
    if (location) q = q.ilike('location', `%${location}%`);

    const { data, error } = await q;
    if (error) {
      console.error('Error cargando empleos:', error);
      setJobs([]);
      return;
    }
    setJobs(data || []);
    if (data && data.length > 0) {
      const jobIdParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('job') : null;
      const fromParam = jobIdParam ? data.find((j) => j.id === jobIdParam) : null;
      setSelected((s) => s || fromParam || data[0]);
    } else {
      setSelected(null);
    }
  }

  function clearFilters() {
    setAreaFilter(new Set());
    setModalityFilter(new Set());
    setLocation('');
  }

  async function toggleSave(jobId) {
    if (!userId) return;
    if (savedIds.has(jobId)) {
      await supabase.from('saved_jobs').delete().eq('user_id', userId).eq('job_id', jobId);
      setSavedIds((prev) => {
        const n = new Set(prev);
        n.delete(jobId);
        return n;
      });
      toast('Eliminado de guardados');
    } else {
      await supabase.from('saved_jobs').insert({ user_id: userId, job_id: jobId });
      setSavedIds((prev) => new Set(prev).add(jobId));
      toast('Guardado en favoritos');
    }
  }

  function openApply(job) {
    if (!userId) return;
    setApplyingJob(job);
  }

  function handleApplySuccess() {
    setAppliedIds((prev) => new Set(prev).add(applyingJob.id));
    setApplyingJob(null);
  }

  async function withdrawApplication(jobId) {
    if (!userId) return;
    const confirmed = window.confirm('¿Seguro que quieres retirar tu solicitud a esta oferta?');
    if (!confirmed) return;
    const { error } = await supabase.from('job_applications').delete().eq('job_id', jobId).eq('candidate_id', userId);
    if (error) {
      toast('No se pudo retirar la solicitud');
      return;
    }
    setAppliedIds((prev) => {
      const n = new Set(prev);
      n.delete(jobId);
      return n;
    });
    toast('Solicitud retirada');
  }

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function isApplied(job) {
    return appliedIds.has(job.id);
  }

  const activeFiltersCount = areaFilter.size + modalityFilter.size + (location ? 1 : 0);

  return (
    <div className="sec">
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Empleos</h1>
        <p style={{ fontSize: 12.5, color: '#888', margin: '3px 0 0' }}>
          {totalActiveCount !== null ? `${totalActiveCount} oportunidades activas · ` : ''}
          Encuentra oportunidades especializadas en asuntos públicos.
        </p>
      </div>

      {showCvBanner && (
        <div
          style={{
            background: '#eeecfd',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <i className="ti ti-file-upload" style={{ color: '#6d5aef', fontSize: 17, flexShrink: 0 }}></i>
          <div style={{ flex: 1, fontSize: 12.5 }}>
            <span style={{ color: '#3c3489', fontWeight: 600 }}>Sube tu CV y completa tu perfil</span>
            <span style={{ color: '#534ab7' }}> — así las organizaciones te encuentran antes.</span>
          </div>
          <Link href="/profile" style={{ fontSize: 12, color: '#6d5aef', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Completar →
          </Link>
          <i
            className="ti ti-x"
            onClick={dismissCvBanner}
            style={{ color: '#8b83d9', fontSize: 14, cursor: 'pointer', flexShrink: 0 }}
            aria-label="Cerrar aviso"
          ></i>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <MultiSelectFilter label="Área" values={AREAS.map((a) => ({ value: a, label: a }))} selected={areaFilter} onApply={setAreaFilter} />
        <MultiSelectFilter label="Modalidad" values={MODALITY_OPTIONS} selected={modalityFilter} onApply={setModalityFilter} />
        <input
          placeholder="Ubicación"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={{
            background: '#faf9f5',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '8px 14px',
            fontSize: 12.5,
            color: '#333',
            minWidth: 150,
          }}
        />
        {activeFiltersCount > 0 && (
          <button
            onClick={clearFilters}
            style={{ background: 'none', border: 'none', fontSize: 12, color: '#999', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <i className="ti ti-x" style={{ fontSize: 12 }}></i> Limpiar filtros
          </button>
        )}
      </div>

      {jobs === null ? (
        <div className="jobs-wrap">
          <div className="jlist">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ padding: '13px 14px', borderBottom: '.5px solid #f0f0eb' }}>
                <div className="skel" style={{ height: 14, width: '80%', marginBottom: 8 }}></div>
                <div className="skel" style={{ height: 12, width: '55%' }}></div>
              </div>
            ))}
          </div>
          <div className="jdetail">
            <div className="skel" style={{ height: 44, width: 44, borderRadius: 8, marginBottom: 14 }}></div>
            <div className="skel" style={{ height: 22, width: '60%', marginBottom: 10 }}></div>
            <div className="skel" style={{ height: 14, width: '40%', marginBottom: 20 }}></div>
            <div className="skel" style={{ height: 38, width: 160, marginBottom: 20 }}></div>
            <div className="skel" style={{ height: 80, width: '100%', marginBottom: 10 }}></div>
            <div className="skel" style={{ height: 80, width: '100%' }}></div>
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-briefcase-off"></i>
            No hemos encontrado empleos con estos filtros.
            {activeFiltersCount > 0 && (
              <div style={{ marginTop: 10 }}>
                <button className="btn-o" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="jobs-wrap">
          <div className="jlist">
            {jobs.map((j) => {
              const isNew = (Date.now() - new Date(j.created_at).getTime()) / (1000 * 60 * 60 * 24) < 3;
              const isApplied = appliedIds.has(j.id);
              return (
                <div key={j.id} className={`ji ${selected?.id === j.id ? 'on' : ''}`} onClick={() => selectJob(j)}>
                  <div className="jt">{j.title}</div>
                  <div className="jo">{j.organizations?.name}</div>
                  <div className="jm">
                    <span>
                      <i className="ti ti-map-pin" style={{ fontSize: 11 }}></i> {j.location}
                    </span>
                    <span>{timeAgo(j.created_at)}</span>
                  </div>
                  {(isNew || isApplied) && (
                    <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                      {isNew && <span style={{ fontSize: 10, fontWeight: 600, color: '#777', background: '#f0efe9', padding: '2px 8px', borderRadius: 10 }}>Nuevo</span>}
                      {isApplied && <span style={{ fontSize: 10, fontWeight: 600, color: '#777', background: '#f0efe9', padding: '2px 8px', borderRadius: 10 }}>Aplicado</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="jdetail" ref={detailRef}>
            {selected && (
              <>
                <div className="jdh">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <Link href={selected.organizations?.slug ? `/organizations/${selected.organizations.slug}` : '#'} style={{ flexShrink: 0 }}>
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 10,
                          background: '#e8f4f0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                          overflow: 'hidden',
                        }}
                      >
                        {selected.organizations?.logo_url ? (
                          <img src={selected.organizations.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <i className="ti ti-building"></i>
                        )}
                      </div>
                    </Link>
                    <div>
                      <h2 style={{ margin: 0 }}>{selected.title}</h2>
                      <div style={{ fontSize: 13, color: '#666', marginTop: 5 }}>
                        {selected.organizations?.name} · {selected.location}
                      </div>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 3 }}>
                        {modalityLabel(selected.modality)} · Publicado {timeAgo(selected.created_at)}
                      </div>
                      {selected.views_count >= 3 && (
                        <div style={{ fontSize: 12, color: '#888', marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <i className="ti ti-eye" style={{ fontSize: 13 }}></i>
                          {selected.views_count} personas han visto esta oferta
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    {selected.application_mode === 'externa' ? (
                      <a
                        href={`/api/jobs/${selected.id}/go`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ai"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        Aplicar en la web de la organización <i className="ti ti-external-link"></i>
                      </a>
                    ) : isApplied(selected) ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: '#f0efe9',
                          color: '#666',
                          fontWeight: 600,
                          fontSize: 13,
                          padding: '11px 20px',
                          borderRadius: 8,
                        }}
                      >
                        <i className="ti ti-check"></i> Solicitud enviada
                      </span>
                    ) : (
                      <button className="btn-ai" onClick={() => openApply(selected)}>
                        Solicitar empleo
                      </button>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="icon-circle-btn"
                        title={savedIds.has(selected.id) ? 'Guardado' : 'Guardar'}
                        aria-label="Guardar oferta"
                        onClick={() => toggleSave(selected.id)}
                      >
                        <i className={`ti ${savedIds.has(selected.id) ? 'ti-bookmark-filled' : 'ti-bookmark'}`}></i>
                      </button>
                      <button className="icon-circle-btn" title="Compartir" aria-label="Compartir oferta" onClick={() => setSharingJob(selected)}>
                        <i className="ti ti-share"></i>
                      </button>
                      <button
                        className="icon-circle-btn"
                        title={alertKeys.has(alertKey(selected.area, selected.location)) ? 'Alerta activada' : 'Avisarme de ofertas similares'}
                        aria-label="Activar alerta para ofertas similares"
                        onClick={() => toggleAlert(selected)}
                      >
                        <i className={`ti ${alertKeys.has(alertKey(selected.area, selected.location)) ? 'ti-bell-filled' : 'ti-bell'}`}></i>
                      </button>
                    </div>
                  </div>

                  {isApplied(selected) && selected.application_mode !== 'externa' && (
                    <button
                      className="btn-o"
                      style={{ fontSize: 12, marginTop: -6, marginBottom: 14 }}
                      onClick={() => withdrawApplication(selected.id)}
                    >
                      Retirar solicitud
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 18,
                    margin: '0 0 20px',
                    paddingTop: 16,
                    borderTop: '.5px solid #eee',
                    fontSize: 12.5,
                    color: '#555',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    <i className="ti ti-map-pin" style={{ color: '#999', marginRight: 4 }}></i>
                    {selected.location}
                  </span>
                  <span>
                    <i className="ti ti-building-skyscraper" style={{ color: '#999', marginRight: 4 }}></i>
                    {modalityLabel(selected.modality)}
                  </span>
                  <span>
                    <i className="ti ti-clock" style={{ color: '#999', marginRight: 4 }}></i>
                    Jornada {employmentLabel(selected.employment_type).toLowerCase()}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #eee', marginBottom: 18, overflowX: 'auto' }}>
                  {SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => scrollToSection(s.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: 12,
                        color: '#999',
                        paddingBottom: 8,
                        borderBottom: '2px solid transparent',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {selected.job_tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
                    {selected.job_tags.slice(0, 4).map((t, i) => (
                      <span key={i} style={{ fontSize: 11, background: '#f4f4f0', color: '#555', padding: '4px 10px', borderRadius: 14 }}>
                        {t.tag}
                      </span>
                    ))}
                  </div>
                )}

                <div id="sec-descripcion" className="jd-sec">Descripción</div>
                <div className="jd-txt" style={{ lineHeight: 1.7, marginBottom: 24 }}>{selected.description}</div>

                {selected.job_responsibilities?.length > 0 && (
                  <>
                    <div id="sec-responsabilidades" className="jd-sec">Responsabilidades</div>
                    <div className="jd-txt" style={{ lineHeight: 1.7, marginBottom: 24 }}>
                      <ul>
                        {sortByOrder(selected.job_responsibilities).map((r, i) => (
                          <li key={i} style={{ marginBottom: 6 }}>{r.content}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {selected.job_requirements?.length > 0 && (
                  <>
                    <div id="sec-requisitos" className="jd-sec">Requisitos</div>
                    <div className="jd-txt" style={{ lineHeight: 1.7, marginBottom: 24 }}>
                      <ul>
                        {sortByOrder(selected.job_requirements).map((r, i) => (
                          <li key={i} style={{ marginBottom: 6 }}>{r.content}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {selected.organizations && (
                  <div id="sec-empresa">
                    <div className="jd-sec">Empresa</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '.5px solid #eee', borderRadius: 12, padding: 16 }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 10,
                          background: '#e8f4f0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}
                      >
                        {selected.organizations.logo_url ? (
                          <img src={selected.organizations.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <i className="ti ti-building"></i>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Link
                            href={selected.organizations.slug ? `/organizations/${selected.organizations.slug}` : '#'}
                            style={{ fontWeight: 700, fontSize: 14, color: '#222', textDecoration: 'none' }}
                          >
                            {selected.organizations.name}
                          </Link>
                          {selected.organizations.verified && (
                            <HoverTooltip label="Página verificada por la organización">
                              <i className="ti ti-circle-check-filled" style={{ color: '#2563eb', fontSize: 14 }}></i>
                            </HoverTooltip>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#888' }}>{TYPE_LABELS[selected.organizations.org_type]}</div>
                      </div>
                      <button
                        className="btn-o"
                        style={{ fontSize: 12, padding: '7px 14px' }}
                        disabled={followLoading}
                        onClick={() => toggleFollowOrg(selected.organizations.id, selected.organizations.name)}
                      >
                        {followedOrgIds.has(selected.organizations.id) ? (
                          <>
                            <i className="ti ti-check"></i> Siguiendo
                          </>
                        ) : (
                          'Seguir'
                        )}
                      </button>
                      <Link
                        href={selected.organizations.slug ? `/organizations/${selected.organizations.slug}` : '#'}
                        className="btn-p"
                        style={{ fontSize: 12, padding: '7px 14px', textDecoration: 'none' }}
                      >
                        Ver perfil
                      </Link>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {applyingJob && <ApplyModal job={applyingJob} onClose={() => setApplyingJob(null)} onSuccess={handleApplySuccess} />}

      {sharingJob && (
        <ShareJobModal job={sharingJob} orgName={sharingJob.organizations?.name} voice="recommend" onClose={() => setSharingJob(null)} />
      )}
    </div>
  );
}

function sortByOrder(arr) {
  return [...arr].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function modalityLabel(m) {
  return { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' }[m] || m;
}

function employmentLabel(e) {
  return { jornada_completa: 'Completa', media_jornada: 'Media jornada', practicas: 'Prácticas', freelance: 'Freelance' }[e] || '—';
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 3600) return `hace ${Math.max(1, Math.round(diff / 60))} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
  return `hace ${Math.round(diff / 86400)} días`;
}
