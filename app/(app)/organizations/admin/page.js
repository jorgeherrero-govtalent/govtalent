'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { hasInterestGroupBadge } from '@/lib/interestGroupBadge';
import { SECTOR_LABELS } from '@/lib/orgTaxonomy';
import ProgressChecklist from '@/components/ProgressChecklist';
import VerifyOrganizationModal from '@/components/VerifyOrganizationModal';

export default function OrganizationAdminPage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [userId, setUserId] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [kpis, setKpis] = useState({ activeJobs: 0, totalApplications: 0, applicationsThisWeek: 0, reviewedApplications: 0 });
  const [sharingJob, setSharingJob] = useState(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    setUserId(uid);
    if (!uid) return;

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();

    if (!membership) return;
    const organization = membership.organizations;
    setOrg(organization);
    loadJobs(organization.id);
    loadKpis(organization.id);
  }

  async function loadJobs(orgId) {
    const { data } = await supabase
      .from('jobs')
      .select('id, title, location, status, is_featured, created_at, job_applications(count)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    setJobs(data || []);
  }

  async function loadKpis(orgId) {
    const { data: orgJobs } = await supabase.from('jobs').select('id, status').eq('organization_id', orgId);
    const jobIds = (orgJobs || []).map((j) => j.id);
    const activeJobs = (orgJobs || []).filter((j) => j.status === 'activa').length;

    if (jobIds.length === 0) {
      setKpis({ activeJobs, totalApplications: 0, applicationsThisWeek: 0, reviewedApplications: 0 });
      return;
    }

    const { count: totalApplications } = await supabase
      .from('job_applications')
      .select('id', { count: 'exact', head: true })
      .in('job_id', jobIds);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: applicationsThisWeek } = await supabase
      .from('job_applications')
      .select('id', { count: 'exact', head: true })
      .in('job_id', jobIds)
      .gte('applied_at', weekAgo);

    const { count: reviewedApplications } = await supabase
      .from('job_applications')
      .select('id', { count: 'exact', head: true })
      .in('job_id', jobIds)
      .neq('status', 'enviada');

    setKpis({
      activeJobs,
      totalApplications: totalApplications || 0,
      applicationsThisWeek: applicationsThisWeek || 0,
      reviewedApplications: reviewedApplications || 0,
    });
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
              className="co-cover"
              style={
                org.cover_url
                  ? {
                      backgroundImage: `url(${org.cover_url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: org.cover_position || '50% 50%',
                    }
                  : undefined
              }
            >
              <div
                className="co-logo"
                style={
                  org.logo_url
                    ? {
                        backgroundImage: `url(${org.logo_url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: org.logo_position || '50% 50%',
                      }
                    : undefined
                }
              >
                {!org.logo_url && '🏛️'}
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
                {hasInterestGroupBadge(org) && (
                  <span className="tt">
                    <i className="ti ti-shield-check" style={{ color: '#6d5aef', fontSize: 15.5 }}></i>
                    <span className="tt-bubble">
                      Grupo de interés registrado{org.interest_group_registry_number ? ` · ${org.interest_group_registry_number}` : ''}
                    </span>
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: '#555', marginBottom: 8 }}>{org.bio || SECTOR_LABELS[org.sector] || 'Añade una descripción'}</div>
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
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                {jobs.length === 0 ? (
                  <a href="/organizations/admin/company" className="btn-o" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-edit"></i> Editar página de empresa
                  </a>
                ) : (
                  <>
                    <a href="/organizations/admin/company" className="btn-p" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <i className="ti ti-edit"></i> Editar página de empresa
                    </a>
                    <a href="/organizations/admin/candidates" className="btn-ai" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <i className="ti ti-layout-kanban"></i> Tablero de candidatos
                    </a>
                  </>
                )}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 13 }}>
            {jobs.length === 0 ? (
              <a
                href="/organizations/admin/jobs?new=1"
                className="btn-ai"
                style={{
                  padding: 16,
                  borderRadius: 12,
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 3,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  <i className="ti ti-plus" style={{ marginRight: 4 }}></i> Nueva oferta
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.9 }}>Aún no tienes ofertas activas</div>
              </a>
            ) : (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1d6f5c' }}>{kpis.activeJobs}</div>
                <div style={{ fontSize: 12, color: '#888' }}>Ofertas activas</div>
              </div>
            )}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a18' }}>{kpis.totalApplications}</div>
              <div style={{ fontSize: 12, color: '#888' }}>Candidaturas (total)</div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#6d5aef' }}>{kpis.applicationsThisWeek}</div>
              <div style={{ fontSize: 12, color: '#888' }}>Candidaturas (7 días)</div>
            </div>
          </div>
        </div>

        <div>
          <ProgressChecklist
            title="Primeros pasos"
            hideWhenComplete
            items={[
              { label: 'Logo de la organización', done: !!org.logo_url },
              { label: 'Descripción de la organización', done: !!org.bio },
              { label: 'Sitio web', done: !!org.website_url },
              { label: 'Organización verificada', done: !!org.verified, onClick: () => setShowVerifyModal(true) },
              { label: 'Primera oferta publicada', done: jobs.length > 0 },
              { label: 'Primera candidatura recibida', done: kpis.totalApplications > 0 },
              { label: 'Primera candidatura revisada', done: kpis.reviewedApplications > 0 },
            ]}
            hint="Completa estos pasos para sacarle el máximo partido a GovTalent."
          />

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

          <div className="sw" style={{ marginTop: 16 }}>
            <h4>Ofertas activas</h4>
            {jobs.filter((j) => j.status === 'activa').length === 0 && (
              <div style={{ fontSize: 12.5, color: '#999', marginBottom: 10 }}>No tienes ofertas activas ahora mismo.</div>
            )}
            {jobs.filter((j) => j.status === 'activa').slice(0, 3).map((j) => (
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

      {showVerifyModal && org && (
        <VerifyOrganizationModal
          organizationId={org.id}
          organizationName={org.name}
          userId={userId}
          onClose={() => setShowVerifyModal(false)}
        />
      )}
    </div>
  );
}
