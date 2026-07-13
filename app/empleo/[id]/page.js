import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import PublicJobApplyButton from '@/components/PublicJobApplyButton';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.vercel.app';

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

async function getJob(id) {
  const supabase = createClient();
  const { data } = await supabase
    .from('jobs')
    .select(
      `*, organizations ( name, slug, logo_url, org_type ),
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Esta oferta ya no está disponible</div>
        <p style={{ color: '#888', fontSize: 14 }}>Puede que se haya cerrado o que el enlace no sea correcto.</p>
        <Link href="/jobs" className="btn-p" style={{ textDecoration: 'none' }}>
          Ver empleos disponibles
        </Link>
      </div>
    );
  }

  const org = job.organizations;
  const requirements = [...(job.job_requirements || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const responsibilities = [...(job.job_responsibilities || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return (
    <div style={{ minHeight: '100vh', background: '#f4f3ee' }}>
      <div style={{ background: '#fff', borderBottom: '.5px solid #e0dfd8', padding: '14px 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/jobs" style={{ fontWeight: 800, fontSize: 19, textDecoration: 'none', color: '#1a1a18' }}>
            gov<span style={{ background: '#1d6f5c', color: '#fff', padding: '1px 6px', borderRadius: 5 }}>talent</span>
          </Link>
          <Link href="/login" style={{ fontSize: 13, color: '#1d6f5c', textDecoration: 'none', fontWeight: 500 }}>
            Iniciar sesión
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '20px auto', padding: '0 20px 60px' }}>
        <div className="card" style={{ padding: 24 }}>
          <Link
            href={org?.slug ? `/organizations/${org.slug}` : '#'}
            style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, textDecoration: 'none', color: 'inherit' }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: '#e8f4f0',
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
                <i className="ti ti-building" style={{ fontSize: 22 }}></i>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{org?.name}</div>
              <div style={{ fontSize: 12.5, color: '#888' }}>{TYPE_LABELS[org?.org_type]}</div>
            </div>
          </Link>

          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>{job.title}</h1>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <span className="badge bg">{job.area}</span>
            <span className="badge bgr">{MODALITY_LABELS[job.modality]}</span>
            <span className="badge bgr">{job.location}</span>
          </div>

          <div style={{ marginBottom: 24 }}>
            <PublicJobApplyButton jobId={job.id} />
          </div>

          {(job.salary_min || job.salary_max) && (
            <div style={{ fontSize: 13.5, color: '#555', marginBottom: 20 }}>
              <i className="ti ti-cash" style={{ color: '#888' }}></i>{' '}
              {job.salary_min?.toLocaleString('es-ES')} – {job.salary_max?.toLocaleString('es-ES')} €
            </div>
          )}

          {job.job_tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
              {job.job_tags.map((t, i) => (
                <div key={i} style={{ padding: '5px 10px', borderRadius: 6, background: '#f4f4f0', color: '#555', fontSize: 12.5 }}>
                  <i className="ti ti-tag" style={{ fontSize: 12 }}></i> {t.tag}
                </div>
              ))}
            </div>
          )}

          <div className="jd-sec">Descripción</div>
          <div className="jd-txt">{job.description}</div>

          {responsibilities.length > 0 && (
            <>
              <div className="jd-sec">Responsabilidades</div>
              <div className="jd-txt">
                <ul>
                  {responsibilities.map((r, i) => (
                    <li key={i}>{r.content}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {requirements.length > 0 && (
            <>
              <div className="jd-sec">Requisitos</div>
              <div className="jd-txt">
                <ul>
                  {requirements.map((r, i) => (
                    <li key={i}>{r.content}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <div style={{ marginTop: 26, paddingTop: 20, borderTop: '.5px solid #e0dfd8' }}>
            <PublicJobApplyButton jobId={job.id} />
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#999', marginTop: 16 }}>
          Publicado en{' '}
          <Link href="/jobs" style={{ color: '#1d6f5c' }}>
            GovTalent
          </Link>{' '}
          — la plataforma de talento para asuntos públicos, política y gobierno.
        </p>
      </div>
    </div>
  );
}
