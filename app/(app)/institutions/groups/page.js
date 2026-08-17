'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { groupColor } from '@/lib/grupos';

export default function GroupsDirectoryPage() {
  const supabase = createClient();
  const [groups, setGroups] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    // group_profile trae ya los recuentos. Antes se leía de deputy_roles,
    // que se diseñó para esto pero nunca se llegó a cargar: por eso las
    // nueve tarjetas mostraban "Portavoz: —".
    const { data } = await supabase
      .from('group_profile')
      .select('group_id, slug, name, short_name, member_count, n_diputados, n_vivas, n_presentadas, n_leyes, n_portavocias')
      .order('n_diputados', { ascending: false });
    setGroups(data || []);
  }

  // Sin tildes, igual que el resto de buscadores: nadie escribe
  // "Catalunya" con acento al buscar.
  const normalize = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = (groups || []).filter((g) => normalize(g.name).includes(normalize(search)));

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Grupos parlamentarios</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>
          {groups
            ? `${groups.length} grupos · ${groups.reduce((s, g) => s + (g.n_diputados || 0), 0)} diputados · XV Legislatura`
            : '—'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14 }}>
        <Link href="/institutions/deputies" style={{ fontSize: 13, color: '#999', paddingBottom: 8, textDecoration: 'none' }}>
          Diputados
        </Link>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1d6f5c', borderBottom: '2px solid #1d6f5c', paddingBottom: 8 }}>
          Grupos parlamentarios
        </span>
        <Link href="/institutions/comisiones" style={{ fontSize: 13, color: '#999', paddingBottom: 8, textDecoration: 'none' }}>
          Comisiones
        </Link>
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
              key={g.group_id}
              href={`/institutions/groups/${g.slug}`}
              className="card"
              style={{ padding: 16, textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 13 }}>
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 9,
                    background: `${groupColor(g.name)}18`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ width: 15, height: 15, borderRadius: 3, background: groupColor(g.name) }}></span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>{g.name}</div>
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 3 }}>
                    {[
                      `${g.n_diputados} ${g.n_diputados === 1 ? 'diputado' : 'diputados'}`,
                      g.n_portavocias > 0 ? `${g.n_portavocias} portavocías` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, paddingTop: 12, borderTop: '.5px solid #f0f0eb' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1d6f5c' }}>
                    {(g.n_vivas || 0).toLocaleString('es-ES')}
                  </div>
                  <div style={{ fontSize: 10, color: '#999' }}>en trámite</div>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{g.n_leyes || 0}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>leyes</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
