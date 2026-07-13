'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import ApplyModal from '@/components/ApplyModal';

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

export default function JobsPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState(null);
  const [selected, setSelected] = useState(null);
  const [userId, setUserId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());
  const [appliedIds, setAppliedIds] = useState(new Set());
  const [applyingJob, setApplyingJob] = useState(null);
  const [followedOrgIds, setFollowedOrgIds] = useState(new Set());
  const [followLoading, setFollowLoading] = useState(false);
  const [alertKeys, setAlertKeys] = useState(new Set());
  const [sharingJob, setSharingJob] = useState(null);

  const [filters, setFilters] = useState({ area: '', modality: '', location: '' });

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
  }, []);

  useEffect(() => {
    loadJobs();
  }, [filters]);

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
  }, [userId]);

  function alertKey(area, location) {
    return `${area}|||${location || ''}`;
  }

  async function toggleAlert(job) {
    if (!userId) return;
    const key = alertKey(job.area, job.location);
    if (alertKeys.has(key)) {
      await supabase
        .from('job_alerts')
        .delete()
        .eq('user_id', userId)
        .eq('area', job.area)
        .eq('location', job.location);
      setAlertKeys((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
      toast('Alerta desactivada');
    } else {
      const { error } = await supabase
        .from('job_alerts')
        .insert({ user_id: userId, area: job.area, location: job.location });
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
         description, is_featured, created_at,
         organizations ( id, name, logo_url, slug, org_type ),
         job_tags ( tag ),
         job_requirements ( content, sort_order ),
         job_responsibilities ( content, sort_order ),
         job_applications ( count )`
      )
      .eq('status', 'activa')
      .order('created_at', { ascending: false });

    if (filters.area) q = q.eq('area', filters.area);
    if (filters.modality) q = q.eq('modality', filters.modality);
    if (filters.location) q = q.ilike('location', `%${filters.location}%`);

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
    }
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
    const { error } = await supabase
      .from('job_applications')
      .delete()
      .eq('job_id', jobId)
      .eq('candidate_id', userId);
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

  function publicJobUrl(jobId) {
    return `${window.location.origin}/empleo/${jobId}`;
  }

  function buildCandidateShareTemplates(job) {
    const url = publicJobUrl(job.id);
    const orgName = job.organizations?.name || 'esta organización';
    const modLabel =
      job.modality === 'presencial' ? 'Presencial' : job.modality === 'hibrido' ? 'Híbrido' : 'Remoto';
    return {
      linkedin: `📢 Desde ${orgName} están buscando un/a ${job.title}, ¿te interesa?\n\n📍 ${job.location} · ${modLabel}\n\nSi conoces a alguien que pueda encajar (¡o te interesa a ti!), aquí tienes toda la información:\n${url}`,
      whatsapp: `¡Hola! 👋 Desde *${orgName}* están buscando un/a *${job.title}*, ¿te interesa? Aquí está la oferta: ${url}`,
    };
  }

  return (
    <div className="sec">
      <div className="filters">
        <select
          className="fsel"
          value={filters.area}
          onChange={(e) => setFilters({ ...filters, area: e.target.value })}
        >
          <option value="">Área</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          className="fsel"
          value={filters.modality}
          onChange={(e) => setFilters({ ...filters, modality: e.target.value })}
        >
          <option value="">Modalidad</option>
          <option value="presencial">Presencial</option>
          <option value="hibrido">Híbrido</option>
          <option value="remoto">Remoto</option>
        </select>
        <input
          className="fsel"
          placeholder="Ubicación"
          value={filters.location}
          onChange={(e) => setFilters({ ...filters, location: e.target.value })}
          style={{ minWidth: 160 }}
        />
      </div>

      {jobs === null ? (
        <div className="spinner"></div>
      ) : jobs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-briefcase-off"></i>
            Todavía no hay ofertas de empleo publicadas con estos filtros.
          </div>
        </div>
      ) : (
        <div className="jobs-wrap">
          <div className="jlist">
            {jobs.map((j) => (
              <div
                key={j.id}
                className={`ji ${selected?.id === j.id ? 'on' : ''}`}
                onClick={() => setSelected(j)}
              >
                <div className="jt">{j.title}</div>
                <div className="jo">{j.organizations?.name}</div>
                <div className="jm">
                  <span>
                    <i className="ti ti-map-pin" style={{ fontSize: 11 }}></i> {j.location}
                  </span>
                  <span>{timeAgo(j.created_at)}</span>
                  <span style={{ color: '#1d6f5c' }}>
                    {j.job_applications?.[0]?.count || 0} solicitudes
                  </span>
                </div>
                {j.is_featured && (
                  <div style={{ marginTop: 5 }}>
                    <span className="badge by">★ Destacado</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="jdetail">
            {selected && (
              <>
                <div className="jdh">
                  <Link
                    href={selected.organizations?.slug ? `/organizations/${selected.organizations.slug}` : '#'}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, textDecoration: 'none', color: 'inherit' }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: '#e8f4f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        overflow: 'hidden',
                      }}
                    >
                      {selected.organizations?.logo_url ? (
                        <img
                          src={selected.organizations.logo_url}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <i className="ti ti-building"></i>
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {selected.organizations?.name} <i className="ti ti-external-link" style={{ fontSize: 11, color: '#aaa' }}></i>
                      </div>
                      <div style={{ fontSize: 12, color: '#888' }}>{selected.location}</div>
                    </div>
                  </Link>
                  <h2>{selected.title}</h2>
                  <div
                    style={{
                      display: 'flex',
                      gap: 7,
                      flexWrap: 'wrap',
                      margin: '8px 0 10px',
                      fontSize: 12.5,
                      color: '#666',
                    }}
                  >
                    {selected.is_featured && <span className="badge by">★ Destacado</span>}
                    <span>{modalityLabel(selected.modality)}</span>
                    <span>{timeAgo(selected.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <button
                      className={appliedIds.has(selected.id) ? 'btn-o' : 'btn-p'}
                      onClick={() =>
                        appliedIds.has(selected.id) ? withdrawApplication(selected.id) : openApply(selected)
                      }
                    >
                      {appliedIds.has(selected.id) ? (
                        <>
                          <i className="ti ti-x"></i> Retirar solicitud
                        </>
                      ) : (
                        'Solicitud sencilla'
                      )}
                    </button>
                    <button className="btn-g" onClick={() => toggleSave(selected.id)}>
                      <i className="ti ti-bookmark"></i>{' '}
                      {savedIds.has(selected.id) ? 'Guardado' : 'Guardar en favoritos'}
                    </button>
                    <button className="btn-g" onClick={() => setSharingJob(selected)}>
                      <i className="ti ti-share"></i> Copiar y recomendar
                    </button>
                    <button className="btn-g" onClick={() => toggleAlert(selected)}>
                      <i className={`ti ${alertKeys.has(alertKey(selected.area, selected.location)) ? 'ti-bell-off' : 'ti-bell-plus'}`}></i>{' '}
                      {alertKeys.has(alertKey(selected.area, selected.location))
                        ? 'Alerta activada'
                        : 'Establecer una alerta para empleos similares'}
                    </button>
                  </div>
                </div>

                {selected.job_tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {selected.job_tags.map((t, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '5px 10px',
                          borderRadius: 6,
                          background: '#f4f4f0',
                          color: '#555',
                          fontSize: 12.5,
                        }}
                      >
                        <i className="ti ti-tag" style={{ fontSize: 12 }}></i>
                        {t.tag}
                      </div>
                    ))}
                  </div>
                )}

                <div className="jd-sec">Descripción</div>
                <div className="jd-txt">{selected.description}</div>

                {selected.job_responsibilities?.length > 0 && (
                  <>
                    <div className="jd-sec">Responsabilidades</div>
                    <div className="jd-txt">
                      <ul>
                        {sortByOrder(selected.job_responsibilities).map((r, i) => (
                          <li key={i}>{r.content}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {selected.job_requirements?.length > 0 && (
                  <>
                    <div className="jd-sec">Requisitos</div>
                    <div className="jd-txt">
                      <ul>
                        {sortByOrder(selected.job_requirements).map((r, i) => (
                          <li key={i}>{r.content}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {selected.organizations && (
                  <>
                    <div className="jd-sec">Empleo en {selected.organizations.name}</div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        border: '1px solid #e0dfd8',
                        borderRadius: 10,
                        padding: 14,
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
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
                          <img
                            src={selected.organizations.logo_url}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <i className="ti ti-building"></i>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <Link
                          href={selected.organizations.slug ? `/organizations/${selected.organizations.slug}` : '#'}
                          style={{ fontWeight: 600, fontSize: 14, color: '#222', textDecoration: 'none' }}
                        >
                          {selected.organizations.name}
                        </Link>
                        <div style={{ fontSize: 12, color: '#888' }}>{TYPE_LABELS[selected.organizations.org_type]}</div>
                      </div>
                      <button
                        className={followedOrgIds.has(selected.organizations.id) ? 'btn-o' : 'btn-p'}
                        style={{ fontSize: 12.5, padding: '7px 14px' }}
                        disabled={followLoading}
                        onClick={() => toggleFollowOrg(selected.organizations.id, selected.organizations.name)}
                      >
                        {followedOrgIds.has(selected.organizations.id) ? (
                          <>
                            <i className="ti ti-check"></i> Siguiendo
                          </>
                        ) : (
                          <>
                            <i className="ti ti-plus"></i> Seguir
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {applyingJob && (
        <ApplyModal
          job={applyingJob}
          onClose={() => setApplyingJob(null)}
          onSuccess={handleApplySuccess}
        />
      )}

      {sharingJob && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setSharingJob(null)}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <h2>
                <i className="ti ti-share" style={{ color: '#6d5aef' }}></i> Compartir "{sharingJob.title}"
              </h2>
              <div className="modal-x" onClick={() => setSharingJob(null)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: '#888', marginBottom: 16 }}>
              Comparte esta oferta con alguien a quien le pueda interesar — puede verla y aplicar sin tener cuenta
              todavía en GovTalent.
            </p>

            <div className="field">
              <label>Enlace público</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={publicJobUrl(sharingJob.id)} onClick={(e) => e.target.select()} />
                <button
                  type="button"
                  className="btn-o"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => {
                    navigator.clipboard?.writeText(publicJobUrl(sharingJob.id));
                    toast('Enlace copiado ✓');
                  }}
                >
                  <i className="ti ti-copy"></i> Copiar
                </button>
              </div>
            </div>

            {(() => {
              const t = buildCandidateShareTemplates(sharingJob);
              return (
                <>
                  <div style={{ background: '#f8faf9', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        <i className="ti ti-brand-linkedin" style={{ color: '#888' }}></i> LinkedIn
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn-g"
                          style={{ fontSize: 11.5, padding: '5px 9px' }}
                          onClick={() => {
                            navigator.clipboard?.writeText(t.linkedin);
                            toast('Texto copiado ✓ — pégalo al crear la publicación');
                          }}
                        >
                          Copiar texto
                        </button>
                        <a
                          className="btn-p"
                          style={{ fontSize: 11.5, padding: '5px 9px', textDecoration: 'none' }}
                          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicJobUrl(sharingJob.id))}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir LinkedIn
                        </a>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#666', whiteSpace: 'pre-wrap', maxHeight: 90, overflow: 'auto' }}>{t.linkedin}</div>
                    <p style={{ fontSize: 10.5, color: '#aaa', marginTop: 6 }}>
                      LinkedIn no permite prerrellenar el texto de la publicación — cópialo y pégalo tú al abrir el editor.
                    </p>
                  </div>

                  <div style={{ background: '#f8faf9', borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        <i className="ti ti-brand-whatsapp" style={{ color: '#888' }}></i> WhatsApp
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn-g"
                          style={{ fontSize: 11.5, padding: '5px 9px' }}
                          onClick={() => {
                            navigator.clipboard?.writeText(t.whatsapp);
                            toast('Mensaje copiado ✓');
                          }}
                        >
                          Copiar
                        </button>
                        <a
                          className="btn-p"
                          style={{ fontSize: 11.5, padding: '5px 9px', textDecoration: 'none' }}
                          href={`https://wa.me/?text=${encodeURIComponent(t.whatsapp)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Enviar
                        </a>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#666', whiteSpace: 'pre-wrap' }}>{t.whatsapp}</div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
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

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 3600) return `hace ${Math.max(1, Math.round(diff / 60))} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
  return `hace ${Math.round(diff / 86400)} días`;
}
