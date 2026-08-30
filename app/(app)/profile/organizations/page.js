'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';

const TYPE_LABELS = {
  empresa: 'Empresa',
  empresa_publica: 'Empresa pública',
  consultora_public_affairs: 'Consultora de Public Affairs',
  asociacion_profesional: 'Asociación profesional',
  sindicato: 'Sindicato',
  tercer_sector_ong: 'Organización del tercer sector / ONG',
  institucion_publica: 'Institución pública',
  partido_politico: 'Partido político',
  think_tank_fundacion: 'Think tank / Fundación',
  universidad_centro_educativo: 'Universidad / Institución académica',
  medios_comunicacion: 'Medios y comunicación',
  otro: 'Otro',
};

const EVENT_ICON = {
  new_job_posting: { icon: 'ti-briefcase', color: '#1d6f5c', bg: '#f0f8f5' },
  profile_updated: { icon: 'ti-user-check', color: '#6d5aef', bg: '#eeecfd' },
  new_organization: { icon: 'ti-building', color: '#888', bg: '#f4f4f0' },
  organization_verified: { icon: 'ti-shield-check', color: '#1d9d63', bg: '#eafaf1' },
};

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  if (days < 7) return `hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `hace ${weeks} semana${weeks > 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? 'es' : ''}`;
}

export default function FollowedOrganizationsPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingUnfollow, setConfirmingUnfollow] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return setLoading(false);
    setUserId(uid);

    const { data: follows } = await supabase
      .from('organization_follows')
      .select('organizations(id, slug, name, logo_url, org_type, sector, location)')
      .eq('user_id', uid);

    const followedOrgs = (follows || []).map((f) => f.organizations).filter(Boolean);
    const orgIds = followedOrgs.map((o) => o.id);

    if (orgIds.length === 0) {
      setOrgs([]);
      setLoading(false);
      return;
    }

    const [{ data: jobsData }, { data: eventsData }] = await Promise.all([
      supabase.from('jobs').select('id, title, organization_id, created_at').eq('status', 'activa').in('organization_id', orgIds),
      supabase
        .from('radar_events')
        .select('organization_id, event_type, title, occurred_at')
        .eq('is_published', true)
        .in('organization_id', orgIds)
        .order('occurred_at', { ascending: false }),
    ]);

    const merged = followedOrgs.map((org) => {
      const activeJobs = (jobsData || []).filter((j) => j.organization_id === org.id);
      const latestJob = activeJobs.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const latestEvent = (eventsData || []).find((e) => e.organization_id === org.id);

      let signal = null;
      if (latestJob && (!latestEvent || new Date(latestJob.created_at) >= new Date(latestEvent.occurred_at))) {
        signal = {
          text: `Publicó "${latestJob.title}" ${timeAgo(latestJob.created_at)}`,
          ...EVENT_ICON.new_job_posting,
        };
      } else if (latestEvent) {
        signal = {
          text: `${latestEvent.title} — ${timeAgo(latestEvent.occurred_at)}`,
          ...(EVENT_ICON[latestEvent.event_type] || EVENT_ICON.new_organization),
        };
      }

      return { ...org, activeJobsCount: activeJobs.length, signal };
    });

    setOrgs(merged);
    setLoading(false);
  }

  async function unfollow(org) {
    await supabase.from('organization_follows').delete().eq('user_id', userId).eq('organization_id', org.id);
    setOrgs((prev) => prev.filter((o) => o.id !== org.id));
    setConfirmingUnfollow(null);
  }

  if (loading) return <div className="spinner"></div>;

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 10 }}>
        <BackLink fallbackHref="/profile" fallbackLabel="Volver a mi perfil" />
      </div>

      <div className="card">
        <div className="cp">
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Organizaciones que sigues</h2>
            <p style={{ fontSize: 13, color: '#888' }}>Novedades y ofertas de las organizaciones que sigues en un solo sitio.</p>
          </div>

          {orgs.length === 0 && (
            <div className="empty-state">
              <i className="ti ti-building-off"></i>
              Todavía no sigues a ninguna organización.
              <div style={{ marginTop: 10 }}>
                <Link href="/organizations" style={{ fontSize: 12.5, color: '#1d6f5c', fontWeight: 600 }}>
                  Explorar el directorio →
                </Link>
              </div>
            </div>
          )}

          {orgs.map((org) => (
            <div key={org.id} style={{ padding: '14px 0', borderBottom: '.5px solid #f0f0eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Link href={`/organizations/${org.slug}`} style={{ flexShrink: 0 }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 10,
                      background: '#f0efe9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <i className="ti ti-building" style={{ fontSize: 18, color: '#999' }}></i>
                    )}
                  </div>
                </Link>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/organizations/${org.slug}`} style={{ fontSize: 14, fontWeight: 700, color: '#222', textDecoration: 'none' }}>
                    {org.name}
                  </Link>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {[TYPE_LABELS[org.org_type] || org.org_type, org.location].filter(Boolean).join(' · ') || 'Tipo no especificado'}
                  </div>
                </div>
                <button
                  className="btn-o"
                  onClick={() => setConfirmingUnfollow(org)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                >
                  <i className="ti ti-check"></i> Siguiendo
                </button>
              </div>

              <div style={{ marginTop: 10, marginLeft: 60 }}>
                {org.signal ? (
                  <div
                    style={{
                      background: org.signal.bg,
                      color: org.signal.color,
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <i className={`ti ${org.signal.icon}`} style={{ fontSize: 13 }}></i>
                    {org.signal.text}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#999' }}>Sin novedades recientes</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {confirmingUnfollow && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setConfirmingUnfollow(null)}>
          <div className="modal-box" style={{ maxWidth: 380, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -4 }}>
              <div className="modal-x" style={{ width: 28, height: 28 }} onClick={() => setConfirmingUnfollow(null)}>
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
              <i className="ti ti-user-minus" style={{ color: '#666', fontSize: 17 }}></i>
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6 }}>
              ¿Quieres dejar de seguir a "{confirmingUnfollow.name}"?
            </div>
            <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.5, marginBottom: 18 }}>
              Dejarás de ver sus novedades y ofertas aquí. Puedes volver a seguirla cuando quieras desde su página.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-o" onClick={() => setConfirmingUnfollow(null)}>
                Cancelar
              </button>
              <button className="btn-p" onClick={() => unfollow(confirmingUnfollow)}>
                Sí, dejar de seguir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
