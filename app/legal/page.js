import Link from 'next/link';
import Footer from '@/components/Footer';

export const metadata = { title: 'Aviso legal y Privacidad · GovTalent' };

export default function LegalPage() {
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
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 20 }}>Aviso legal y Privacidad</h1>
        <div className="card" style={{ padding: 24, fontSize: 14, lineHeight: 1.7, color: '#444' }}>
          <p style={{ marginBottom: 14 }}>
            Este apartado recogerá el aviso legal, las condiciones de uso y la política de privacidad de
            GovTalent. Estamos completando este contenido — mientras tanto, si tienes cualquier duda sobre el
            tratamiento de tus datos puedes escribirnos a{' '}
            <a href="mailto:info@govtalent.io" style={{ color: '#1d6f5c' }}>
              info@govtalent.io
            </a>
            .
          </p>
          <p>
            Responsable del tratamiento: GovTalent. Finalidad: gestión de la relación entre candidatos y
            organizaciones en la plataforma. Puedes ejercer tus derechos de acceso, rectificación, supresión y
            demás derechos reconocidos por el RGPD contactando en la dirección anterior.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
