import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { hasInterestGroupBadge } from '@/lib/interestGroupBadge';
import OrganizationFollowButton from '@/components/OrganizationFollowButton';
import OrganizationClaimBanner from '@/components/OrganizationClaimBanner';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

const ACTIVITY_TYPE_LABELS = {
  reunion_audiencia: 'Reunión o audiencia',
  conferencia_formacion: 'Conferencia o formación',
  campana_comunicacion: 'Campaña de comunicación',
  documento_posicion: 'Documento o posición entregado',
  otro: 'Otro',
};

async function getOrgData(slug) {
  const supabase = createClient();

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', slug).maybeSingle();
  if (!org) return { org: null };

  const [{ data: authData }, { data: jobs }, { data: activities }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('jobs')
      .select('id, title, location, modality, created_at, is_featured')
      .eq('organization_id', org.id)
      .eq('status', 'activa')
      .order('created_at', { ascending: false }),
    supabase
      .from('influence_activities')
      .select('id, activity_date, activity_type, counterpart_name, subject')
      .eq('organization_id', org.id)
      .eq('is_public', true)
      .order('activity_date', { ascending: false })
      .limit(15),
  ]);

  const userId = authData?.user?.id || null;

  let following = false;
  if (userId) {
    const { data: f } = await supabase
      .from('organization_follows')
      .select('user_id')
      .eq('user_id', userId)
      .eq('organization_id', org.id)
      .maybeSingle();
    following = !!f;
  }

  return { org, jobs: jobs || [], activities: activities || [], userId, following };
}

function buildOrganizationJsonLd(org) {
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Organization',
    name: org.name,
    url: `${SITE_URL}/organizations/${org.slug}`,
  };

  if (org.logo_url) jsonLd.logo = org.logo_url;
  if (org.website_url) jsonLd.sameAs = [org.website_url];
  if (org.bio || org.sector) jsonLd.description = org.bio || org.sector;
  if (org.location) {
    jsonLd.address = {
      '@type': 'PostalAddress',
      addressLocality: org.location,
      addressCountry: 'ES',
    };
  }

  return jsonLd;
}

export async function generateMetadata({ params }) {
  const { org } = await getOrgData(params.slug);

  if (!org) {
    return { title: 'Organización no encontrada · GovTalent' };
  }

  const title = `${org.name} — Empleo en asuntos públicos · GovTalent`;
  const description = (
    org.bio ||
    `Descubre las ofertas de empleo de ${org.name} en asuntos públicos, relaciones institucionales y comunicación.`
  ).slice(0, 155);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/organizations/${org.slug}`,
      siteName: 'GovTalent',
      locale: 'es_ES',
      type: 'website',
      images: org.logo_url ? [{ url: org.logo_url }] : undefined,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function OrganizationPublicPage({ params }) {
  const { org, jobs, activities, userId, following } = await getOrgData(params.slug);

  if (!org) {
    return (
      <div className="sec">
        <div style={{ maxWidth: 900, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Organización no encontrada</div>
          <Link href="/organizations" className="btn-p" style={{ textDecoration: 'none' }}>
            Volver al buscador
          </Link>
        </div>
      </div>
    );
  }

  const jsonLd = buildOrganizationJsonLd(org);

  return (
    <div className="sec">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {userId && (
        <div style={{ maxWidth: 900, margin: '0 auto 10px' }}>
          <Link href="/organizations" style={{ fontSize: 12.5, color: '#1d6f5c', textDecoration: 'none' }}>
            <i className="ti ti-arrow-left"></i> Volver al buscador
          </Link>
        </div>
      )}

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
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
          {!org.verified && userId && (
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
          <OrganizationFollowButton
            organizationId={org.id}
            organizationName={org.name}
            userId={userId}
            initialFollowing={following}
          />
        </div>
      </div>

      <OrganizationClaimBanner
        organizationId={org.id}
        organizationName={org.name}
        claimed={!!org.claimed}
        userId={userId}
      />

      {!userId && (
        <div
          className="org-cta-banner"
          style={{
            maxWidth: 900,
            margin: '0 auto 16px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, #6d5aef 0%, #2f2266 100%)',
            boxShadow: '0 10px 28px rgba(47,34,102,0.24)',
            textAlign: 'center',
          }}
        >
          <div className="org-cta-headline" style={{ fontWeight: 800, color: '#fff', marginBottom: 18, letterSpacing: '-0.01em' }}>
            ¿Quieres trabajar o colaborar con {org.name}?
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
            Regístrate ahora para:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
            {[
              'Recibir alertas cuando publique nuevas ofertas',
              'Seguir su actividad',
              'Descubrir organizaciones similares',
              'Acceder a toda la red profesional del sector',
            ].map((label) => (
              <span
                key={label}
                style={{
                  fontSize: 12.5,
                  color: '#fff',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  borderRadius: 20,
                  padding: '6px 14px',
                }}
              >
                ✅ {label}
              </span>
            ))}
          </div>
          <Link
            href="/login?view=signup"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#fff',
              color: '#3d2f8f',
              fontWeight: 800,
              fontSize: 15,
              padding: '13px 30px',
              borderRadius: 999,
              boxShadow: '0 8px 22px rgba(0,0,0,0.2)',
              letterSpacing: '-0.005em',
            }}
          >
            Regístrate gratis <i className="ti ti-arrow-right" style={{ fontSize: 16 }}></i>
          </Link>
        </div>
      )}

      <div className="org-layout-grid">
        <div className="card">
          <div className="p-sec" style={{ borderBottom: 'none' }}>
            <h3>Empleos activos en esta organización</h3>
            {jobs.length === 0 &&
              (userId ? (
                <div style={{ fontSize: 13, color: '#999' }}>Sin ofertas activas por ahora.</div>
              ) : (
                <div style={{ fontSize: 13, color: '#999' }}>
                  <Link href="/login?view=signup" style={{ color: '#1d6f5c', fontWeight: 600, textDecoration: 'none' }}>
                    Regístrate
                  </Link>{' '}
                  y recibe una alerta cuando esta organización publique una oferta.
                </div>
              ))}
            {(!userId ? jobs.slice(0, 3) : jobs).map((j) => (
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
            {!userId && jobs.length > 3 && (
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <Link
                  href="/login?view=signup"
                  style={{ fontSize: 13, color: '#1d6f5c', fontWeight: 600, textDecoration: 'none' }}
                >
                  Regístrate y revisa todas las ofertas
                </Link>
              </div>
            )}
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

      {activities.length > 0 && (
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
            {activities.map((a) => (
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
