import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';
const FOUNDING_MEMBER_SEATS = 30;

export const metadata = {
  title: 'Precios para organizaciones · GovTalent',
  description:
    'Planes para organizaciones que contratan talento de asuntos públicos, política y gobierno en GovTalent.',
  openGraph: {
    title: 'Precios para organizaciones · GovTalent',
    description:
      'Planes para organizaciones que contratan talento de asuntos públicos, política y gobierno en GovTalent.',
    url: `${SITE_URL}/precios`,
    siteName: 'GovTalent',
    locale: 'es_ES',
    type: 'website',
  },
};

async function getData() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { count } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('is_founding_member', true);
  return { loggedIn: !!authData.user, foundingTaken: count || 0 };
}

function Check({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#3a3a36', marginBottom: 9 }}>
      <i className="ti ti-check" style={{ color: '#1d6f5c', fontSize: 15, marginTop: 1, flexShrink: 0 }}></i>
      <span>{children}</span>
    </div>
  );
}

function CrossedOut({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#b5b3ac', marginBottom: 9 }}>
      <i className="ti ti-x" style={{ fontSize: 15, marginTop: 1, flexShrink: 0 }}></i>
      <span>{children}</span>
    </div>
  );
}

export default async function PricingPage() {
  const { loggedIn, foundingTaken } = await getData();
  const foundingLeft = Math.max(0, FOUNDING_MEMBER_SEATS - foundingTaken);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f4f3ee' }}>
      <div style={{ background: '#fff', borderBottom: '.5px solid #e0dfd8', padding: '14px 20px' }}>
        <div
          style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Link href="/jobs" style={{ fontWeight: 800, fontSize: 19, textDecoration: 'none', color: '#1a1a18' }}>
            gov<span style={{ background: '#1d6f5c', color: '#fff', padding: '1px 6px', borderRadius: 5 }}>talent</span>
          </Link>
          <Link
            href={loggedIn ? '/organizations/admin' : '/login'}
            style={{ fontSize: 13, color: '#1d6f5c', textDecoration: 'none', fontWeight: 500 }}
          >
            {loggedIn ? 'Ir a mi organización' : 'Iniciar sesión'}
          </Link>
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 960, margin: '0 auto', padding: '48px 20px 64px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a1a18', marginBottom: 10 }}>
            Precios para organizaciones
          </h1>
          <p style={{ fontSize: 14.5, color: '#666', maxWidth: 560, margin: '0 auto' }}>
            Atrae el mejor talento, publica ofertas de empleo, gestiona candidatos con un ATS integrado, descubre el
            mayor directorio de organizaciones del sector y accede a inteligencia de mercado especializada. Todo
            desde una única plataforma.
          </p>
        </div>

        {foundingLeft > 0 && (
          <div
            style={{
              background: 'linear-gradient(135deg, #6d5aef 0%, #2f2266 100%)',
              borderRadius: 16,
              padding: '22px 26px',
              marginBottom: 32,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                  Founding Member — 199€/año, precio para siempre
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)' }}>
                  Acceso al plan Pro con un 50% de descuento de por vida. Solo para las 30 primeras organizaciones.
                </div>
              </div>
              <Link
                href="/login?view=signup"
                style={{
                  textDecoration: 'none',
                  background: '#fff',
                  color: '#3d2f8f',
                  fontWeight: 700,
                  fontSize: 13.5,
                  padding: '10px 22px',
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                }}
              >
                Reservar mi plaza
              </Link>
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: 'rgba(255,255,255,0.85)',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <i className="ti ti-flame" style={{ fontSize: 13 }}></i>
              {foundingTaken} organizaciones ya se han unido — quedan {foundingLeft} de {FOUNDING_MEMBER_SEATS} plazas
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.18)', overflow: 'hidden', maxWidth: 200 }}>
              <div
                style={{
                  height: '100%',
                  width: `${(foundingTaken / FOUNDING_MEMBER_SEATS) * 100}%`,
                  background: '#fff',
                  borderRadius: 4,
                }}
              ></div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: '26px 22px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a18', marginBottom: 2 }}>Free</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a18', marginBottom: 4 }}>
              0€ <span style={{ fontSize: 12.5, fontWeight: 400, color: '#999' }}>/ siempre</span>
            </div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 18 }}>Empieza sin compromiso</div>
            <Check>Ficha de organización con badge de verificación</Check>
            <Check>Personalización de tu página</Check>
            <Check>1 oferta activa</Check>
            <Check>Registro de transparencia</Check>
            <Check>Resumen de candidatos con IA</Check>
            <Check>Publica hasta 2 eventos</Check>
            <CrossedOut>Descripción de oferta con IA</CrossedOut>
            <CrossedOut>Matching de candidatos con IA</CrossedOut>
            <CrossedOut>Directorio inteligente de organizaciones</CrossedOut>
            <Link
              href="/login?view=signup"
              className="btn-o"
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 18 }}
            >
              Empezar gratis
            </Link>
          </div>

          <div className="card" style={{ padding: '26px 22px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a18', marginBottom: 2 }}>Plus</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a18', marginBottom: 4 }}>
              299€ <span style={{ fontSize: 12.5, fontWeight: 400, color: '#999' }}>/ año</span>
            </div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 18 }}>
              Todo lo necesario para contratar y atraer talento
            </div>
            <Check>Todo lo de Free</Check>
            <Check>Ofertas ilimitadas</Check>
            <Check>Descripción de oferta con IA</Check>
            <Check>Publica eventos de manera ilimitada</Check>
            <CrossedOut>Matching de candidatos con IA</CrossedOut>
            <CrossedOut>Directorio inteligente de organizaciones</CrossedOut>
            <Link
              href="/login?view=signup"
              className="btn-o"
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 18 }}
            >
              Probar 5 días gratis
            </Link>
          </div>

          <div className="card" style={{ padding: '26px 22px', border: '2px solid #1d6f5c' }}>
            <div
              style={{
                display: 'inline-block',
                fontSize: 10.5,
                fontWeight: 700,
                color: '#1d6f5c',
                background: '#e8f5f0',
                padding: '3px 10px',
                borderRadius: 20,
                marginBottom: 8,
              }}
            >
              MÁS COMPLETO
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a18', marginBottom: 2 }}>Pro</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a18', marginBottom: 4 }}>
              399€ <span style={{ fontSize: 12.5, fontWeight: 400, color: '#999' }}>/ año</span>
            </div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 18 }}>
              Todo el potencial de GovTalent: talento, inteligencia y herramientas avanzadas
            </div>
            <Check>Todo lo de Plus</Check>
            <Check>Matching de candidatos con IA</Check>
            <Check>Directorio inteligente de organizaciones</Check>
            <Check>Filtros avanzados, exportación y BI</Check>
            <Check>Varios usuarios de equipo</Check>
            <Check>Nuevas funcionalidades en desarrollo, incluidas sin coste adicional</Check>
            <Link
              href="/login?view=signup"
              className="btn-p"
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 18 }}
            >
              Probar 5 días gratis
            </Link>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 32, fontSize: 12.5, color: '#999' }}>
          Todas las organizaciones nuevas empiezan con una prueba de 5 días con acceso a todo excepto al directorio
          inteligente de organizaciones. ¿Ya tienes una organización y quieres hacer el upgrade?{' '}
          <a href="mailto:hola@govtalent.app" style={{ color: '#1d6f5c', fontWeight: 500 }}>
            Escríbenos
          </a>{' '}
          y lo activamos.
        </div>
      </div>
    </div>
  );
}
