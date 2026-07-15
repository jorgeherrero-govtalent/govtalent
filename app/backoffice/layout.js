import Link from 'next/link';

const NAV = [
  { href: '/backoffice', label: 'Dashboard', icon: 'ti-layout-dashboard' },
  { href: '/backoffice/organizaciones', label: 'Organizaciones', icon: 'ti-building' },
  { href: '/backoffice/usuarios', label: 'Usuarios', icon: 'ti-users' },
  { href: '/jobs', label: '← Volver a GovTalent', icon: 'ti-arrow-back' },
];

export default function BackofficeLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f0efe9' }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: '#1a1a18',
          color: '#fff',
          padding: '22px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ padding: '0 8px 22px', fontSize: 17, fontWeight: 800 }}>
          gov<span style={{ background: '#1d6f5c', padding: '1px 6px', borderRadius: 5 }}>talent</span>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6d5aef', letterSpacing: '.04em', marginTop: 4 }}>
            BACKOFFICE
          </div>
        </div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '9px 10px',
              borderRadius: 8,
              color: '#ccc',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            <i className={`ti ${item.icon}`} style={{ fontSize: 15 }}></i>
            {item.label}
          </Link>
        ))}
      </aside>
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1100 }}>{children}</main>
    </div>
  );
}
