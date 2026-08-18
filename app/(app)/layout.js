'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Toast from '@/components/Toast';
import OnboardingModal from '@/components/OnboardingModal';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';

export default function AppLayout({ children }) {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [myOrg, setMyOrg] = useState(null);
  const [novedades, setNovedades] = useState(0);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showMeMenu, setShowMeMenu] = useState(false);
  const [meMenuPos, setMeMenuPos] = useState({ top: 0, right: 0 });
  const meBtnRef = useRef(null);

  function openMeMenu() {
    const rect = meBtnRef.current?.getBoundingClientRect();
    if (rect) setMeMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setShowMeMenu(true);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        setAuthChecked(true);
        return;
      }
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();
      if (!active) return;
      setUser(profile);
      setAuthChecked(true);
      setNeedsOnboarding(!!profile && !profile.onboarding_completed);

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(slug, name)')
        .eq('user_id', data.user.id)
        .limit(1)
        .maybeSingle();
      if (active && membership) setMyOrg(membership);

      // El punto de la barra: cuántas novedades hay sin ver. Solo cuenta,
      // no trae las filas, para no cargar la barra en cada navegación.
      const { count } = await supabase
        .from('my_follow_events')
        .select('event_id', { count: 'exact', head: true })
        .eq('es_nueva', true);
      if (active) setNovedades(count || 0);
    }
    load();
    return () => {
      active = false;
    };
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function handleOnboardingComplete() {
    // Recarga completa para que toda la app (nav incluida) refleje
    // los nuevos datos de perfil sin tener que replicar el estado a mano.
    window.location.reload();
  }

  const initial = user ? (user.first_name?.[0] || 'U').toUpperCase() : '';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {authChecked && !user ? (
        <PublicHeader />
      ) : (
        <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-logo">
            gov<span>talent</span>
          </Link>
          {/* El orden dice de qué va el producto: primero lo que se
              mueve, luego quién decide, después lo tuyo, y el empleo al
              final. Organizaciones pasa a vivir dentro de Instituciones.

              Regulatorio se marca activo también en sus rutas hijas para
              que la barra no se apague al entrar en un expediente. */}
          <Link
            href="/regulatorio"
            className={`ni ${
              pathname.startsWith('/regulatorio') ||
              pathname.startsWith('/initiatives') ||
              pathname.startsWith('/procedures') ||
              pathname.startsWith('/congreso')
                ? 'on'
                : ''
            }`}
          >
            <i className="ti ti-timeline-event"></i>Regulatorio
          </Link>

          <Link
            href="/institutions"
            className={`ni ${
              pathname.startsWith('/institutions') ||
              (pathname.startsWith('/organizations') && !pathname.includes('admin'))
                ? 'on'
                : ''
            }`}
          >
            <i className="ti ti-building-bank"></i>Instituciones
          </Link>

          <Link href="/seguimiento" className={`ni ${pathname.startsWith('/seguimiento') ? 'on' : ''}`}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <i className="ti ti-bell"></i>
              {novedades > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -5,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#6d5aef',
                    border: '1.5px solid #fff',
                  }}
                  aria-hidden="true"
                ></span>
              )}
            </span>
            Seguimiento
          </Link>

          <Link href="/jobs" className={`ni ${pathname.startsWith('/jobs') ? 'on' : ''}`}>
            <i className="ti ti-briefcase"></i>Empleos
          </Link>

          <div className="nav-sp"></div>

          {myOrg ? (
            <Link
              href="/organizations/admin"
              className={`ni ${pathname.includes('/organizations/admin') ? 'on' : ''}`}
            >
              <i className="ti ti-settings"></i>Mi organización
            </Link>
          ) : (
            <Link href="/organizations/new" className="nav-ebtn">
              <i className="ti ti-building"></i> Para empresas
            </Link>
          )}

          <div className="nav-me">
            <div className="ni" ref={meBtnRef} onClick={() => (showMeMenu ? setShowMeMenu(false) : openMeMenu())}>
              <div className="nav-av">{user?.avatar_url ? <img src={user.avatar_url} alt="" /> : initial || '·'}</div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                Tú <i className={`ti ${showMeMenu ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 12 }}></i>
              </span>
            </div>

            {showMeMenu &&
              typeof document !== 'undefined' &&
              createPortal(
                <>
                  <div onClick={() => setShowMeMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 300 }}></div>
                  <div className="nav-me-menu" style={{ position: 'fixed', top: meMenuPos.top, right: meMenuPos.right, zIndex: 301 }}>
                    <Link href="/profile" className="nav-me-item" onClick={() => setShowMeMenu(false)}>
                      <i className="ti ti-user"></i> Ver mi perfil
                    </Link>
                    <Link href="/account" className="nav-me-item" onClick={() => setShowMeMenu(false)}>
                      <i className="ti ti-settings"></i> Mi cuenta
                    </Link>
                    {user?.role === 'platform_admin' && (
                      <Link href="/backoffice" className="nav-me-item" onClick={() => setShowMeMenu(false)}>
                        <i className="ti ti-shield-lock" style={{ color: '#6d5aef' }}></i> Acceso Backoffice
                      </Link>
                    )}
                    <button
                      className="nav-me-item"
                      onClick={() => {
                        setShowMeMenu(false);
                        signOut();
                      }}
                    >
                      <i className="ti ti-logout"></i> Cerrar sesión
                    </button>
                  </div>
                </>,
                document.body
              )}
          </div>
        </div>
      </nav>
      )}

      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
      <Toast />

      {needsOnboarding && user && pathname !== '/organizations/new' && (
        <OnboardingModal userId={user.id} onComplete={handleOnboardingComplete} />
      )}
    </div>
  );
}
