import Link from 'next/link';
import Footer from '@/components/Footer';

export const metadata = { title: 'Configuración y política de Cookies · GovTalent' };

export default function CookiesPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f3ee', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#fff', borderBottom: '.5px solid #e0dfd8', padding: '14px 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Link href="/jobs" style={{ fontWeight: 800, fontSize: 19, textDecoration: 'none', color: '#1a1a18' }}>
            gov<span style={{ background: '#1d6f5c', color: '#fff', padding: '1px 6px', borderRadius: 5 }}>talent</span>
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 60px', flex: 1 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 20 }}>Configuración y política de Cookies</h1>
        <div className="card" style={{ padding: 24, fontSize: 14, lineHeight: 1.7, color: '#444' }}>
          <p style={{ marginBottom: 14 }}>
            GovTalent utiliza cookies técnicas necesarias para el funcionamiento de la plataforma (por ejemplo,
            mantener tu sesión iniciada). Estamos completando el panel de configuración de preferencias — mientras
            tanto, puedes gestionar las cookies directamente desde los ajustes de tu navegador.
          </p>
          <p>
            Si tienes dudas sobre el uso de cookies en GovTalent, escríbenos a{' '}
            <a href="mailto:info@govtalent.io" style={{ color: '#1d6f5c' }}>
              info@govtalent.io
            </a>
            .
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
