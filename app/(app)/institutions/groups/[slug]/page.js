'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'diputados', label: 'Diputados' },
  { id: 'comisiones', label: 'Comisiones' },
  { id: 'mesa', label: 'Mesa y Portavoces' },
];

function nameDisplay(officialName) {
  const [last, first] = officialName.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}

function initials(fullName) {
  const [last, first] = fullName.split(',').map((s) => s.trim());
  return `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase();
}

export default function GroupProfilePage() {
  const { slug } = useParams();
  const supabase = createClient();

  const [group, setGroup] = useState(null);
  const [legislature, setLegislature] = useState(null);
  const [deputies, setDeputies] = useState([]);
  const [tab, setTab] = useState('resumen');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    load();
  }, [slug]);

  async function load() {
    const { data: g } = await supabase.from('parliamentary_groups').select('*').eq('slug', slug).maybeSingle();
    if (!g) {
      setNotFound(true);
      return;
    }
    setGroup(g);

    const [{ data: leg }, { data: deputiesData }] = await Promise.all([
      supabase.from('legislatures').select('code, name').eq('id', g.legislature_id).maybeSingle(),
      supabase
        .from('deputies')
        .select('id, full_name, slug, constituency, photo_url')
        .eq('parliamentary_group_id', g.id)
        .eq('active', true)
        .order('last_name', { ascending: true }),
    ]);

    setLegislature(leg);
    setDeputies(deputiesData || []);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    toast('Enlace copiado ✓');
  }

  if (notFound) {
    return (
      <div className="sec">
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-flag-off"></i>
            No hemos encontrado este grupo parlamentario.
            <div style={{ marginTop: 10 }}>
              <Link href="/institutions/groups" className="btn-o" style={{ textDecoration: 'none' }}>
                Volver a Grupos
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!group) return <div className="spinner"></div>;

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: '#888' }}>
        <Link href="/institutions" style={{ color: '#888', textDecoration: 'none' }}>
          Instituciones
        </Link>{' '}
        /{' '}
        <Link href="/institutions/groups" style={{ color: '#888', textDecoration: 'none' }}>
          Grupos parlamentarios
        </Link>{' '}
        / <span style={{ color: '#555' }}>{group.name}</span>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              background: '#e8f4f0',
              color: '#1d6f5c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {group.logo_url ? (
              <img src={group.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <i className="ti ti-flag"></i>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{group.name}</h1>
            {legislature && <div style={{ fontSize: 12.5, color: '#888', marginTop: 4 }}>{legislature.code} Legislatura</div>}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr .5px 1fr .5px 1fr',
            background: '#faf9f5',
            borderRadius: 10,
            padding: '14px 8px',
            marginBottom: 16,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{group.member_count}</div>
            <div style={{ fontSize: 10.5, color: '#888' }}>diputados</div>
          </div>
          <div style={{ background: '#e0dfd8' }}></div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#ccc' }}>—</div>
            <div style={{ fontSize: 10.5, color: '#888' }}>comisiones</div>
          </div>
          <div style={{ background: '#e0dfd8' }}></div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#ccc' }}>—</div>
            <div style={{ fontSize: 10.5, color: '#888' }}>secretarías</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="icon-circle-btn" title="Compartir" onClick={copyLink}>
            <i className="ti ti-share"></i>
          </button>
          {group.official_url && (
            <a
              href={group.official_url}
              target="_blank"
              rel="noreferrer"
              className="btn-o"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
            >
              Ver en el Congreso <i className="ti ti-external-link" style={{ fontSize: 13 }}></i>
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', margin: '18px 0', overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 12.5,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#1d6f5c' : '#999',
              borderBottom: tab === t.id ? '2px solid #1d6f5c' : '2px solid transparent',
              padding: '0 0 9px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Dirección del grupo</div>
            <div style={{ fontSize: 12, color: '#999' }}>
              Aún no disponible — estamos ampliando la sincronización para traer portavoz, secretaría general y Mesa.
            </div>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Comisiones</div>
            <div style={{ fontSize: 12, color: '#999' }}>Información sobre comisiones y subcomisiones parlamentarias — próximamente.</div>
          </div>
        </div>
      )}

      {tab === 'diputados' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {deputies.map((d) => (
            <Link
              key={d.id}
              href={`/institutions/deputies/${d.slug}`}
              className="card"
              style={{ padding: 14, textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#e8f4f0',
                  color: '#1d6f5c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
              >
                {d.photo_url ? <img src={d.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(d.full_name)}
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{nameDisplay(d.full_name)}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{d.constituency}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'comisiones' && (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-gavel"></i>
            Aún no tenemos la composición de comisiones — es la siguiente ampliación prevista de la sincronización.
          </div>
        </div>
      )}

      {tab === 'mesa' && (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-users-group"></i>
            Aún no tenemos los datos de Mesa y portavoces — es la siguiente ampliación prevista de la sincronización.
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos del Congreso de los Diputados.{' '}
        <a href="https://www.congreso.es/es/opendata/diputados" target="_blank" rel="noreferrer" style={{ color: '#1d6f5c' }}>
          Ver fuente oficial ↗
        </a>
      </div>
    </div>
  );
}
