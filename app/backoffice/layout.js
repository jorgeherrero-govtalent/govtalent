'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/backoffice', label: 'Dashboard', icon: 'ti-layout-dashboard' },
  { href: '/backoffice/organizaciones', label: 'Organizaciones', icon: 'ti-building' },
  { href: '/backoffice/usuarios', label: 'Usuarios', icon: 'ti-users' },
];

export default function BackofficeLayout({ children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('gt_backoffice_collapsed');
    if (saved === '1') setCollapsed(true);
    setReady(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem('gt_backoffice_collapsed', !prev ? '1' : '0');
      return !prev;
    });
  }

  const sidebarWidth = collapsed ? 64 : 216;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f4f3ee' }}>
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
          transition: ready ? 'width .15s ease' : 'none',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div
          style={{
            padding: collapsed ? '0 0 20px' : '0 6px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
          }}
        >
          {!collapsed && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a18' }}>
                gov<span style={{ background: '#1d6f5c', color: '#fff', padding: '1px 6px', borderRadius: 5 }}>talent</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6d5aef', letterSpacing: '.05em', marginTop: 3 }}>
                BACKOFFICE
              </div>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
            style={{
              width: 26,
              height: 26,
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
            <i className={`ti ${collapsed ? 'ti-layout-sidebar-right-expand' : 'ti-layout-sidebar-left-expand'}`} style={{ fontSize: 14 }}></i>
          </button>
        </div>

        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/backoffice' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
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
              }}
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: 15, flexShrink: 0 }}></i>
              {!collapsed && item.label}
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

      <main style={{ flex: 1, padding: '26px 32px', minWidth: 0 }}>{children}</main>
    </div>
  );
}
