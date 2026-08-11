'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

function initials(fullName) {
  const parts = fullName.trim().split(' ');
  return `${parts[0]?.[0] || ''}${parts[parts.length - 1]?.[0] || ''}`.toUpperCase();
}

export default function GovernmentMemberProfilePage() {
  const { slug } = useParams();
  const supabase = createClient();
  const [member, setMember] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [userId, setUserId] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from('government_members')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => (data ? setMember(data) : setNotFound(true)));
  }, [slug]);

  useEffect(() => {
    if (!member) return;
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      setUserId(uid);
      const { data: savedRow } = await supabase
        .from('saved_government_members')
        .select('id')
        .eq('user_id', uid)
        .eq('government_member_id', member.id)
        .maybeSingle();
      setSaved(!!savedRow);
    });
  }, [member]);

  async function toggleSave() {
    if (!userId) {
      toast('Inicia sesión para guardar');
      return;
    }
    if (saved) {
      await supabase.from('saved_government_members').delete().eq('user_id', userId).eq('government_member_id', member.id);
      setSaved(false);
      toast('Eliminado de guardados');
    } else {
      await supabase.from('saved_government_members').insert({ user_id: userId, government_member_id: member.id });
      setSaved(true);
      toast('Guardado ✓');
    }
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

  if (!member) return <div className="spinner"></div>;

  const hasContact = member.ministry_email || member.ministry_phone || member.ministry_website;

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
        / <span style={{ color: '#555' }}>{member.full_name}</span>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: '#e8f4f0',
              color: '#1d6f5c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 700,
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {member.photo_url ? (
              <img src={member.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initials(member.full_name)
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{member.full_name}</h1>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{member.role}</div>
            {member.ministry_name && (
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: '#666',
                  background: '#f0efe9',
                  padding: '3px 9px',
                  borderRadius: 10,
                  marginTop: 8,
                }}
              >
                Ministerio de {member.ministry_name}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-ai" onClick={toggleSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ti ${saved ? 'ti-bookmark-filled' : 'ti-bookmark'}`}></i> {saved ? 'Guardado' : 'Guardar'}
          </button>
          <Link href="/institutions/ministries" style={{ fontSize: 12, color: '#1d6f5c', fontWeight: 600, textDecoration: 'none' }}>
            Ver equipo →
          </Link>
          {member.bio_url && (
            <a
              href={member.bio_url}
              target="_blank"
              rel="noreferrer"
              className="btn-o"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
            >
              Ver ficha oficial <i className="ti ti-external-link" style={{ fontSize: 13 }}></i>
            </a>
          )}
        </div>
      </div>

      {hasContact && (
        <div className="card" style={{ padding: 18, marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Contacto del Ministerio</div>
          <div style={{ fontSize: 12, color: '#555', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {member.ministry_email && (
              <span>
                <i className="ti ti-mail" style={{ color: '#999', marginRight: 6 }}></i>
                <a href={`mailto:${member.ministry_email}`} style={{ color: '#555', textDecoration: 'none' }}>
                  {member.ministry_email}
                </a>
              </span>
            )}
            {member.ministry_phone && (
              <span>
                <i className="ti ti-phone" style={{ color: '#999', marginRight: 6 }}></i>
                {member.ministry_phone}
              </span>
            )}
            {member.ministry_website && (
              <span>
                <i className="ti ti-world" style={{ color: '#999', marginRight: 6 }}></i>
                <a
                  href={member.ministry_website.startsWith('http') ? member.ministry_website : `https://${member.ministry_website}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#555', textDecoration: 'none' }}
                >
                  {member.ministry_website}
                </a>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 18, marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Trayectoria</div>
        {member.bio_text ? (
          <div style={{ fontSize: 12.5, color: '#444', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{member.bio_text}</div>
        ) : (
          <div className="empty-state">
            <i className="ti ti-file-off"></i>
            Aún no tenemos la trayectoria de esta persona sincronizada.
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos de La Moncloa — Gobierno de España.{' '}
        <a href="https://www.lamoncloa.gob.es/gobierno/composiciondelgobierno/Paginas/index.aspx" target="_blank" rel="noreferrer" style={{ color: '#1d6f5c' }}>
          Ver fuente oficial ↗
        </a>
      </div>
    </div>
  );
}
