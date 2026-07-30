'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Toast from '@/components/Toast';
import OnboardingModal from '@/components/OnboardingModal';
import Footer from '@/components/Footer';

export default function AppLayout({ children }) {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [myOrg, setMyOrg] = useState(null);
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
        <div style={{ background: '#fff', borderBottom: '.5px solid #e0dfd8', padding: '14px 20px' }}>
          <div
            style={{
              maxWidth: 760,
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <Link href="/jobs" style={{ fontWeight: 800, fontSize: 19, textDecoration: 'none', color: '#1a1a18' }}>
                gov<span style={{ background: '#1d6f5c', color: '#fff', padding: '1px 6px', borderRadius: 5 }}>talent</span>
              </Link>
              <div style={{ fontSize: 11.5, color: '#888', fontWeight: 500, marginTop: 2, maxWidth: 380 }}>
                La plataforma all-in-one del ecosistema profesional de los asuntos públicos
              </div>
            </div>
            <Link href="/login" style={{ fontSize: 13, color: '#1d6f5c', textDecoration: 'none', fontWeight: 500 }}>
              Iniciar sesión
            </Link>
          </div>
        </div>
      ) : (
        <nav className="nav">
        <div className="nav-inner">
          <Link href="/jobs" className="nav-logo">
            gov<span>talent</span>
          </Link>
          <Link href="/jobs" className={`ni ${pathname.startsWith('/jobs') ? 'on' : ''}`}>
            <i className="ti ti-briefcase"></i>Empleos
          </Link>
          <div className="ni" style={{ cursor: 'default', color: '#bbb' }} title="Próximamente">
            <i className="ti ti-calendar-event"></i>Eventos (Próximamente)
          </div>
          <Link
            href="/organizations"
            className={`ni ${pathname.startsWith('/organizations') && !pathname.includes('admin') ? 'on' : ''}`}
          >
            <i className="ti ti-building"></i>Organizaciones
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
