import Link from 'next/link';
import Footer from '@/components/Footer';
import BackCloseButton from '@/components/BackCloseButton';

export default function LegalPageShell({ title, children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f3ee', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#fff', borderBottom: '.5px solid #e0dfd8', padding: '14px 20px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/jobs" style={{ fontWeight: 800, fontSize: 19, textDecoration: 'none', color: '#1a1a18' }}>
            gov<span style={{ background: '#1d6f5c', color: '#fff', padding: '1px 6px', borderRadius: 5 }}>talent</span>
          </Link>
          <BackCloseButton />
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 20px 60px', flex: 1, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22, fontSize: 12.5 }}>
          <LegalTab href="/legal" label="Aviso legal" />
          <LegalTab href="/privacidad" label="Privacidad" />
          <LegalTab href="/condiciones" label="Condiciones del servicio" />
          <LegalTab href="/cookies" label="Cookies" />
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>{title}</h1>
        <p style={{ fontSize: 12, color: '#999', marginBottom: 22 }}>Última revisión: [MES AÑO]</p>

        <div className="card" style={{ padding: '28px 30px', fontSize: 13.5, lineHeight: 1.75, color: '#3a3a36' }}>
          {children}
        </div>
      </div>

      <Footer />
    </div>
  );
}

function LegalTab({ href, label }) {
  return (
    <Link
      href={href}
      style={{
        padding: '6px 12px',
        borderRadius: 20,
        textDecoration: 'none',
        border: '.5px solid #e0dfd8',
        color: '#666',
        background: '#fff',
      }}
    >
      {label}
    </Link>
  );
}
