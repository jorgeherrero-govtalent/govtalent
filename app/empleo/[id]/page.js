import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import PublicJobApplyButton from '@/components/PublicJobApplyButton';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

const MODALITY_LABELS = { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' };
const TYPE_LABELS = {
  empresa: 'Empresa',
  consultora_public_affairs: 'Consultora',
  tercer_sector_ong: 'ONG / Tercer sector',
  partido_politico: 'Partido político',
  institucion_publica: 'Institución pública',
  think_tank_fundacion: 'Think tank',
  medios_comunicacion: 'Medios',
  universidad_centro_educativo: 'Centro educativo',
  asociacion_profesional: 'Asociación profesional',
  otro: 'Otro',
};

// Las mismas etiquetas que usa el listado interno de empleos, para que
// una oferta no se llame distinto dentro y fuera de la plataforma.
const EMPLOYMENT_LABELS = {
  jornada_completa: 'Jornada completa',
  media_jornada: 'Media jornada',
  practicas: 'Prácticas',
  freelance: 'Freelance',
  temporal: 'Temporal',
};

const EMPLOYMENT_TYPE_SCHEMA = {
  jornada_completa: 'FULL_TIME',
  media_jornada: 'PART_TIME',
  practicas: 'INTERN',
  freelance: 'CONTRACTOR',
  temporal: 'TEMPORARY',
};

const TARJETA = {
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 1px 2px rgba(0,0,0,.04)',
  padding: '24px 26px',
  marginBottom: 14,
};

const TEXTO = { fontSize: 13, color: '#57534e', lineHeight: 1.65, whiteSpace: 'pre-wrap' };

function Seccion({ titulo, primera }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18', margin: primera ? '0 0 8px' : '22px 0 8px' }}>
      {titulo}
    </div>
  );
}

function buildJobPostingJsonLd(job, org) {
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: (job.published_at || job.created_at || '').slice(0, 10),
    hiringOrganization: {
      '@type': 'Organization',
      name: org?.name || 'GovTalent',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.location || undefined,
        addressCountry: 'ES',
      },
    },
    identifier: {
      '@type': 'PropertyValue',
      name: 'GovTalent',
      value: job.id,
    },
    url: `${SITE_URL}/empleo/${job.id}`,
  };

  if (job.closes_at) {
    jsonLd.validThrough = job.closes_at;
  }

  if (EMPLOYMENT_TYPE_SCHEMA[job.employment_type]) {
    jsonLd.employmentType = EMPLOYMENT_TYPE_SCHEMA[job.employment_type];
  }

  if (job.modality === 'remoto') {
    jsonLd.jobLocationType = 'TELECOMMUTE';
    jsonLd.applicantLocationRequirements = {
      '@type': 'Country',
      name: 'ES',
    };
  }

  if (job.salary_min || job.salary_max) {
    jsonLd.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: job.salary_currency || 'EUR',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.salary_min || job.salary_max,
        maxValue: job.salary_max || job.salary_min,
        unitText: 'YEAR',
      },
    };
  }

  return jsonLd;
}

async function getJob(id) {
  const supabase = createClient();
  const { data } = await supabase
    .from('jobs')
    .select(
      `*, organizations ( name, slug, logo_url, org_type, bio ),
       job_requirements ( content, sort_order ),
       job_responsibilities ( content, sort_order ),
       job_tags ( tag )`
    )
    .eq('id', id)
    .eq('status', 'activa')
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }) {
  const job = await getJob(params.id);
  if (!job) {
    return { title: 'Oferta no disponible · GovTalent' };
  }
  const title = `${job.title} en ${job.organizations?.name} · GovTalent`;
  const description = (job.description || '').slice(0, 155);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/empleo/${job.id}`,
      siteName: 'GovTalent',
      locale: 'es_ES',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function PublicJobPage({ params }) {
  const job = await getJob(params.id);

  if (!job) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PublicHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Esta oferta ya no está disponible</div>
          <p style={{ color: '#888', fontSize: 14 }}>Puede que se haya cerrado o que el enlace no sea correcto.</p>
          <Link href="/jobs" className="btn-p" style={{ textDecoration: 'none' }}>
            Ver empleos disponibles
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const org = job.organizations;
  const requirements = [...(job.job_requirements || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const responsibilities = [...(job.job_responsibilities || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const jobPostingJsonLd = buildJobPostingJsonLd(job, org);

  // Los datos que alguien mira antes de decidir si sigue leyendo. Antes
  // estaban repartidos entre las etiquetas de arriba y una línea suelta
  // debajo del botón; el salario, que es lo primero que se busca, era lo
  // último que aparecía.
  const claves = [
    job.location && { icono: 'map-pin', texto: job.location },
    job.modality && { icono: 'building', texto: MODALITY_LABELS[job.modality] },
    job.employment_type && { icono: 'clock', texto: EMPLOYMENT_LABELS[job.employment_type] },
    (job.salary_min || job.salary_max) && {
      icono: 'cash',
      texto: [job.salary_min?.toLocaleString('es-ES'), job.salary_max?.toLocaleString('es-ES')]
        .filter(Boolean)
        .join(' – ') + ' €',
    },
  ].filter(Boolean);

  // Prueba social, y solo cuando dice algo. "1 candidatura" o "3 visitas"
  // restan en vez de sumar, así que por debajo de esos umbrales no sale.
  const interes = [
    job.application_count >= 3 && `${job.application_count} candidaturas`,
    job.views_count >= 10 && `${job.views_count} personas la han visto`,
  ].filter(Boolean);

  return (
    <div style={{ minHeight: '100vh', background: '#f0efe9', display: 'flex', flexDirection: 'column' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd) }} />
      <PublicHeader />

      <div style={{ maxWidth: 720, margin: '20px auto 40px', flex: 1, width: '100%', padding: '0 16px' }}>
        <div style={TARJETA}>
          <Link
            href={org?.slug ? `/organizations/${org.slug}` : '#'}
            style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, textDecoration: 'none', color: 'inherit' }}
          >
            <span
              style={{
                width: 46,
                height: 46,
                borderRadius: 10,
                background: '#f5f4f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {org?.logo_url ? (
                <img src={org.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <i className="ti ti-building" style={{ fontSize: 20, color: '#a8a49c' }}></i>
              )}
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{org?.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: '#8b8780' }}>
                {[TYPE_LABELS[org?.org_type], job.location].filter(Boolean).join(' · ')}
              </span>
            </span>
          </Link>

          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.4px', lineHeight: 1.25, margin: '0 0 14px' }}>
            {job.title}
          </h1>

          {claves.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 18,
                flexWrap: 'wrap',
                paddingBottom: 18,
                borderBottom: '.5px solid #f2f0ec',
                marginBottom: 18,
              }}
            >
              {claves.map((c) => (
                <span key={c.texto} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#57534e' }}>
                  <i className={`ti ti-${c.icono}`} style={{ fontSize: 14, color: '#a8a49c' }}></i>
                  {c.texto}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <PublicJobApplyButton
              jobId={job.id}
              label="Solicitar"
              applicationMode={job.application_mode}
              externalApplyUrl={job.external_apply_url}
            />
            {interes.length > 0 && (
              <span style={{ fontSize: 11.5, color: '#8b8780' }}>{interes.join(' · ')}</span>
            )}
          </div>
        </div>

        <div style={TARJETA}>
          <Seccion titulo="Descripción" primera />
          <div style={TEXTO}>{job.description}</div>

          {responsibilities.length > 0 && (
            <>
              <Seccion titulo="Responsabilidades" />
              <ul style={{ ...TEXTO, margin: 0, paddingLeft: 18 }}>
                {responsibilities.map((r, i) => (
                  <li key={i} style={{ marginBottom: 5 }}>
                    {r.content}
                  </li>
                ))}
              </ul>
            </>
          )}

          {requirements.length > 0 && (
            <>
              <Seccion titulo="Requisitos" />
              <ul style={{ ...TEXTO, margin: 0, paddingLeft: 18 }}>
                {requirements.map((r, i) => (
                  <li key={i} style={{ marginBottom: 5 }}>
                    {r.content}
                  </li>
                ))}
              </ul>
            </>
          )}

          {job.job_tags?.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 22,
                paddingTop: 18,
                borderTop: '.5px solid #f2f0ec',
              }}
            >
              {job.job_tags.map((t, i) => (
                <span
                  key={i}
                  style={{ fontSize: 11.5, background: '#f4f4f0', color: '#57534e', borderRadius: 20, padding: '4px 11px' }}
                >
                  {t.tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {org && (
          <div style={TARJETA}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Sobre {org.name}</span>
              {org.slug && (
                <Link href={`/organizations/${org.slug}`} style={{ fontSize: 12, color: '#8b8780', textDecoration: 'none' }}>
                  Ver su página →
                </Link>
              )}
            </div>
            {org.bio && <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6 }}>{org.bio}</div>}
          </div>
        )}

        {/* El registro, en la tarjeta negra: es el lenguaje que ya usa la
            plataforma para hablar en su propia voz. Antes era un segundo
            botón de solicitar con otro texto, y dos botones que hacen lo
            mismo con nombres distintos confunden. */}
        <div
          className="bento"
          style={{
            background: '#15140f',
            borderRadius: 16,
            padding: '22px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 220, fontSize: 14.5, color: '#fff', lineHeight: 1.5 }}>
            Esta es una de las ofertas del ecosistema de asuntos públicos. Regístrate y recibe las que encajen con tu
            perfil.
          </div>
          <Link
            href="/login?view=signup"
            className="btn-mov"
            style={{
              fontSize: 12.5,
              background: '#6d5aef',
              color: '#fff',
              borderRadius: 9,
              padding: '10px 20px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              textDecoration: 'none',
            }}
          >
            Crear cuenta gratis
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
