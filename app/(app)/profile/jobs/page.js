'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import HoverTooltip from '@/components/HoverTooltip';

// Solo estos 4 estados representan un proceso todavía en curso — son los
// que se muestran con el stepper. "Rechazada" y "retirada" viven aparte, en
// la pestaña "Cerradas": hoy no guardamos en qué etapa se rechazó una
// candidatura, así que intentar "cortar" el stepper ahí sería inventar un
// dato que no tenemos. Mejor un badge simple y honesto.
const STAGES = ['enviada', 'en_revision', 'entrevista', 'oferta'];
const STAGE_LABELS = { enviada: 'Enviada', en_revision: 'Revisión', entrevista: 'Entrevista', oferta: 'Oferta' };

const CLOSED_LABELS = {
  rechazada: { label: 'Rechazada', color: '#b3261e', bg: '#fbeceb' },
  retirada: { label: 'Retirada', color: '#888', bg: '#f0efe9' },
};

function OrgLogo({ url }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        background: '#e8f4f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {url ? (
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <i className="ti ti-building" style={{ fontSize: 17, color: '#7fa89c' }}></i>
      )}
    </div>
  );
}

function UnavailableTitle({ jobDeleted, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontWeight: 700, fontSize: 14, color: '#888' }}>
        {jobDeleted ? 'La organización pausó o desactivó esta oferta' : title}
      </span>
      <HoverTooltip label="La organización pausó o desactivó esta oferta">
        <i className="ti ti-info-circle" style={{ fontSize: 14, color: '#aaa' }}></i>
      </HoverTooltip>
    </div>
  );
}

export default function MyJobsPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState(null);
  const [tab, setTab] = useState('guardados');
  const [saved, setSaved] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(null);

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
        .select('job_id, created_at, jobs(id, title, location, modality, status, organizations(name, logo_url, slug))')
        .eq('user_id', uid),
      supabase
        .from('job_applications')
        .select('id, status, applied_at, jobs(id, title, location, modality, status, organizations(name, logo_url, slug))')
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

  const activeApplications = applications.filter((a) => STAGES.includes(a.status));
  const closedApplications = applications.filter((a) => !STAGES.includes(a.status));

  const list = tab === 'guardados' ? saved : tab === 'solicitados' ? activeApplications : closedApplications;

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
              Cerrados ({closedApplications.length})
            </button>
          </div>

          {list.length === 0 && (
            <div className="empty-state">
              <i className="ti ti-briefcase-off"></i>
              {tab === 'guardados' && 'No has guardado ningún empleo todavía.'}
              {tab === 'solicitados' && 'No tienes ninguna candidatura en curso.'}
              {tab === 'cerrados' && 'No tienes candidaturas cerradas.'}
            </div>
          )}

          {tab === 'guardados' &&
            saved.map((s) => {
              const jobDeleted = !s.jobs;
              const jobPaused = s.jobs && s.jobs.status !== 'activa';
              const unavailable = jobDeleted || jobPaused;
              return (
                <div key={s.job_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '.5px solid #f0f0eb' }}>
                  <OrgLogo url={!unavailable ? s.jobs?.organizations?.logo_url : null} />
                  <div style={{ flex: 1 }}>
                    {unavailable ? (
                      <>
                        <UnavailableTitle jobDeleted={jobDeleted} title={s.jobs?.title} />
                        {!jobDeleted && <div style={{ fontSize: 12.5, color: '#999' }}>{s.jobs.organizations?.name}</div>}
                        <div style={{ fontSize: 12, color: '#999' }}>
                          {s.created_at ? `Guardada el ${new Date(s.created_at).toLocaleDateString('es-ES')}` : 'Oferta no disponible'}
                        </div>
                      </>
                    ) : (
                      <>
                        <Link href={`/jobs?job=${s.jobs?.id}`} style={{ fontWeight: 700, fontSize: 14, color: '#222', textDecoration: 'none' }}>
                          {s.jobs?.title}
                        </Link>
                        <div style={{ fontSize: 12.5, color: '#888' }}>{s.jobs?.organizations?.name}</div>
                        <div style={{ fontSize: 12, color: '#999' }}>
                          {s.jobs?.location} · {s.jobs?.modality === 'presencial' ? 'Presencial' : s.jobs?.modality === 'hibrido' ? 'Híbrido' : 'Remoto'}
                        </div>
                      </>
                    )}
                  </div>
                  <button className="btn-o" style={{ fontSize: 12 }} onClick={() => unsave(s.job_id)}>
                    <i className="ti ti-bookmark-off"></i> Quitar
                  </button>
                </div>
              );
            })}

          {tab === 'solicitados' &&
            activeApplications.map((a) => {
              const jobDeleted = !a.jobs;
              const jobPaused = a.jobs && a.jobs.status !== 'activa';
              const unavailable = jobDeleted || jobPaused;
              const stageIndex = STAGES.indexOf(a.status);
              return (
                <div key={a.id} style={{ padding: '16px 0', borderBottom: '.5px solid #f0f0eb' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <OrgLogo url={!unavailable ? a.jobs?.organizations?.logo_url : null} />
                    <div style={{ flex: 1 }}>
                      {unavailable ? (
                        <UnavailableTitle jobDeleted={jobDeleted} title={a.jobs?.title} />
                      ) : (
                        <Link href={`/jobs?job=${a.jobs?.id}`} style={{ fontWeight: 700, fontSize: 14, color: '#222', textDecoration: 'none' }}>
                          {a.jobs?.title}
                        </Link>
                      )}
                      <div style={{ fontSize: 12.5, color: '#888', marginTop: 1 }}>
                        {!jobDeleted && a.jobs?.organizations?.name}
                        {!jobDeleted && ' · '}
                        Solicitado el {new Date(a.applied_at).toLocaleDateString('es-ES')}
                      </div>

                      {!unavailable && (
                        <div style={{ marginTop: 12, maxWidth: 320 }}>
                          <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
                            {STAGES.map((stage, i) => (
                              <div
                                key={stage}
                                style={{
                                  flex: 1,
                                  height: 8,
                                  borderRadius: 20,
                                  background: i <= stageIndex ? '#1d6f5c' : '#e0dfd8',
                                }}
                              ></div>
                            ))}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>{STAGE_LABELS[a.status]}</span>
                        </div>
                      )}
                    </div>
                    <button className="btn-o" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => setConfirmingWithdraw(a)}>
                      Retirar
                    </button>
                  </div>
                </div>
              );
            })}

          {tab === 'cerrados' &&
            closedApplications.map((a) => {
              const st = CLOSED_LABELS[a.status] || CLOSED_LABELS.retirada;
              const jobDeleted = !a.jobs;
              const jobPaused = a.jobs && a.jobs.status !== 'activa';
              const unavailable = jobDeleted || jobPaused;
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '.5px solid #f0f0eb' }}>
                  <OrgLogo url={!unavailable ? a.jobs?.organizations?.logo_url : null} />
                  <div style={{ flex: 1 }}>
                    {unavailable ? (
                      <UnavailableTitle jobDeleted={jobDeleted} title={a.jobs?.title} />
                    ) : (
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#555' }}>{a.jobs?.title}</div>
                    )}
                    <div style={{ fontSize: 12.5, color: '#999' }}>
                      {!jobDeleted && a.jobs?.organizations?.name}
                      {!jobDeleted && ' · '}
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
                </div>
              );
            })}
        </div>
      </div>

      {confirmingWithdraw && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setConfirmingWithdraw(null)}>
          <div className="modal-box" style={{ maxWidth: 380, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -4 }}>
              <div className="modal-x" style={{ width: 28, height: 28 }} onClick={() => setConfirmingWithdraw(null)}>
                <i className="ti ti-x" style={{ fontSize: 13 }}></i>
              </div>
            </div>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#f0f0eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <i className="ti ti-x" style={{ color: '#666', fontSize: 17 }}></i>
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6 }}>
              ¿Retirar tu candidatura a "{confirmingWithdraw.jobs?.title || 'esta oferta'}"?
            </div>
            <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.5, marginBottom: 18 }}>
              La organización dejará de ver tu candidatura como activa. Esta acción no se puede deshacer — si quieres
              volver a aplicar, tendrás que enviar una nueva solicitud.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-o" onClick={() => setConfirmingWithdraw(null)}>
                Cancelar
              </button>
              <button
                className="btn-p"
                onClick={() => {
                  withdraw(confirmingWithdraw.id);
                  setConfirmingWithdraw(null);
                }}
              >
                Sí, retirar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
