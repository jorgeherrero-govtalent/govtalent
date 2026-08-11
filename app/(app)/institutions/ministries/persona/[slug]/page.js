'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

function initials(fullName) {
  const parts = fullName.replace(',', '').trim().split(' ');
  return `${parts[0]?.[0] || ''}${parts[parts.length - 1]?.[0] || ''}`.toUpperCase();
}

// "Del Canto Soriano, Lydia" -> "Lydia Del Canto Soriano"
function nameDisplay(officialName) {
  const [last, first] = officialName.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}

export default function GovernmentOfficialProfilePage() {
  const { slug } = useParams();
  const supabase = createClient();
  const [official, setOfficial] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    supabase
      .from('government_officials')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => (data ? setOfficial(data) : setNotFound(true)));
  }, [slug]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    toast('Enlace copiado ✓');
  }

  if (notFound) {
    return (
      <div className="sec">
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hemos encontrado a esta persona.
            <div style={{ marginTop: 10 }}>
              <Link href="/institutions/ministries" className="btn-o" style={{ textDecoration: 'none' }}>
                Volver a Ministerios
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!official) return <div className="spinner"></div>;

  const displayName = nameDisplay(official.full_name);

  return (
    <div className="sec" style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: '#888' }}>
        <Link href="/institutions" style={{ color: '#888', textDecoration: 'none' }}>
          Instituciones
        </Link>{' '}
        /{' '}
        <Link href="/institutions/ministries" style={{ color: '#888', textDecoration: 'none' }}>
          Ministerios
        </Link>{' '}
        / <span style={{ color: '#555' }}>{displayName}</span>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 10,
              background: '#e8f4f0',
              color: '#1d6f5c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials(official.full_name)}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{displayName}</h1>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{official.role}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#666', background: '#f0efe9', padding: '3px 9px', borderRadius: 10 }}>
                {official.ministry_name}
              </span>
              {official.unit_name && official.unit_name !== official.ministry_name && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#666', background: '#f0efe9', padding: '3px 9px', borderRadius: 10 }}>
                  {official.unit_name}
                </span>
              )}
            </div>
          </div>
        </div>

        <button className="icon-circle-btn" title="Compartir" onClick={copyLink}>
          <i className="ti ti-share"></i>
        </button>
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos de la Agenda de la Comunicación (lamoncloa.gob.es), edición 2025 — actualización anual.
      </div>
    </div>
  );
}
