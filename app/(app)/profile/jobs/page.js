'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const STATUS_LABELS = {
  enviada: { label: 'Enviada', color: '#2563eb', bg: '#e8f0fb' },
  en_revision: { label: 'En revisión', color: '#b8860b', bg: '#fff8e1' },
  entrevista: { label: 'Entrevista', color: '#6d5aef', bg: '#eeecfd' },
  oferta: { label: 'Oferta', color: '#1d6f5c', bg: '#e8f4f0' },
  rechazada: { label: 'Rechazada', color: '#b3261e', bg: '#fbeceb' },
  retirada: { label: 'Retirada', color: '#888', bg: '#f0efe9' },
};

export default function MyJobsPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState(null);
  const [tab, setTab] = useState('guardados');
  const [saved, setSaved] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return setLoading(false);
    setUserId(uid);

    const [{ data: savedData }, { data: appsData }] = await Promise.all([
      supabase
        .from('saved_jobs')
        .select('job_id, jobs(id, title, location, modality, organizations(name, logo_url, slug))')
        .eq('user_id', uid),
      supabase
        .from('job_applications')
        .select('id, status, applied_at, jobs(id, title, location, modality, organizations(name, logo_url, slug))')
        .eq('candidate_id', uid)
        .order('applied_at', { ascending: false }),
    ]);

    setSaved(savedData || []);
    setApplications(appsData || []);
    setLoading(false);
  }

  async function unsave(jobId) {
    await supabase.from('saved_jobs').delete().eq('user_id', userId).eq('job_id', jobId);
    setSaved((prev) => prev.filter((s) => s.job_id !== jobId));
    toast('Empleo quitado de guardados');
  }

  async function withdraw(appId) {
    await supabase.from('job_applications').update({ status: 'retirada' }).eq('id', appId);
    setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status: 'retirada' } : a)));
    toast('Solicitud retirada');
  }

  if (loading) return <div className="spinner"></div>;

  const activeApplications = applications.filter((a) => a.status !== 'retirada');
  const list = tab === 'guardados' ? saved : applications;

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 10 }}>
        <Link href="/profile" style={{ fontSize: 12.5, color: '#1d6f5c', textDecoration: 'none' }}>
          <i className="ti ti-arrow-left"></i> Volver a mi perfil
        </Link>
      </div>

      <div className="card">
        <div className="cp">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Mis empleos</h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Empleos que has guardado y a los que has aplicado.</p>

          <div style={{ display: 'flex', gap: 6, borderBottom: '.5px solid #e0dfd8', marginBottom: 16 }}>
            <button
              onClick={() => setTab('guardados')}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 14px',
                fontSize: 13.5,
                fontWeight: tab === 'guardados' ? 600 : 400,
                color: tab === 'guardados' ? '#1d6f5c' : '#888',
                borderBottom: tab === 'guardados' ? '2px solid #1d6f5c' : '2px solid transparent',
              }}
            >
              Guardados ({saved.length})
            </button>
            <button
              onClick={() => setTab('solicitados')}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 14px',
                fontSize: 13.5,
                fontWeight: tab === 'solicitados' ? 600 : 400,
                color: tab === 'solicitados' ? '#1d6f5c' : '#888',
                borderBottom: tab === 'solicitados' ? '2px solid #1d6f5c' : '2px solid transparent',
              }}
            >
              Solicitados ({activeApplications.length})
            </button>
          </div>

          {list.length === 0 && (
            <div className="empty-state">
              <i className="ti ti-briefcase-off"></i>
              {tab === 'guardados' ? 'No has guardado ningún empleo todavía.' : 'No has aplicado a ningún empleo todavía.'}
            </div>
          )}

          {tab === 'guardados' &&
            saved.map((s) => (
              <div key={s.job_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '.5px solid #f0f0eb' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: '#e8f4f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {s.jobs?.organizations?.logo_url ? (
                    <img src={s.jobs.organizations.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <i className="ti ti-building"></i>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <Link href={`/jobs?job=${s.jobs?.id}`} style={{ fontWeight: 600, fontSize: 14, color: '#222', textDecoration: 'none' }}>
                    {s.jobs?.title}
                  </Link>
                  <div style={{ fontSize: 12.5, color: '#888' }}>{s.jobs?.organizations?.name}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {s.jobs?.location} · {s.jobs?.modality === 'presencial' ? 'Presencial' : s.jobs?.modality === 'hibrido' ? 'Híbrido' : 'Remoto'}
                  </div>
                </div>
                <button className="btn-o" style={{ fontSize: 12 }} onClick={() => unsave(s.job_id)}>
                  <i className="ti ti-bookmark-off"></i> Quitar
                </button>
              </div>
            ))}

          {tab === 'solicitados' &&
            applications.map((a) => {
              const st = STATUS_LABELS[a.status] || STATUS_LABELS.enviada;
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '.5px solid #f0f0eb' }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: '#e8f4f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {a.jobs?.organizations?.logo_url ? (
                      <img src={a.jobs.organizations.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <i className="ti ti-building"></i>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Link href={`/jobs?job=${a.jobs?.id}`} style={{ fontWeight: 600, fontSize: 14, color: '#222', textDecoration: 'none' }}>
                      {a.jobs?.title}
                    </Link>
                    <div style={{ fontSize: 12.5, color: '#888' }}>{a.jobs?.organizations?.name}</div>
                    <div style={{ fontSize: 11.5, color: '#999' }}>
                      Solicitado el {new Date(a.applied_at).toLocaleDateString('es-ES')}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 20,
                      background: st.bg,
                      color: st.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {st.label}
                  </span>
                  {a.status !== 'retirada' && a.status !== 'rechazada' && (
                    <button className="btn-o" style={{ fontSize: 12 }} onClick={() => withdraw(a.id)}>
                      Retirar
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
