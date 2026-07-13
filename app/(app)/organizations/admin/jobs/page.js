'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const AREAS = [
  'Public Affairs',
  'Comunicación Política',
  'Relaciones Institucionales',
  'Asuntos Europeos',
  'Regulación',
];

export default function AllJobsPage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('activos');
  const [togglingId, setTogglingId] = useState(null);

  const [editingJob, setEditingJob] = useState(null);
  const [loadingEditJob, setLoadingEditJob] = useState(false);
  const [savingJobEdit, setSavingJobEdit] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return setLoading(false);

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', uid)
      .maybeSingle();

    if (!membership) return setLoading(false);
    setOrg(membership.organizations);

    const { data } = await supabase
      .from('jobs')
      .select('id, title, area, location, modality, status, created_at, job_applications(count)')
      .eq('organization_id', membership.organizations.id)
      .order('created_at', { ascending: false });

    setJobs(data || []);
    setLoading(false);
  }

  async function toggleStatus(job) {
    const newStatus = job.status === 'activa' ? 'pausada' : 'activa';
    setTogglingId(job.id);
    const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', job.id);
    setTogglingId(null);
    if (error) {
      toast('No se pudo actualizar el estado de la oferta');
      return;
    }
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: newStatus } : j)));
    toast(newStatus === 'activa' ? 'Oferta activada ✓' : 'Oferta desactivada ✓');
  }

  async function openEditJob(jobId) {
    setLoadingEditJob(true);
    const { data, error } = await supabase
      .from('jobs')
      .select(`*, job_requirements(content, sort_order), job_responsibilities(content, sort_order), job_tags(tag)`)
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
    load();
  }

  if (loading) return <div className="spinner"></div>;

  if (!org) {
    return (
      <div className="sec">
        <div className="empty-state">
          <i className="ti ti-building-off"></i>
          Todavía no administras ninguna organización.
        </div>
      </div>
    );
  }

  const activos = jobs.filter((j) => j.status === 'activa');
  const cerrados = jobs.filter((j) => j.status !== 'activa');
  const list = tab === 'activos' ? activos : cerrados;

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 10 }}>
        <Link href="/organizations/admin" style={{ fontSize: 12.5, color: '#1d6f5c', textDecoration: 'none' }}>
          <i className="ti ti-arrow-left"></i> Volver a mi organización
        </Link>
      </div>

      <div className="card">
        <div className="cp">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Todas las ofertas</h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Gestiona los anuncios de empleo de {org.name}.</p>

          <div style={{ display: 'flex', gap: 6, borderBottom: '.5px solid #e0dfd8', marginBottom: 16 }}>
            <button
              onClick={() => setTab('activos')}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 14px',
                fontSize: 13.5,
                fontWeight: tab === 'activos' ? 600 : 400,
                color: tab === 'activos' ? '#1d6f5c' : '#888',
                borderBottom: tab === 'activos' ? '2px solid #1d6f5c' : '2px solid transparent',
              }}
            >
              Activos ({activos.length})
            </button>
            <button
              onClick={() => setTab('cerrados')}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 14px',
                fontSize: 13.5,
                fontWeight: tab === 'cerrados' ? 600 : 400,
                color: tab === 'cerrados' ? '#1d6f5c' : '#888',
                borderBottom: tab === 'cerrados' ? '2px solid #1d6f5c' : '2px solid transparent',
              }}
            >
              Cerrados ({cerrados.length})
            </button>
          </div>

          {list.length === 0 && (
            <div className="empty-state">
              <i className="ti ti-briefcase-off"></i>
              {tab === 'activos' ? 'No tienes ofertas activas ahora mismo.' : 'No tienes ofertas cerradas.'}
            </div>
          )}

          {list.map((j) => (
            <div key={j.id} style={{ padding: '14px 0', borderBottom: '.5px solid #f0f0eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{j.title}</div>
                  <div style={{ fontSize: 12.5, color: '#666', marginTop: 2 }}>{j.area}</div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                    {j.location} · {j.modality === 'presencial' ? 'Presencial' : j.modality === 'hibrido' ? 'Híbrido' : 'Remoto'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Link
                    href={`/organizations/admin/candidates?job=${j.id}`}
                    style={{ fontSize: 12.5, color: '#1d6f5c', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {j.job_applications?.[0]?.count || 0} solicitudes
                  </Link>
                  <button
                    className="btn-o"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                    disabled={loadingEditJob}
                    onClick={() => openEditJob(j.id)}
                  >
                    <i className="ti ti-edit"></i> Actualizar
                  </button>
                  <button
                    className={j.status === 'activa' ? 'btn-o' : 'btn-p'}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                    disabled={togglingId === j.id}
                    onClick={() => toggleStatus(j)}
                  >
                    {togglingId === j.id
                      ? 'Actualizando...'
                      : j.status === 'activa'
                      ? 'Desactivar'
                      : 'Reactivar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

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
