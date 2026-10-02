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
import MenuLateral from '@/components/MenuLateral';
import BarraMovil from '@/components/BarraMovil';
import BuscadorGlobal from '@/components/BuscadorGlobal';
import Logo from '@/components/Logo';
import { limitesDe } from '@/lib/alarmas';

export default function AppLayout({ children }) {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [misOrgs, setMisOrgs] = useState([]);
  const [tieneOfertas, setTieneOfertas] = useState(false);
  const [novedades, setNovedades] = useState(0);
  // La tarjeta del plan del menú lateral: alarmas activas sobre el límite.
  const [alarmas, setAlarmas] = useState(null);
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
      const [{ count: cambios }, { count: encontrados }, { data: nivel }, { count: activas }] = await Promise.all([
        supabase.from('my_follow_events').select('event_id', { count: 'exact', head: true }).eq('es_nueva', true),
        supabase
          .from('sector_alert_matches')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', data.user.id)
          .eq('visto', false)
          .eq('descartado', false),
        supabase.rpc('nivel_avisos'),
        supabase
          .from('sector_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', data.user.id)
          .eq('activa', true),
      ]);
      if (active && vistasEn.current < pedidoEn) setNovedades((cambios || 0) + (encontrados || 0));
      if (active) {
        const esPro = nivel === 'pro';
        setAlarmas({ usadas: activas || 0, limite: limitesDe(nivel).alarmas, esPro });
      }
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


  // Sin sesión (fichas públicas de organizaciones y ofertas): la cabecera
  // pública y el pie de siempre. Con sesión: el menú lateral, sin pie.
  if (authChecked && !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PublicHeader />
        <main style={{ flex: 1 }}>{children}</main>
        <Footer />
        <Toast />
      </div>
    );
  }

  const enOrganizacion = pathname.includes('/organizations/admin') ? misOrgs[0]?.slug : null;

  return (
    <div className="gt-app">
      <MenuLateral
        user={user}
        organizaciones={misOrgs}
        enOrganizacion={enOrganizacion}
        tieneOfertas={tieneOfertas}
        novedades={novedades}
        alarmas={alarmas}
        onSignOut={signOut}
      />

      <div className="gt-lienzo">
        {/* En móvil no hay menú lateral: arriba quedan el logotipo, el
            buscador y el menú de usuario, y los módulos bajan a
            BarraMovil. */}
        <nav className="nav gt-movil-top">
          <div className="nav-inner" style={{ padding: '0 14px', gap: 2, overflow: 'visible' }}>
            <Link href="/" className="nav-logo" aria-label="GovTalent, ir al inicio">
              <Logo height={24} />
            </Link>
            <div className="nav-sp"></div>
            <BuscadorGlobal />
            <MenuUsuario
              user={user}
              organizaciones={misOrgs}
              enOrganizacion={enOrganizacion}
              tieneOfertas={tieneOfertas}
              onSignOut={signOut}
            />
          </div>
        </nav>

        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>

      <BarraMovil alarmas={novedades} />
      <Toast />

      {needsOnboarding && user && pathname !== '/organizations/new' && (
        <OnboardingModal userId={user.id} onComplete={handleOnboardingComplete} />
      )}
    </div>
  );
}
