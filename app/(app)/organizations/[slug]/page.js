'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

export default function OrganizationPublicPage() {
  const { slug } = useParams();
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [userId, setUserId] = useState(null);
  const [following, setFollowing] = useState(false);

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
              ? { backgroundImage: `url(${org.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
        >
          <div className="co-logo">
            {org.logo_url ? <img src={org.logo_url} alt="" /> : '🏛️'}
          </div>
        </div>
        <div className="co-info">
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>{org.name}</div>
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
    </div>
  );
}
