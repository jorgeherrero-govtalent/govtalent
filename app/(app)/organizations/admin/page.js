'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const AREAS = [
  'Public Affairs',
  'Comunicación Política',
  'Relaciones Institucionales',
  'Asuntos Europeos',
  'Regulación',
];

const APPLICATION_STATUS_LABELS = {
  enviada: 'Enviada',
  en_revision: 'En revisión',
  entrevista: 'Entrevista',
  oferta: 'Oferta',
  rechazada: 'Rechazada',
  retirada: 'Retirada',
};

export default function OrganizationAdminPage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [expandedJob, setExpandedJob] = useState(null);
  const [applications, setApplications] = useState({});
  const [showEdit, setShowEdit] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return;

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', uid)
      .maybeSingle();

    if (!membership) return;
    setOrg(membership.organizations);
    loadJobs(membership.organizations.id);
  }

  async function loadJobs(orgId) {
    const { data } = await supabase
      .from('jobs')
      .select('id, title, location, status, is_featured, created_at, job_applications(count)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    setJobs(data || []);
  }

  async function toggleApplications(jobId) {
    if (expandedJob === jobId) {
      setExpandedJob(null);
      return;
    }
    setExpandedJob(jobId);
    if (!applications[jobId]) {
      const { data } = await supabase
        .from('job_applications')
        .select('id, status, applied_at, users(first_name, last_name, professional_title, email)')
        .eq('job_id', jobId)
        .order('applied_at', { ascending: false });
      setApplications((prev) => ({ ...prev, [jobId]: data || [] }));
    }
  }

  async function updateStatus(appId, jobId, status) {
    await supabase.from('job_applications').update({ status }).eq('id', appId);
    setApplications((prev) => ({
      ...prev,
      [jobId]: prev[jobId].map((a) => (a.id === appId ? { ...a, status } : a)),
    }));
  }

  async function publishJob(e) {
    e.preventDefault();
    setPosting(true);
    const f = new FormData(e.target);

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        organization_id: org.id,
        title: f.get('title'),
        area: f.get('area'),
        location: f.get('location'),
        modality: f.get('modality'),
        employment_type: f.get('employment_type'),
        salary_min: f.get('salary_min') ? Number(f.get('salary_min')) : null,
        salary_max: f.get('salary_max') ? Number(f.get('salary_max')) : null,
        description: f.get('description'),
        status: 'activa',
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !job) {
      setPosting(false);
      toast('No se pudo publicar la oferta');
      return;
    }

    const reqLines = (f.get('requirements') || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const resLines = (f.get('responsibilities') || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const tags = (f.get('tags') || '').split(',').map((s) => s.trim()).filter(Boolean);

    if (reqLines.length > 0) {
      await supabase
        .from('job_requirements')
        .insert(reqLines.map((content, i) => ({ job_id: job.id, content, sort_order: i })));
    }
    if (resLines.length > 0) {
      await supabase
        .from('job_responsibilities')
        .insert(resLines.map((content, i) => ({ job_id: job.id, content, sort_order: i })));
    }
    if (tags.length > 0) {
      await supabase.from('job_tags').insert(tags.map((tag) => ({ job_id: job.id, tag })));
    }

    setPosting(false);
    e.target.reset();
    toast('Oferta publicada correctamente ✓');
    loadJobs(org.id);
  }

  async function saveOrgEdit(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const updates = {
      name: f.get('name'),
      website_url: f.get('website_url') || null,
      linkedin_url: f.get('linkedin_url') || null,
      sector: f.get('sector') || null,
      size_range: f.get('size_range') || null,
      location: f.get('location') || null,
      founded_year: f.get('founded_year') ? Number(f.get('founded_year')) : null,
      bio: f.get('bio') || null,
    };
    await supabase.from('organizations').update(updates).eq('id', org.id);
    setOrg({ ...org, ...updates });
    setShowEdit(false);
    toast('Página de organización actualizada ✓ (visible para ti y para los candidatos)');
  }

  if (org === null) {
    return (
      <div className="sec">
        <div className="empty-state">
          <i className="ti ti-building-off"></i>
          Todavía no administras ninguna organización.{' '}
          <a href="/organizations/new" style={{ color: '#1d6f5c' }}>
            Crea tu página aquí
          </a>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="sec">
      <div className="card" style={{ maxWidth: 1080, margin: '0 auto 13px' }}>
        <div className="co-cover">
          <div className="co-logo">{org.logo_url ? <img src={org.logo_url} alt="" /> : '🏛️'}</div>
          <div style={{ position: 'absolute', top: 11, right: 11 }}>
            <button className="btn-g" onClick={() => setShowEdit(true)}>
              <i className="ti ti-edit"></i> Editar
            </button>
          </div>
        </div>
        <div className="co-info">
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>{org.name}</div>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>{org.bio || org.sector || 'Añade una descripción'}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: '#888' }}>
            {org.location && (
              <span>
                <i className="ti ti-map-pin" style={{ fontSize: 12 }}></i> {org.location}
              </span>
            )}
            {org.size_range && (
              <span>
                <i className="ti ti-users" style={{ fontSize: 12 }}></i> {org.size_range} empleados
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 13, maxWidth: 1080, margin: '0 auto' }}>
        <div className="card">
          <div className="cp">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 13 }}>Publicar oferta de empleo</div>
            <form onSubmit={publishJob} style={{ background: '#f8faf9', borderRadius: 10, padding: 15 }}>
              <div className="form-row">
                <div className="form-g">
                  <label>Título del puesto</label>
                  <input name="title" required placeholder="Ej: Senior Public Affairs Manager" />
                </div>
                <div className="form-g">
                  <label>Área</label>
                  <select name="area" required>
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-g">
                  <label>Ubicación</label>
                  <input name="location" required placeholder="Madrid, España" />
                </div>
                <div className="form-g">
                  <label>Modalidad</label>
                  <select name="modality" required>
                    <option value="presencial">Presencial</option>
                    <option value="hibrido">Híbrido</option>
                    <option value="remoto">Remoto</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-g">
                  <label>Tipo de jornada</label>
                  <select name="employment_type" required>
                    <option value="jornada_completa">Jornada completa</option>
                    <option value="media_jornada">Media jornada</option>
                    <option value="practicas">Prácticas</option>
                    <option value="freelance">Freelance</option>
                  </select>
                </div>
                <div className="form-g">
                  <label>Rango salarial (opcional)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input name="salary_min" type="number" placeholder="35000" />
                    <input name="salary_max" type="number" placeholder="45000" />
                  </div>
                </div>
              </div>
              <div className="form-g">
                <label>Descripción</label>
                <textarea name="description" required placeholder="Describe las responsabilidades, requisitos y condiciones..."></textarea>
              </div>
              <div className="form-g">
                <label>Responsabilidades (una por línea)</label>
                <textarea name="responsibilities" placeholder={'Liderar la estrategia...\nRepresentar a la empresa...'}></textarea>
              </div>
              <div className="form-g">
                <label>Requisitos (uno por línea)</label>
                <textarea name="requirements" placeholder={'5+ años de experiencia...\nInglés fluido...'}></textarea>
              </div>
              <div className="form-g">
                <label>Etiquetas (separadas por comas)</label>
                <input name="tags" placeholder="Public Affairs, Regulación, Liderazgo" />
              </div>
              <button className="btn-p" style={{ width: '100%' }} disabled={posting}>
                <i className="ti ti-send"></i> {posting ? 'Publicando...' : 'Publicar oferta'}
              </button>
            </form>
          </div>
        </div>

        <div>
          <div className="sw">
            <h4>Ofertas activas</h4>
            {jobs.length === 0 && <div style={{ fontSize: 12.5, color: '#999' }}>Aún no has publicado ofertas.</div>}
            {jobs.map((j) => (
              <div key={j.id} style={{ marginBottom: 10 }}>
                <div
                  className="ji on"
                  style={{ borderLeft: '3px solid #1d6f5c', borderRadius: 8, cursor: 'pointer' }}
                  onClick={() => toggleApplications(j.id)}
                >
                  <div className="jt">{j.title}</div>
                  <div className="jo">
                    {org.name} · {j.location}
                  </div>
                  <div className="jm">
                    <span style={{ color: '#1d6f5c' }}>{j.job_applications?.[0]?.count || 0} solicitudes</span>
                    <span>·</span>
                    <span className="badge bg" style={{ fontSize: 10 }}>
                      {j.status}
                    </span>
                  </div>
                </div>
                {expandedJob === j.id && (
                  <div style={{ padding: '8px 6px' }}>
                    {(applications[j.id] || []).length === 0 && (
                      <div style={{ fontSize: 12, color: '#999' }}>Sin solicitudes todavía.</div>
                    )}
                    {(applications[j.id] || []).map((a) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '.5px solid #f0f0eb' }}>
                        <div className="sp-av">{a.users?.first_name?.[0]}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                            {a.users?.first_name} {a.users?.last_name}
                          </div>
                          <div style={{ fontSize: 11, color: '#888' }}>{a.users?.professional_title}</div>
                        </div>
                        <select
                          value={a.status}
                          onChange={(e) => updateStatus(a.id, j.id, e.target.value)}
                          style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, border: '.5px solid #e0dfd8' }}
                        >
                          {Object.entries(APPLICATION_STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showEdit && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setShowEdit(false)}>
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <h2>Editar página de la organización</h2>
              <div className="modal-x" onClick={() => setShowEdit(false)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <form onSubmit={saveOrgEdit}>
              <div className="two">
                <div className="field">
                  <label>Sitio web</label>
                  <input name="website_url" defaultValue={org.website_url || ''} placeholder="https://organizacion.com" />
                </div>
                <div className="field">
                  <label>LinkedIn URL</label>
                  <input name="linkedin_url" defaultValue={org.linkedin_url || ''} placeholder="https://linkedin.com/company/..." />
                </div>
              </div>
              <div className="field">
                <label>Nombre de la organización</label>
                <input name="name" defaultValue={org.name} required />
              </div>
              <div className="two">
                <div className="field">
                  <label>Sector de especialización</label>
                  <input name="sector" defaultValue={org.sector || ''} placeholder="Energía, Tecnología..." />
                </div>
                <div className="field">
                  <label>Nº de empleados</label>
                  <select name="size_range" defaultValue={org.size_range || ''}>
                    <option value="">Sin especificar</option>
                    <option value="1-10">1-10 empleados</option>
                    <option value="11-50">11-50 empleados</option>
                    <option value="50-200">50-200 empleados</option>
                    <option value="200-1000">200-1000 empleados</option>
                    <option value="+1000">+1000 empleados</option>
                  </select>
                </div>
              </div>
              <div className="two">
                <div className="field">
                  <label>Sede</label>
                  <input name="location" defaultValue={org.location || ''} />
                </div>
                <div className="field">
                  <label>Año de fundación</label>
                  <input name="founded_year" type="number" defaultValue={org.founded_year || ''} />
                </div>
              </div>
              <div className="field">
                <label>Descripción de la organización</label>
                <textarea
                  name="bio"
                  defaultValue={org.bio || ''}
                  style={{
                    width: '100%',
                    minHeight: 100,
                    padding: '10px 12px',
                    border: '1px solid #e0dfd8',
                    borderRadius: 9,
                    fontSize: 13.5,
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                  placeholder="Describe la misión, visión y qué os diferencia..."
                ></textarea>
              </div>
              <div className="m-foot">
                <button type="button" className="m-back" onClick={() => setShowEdit(false)}>
                  Cancelar
                </button>
                <button className="m-next">
                  <i className="ti ti-check"></i> Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
