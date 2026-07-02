'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Toast from '@/components/Toast';

export default function AppLayout({ children }) {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [myOrg, setMyOrg] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();
      setUser(profile);

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(slug, name)')
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (membership) setMyOrg(membership);
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

  const initial = user ? (user.first_name?.[0] || 'U').toUpperCase() : '';

  return (
    <div>
      <nav className="nav">
        <Link href="/jobs" className="nav-logo">
          gov<span>talent</span>
        </Link>
        <Link href="/jobs" className={`ni ${pathname.startsWith('/jobs') ? 'on' : ''}`}>
          <i className="ti ti-briefcase"></i>Empleos
        </Link>
        <Link href="/events" className={`ni ${pathname.startsWith('/events') ? 'on' : ''}`}>
          <i className="ti ti-calendar-event"></i>Eventos
        </Link>
        <Link
          href="/organizations"
          className={`ni ${pathname.startsWith('/organizations') && !pathname.includes('admin') ? 'on' : ''}`}
        >
          <i className="ti ti-building"></i>Organizaciones
        </Link>
        {myOrg && (
          <Link
            href="/organizations/admin"
            className={`ni ${pathname.includes('/organizations/admin') ? 'on' : ''}`}
          >
            <i className="ti ti-settings"></i>Mi organización
          </Link>
        )}
        <div className="nav-sp"></div>
        <i
          className="ti ti-logout"
          style={{ fontSize: 18, color: '#888', cursor: 'pointer' }}
          title="Cerrar sesión"
          onClick={signOut}
        ></i>
        <Link href="/profile" className="nav-av" title="Mi perfil">
          {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : initial || '·'}
        </Link>
        {!myOrg && (
          <Link href="/organizations/new" className="nav-ebtn">
            <i className="ti ti-building"></i> Para organizaciones
          </Link>
        )}
      </nav>

      {children}
      <Toast />
    </div>
  );
}
