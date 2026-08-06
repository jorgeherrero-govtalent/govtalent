'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sidebarTrialLabel } from '@/lib/plan';

const NAV = [
  { href: '/organizations/admin', label: 'Dashboard', icon: 'ti-layout-dashboard', exact: true },
  { href: '/organizations/admin/company', label: 'Página de empresa', icon: 'ti-building' },
  { href: '/organizations/admin/jobs', label: 'Ofertas', icon: 'ti-briefcase' },
  { href: '/organizations/admin/candidates', label: 'Candidatos', icon: 'ti-users' },
  { href: '/organizations/admin/database', label: 'Directorio inteligente', icon: 'ti-radar-2' },
  { href: '/organizations/admin/influence-log', label: 'Transparencia', icon: 'ti-shield-check' },
  { href: '/organizations/admin/plan', label: 'Plan', icon: 'ti-diamond' },
];

export default function OrganizationAdminLayout({ children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [org, setOrg] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('gt_org_admin_collapsed');
    if (saved === '1') setCollapsed(true);
    loadOrg();
  }, []);

  async function loadOrg() {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return;
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(plan, plan_status, trial_ends_at)')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();
    if (membership?.organizations) setOrg(membership.organizations);
  }

  const trialLabel = org ? sidebarTrialLabel(org) : null;

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem('gt_org_admin_collapsed', !prev ? '1' : '0');
      return !prev;
    });
  }

  const sidebarWidth = collapsed ? 64 : 208;

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
      <aside
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          background: '#fff',
          borderRight: '.5px solid #e0dfd8',
          padding: collapsed ? '18px 10px' : '18px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          transition: 'width .15s ease',
          position: 'sticky',
          top: 64,
          height: 'calc(100vh - 64px)',
        }}
      >
        <div
          style={{
            padding: collapsed ? '0 0 14px' : '0 6px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
          }}
        >
          {!collapsed && <div style={{ fontSize: 11, fontWeight: 700, color: '#999', letterSpacing: '.04em' }}>MI ORGANIZACIÓN</div>}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              border: '.5px solid #e0dfd8',
              background: '#fff',
              color: '#888',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <i className={`ti ${collapsed ? 'ti-layout-sidebar-right-expand' : 'ti-layout-sidebar-left-expand'}`} style={{ fontSize: 13 }}></i>
          </button>
        </div>

        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const showTrialBadge = item.href === '/organizations/admin/plan' && trialLabel !== null;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? (showTrialBadge ? `${item.label} · ${trialLabel}` : item.label) : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 9,
                padding: collapsed ? '9px' : '9px 10px',
                borderRadius: 8,
                color: active ? '#1d6f5c' : '#666',
                background: active ? '#f0f8f5' : 'transparent',
                fontWeight: active ? 600 : 500,
                textDecoration: 'none',
                fontSize: 13,
                position: 'relative',
              }}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: 15, flexShrink: 0 }}></i>
              {!collapsed && item.label}
              {/* Pill de recordatorio: mismo tratamiento visual siempre (fondo, borde,
                  tipografía) en cualquier estado — la diferencia la comunica solo el
                  texto (sidebarTrialLabel), nunca el color. */}
              {!collapsed && showTrialBadge && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: '#666',
                    background: '#f0efe9',
                    border: '.5px solid #e0dfd8',
                    padding: '2px 7px',
                    borderRadius: 20,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {trialLabel}
                </span>
              )}
              {collapsed && showTrialBadge && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#999',
                  }}
                ></span>
              )}
            </Link>
          );
        })}

        <div style={{ flex: 1 }} />

        <Link
          href="/jobs"
          title={collapsed ? 'Volver a GovTalent' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 9,
            padding: collapsed ? '9px' : '9px 10px',
            borderRadius: 8,
            color: '#999',
            textDecoration: 'none',
            fontSize: 12.5,
            borderTop: '.5px solid #e0dfd8',
            marginTop: 8,
            paddingTop: 14,
          }}
        >
          <i className="ti ti-arrow-back" style={{ fontSize: 14, flexShrink: 0 }}></i>
          {!collapsed && 'Volver a GovTalent'}
        </Link>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
