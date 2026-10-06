import { createClient } from '@/lib/supabase/server';
import PublicHeader from '@/components/PublicHeader';
import CalculadoraPrecios from '@/components/CalculadoraPrecios';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

// La sesión decide qué hace el botón de contratar (alta o pago), así que la
// página no se puede servir en caché.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const DESCRIPCION =
  'Un solo plan de vigilancia normativa para una persona o para todo tu equipo, de 1 a 50 usuarios, con pago mensual o anual. El directorio, aparte.';

export const metadata = {
  title: 'Precios · GovTalent',
  description: DESCRIPCION,
  openGraph: {
    title: 'Precios · GovTalent',
    description: DESCRIPCION,
    url: `${SITE_URL}/precios`,
    siteName: 'GovTalent',
    locale: 'es_ES',
    type: 'website',
  },
};

export default async function PricingPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const autenticado = Boolean(data?.user);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f4f3ee' }}>
      <PublicHeader maxWidth={1040} />

      <div className="pricing-wrap" style={{ flex: 1, maxWidth: 1040, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 className="pricing-h1" style={{ fontWeight: 700, color: '#1a1a18', margin: '0 0 10px' }}>
            Un solo plan, para una persona o para todo tu equipo
          </h1>
          <p style={{ fontSize: 15, color: '#55524b', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
            Todo lo que necesitas para crecer, en un único lugar. Suscripción mensual y anual. Precios sin IVA.
          </p>
        </div>

        <CalculadoraPrecios autenticado={autenticado} />

        <p style={{ fontSize: 12, color: '#a8a49c', textAlign: 'center', marginTop: 32, lineHeight: 1.6 }}>
          Al contratar aceptas las{' '}
          <a href="/condiciones" style={{ color: '#77746e', textDecoration: 'underline' }}>
            condiciones de contratación
          </a>{' '}
          y la{' '}
          <a href="/privacidad" style={{ color: '#77746e', textDecoration: 'underline' }}>
            política de privacidad
          </a>
          .
        </p>
      </div>
    </div>
  );
}
