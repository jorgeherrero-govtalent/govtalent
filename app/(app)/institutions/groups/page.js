'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function GroupsDirectoryPage() {
  const supabase = createClient();
  const [groups, setGroups] = useState(null);
  const [portavozByGroup, setPortavozByGroup] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [{ data: groupsData }, { data: rolesData }] = await Promise.all([
      supabase.from('parliamentary_groups').select('*').eq('active', true).order('member_count', { ascending: false }),
      supabase
        .from('deputy_roles')
        .select('parliamentary_group_id, role, deputies(full_name)')
        .eq('active', true)
        .ilike('role', 'Portavoz'),
    ]);
    setGroups(groupsData || []);

    const byGroup = {};
    for (const r of rolesData || []) {
      if (r.parliamentary_group_id && !byGroup[r.parliamentary_group_id]) {
        byGroup[r.parliamentary_group_id] = r.deputies?.full_name;
      }
    }
    setPortavozByGroup(byGroup);
  }

  const filtered = (groups || []).filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Grupos parlamentarios</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>{groups ? groups.length : '—'} grupos · XV Legislatura</p>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14 }}>
        <Link href="/institutions/deputies" style={{ fontSize: 13, color: '#999', paddingBottom: 8, textDecoration: 'none' }}>
          Diputados
        </Link>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1d6f5c', borderBottom: '2px solid #1d6f5c', paddingBottom: 8 }}>
          Grupos parlamentarios
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#fff',
          border: '.5px solid #e0dfd8',
          borderRadius: 20,
          padding: '8px 16px',
          marginBottom: 16,
          maxWidth: 380,
        }}
      >
        <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar grupo parlamentario..."
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
        />
      </div>

      {groups === null ? (
        <div className="spinner"></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-flag-off"></i>
            No hay grupos que coincidan con la búsqueda.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.map((g) => (
            <Link
              key={g.id}
              href={`/institutions/groups/${g.slug}`}
              className="card"
              style={{ padding: 16, textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 9,
                    background: '#e8f4f0',
                    color: '#1d6f5c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}
                >
                  {g.logo_url ? (
                    <img src={g.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <i className="ti ti-flag"></i>
                  )}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.25 }}>{g.name}</div>
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>{g.member_count} diputados</div>
              <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>
                Portavoz: {portavozByGroup[g.id] ? nameDisplay(portavozByGroup[g.id]) : '—'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function nameDisplay(officialName) {
  const [last, first] = officialName.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}
