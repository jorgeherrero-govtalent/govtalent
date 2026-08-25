'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Toast from '@/components/Toast';
import OnboardingModal from '@/components/OnboardingModal';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import MenuUsuario from '@/components/MenuUsuario';

export default function AppLayout({ children }) {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [misOrgs, setMisOrgs] = useState([]);
  const [novedades, setNovedades] = useState(0);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

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

      // Todas, no solo una: el menú es un selector y con .limit(1) solo
      // aparecería la primera de quien pertenezca a varias.
      const { data: membresias } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(slug, name, logo_url)')
        .eq('user_id', data.user.id);
      if (active) {
        setMisOrgs((membresias || []).map((m) => m.organizations).filter(Boolean));
      }

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

          {/* "Mi organización" y "Para empresas" desaparecen de la
              barra: eran dos elementos que hacían lo mismo según si
              tenías organización o no, y ahora viven dentro del menú
              junto al resto de contextos. */}

          <MenuUsuario
            user={user}
            organizaciones={misOrgs}
            enOrganizacion={pathname.includes('/organizations/admin') ? misOrgs[0]?.slug : null}
            onSignOut={signOut}
          />
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
