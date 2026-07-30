'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { hasInterestGroupBadge } from '@/lib/interestGroupBadge';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import ClaimOrganizationModal from '@/components/ClaimOrganizationModal';

const ACTIVITY_TYPE_LABELS = {
  reunion_audiencia: 'Reunión o audiencia',
  conferencia_formacion: 'Conferencia o formación',
  campana_comunicacion: 'Campaña de comunicación',
  documento_posicion: 'Documento o posición entregado',
  otro: 'Otro',
};

export default function OrganizationPublicPage() {
  const { slug } = useParams();
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [publicActivities, setPublicActivities] = useState([]);
  const [userId, setUserId] = useState(null);
  const [following, setFollowing] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimSubmitted, setClaimSubmitted] = useState(false);

  useEffect(() => {
    load();
  }, [slug]);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    setUserId(uid);

    const { data: o } = await supabase.from('organizations').select('*').eq('slug', slug).single();
    setOrg(o);
    if (!o) return;

    const { data: js } = await supabase
      .from('jobs')
      .select('id, title, location, modality, created_at, is_featured')
      .eq('organization_id', o.id)
      .eq('status', 'activa')
      .order('created_at', { ascending: false });
    setJobs(js || []);

    const { data: acts } = await supabase
      .from('influence_activities')
      .select('id, activity_date, activity_type, counterpart_name, subject')
      .eq('organization_id', o.id)
      .eq('is_public', true)
      .order('activity_date', { ascending: false })
      .limit(15);
    setPublicActivities(acts || []);

    if (uid) {
      const { data: f } = await supabase
        .from('organization_follows')
        .select('*')
        .eq('user_id', uid)
        .eq('organization_id', o.id)
        .maybeSingle();
      setFollowing(!!f);
    }
  }

  async function toggleFollow() {
    if (!userId || !org) return;
    if (following) {
      await supabase.from('organization_follows').delete().eq('user_id', userId).eq('organization_id', org.id);
      setFollowing(false);
      toast(`Has dejado de seguir a ${org.name}`);
    } else {
      await supabase.from('organization_follows').insert({ user_id: userId, organization_id: org.id });
      setFollowing(true);
      toast(`Ahora sigues a ${org.name}`);
    }
  }

  if (!org) return <div className="spinner"></div>;

  return (
    <div className="sec">
      <div style={{ maxWidth: 900, margin: '0 auto 10px' }}>
        <Link href="/organizations" style={{ fontSize: 12.5, color: '#1d6f5c', textDecoration: 'none' }}>
          <i className="ti ti-arrow-left"></i> Volver al buscador
        </Link>
      </div>

      <div className="card" style={{ maxWidth: 900, margin: '0 auto 13px' }}>
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
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            {org.name}
            {org.verified && (
              <span className="tt">
                <i className="ti ti-circle-check-filled" style={{ color: '#1d9d63', fontSize: 17 }}></i>
                <span className="tt-bubble">Página verificada por la organización</span>
              </span>
            )}
            {hasInterestGroupBadge(org) && (
              <span className="tt">
                <i className="ti ti-shield-check" style={{ color: '#6d5aef', fontSize: 17 }}></i>
                <span className="tt-bubble">
                  Grupo de interés registrado{org.interest_group_registry_number ? ` · ${org.interest_group_registry_number}` : ''}
                </span>
              </span>
            )}
          </div>
          {!org.verified && (
            <div className="badge bgr" style={{ display: 'inline-flex', marginBottom: 8, width: 'fit-content' }}>
              <i className="ti ti-clock" style={{ fontSize: 11 }}></i> No verificada por la organización
            </div>
          )}
          <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>{org.bio || org.sector}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: '#888', marginBottom: 12 }}>
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
          <button className={following ? 'btn-o' : 'btn-p'} onClick={toggleFollow}>
            <i className={`ti ${following ? 'ti-check' : 'ti-plus'}`}></i> {following ? 'Siguiendo' : 'Seguir'}
          </button>
        </div>
      </div>

      {!org.claimed && userId && (
        <div
          style={{
            maxWidth: 900,
            margin: '0 auto 16px',
            background: '#f0f8f5',
            border: '1px solid #c0e4d8',
            borderRadius: 12,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="ti ti-building-community" style={{ color: '#1d6f5c', fontSize: 20 }}></i>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1a18' }}>¿Eres de {org.name}?</div>
              <div style={{ fontSize: 12, color: '#666' }}>Reclama esta página para gestionarla y publicar ofertas.</div>
            </div>
          </div>
          {claimSubmitted ? (
            <span style={{ fontSize: 12.5, color: '#1d6f5c', fontWeight: 600 }}>
              <i className="ti ti-clock" style={{ fontSize: 13 }}></i> Solicitud enviada, en revisión
            </span>
          ) : (
            <button className="btn-p" onClick={() => setShowClaimModal(true)}>
              <i className="ti ti-shield-check"></i> Reclamar esta página
            </button>
          )}
        </div>
      )}

      {showClaimModal && (
        <ClaimOrganizationModal
          organizationId={org.id}
          organizationName={org.name}
          userId={userId}
          onClose={() => setShowClaimModal(false)}
          onSubmitted={() => setClaimSubmitted(true)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 13, maxWidth: 900, margin: '0 auto' }}>
        <div className="card">
          <div className="p-sec" style={{ borderBottom: 'none' }}>
            <h3>Empleos activos en esta organización</h3>
            {jobs.length === 0 && <div style={{ fontSize: 13, color: '#999' }}>Sin ofertas activas por ahora.</div>}
            {jobs.map((j) => (
              <Link
                href="/jobs"
                key={j.id}
                className="ji"
                style={{ borderRadius: 8, marginBottom: 7, display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <div className="jt">{j.title}</div>
                <div className="jo">
                  {org.name} · {j.location}
                </div>
                {j.is_featured && (
                  <div style={{ marginTop: 5 }}>
                    <span className="badge by">★ Destacado</span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="sw">
            <h4>Información de la organización</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: '#555' }}>
              {org.website_url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="ti ti-world" style={{ color: '#1d6f5c', fontSize: 15, width: 16 }}></i>
                  <a href={org.website_url} target="_blank" rel="noreferrer" style={{ color: '#1d6f5c', fontWeight: 500 }}>
                    {org.website_url.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
              {org.linkedin_url && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="ti ti-brand-linkedin" style={{ color: '#1d6f5c', fontSize: 15, width: 16 }}></i>
                  <a href={org.linkedin_url} target="_blank" rel="noreferrer" style={{ color: '#1d6f5c', fontWeight: 500 }}>
                    LinkedIn
                  </a>
                </div>
              )}
              {org.founded_year && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="ti ti-calendar" style={{ color: '#888', fontSize: 15, width: 16 }}></i>
                  Fundada en {org.founded_year}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {publicActivities.length > 0 && (
        <div className="card" style={{ maxWidth: 900, margin: '13px auto 0', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <i className="ti ti-shield-check" style={{ color: '#6d5aef', fontSize: 17 }}></i>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Actividad de transparencia</h3>
          </div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
            Contactos y actividades de influencia que esta organización ha hecho públicos voluntariamente, en línea
            con la Ley de Transparencia e Integridad de los Grupos de Interés.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {publicActivities.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 12, paddingBottom: 12, borderBottom: '.5px solid #e0dfd8' }}>
                <div style={{ fontSize: 11.5, color: '#999', minWidth: 84, flexShrink: 0 }}>{a.activity_date}</div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#333' }}>
                    {ACTIVITY_TYPE_LABELS[a.activity_type] || a.activity_type}
                    {a.counterpart_name ? ` — ${a.counterpart_name}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>{a.subject}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
