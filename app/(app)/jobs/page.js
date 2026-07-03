'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import ApplyModal from '@/components/ApplyModal';

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
  const [alertKeys, setAlertKeys] = useState(new Set());

  const [filters, setFilters] = useState({ area: '', modality: '', location: '' });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => data.user && setUserId(data.user.id));
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

  async function loadJobs() {
    let q = supabase
      .from('jobs')
      .select(
        `id, title, area, location, modality, employment_type, salary_min, salary_max,
         description, is_featured, created_at,
         organizations ( id, name, logo_url ),
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
    if (data && data.length > 0) setSelected((s) => s || data[0]);
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

  function copyLink(jobId) {
    navigator.clipboard?.writeText(`${window.location.origin}/jobs?id=${jobId}`);
    toast('Enlace copiado, ¡recomiéndalo!');
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
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
                        {selected.organizations?.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#888' }}>{selected.location}</div>
                    </div>
                  </div>
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
                    <button className="btn-g" onClick={() => copyLink(selected.id)}>
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
