'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

function initials(fullName) {
  const parts = fullName.trim().split(' ');
  return `${parts[0]?.[0] || ''}${parts[parts.length - 1]?.[0] || ''}`.toUpperCase();
}

function MemberCard({ member }) {
  return (
    <Link
      href={`/institutions/ministries/${member.slug}`}
      className="card"
      style={{ padding: 14, textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#e8f4f0',
          color: '#1d6f5c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          fontWeight: 700,
          marginBottom: 8,
          overflow: 'hidden',
        }}
      >
        {member.photo_url ? (
          <img src={member.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          initials(member.full_name)
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{member.full_name}</div>
      <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>{member.role}</div>
    </Link>
  );
}

export default function MinistriesDirectoryPage() {
  const supabase = createClient();
  const [members, setMembers] = useState(null);

  useEffect(() => {
    supabase
      .from('government_members')
      .select('full_name, slug, role, rank, photo_url')
      .eq('active', true)
      .order('order_index', { ascending: true })
      .then(({ data }) => setMembers(data || []));
  }, []);

  const presidente = members?.filter((m) => m.rank === 'presidente') || [];
  const vicepresidencias = members?.filter((m) => m.rank === 'vicepresidente') || [];
  const ministros = members?.filter((m) => m.rank === 'ministro') || [];

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ministerios</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>
          {members ? members.length : '—'} miembros del Gobierno · XV Legislatura
        </p>
      </div>

      {members === null ? (
        <div className="spinner"></div>
      ) : (
        <>
          {presidente.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>Presidencia</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {presidente.map((m) => (
                  <MemberCard key={m.slug} member={m} />
                ))}
              </div>
            </div>
          )}

          {vicepresidencias.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>Vicepresidencias</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {vicepresidencias.map((m) => (
                  <MemberCard key={m.slug} member={m} />
                ))}
              </div>
            </div>
          )}

          {ministros.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>Ministerios</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {ministros.map((m) => (
                  <MemberCard key={m.slug} member={m} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
