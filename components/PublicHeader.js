import Link from 'next/link';

export default function PublicHeader({ loggedIn = false, loggedInHref = '/organizations/admin', maxWidth = 760 }) {
  return (
    <div className="pub-header">
      <div className="pub-header-inner" style={{ maxWidth }}>
        <div className="pub-header-brand">
          <Link href="/jobs" className="pub-header-logo">
            gov<span>talent</span>
          </Link>
          <div className="pub-header-tagline">
            La plataforma all-in-one del ecosistema profesional de los asuntos públicos
          </div>
        </div>
        <Link href={loggedIn ? loggedInHref : '/login'} className="pub-header-link">
          {loggedIn ? 'Ir a mi organización' : 'Iniciar sesión'}
        </Link>
      </div>
    </div>
  );
}
