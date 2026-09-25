'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Toast from '@/components/Toast';
import OnboardingModal from '@/components/OnboardingModal';
import PublicHeader from '@/components/PublicHeader';
import Footer from '@/components/Footer';
import MenuUsuario from '@/components/MenuUsuario';
import BarraMovil from '@/components/BarraMovil';
import BuscadorGlobal from '@/components/BuscadorGlobal';
import Logo from '@/components/Logo';

export default function AppLayout({ children }) {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [misOrgs, setMisOrgs] = useState([]);
  const [tieneOfertas, setTieneOfertas] = useState(false);
  const [novedades, setNovedades] = useState(0);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  // Cuándo se marcó todo como visto en /alarmas. Si el recuento de la
  // barra salió antes y llega después, traería el número viejo.
  const vistasEn = useRef(0);

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
        .select('organization_id, organizations(id, slug, name, logo_url, plan, plan_status, trial_ends_at, is_founding_member)')
        .eq('user_id', data.user.id);
      if (active) {
        const orgs = (membresias || []).map((m) => m.organizations).filter(Boolean);
        setMisOrgs(orgs);

        // Si ya has publicado, el menú no te invita a publicar tu primera
        // oferta: sonaría a que nadie mira lo que haces.
        if (orgs.length) {
          const { count } = await supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .in('organization_id', orgs.map((o) => o.id));
          if (active) setTieneOfertas((count || 0) > 0);
        }
      }

      // El contador de Alarmas: lo nuevo que han encontrado las alarmas y
      // lo que ha cambiado en lo que sigues, sumado. Es el único contador
      // de la aplicación: la campana desaparece porque repetía este mismo
      // número en otro sitio. Solo cuenta, no trae filas, para no cargar
      // la barra en cada navegación.
      const pedidoEn = Date.now();
      const [{ count: cambios }, { count: encontrados }] = await Promise.all([
        supabase.from('my_follow_events').select('event_id', { count: 'exact', head: true }).eq('es_nueva', true),
        supabase
          .from('sector_alert_matches')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', data.user.id)
          .eq('visto', false)
          .eq('descartado', false),
      ]);
      if (active && vistasEn.current < pedidoEn) setNovedades((cambios || 0) + (encontrados || 0));
    }
    load();
    return () => {
      active = false;
    };
  }, [pathname]);

  // La página de Alarmas avisa con este evento de lo que queda pendiente
  // (los cambios de lo que sigues aún sin «Visto»), para que el contador
  // se ajuste sin esperar a otra navegación.
  useEffect(() => {
    const poner = (e) => {
      vistasEn.current = Date.now();
      setNovedades(Math.max(0, Number(e?.detail?.pendientes) || 0));
    };
    window.addEventListener('gt-alarmas-vistas', poner);
    return () => window.removeEventListener('gt-alarmas-vistas', poner);
  }, []);

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
        {/* En móvil los módulos, Alarmas incluida, bajan a BarraMovil y
            aquí solo quedan el logotipo, el buscador y el menú. Antes se desbordaban: los
            elementos llevan flex-shrink:0 y no se encogen. */}
        <style>{`
          @media (max-width: 720px) {
            .nav-inner { padding: 0 14px; gap: 2px; overflow: visible; }
            /* Los módulos los cubre BarraMovil abajo. El buscador no:
               es lo único de la barra que no está duplicado ahí. */
            .nav-inner .ni-modulo { display: none; }
            .nav-inner .nav-sp { flex: 0; }
          }
        `}</style>
        <div className="nav-inner">
          <Link href="/" className="nav-logo" aria-label="GovTalent, ir al inicio">
            <Logo height={24} />
          </Link>

          {/* Pegado al logo, como en LinkedIn: es lo primero que se
              busca con la vista y no compite con la navegación, que se
              va al otro extremo. */}
          <BuscadorGlobal />

          {/* Con el buscador a la izquierda, los módulos se empujan a la
              derecha. Antes iban seguidos del logo y el hueco quedaba al
              final. */}
          <div className="nav-sp"></div>
          {/* El orden dice de qué va el producto: primero lo que se
              mueve, luego quién decide, después lo tuyo, y el empleo al
              final. Organizaciones pasa a vivir dentro de Instituciones.

              Regulatorio se marca activo también en sus rutas hijas para
              que la barra no se apague al entrar en un expediente. */}
          <Link
            href="/regulatorio"
            className={`ni ni-modulo ${
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

          {/* Alarmas, justo después de Regulatorio: es lo tuyo dentro de
              lo que se mueve. Sustituye a la campana, que llevaba a
              Seguimiento y repetía este mismo contador. Con el número y
              no un punto: saber que hay tres es distinto de saber que hay
              algo. Morada siempre, porque es el color de la función. */}
          <Link
            href="/alarmas"
            className={`ni ni-modulo ${pathname.startsWith('/alarmas') || pathname.startsWith('/seguimiento') ? 'on' : ''}`}
            aria-label={novedades > 0 ? `Alarmas, ${novedades} sin ver` : 'Alarmas'}
            style={{ color: '#6d5aef' }}
          >
            <i className="ti ti-sparkles"></i>Alarmas
            {novedades > 0 && (
              <span
                style={{
                  minWidth: 17,
                  height: 17,
                  padding: '0 5px',
                  boxSizing: 'border-box',
                  borderRadius: 9,
                  background: '#6d5aef',
                  color: '#fff',
                  fontSize: 10.5,
                  lineHeight: '17px',
                  textAlign: 'center',
                  fontWeight: 600,
                  marginLeft: 6,
                }}
              >
                {novedades > 9 ? '9+' : novedades}
              </span>
            )}
          </Link>

          <Link
            href="/institutions"
            className={`ni ni-modulo ${
              pathname.startsWith('/institutions') ||
              (pathname.startsWith('/organizations') && !pathname.includes('admin'))
                ? 'on'
                : ''
            }`}
          >
            <i className="ti ti-building-bank"></i>Instituciones
          </Link>

          <Link href="/projects" className={`ni ni-modulo ${pathname.startsWith('/projects') ? 'on' : ''}`}>
            <i className="ti ti-folder"></i>Proyectos
          </Link>

          <Link href="/jobs" className={`ni ni-modulo ${pathname.startsWith('/jobs') ? 'on' : ''}`}>
            <i className="ti ti-briefcase"></i>Empleos
          </Link>

          {/* "Mi organización" y "Para empresas" desaparecen de la
              barra: eran dos elementos que hacían lo mismo según si
              tenías organización o no, y ahora viven dentro del menú
              junto al resto de contextos. */}

          <MenuUsuario
            user={user}
            organizaciones={misOrgs}
            enOrganizacion={pathname.includes('/organizations/admin') ? misOrgs[0]?.slug : null}
            tieneOfertas={tieneOfertas}
            onSignOut={signOut}
          />
        </div>
      </nav>
      )}

      <BarraMovil alarmas={novedades} />

      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
      <Toast />

      {needsOnboarding && user && pathname !== '/organizations/new' && (
        <OnboardingModal userId={user.id} onComplete={handleOnboardingComplete} />
      )}
    </div>
  );
}
