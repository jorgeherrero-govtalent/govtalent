'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function InstitutionsHomePage() {
  const supabase = createClient();
  const router = useRouter();
  const [counts, setCounts] = useState(null);
  const [legislature, setLegislature] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [{ count: deputiesCount }, { count: groupsCount }, { data: leg }] = await Promise.all([
      supabase.from('deputies').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('parliamentary_groups').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('legislatures').select('name').eq('active', true).maybeSingle(),
    ]);
    setCounts({ deputies: deputiesCount || 0, groups: groupsCount || 0 });
    setLegislature(leg);
  }

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) router.push(`/institutions/deputies?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div className="sec">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Directorio institucional</h1>
        <p style={{ fontSize: 12.5, color: '#888', margin: '3px 0 0' }}>
          Toda la información clave del ecosistema institucional en un solo lugar.
        </p>
      </div>

      <form
        onSubmit={handleSearch}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#fff',
          border: '.5px solid #e0dfd8',
          borderRadius: 20,
          padding: '9px 16px',
          marginBottom: 20,
          maxWidth: 420,
        }}
      >
        <i className="ti ti-search" style={{ color: '#999', fontSize: 15 }}></i>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar diputado, grupo, comisión..."
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 12.5, background: 'transparent' }}
        />
      </form>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr .5px 1fr .5px 1fr .5px 1fr',
          background: '#fff',
          borderRadius: 12,
          padding: '18px 8px',
          marginBottom: 24,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a18' }}>{counts ? counts.deputies : '—'}</div>
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>Diputados</div>
        </div>
        <div style={{ background: '#e0dfd8' }}></div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a18' }}>{counts ? counts.groups : '—'}</div>
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>Grupos parlamentarios</div>
        </div>
        <div style={{ background: '#e0dfd8' }}></div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ccc' }}>—</div>
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>Comisiones y órganos</div>
        </div>
        <div style={{ background: '#e0dfd8' }}></div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a18', marginTop: 3 }}>
            {legislature?.name?.split(' ')[0] || '—'} Legislatura
          </div>
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>Vigente</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Link href="/institutions/deputies" style={{ background: '#fff', borderRadius: 12, padding: 18, textDecoration: 'none' }}>
          <i className="ti ti-users-group" style={{ color: '#6d5aef', fontSize: 19 }}></i>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: '#1a1a18' }}>Diputados</div>
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 3, marginBottom: 10 }}>
            Consulta los diputados del Congreso, sus cargos y comisiones.
          </div>
          <span style={{ fontSize: 12, color: '#6d5aef', fontWeight: 600 }}>Ver diputados →</span>
        </Link>

        <Link href="/institutions/groups" style={{ background: '#fff', borderRadius: 12, padding: 18, textDecoration: 'none' }}>
          <i className="ti ti-flag" style={{ color: '#6d5aef', fontSize: 19 }}></i>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: '#1a1a18' }}>Grupos parlamentarios</div>
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 3, marginBottom: 10 }}>
            Explora los grupos, sus portavoces y composición actual.
          </div>
          <span style={{ fontSize: 12, color: '#6d5aef', fontWeight: 600 }}>Ver grupos →</span>
        </Link>

        <div style={{ background: '#f4f4f0', borderRadius: 12, padding: 18, opacity: 0.75 }}>
          <i className="ti ti-gavel" style={{ color: '#999', fontSize: 19 }}></i>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: '#777' }}>Comisiones</div>
          <div style={{ fontSize: 11.5, color: '#999', marginTop: 3, marginBottom: 10 }}>
            Información sobre comisiones y subcomisiones parlamentarias.
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', background: '#e5e4de', padding: '3px 9px', borderRadius: 10 }}>
            Próximamente
          </span>
        </div>

        <Link href="/institutions/ministries" className="card" style={{ padding: 18, textDecoration: 'none', color: 'inherit' }}>
          <i className="ti ti-building-bank" style={{ color: '#6d5aef', fontSize: 19 }}></i>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>Ministerios</div>
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 3, marginBottom: 10 }}>
            Estructura del Gobierno y titulares de cada ministerio.
          </div>
          <span style={{ fontSize: 12, color: '#6d5aef', fontWeight: 600 }}>Ver ministerios →</span>
        </Link>

        <div style={{ background: '#f4f4f0', borderRadius: 12, padding: 18, opacity: 0.75 }}>
          <i className="ti ti-scale" style={{ color: '#999', fontSize: 19 }}></i>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: '#777' }}>Organismos y entidades</div>
          <div style={{ fontSize: 11.5, color: '#999', marginTop: 3, marginBottom: 10 }}>
            Autoridades independientes, organismos públicos y otros entes.
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', background: '#e5e4de', padding: '3px 9px', borderRadius: 10 }}>
            Próximamente
          </span>
        </div>
      </div>
    </div>
  );
}
