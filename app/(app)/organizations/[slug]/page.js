import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SECTOR_LABELS } from '@/lib/orgTaxonomy';
import { normalizeUrl } from '@/lib/normalizeUrl';
import OrganizationFollowButton from '@/components/OrganizationFollowButton';
import OrganizationClaimBanner from '@/components/OrganizationClaimBanner';
import HoverTooltip from '@/components/HoverTooltip';
import BackLink from '@/components/BackLink';

const MODALITY_LABELS = { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

async function getOrgData(slug) {
  const supabase = createClient();

  const { data: org } = await supabase.from('organizations').select('*').eq('slug', slug).maybeSingle();
  if (!org) return { org: null };

  const [{ data: authData }, { data: jobs }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('jobs')
      .select('id, title, location, modality, created_at, is_featured')
      .eq('organization_id', org.id)
      .eq('status', 'activa')
      .order('created_at', { ascending: false }),
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

  return { org, jobs: jobs || [], userId, following };
}

function buildOrganizationJsonLd(org) {
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Organization',
    name: org.name,
    url: `${SITE_URL}/organizations/${org.slug}`,
  };

  if (org.logo_url) jsonLd.logo = org.logo_url;
  if (org.website_url) jsonLd.sameAs = [normalizeUrl(org.website_url)];
  if (org.bio || org.sector) jsonLd.description = org.bio || SECTOR_LABELS[org.sector];
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
  const { org, jobs, userId, following } = await getOrgData(params.slug);

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

      {/* A una ficha de organización se llega desde el directorio, desde
          una oferta, desde el mapa de un proyecto o desde un actor: el
          buscador casi nunca es el sitio del que vienes. BackLink usa el
          historial y solo cae al directorio si no hay a dónde volver. */}
      {userId && (
        <div style={{ maxWidth: 900, margin: '0 auto 10px' }}>
          <BackLink fallbackHref="/organizations" fallbackLabel="Volver al buscador" />
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
              <HoverTooltip label="Página verificada por la organización">
                <i className="ti ti-circle-check-filled" style={{ color: '#2563eb', fontSize: 17 }}></i>
              </HoverTooltip>
            )}
          </div>
          {!org.verified && userId && (
            <div className="badge bgr" style={{ display: 'inline-flex', marginBottom: 8, width: 'fit-content' }}>
              <i className="ti ti-clock" style={{ fontSize: 11 }}></i> No verificada por la organización
            </div>
          )}
          <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>{org.bio || SECTOR_LABELS[org.sector]}</div>
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

      {/* La tarjeta negra en vez del banner morado con degradado.

          Antes eran cuatro promesas en pastillas y un botón grande, un
          bloque de media pantalla para decir "regístrate". La tarjeta
          negra es el lenguaje que ya usa la plataforma para hablar en su
          propia voz, ocupa un tercio y dice lo mismo. */}
      {!userId && (
        <div
          style={{
            maxWidth: 900,
            margin: '0 auto 16px',
            background: '#15140f',
            borderRadius: 16,
            padding: '22px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 230 }}>
            <div style={{ fontSize: 11.5, color: '#8f7ff5', letterSpacing: '.3px', marginBottom: 9 }}>
              TRABAJA CON {(org.name || '').toUpperCase()}
            </div>
            <div style={{ fontSize: 14.5, color: '#fff', lineHeight: 1.5 }}>
              Recibe un aviso cuando publique una oferta, sigue su actividad y accede al resto del sector.
            </div>
          </div>
          <Link
            href="/login?view=signup"
            style={{
              fontSize: 12.5,
              background: '#6d5aef',
              color: '#fff',
              borderRadius: 9,
              padding: '10px 20px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Regístrate gratis
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
            {/* Se enseñan TODAS, también a quien no ha entrado.

                Antes se recortaban a tres y se pedía registro para ver
                el resto. Quien llega aquí desde Google viene justo a ver
                las ofertas: esconderlas es tirar el tráfico que más
                interesa. El registro se pide en la tarjeta negra de
                arriba, sin bloquear el contenido.

                Y cada oferta lleva ahora a su propia página en vez de al
                listado general, que obligaba a buscarla otra vez. */}
            {jobs.map((j) => (
              <Link
                href={`/empleo/${j.id}`}
                key={j.id}
                className="ji"
                style={{ borderRadius: 8, marginBottom: 7, display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <div className="jt">{j.title}</div>
                <div className="jo">
                  {[j.location, MODALITY_LABELS[j.modality]].filter(Boolean).join(' · ')}
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
                  <a href={normalizeUrl(org.website_url)} target="_blank" rel="noreferrer" style={{ color: '#1d6f5c', fontWeight: 500 }}>
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
