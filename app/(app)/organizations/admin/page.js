'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { useDragPosition, parsePosition } from '@/lib/useDragPosition';

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
  const coverDrag = useDragPosition({
    axis: 'xy',
    value: parsePosition(org?.cover_position),
    editable: !!org?.cover_url,
    onCommit: (pos) => saveOrgCoverPosition(pos),
  });
  const logoDrag = useDragPosition({
    axis: 'xy',
    value: parsePosition(org?.logo_position),
    editable: !!org?.logo_url,
    onCommit: (pos) => saveLogoPosition(pos),
  });
  const [jobs, setJobs] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [showAiOrgTip, setShowAiOrgTip] = useState(true);

  // Cada vez que se abre "Editar página de la organización", el aviso
  // de IA vuelve a aparecer, aunque se hubiera cerrado la vez anterior.
  useEffect(() => {
    if (showEdit) setShowAiOrgTip(true);
  }, [showEdit]);
  const [posting, setPosting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingOrgCover, setUploadingOrgCover] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [loadingEditJob, setLoadingEditJob] = useState(false);
  const [savingJobEdit, setSavingJobEdit] = useState(false);
  const [togglingStatusId, setTogglingStatusId] = useState(null);
  const [viewingJob, setViewingJob] = useState(null);
  const [sharingJob, setSharingJob] = useState(null);
  const [loadingViewJob, setLoadingViewJob] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiJobModal, setShowAiJobModal] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingOrgDesc, setGeneratingOrgDesc] = useState(false);

  const titleRef = useRef(null);
  const areaRef = useRef(null);
  const modalityRef = useRef(null);
  const employmentTypeRef = useRef(null);
  const descriptionRef = useRef(null);
  const responsibilitiesRef = useRef(null);
  const requirementsRef = useRef(null);
  const tagsRef = useRef(null);
  const orgNameRef = useRef(null);
  const orgSectorRef = useRef(null);
  const orgBioRef = useRef(null);
  const orgWebsiteRef = useRef(null);
  const orgLinkedinRef = useRef(null);
  const orgSizeRef = useRef(null);
  const orgNotificationEmailRef = useRef(null);
  const orgLocationRef = useRef(null);
  const orgFoundedYearRef = useRef(null);

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

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !org) return;
    setUploadingLogo(true);
    const ext = file.name.split('.').pop();
    const path = `${org.id}/logo.${ext}`;
    const { error: upErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
    setUploadingLogo(false);
    if (upErr) {
      toast('No se pudo subir el logo. Comprueba que existe el bucket "logos".');
      return;
    }
    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    const logoUrl = `${data.publicUrl}?t=${Date.now()}`;
    await supabase.from('organizations').update({ logo_url: logoUrl }).eq('id', org.id);
    setOrg({ ...org, logo_url: logoUrl });
    toast('Logo actualizado ✓');
  }

  async function handleOrgCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !org) return;
    setUploadingOrgCover(true);
    const ext = file.name.split('.').pop();
    const path = `${org.id}/cover.${ext}`;
    const { error: upErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
    setUploadingOrgCover(false);
    if (upErr) {
      toast('No se pudo subir la portada. Comprueba que existe el bucket "logos".');
      return;
    }
    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    const coverUrl = `${data.publicUrl}?t=${Date.now()}`;
    await supabase.from('organizations').update({ cover_url: coverUrl }).eq('id', org.id);
    setOrg({ ...org, cover_url: coverUrl });
    toast('Portada actualizada ✓');
  }

  async function saveLogoPosition(pos) {
    const value = `${pos.x}% ${pos.y}%`;
    setOrg((prev) => ({ ...prev, logo_position: value }));
    await supabase.from('organizations').update({ logo_position: value }).eq('id', org.id);
  }

  async function saveOrgCoverPosition(pos) {
    const value = `${pos.x}% ${pos.y}%`;
    setOrg((prev) => ({ ...prev, cover_position: value }));
    await supabase.from('organizations').update({ cover_position: value }).eq('id', org.id);
  }

  async function toggleJobStatus(job) {
    const newStatus = job.status === 'activa' ? 'pausada' : 'activa';
    setTogglingStatusId(job.id);
    const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', job.id);
    setTogglingStatusId(null);
    setOpenJobMenuId(null);
    if (error) {
      toast('No se pudo actualizar el estado de la oferta');
      return;
    }
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: newStatus } : j)));
    setViewingJob((prev) => (prev && prev.id === job.id ? { ...prev, status: newStatus } : prev));
    toast(newStatus === 'activa' ? 'Oferta activada ✓' : 'Oferta desactivada ✓');
  }

  function publicJobUrl(jobId) {
    return `${window.location.origin}/empleo/${jobId}`;
  }

  function buildShareTemplates(job) {
    const url = publicJobUrl(job.id);
    const orgName = org?.name || 'nuestra organización';
    return {
      linkedin: `📢 ${orgName} está contratando: buscamos un/a ${job.title} para nuestro equipo.\n\n📍 ${job.location} · ${job.modality === 'presencial' ? 'Presencial' : job.modality === 'hibrido' ? 'Híbrido' : 'Remoto'}\n\nSi te apasiona el sector de asuntos públicos y quieres formar parte de nuestro proyecto, aplica aquí (o comparte con alguien a quien le pueda interesar):\n${url}`,
      whatsapp: `¡Hola! 👋 Desde ${orgName} buscamos un/a *${job.title}*. Si te interesa o conoces a alguien que pueda encajar, aquí está la oferta: ${url}`,
    };
  }

  async function openViewJob(jobId) {
    setLoadingViewJob(true);
    const { data, error } = await supabase
      .from('jobs')
      .select(`*, job_requirements(content, sort_order), job_responsibilities(content, sort_order), job_tags(tag)`)
      .eq('id', jobId)
      .single();
    setLoadingViewJob(false);
    if (error || !data) {
      toast('No se pudo cargar la oferta');
      return;
    }
    setViewingJob(data);
  }

  async function openEditJob(jobId) {
    setLoadingEditJob(true);
    const { data, error } = await supabase
      .from('jobs')
      .select(
        `*, job_requirements(content, sort_order), job_responsibilities(content, sort_order), job_tags(tag)`
      )
      .eq('id', jobId)
      .single();
    setLoadingEditJob(false);
    if (error || !data) {
      toast('No se pudo cargar la oferta');
      return;
    }
    setEditingJob(data);
  }

  async function saveJobEdit(e) {
    e.preventDefault();
    if (!editingJob) return;
    setSavingJobEdit(true);
    const f = new FormData(e.target);

    const updates = {
      title: f.get('title'),
      area: f.get('area'),
      location: f.get('location'),
      modality: f.get('modality'),
      employment_type: f.get('employment_type'),
      salary_min: f.get('salary_min') ? Number(f.get('salary_min')) : null,
      salary_max: f.get('salary_max') ? Number(f.get('salary_max')) : null,
      description: f.get('description'),
      status: f.get('status'),
    };

    const { error: jobErr } = await supabase.from('jobs').update(updates).eq('id', editingJob.id);

    const reqLines = (f.get('requirements') || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const resLines = (f.get('responsibilities') || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const tags = (f.get('tags') || '').split(',').map((s) => s.trim()).filter(Boolean);

    await supabase.from('job_requirements').delete().eq('job_id', editingJob.id);
    await supabase.from('job_responsibilities').delete().eq('job_id', editingJob.id);
    await supabase.from('job_tags').delete().eq('job_id', editingJob.id);

    if (reqLines.length > 0) {
      await supabase
        .from('job_requirements')
        .insert(reqLines.map((content, i) => ({ job_id: editingJob.id, content, sort_order: i })));
    }
    if (resLines.length > 0) {
      await supabase
        .from('job_responsibilities')
        .insert(resLines.map((content, i) => ({ job_id: editingJob.id, content, sort_order: i })));
    }
    if (tags.length > 0) {
      await supabase.from('job_tags').insert(tags.map((tag) => ({ job_id: editingJob.id, tag })));
    }

    setSavingJobEdit(false);
    if (jobErr) {
      toast('No se pudieron guardar los cambios');
      return;
    }
    setEditingJob(null);
    toast('Oferta actualizada ✓');
    loadJobs(org.id);
  }

  async function fillOrgWithAI() {
    const websiteUrl = orgWebsiteRef.current?.value;
    if (!websiteUrl || !websiteUrl.trim()) {
      toast('Añade primero la web de la organización');
      return;
    }
    setGeneratingOrgDesc(true);
    try {
      const res = await fetch('/api/ai/org-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl,
          linkedinUrl: orgLinkedinRef.current?.value,
          name: orgNameRef.current?.value,
          orgType: org?.org_type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');

      if (data.sector && orgSectorRef.current) orgSectorRef.current.value = data.sector;
      if (data.location && orgLocationRef.current) orgLocationRef.current.value = data.location;
      if (data.founded_year && orgFoundedYearRef.current) orgFoundedYearRef.current.value = data.founded_year;
      if (data.size_range && orgSizeRef.current) orgSizeRef.current.value = data.size_range;
      if (data.bio && orgBioRef.current) orgBioRef.current.value = data.bio;

      toast('Datos rellenados ✓ revísalos antes de guardar');
    } catch (err) {
      toast('No se pudo rellenar automáticamente: ' + err.message);
    }
    setGeneratingOrgDesc(false);
  }

  async function generateJobDescription() {
    if (!aiPrompt.trim()) {
      toast('Describe brevemente el puesto para poder generarlo');
      return;
    }
    setGeneratingDesc(true);
    try {
      const res = await fetch('/api/ai/job-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          title: titleRef.current?.value,
          area: areaRef.current?.value,
          modality: modalityRef.current?.value,
          employmentType: employmentTypeRef.current?.value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');

      if (descriptionRef.current) descriptionRef.current.value = data.description;
      if (responsibilitiesRef.current) responsibilitiesRef.current.value = data.responsibilities.join('\n');
      if (requirementsRef.current) requirementsRef.current.value = data.requirements.join('\n');
      if (tagsRef.current) tagsRef.current.value = data.tags.join(', ');

      setShowAiJobModal(false);
      toast('Contenido generado ✓ revísalo antes de publicar');
    } catch (err) {
      toast('No se pudo generar el contenido: ' + err.message);
    }
    setGeneratingDesc(false);
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
    setAiPrompt('');
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
      notification_email: f.get('notification_email') || null,
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 13, maxWidth: 1080, margin: '0 auto' }}>
        <div>
          <div className="card" style={{ marginBottom: 13 }}>
            <div
              ref={coverDrag.containerRef}
              className="co-cover"
              {...coverDrag.bind}
              style={
                org.cover_url
                  ? {
                      backgroundImage: `url(${org.cover_url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: coverDrag.backgroundPosition,
                      ...coverDrag.bind.style,
                    }
                  : undefined
              }
            >
              {org.cover_url && (
                <div className={`drag-hint ${coverDrag.hover || coverDrag.dragging ? 'on' : ''}`}>
                  <i className="ti ti-arrows-move"></i> Arrastra para ajustar
                </div>
              )}
              <label
                title="Cambiar portada"
                onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 11,
              right: 11,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(0,0,0,.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
            }}
          >
            {uploadingOrgCover ? <i className="ti ti-loader-2" style={{ fontSize: 15 }}></i> : <i className="ti ti-camera" style={{ fontSize: 15 }}></i>}
            <input type="file" accept="image/*" hidden onChange={handleOrgCoverUpload} disabled={uploadingOrgCover} />
          </label>

          <div
            ref={logoDrag.containerRef}
            className="co-logo"
            {...logoDrag.bind}
            style={{
              ...logoDrag.bind.style,
              backgroundImage: org.logo_url ? `url(${org.logo_url})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: logoDrag.backgroundPosition,
            }}
          >
            {!org.logo_url && '🏛️'}
            {org.logo_url && (
              <div className={`drag-hint ${logoDrag.hover || logoDrag.dragging ? 'on' : ''}`} style={{ fontSize: 9 }}>
                <i className="ti ti-arrows-move"></i>
              </div>
            )}
            <label
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: 1,
                right: 1,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#1d6f5c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {uploadingLogo ? (
                <i className="ti ti-loader-2" style={{ fontSize: 12, color: '#fff' }}></i>
              ) : (
                <i className="ti ti-camera" style={{ fontSize: 12, color: '#fff' }}></i>
              )}
              <input type="file" accept="image/*" hidden onChange={handleLogoUpload} disabled={uploadingLogo} />
            </label>
          </div>
        </div>
        <div className="co-info">
          <div style={{ fontSize: 17.5, fontWeight: 700, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            {org.name}
            {org.verified && (
              <span className="tt">
                <i className="ti ti-circle-check-filled" style={{ color: '#1d9d63', fontSize: 15.5 }}></i>
                <span className="tt-bubble">Página verificada por la organización</span>
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: '#555', marginBottom: 8 }}>{org.bio || org.sector || 'Añade una descripción'}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#888', marginBottom: 11 }}>
            {org.location && (
              <span>
                <i className="ti ti-map-pin" style={{ fontSize: 11.5 }}></i> {org.location}
              </span>
            )}
            {org.size_range && (
              <span>
                <i className="ti ti-users" style={{ fontSize: 11.5 }}></i> {org.size_range} empleados
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="btn-p" onClick={() => setShowEdit(true)}>
              <i className="ti ti-edit"></i> Editar
            </button>
            <a href="/organizations/admin/candidates" className="btn-ai" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-layout-kanban"></i> Tablero de candidatos
              <span style={{ fontSize: 9.5, padding: '1px 6px', background: 'rgba(255,255,255,.25)', borderRadius: 10, fontWeight: 600 }}>BETA</span>
            </a>
          </div>
          <a
            href={`/organizations/${org.slug}`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: '#1d6f5c', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <i className="ti ti-eye" style={{ fontSize: 12.5 }}></i> Ver como candidato
          </a>
        </div>
      </div>

        <div className="card">
          <div className="cp">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Publicar oferta de empleo</div>
              <button type="button" className="btn-ai-o" style={{ fontSize: 12 }} onClick={() => setShowAiJobModal(true)}>
                <i className="ti ti-bolt"></i> Redactar con IA
              </button>
            </div>
            <form onSubmit={publishJob} style={{ background: '#f8faf9', borderRadius: 10, padding: 15 }}>
              <div className="form-row">
                <div className="form-g">
                  <label>Título del puesto</label>
                  <input ref={titleRef} name="title" required placeholder="Ej: Senior Public Affairs Manager" />
                </div>
                <div className="form-g">
                  <label>Área</label>
                  <select ref={areaRef} name="area" required>
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
                  <select ref={modalityRef} name="modality" required>
                    <option value="presencial">Presencial</option>
                    <option value="hibrido">Híbrido</option>
                    <option value="remoto">Remoto</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-g">
                  <label>Tipo de jornada</label>
                  <select ref={employmentTypeRef} name="employment_type" required>
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
                <textarea ref={descriptionRef} name="description" required placeholder="Describe las responsabilidades, requisitos y condiciones..."></textarea>
              </div>
              <div className="form-g">
                <label>Responsabilidades (una por línea)</label>
                <textarea ref={responsibilitiesRef} name="responsibilities" placeholder={'Liderar la estrategia...\nRepresentar a la empresa...'}></textarea>
              </div>
              <div className="form-g">
                <label>Requisitos (uno por línea)</label>
                <textarea ref={requirementsRef} name="requirements" placeholder={'5+ años de experiencia...\nInglés fluido...'}></textarea>
              </div>
              <div className="form-g">
                <label>Etiquetas (separadas por comas)</label>
                <input ref={tagsRef} name="tags" placeholder="Public Affairs, Regulación, Liderazgo" />
              </div>
              <button className="btn-p" style={{ width: '100%' }} disabled={posting}>
                <i className="ti ti-send"></i> {posting ? 'Publicando...' : 'Publicar oferta'}
              </button>
            </form>
          </div>
        </div>
        </div>

        <div>
          <div
            className="sw"
            style={{
              background: 'linear-gradient(160deg,#faf9ff,#fff)',
              borderColor: '#d8d3fb',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <i className="ti ti-headset" style={{ color: '#6d5aef', fontSize: 17 }}></i>
              <h4 style={{ margin: 0 }}>¿Sacando todo el partido a GovTalent?</h4>
            </div>
            <p style={{ fontSize: 12.5, color: '#666', lineHeight: 1.6, marginBottom: 12 }}>
              Agenda una llamada con nuestro equipo: te ayudamos a publicar mejores ofertas, sacarle partido a la IA y
              conseguir más candidatos cualificados.
            </p>
            <a
              href="mailto:hola@govtalent.app?subject=Quiero%20agendar%20una%20llamada"
              className="btn-o"
              style={{ width: '100%', textAlign: 'center', display: 'block', textDecoration: 'none' }}
            >
              <i className="ti ti-calendar-event"></i> Agendar llamada
            </a>
          </div>

          <div className="sw">
            <h4>Ofertas activas</h4>
            {jobs.filter((j) => j.status === 'activa').length === 0 && (
              <div style={{ fontSize: 12.5, color: '#999', marginBottom: 10 }}>No tienes ofertas activas ahora mismo.</div>
            )}
            {jobs.filter((j) => j.status === 'activa').map((j) => (
              <div
                key={j.id}
                className="ji on"
                style={{ borderLeft: '3px solid #1d6f5c', borderRadius: 8, marginBottom: 10 }}
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
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    className="btn-o"
                    style={{ fontSize: 11.5, padding: '5px 10px' }}
                    disabled={loadingViewJob}
                    onClick={() => openViewJob(j.id)}
                  >
                    <i className="ti ti-eye"></i> Ver oferta
                  </button>
                  <a
                    href={`/organizations/admin/candidates?job=${j.id}`}
                    className="btn-o"
                    style={{ fontSize: 11.5, padding: '5px 10px', textDecoration: 'none' }}
                  >
                    <i className="ti ti-users"></i> Ver candidatos
                  </a>
                  <button
                    className="btn-ai-o"
                    style={{ fontSize: 11.5, padding: '5px 10px' }}
                    onClick={() => setSharingJob(j)}
                  >
                    <i className="ti ti-share"></i> Compartir
                  </button>
                </div>
              </div>
            ))}
            <a
              href="/organizations/admin/jobs"
              style={{ fontSize: 12.5, color: '#1d6f5c', textDecoration: 'none', display: 'inline-block', marginTop: 6 }}
            >
              Ver todas las ofertas →
            </a>
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
              {showAiOrgTip && (
              <div
                style={{
                  background: '#faf9ff',
                  border: '1px solid #d8d3fb',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 16,
                  position: 'relative',
                }}
              >
                <div
                  onClick={() => setShowAiOrgTip(false)}
                  title="Cerrar"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    cursor: 'pointer',
                    color: '#aaa',
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                  }}
                >
                  <i className="ti ti-x" style={{ fontSize: 14 }}></i>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <i className="ti ti-bolt" style={{ color: '#6d5aef', fontSize: 15 }}></i>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Rellenar con IA</span>
                  <span className="badge-ai" style={{ fontSize: 9.5, padding: '1px 6px' }}>BETA</span>
                </div>
                <p style={{ fontSize: 11.5, color: '#888', marginBottom: 10 }}>
                  Añade la web de la organización y rellenamos el resto de campos automáticamente (sector, sede, año de
                  fundación, tamaño y descripción), leyendo el contenido real de la página.
                </p>
                <div className="two">
                  <div className="field">
                    <label>Sitio web</label>
                    <input ref={orgWebsiteRef} name="website_url" defaultValue={org.website_url || ''} placeholder="https://organizacion.com" />
                  </div>
                  <div className="field">
                    <label>LinkedIn URL</label>
                    <input ref={orgLinkedinRef} name="linkedin_url" defaultValue={org.linkedin_url || ''} placeholder="https://linkedin.com/company/..." />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ai"
                  style={{ width: '100%', fontSize: 12.5 }}
                  disabled={generatingOrgDesc}
                  onClick={fillOrgWithAI}
                >
                  <i className="ti ti-bolt"></i> {generatingOrgDesc ? 'Leyendo la web...' : 'Rellenar con IA'}
                </button>
              </div>
              )}

              <div className="field">
                <label>Nombre de la organización</label>
                <input ref={orgNameRef} name="name" defaultValue={org.name} required />
              </div>
              <div className="two">
                <div className="field">
                  <label>Sector de especialización</label>
                  <input ref={orgSectorRef} name="sector" defaultValue={org.sector || ''} placeholder="Energía, Tecnología..." />
                </div>
                <div className="field">
                  <label>Nº de empleados</label>
                  <select ref={orgSizeRef} name="size_range" defaultValue={org.size_range || ''}>
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
                  <input ref={orgLocationRef} name="location" defaultValue={org.location || ''} />
                </div>
                <div className="field">
                  <label>Año de fundación</label>
                  <input ref={orgFoundedYearRef} name="founded_year" type="number" defaultValue={org.founded_year || ''} />
                </div>
              </div>

              <div className="field">
                <label>Email de notificaciones</label>
                <input
                  ref={orgNotificationEmailRef}
                  name="notification_email"
                  type="email"
                  defaultValue={org.notification_email || ''}
                  placeholder="rrhh@organizacion.com"
                />
                <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                  A esta dirección llegarán los avisos de nuevas candidaturas — puede ser distinta del email con el
                  que gestionas esta página. Si lo dejas vacío, avisaremos a las cuentas con acceso de administrador.
                </p>
              </div>

              <div className="field">
                <label>Descripción de la organización</label>
                <textarea
                  ref={orgBioRef}
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

      {showAiJobModal && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setShowAiJobModal(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-head">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="ti ti-bolt" style={{ color: '#6d5aef' }}></i> Redactar con IA
                <span className="badge-ai" style={{ fontSize: 10 }}>BETA</span>
              </h2>
              <div className="modal-x" onClick={() => setShowAiJobModal(false)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: '#888', marginBottom: 14 }}>
              Describe brevemente el puesto y lo que buscas. Rellenaremos la descripción, responsabilidades, requisitos
              y etiquetas del formulario — podrás revisarlo todo antes de publicar.
            </p>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ej: consultor junior para llevar cuentas del sector energético, con inglés alto y ganas de aprender..."
              style={{
                width: '100%',
                minHeight: 100,
                padding: '10px 12px',
                border: '1px solid #e0dfd8',
                borderRadius: 9,
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'vertical',
                marginBottom: 14,
              }}
            ></textarea>
            <div className="m-foot">
              <button type="button" className="m-back" onClick={() => setShowAiJobModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn-ai" style={{ marginLeft: 'auto' }} disabled={generatingDesc} onClick={generateJobDescription}>
                <i className="ti ti-bolt"></i> {generatingDesc ? 'Generando...' : 'Generar contenido'}
              </button>
            </div>
          </div>
        </div>
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
              Esta es la página pública de la oferta — cualquiera puede verla y aplicar sin tener cuenta todavía en
              GovTalent, se registran al aplicar.
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
              const t = buildShareTemplates(sharingJob);
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

      {viewingJob && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setViewingJob(null)}>
          <div className="modal-box" style={{ maxWidth: 620 }}>
            <div className="modal-head">
              <h2>{viewingJob.title}</h2>
              <div className="modal-x" onClick={() => setViewingJob(null)}>
                <i className="ti ti-x"></i>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <span className="badge bg">{viewingJob.area}</span>
              <span className="badge bgr">
                {viewingJob.modality === 'presencial' ? 'Presencial' : viewingJob.modality === 'hibrido' ? 'Híbrido' : 'Remoto'}
              </span>
              <span className="badge bgr">{viewingJob.location}</span>
              <span className={`badge ${viewingJob.status === 'activa' ? 'bg' : 'bgr'}`}>{viewingJob.status}</span>
            </div>

            {(viewingJob.salary_min || viewingJob.salary_max) && (
              <div style={{ fontSize: 13, color: '#555', marginBottom: 14 }}>
                <i className="ti ti-cash" style={{ color: '#888' }}></i>{' '}
                {viewingJob.salary_min?.toLocaleString('es-ES')} – {viewingJob.salary_max?.toLocaleString('es-ES')} €
              </div>
            )}

            {viewingJob.job_tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {viewingJob.job_tags.map((t, i) => (
                  <div
                    key={i}
                    style={{ padding: '5px 10px', borderRadius: 6, background: '#f4f4f0', color: '#555', fontSize: 12.5 }}
                  >
                    <i className="ti ti-tag" style={{ fontSize: 12 }}></i> {t.tag}
                  </div>
                ))}
              </div>
            )}

            <div className="jd-sec">Descripción</div>
            <div className="jd-txt">{viewingJob.description}</div>

            {viewingJob.job_responsibilities?.length > 0 && (
              <>
                <div className="jd-sec">Responsabilidades</div>
                <div className="jd-txt">
                  <ul>
                    {[...viewingJob.job_responsibilities]
                      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                      .map((r, i) => (
                        <li key={i}>{r.content}</li>
                      ))}
                  </ul>
                </div>
              </>
            )}

            {viewingJob.job_requirements?.length > 0 && (
              <>
                <div className="jd-sec">Requisitos</div>
                <div className="jd-txt">
                  <ul>
                    {[...viewingJob.job_requirements]
                      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                      .map((r, i) => (
                        <li key={i}>{r.content}</li>
                      ))}
                  </ul>
                </div>
              </>
            )}

            <div className="m-foot">
              <button
                className="m-back"
                disabled={togglingStatusId === viewingJob.id}
                onClick={() => toggleJobStatus(viewingJob)}
                style={{ color: viewingJob.status === 'activa' ? '#b3261e' : '#1d6f5c' }}
              >
                <i className={`ti ${viewingJob.status === 'activa' ? 'ti-player-pause' : 'ti-player-play'}`}></i>{' '}
                {togglingStatusId === viewingJob.id
                  ? 'Actualizando...'
                  : viewingJob.status === 'activa'
                  ? 'Desactivar oferta'
                  : 'Activar oferta'}
              </button>
              {viewingJob.status === 'activa' && (
                <button
                  type="button"
                  className="btn-ai-o"
                  onClick={() => {
                    setSharingJob(viewingJob);
                    setViewingJob(null);
                  }}
                >
                  <i className="ti ti-share"></i> Compartir
                </button>
              )}
              <button
                className="m-next"
                onClick={() => {
                  const jobId = viewingJob.id;
                  setViewingJob(null);
                  openEditJob(jobId);
                }}
              >
                <i className="ti ti-edit"></i> Actualizar oferta
              </button>
            </div>
          </div>
        </div>
      )}

      {editingJob && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setEditingJob(null)}>
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <h2>Actualizar oferta</h2>
              <div className="modal-x" onClick={() => setEditingJob(null)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <form onSubmit={saveJobEdit}>
              <div className="form-row">
                <div className="form-g">
                  <label>Título del puesto</label>
                  <input name="title" required defaultValue={editingJob.title} />
                </div>
                <div className="form-g">
                  <label>Área</label>
                  <select name="area" required defaultValue={editingJob.area}>
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
                  <input name="location" required defaultValue={editingJob.location} />
                </div>
                <div className="form-g">
                  <label>Modalidad</label>
                  <select name="modality" required defaultValue={editingJob.modality}>
                    <option value="presencial">Presencial</option>
                    <option value="hibrido">Híbrido</option>
                    <option value="remoto">Remoto</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-g">
                  <label>Tipo de jornada</label>
                  <select name="employment_type" required defaultValue={editingJob.employment_type}>
                    <option value="jornada_completa">Jornada completa</option>
                    <option value="media_jornada">Media jornada</option>
                    <option value="practicas">Prácticas</option>
                    <option value="freelance">Freelance</option>
                  </select>
                </div>
                <div className="form-g">
                  <label>Estado de la oferta</label>
                  <select name="status" required defaultValue={editingJob.status}>
                    <option value="activa">Activa</option>
                    <option value="pausada">Pausada</option>
                    <option value="cerrada">Cerrada</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-g">
                  <label>Rango salarial (opcional)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input name="salary_min" type="number" defaultValue={editingJob.salary_min || ''} placeholder="35000" />
                    <input name="salary_max" type="number" defaultValue={editingJob.salary_max || ''} placeholder="45000" />
                  </div>
                </div>
                <div className="form-g"></div>
              </div>
              <div className="form-g">
                <label>Descripción</label>
                <textarea name="description" required defaultValue={editingJob.description}></textarea>
              </div>
              <div className="form-g">
                <label>Responsabilidades (una por línea)</label>
                <textarea
                  name="responsibilities"
                  defaultValue={sortByOrder(editingJob.job_responsibilities || [])
                    .map((r) => r.content)
                    .join('\n')}
                ></textarea>
              </div>
              <div className="form-g">
                <label>Requisitos (uno por línea)</label>
                <textarea
                  name="requirements"
                  defaultValue={sortByOrder(editingJob.job_requirements || [])
                    .map((r) => r.content)
                    .join('\n')}
                ></textarea>
              </div>
              <div className="form-g">
                <label>Etiquetas (separadas por comas)</label>
                <input
                  name="tags"
                  defaultValue={(editingJob.job_tags || []).map((t) => t.tag).join(', ')}
                  placeholder="Public Affairs, Regulación, Liderazgo"
                />
              </div>
              <div className="m-foot">
                <button type="button" className="m-back" onClick={() => setEditingJob(null)}>
                  Cancelar
                </button>
                <button className="m-next" disabled={savingJobEdit}>
                  <i className="ti ti-check"></i> {savingJobEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function sortByOrder(arr) {
  return [...arr].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}
