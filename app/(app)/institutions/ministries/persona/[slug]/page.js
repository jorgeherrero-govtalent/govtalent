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
  const [colleagues, setColleagues] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [userId, setUserId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showAllColleagues, setShowAllColleagues] = useState(false);

  useEffect(() => {
    supabase
      .from('government_officials')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => (data ? setOfficial(data) : setNotFound(true)));
  }, [slug]);

  useEffect(() => {
    if (!official) return;
    supabase
      .from('government_officials')
      .select('slug, full_name, role')
      .eq('ministry_name', official.ministry_name)
      .neq('slug', official.slug)
      .then(({ data }) => setColleagues(data || []));

    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      setUserId(uid);
      const { data: savedRow } = await supabase
        .from('saved_government_officials')
        .select('id')
        .eq('user_id', uid)
        .eq('government_official_id', official.id)
        .maybeSingle();
      setSaved(!!savedRow);
    });
  }, [official]);

  async function toggleSave() {
    if (!userId) {
      toast('Inicia sesión para guardar');
      return;
    }
    if (saved) {
      await supabase.from('saved_government_officials').delete().eq('user_id', userId).eq('government_official_id', official.id);
      setSaved(false);
      toast('Eliminado de guardados');
    } else {
      await supabase.from('saved_government_officials').insert({ user_id: userId, government_official_id: official.id });
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

  if (!official) return <div className="spinner"></div>;

  const displayName = nameDisplay(official.full_name);
  const hasContact = official.unit_email || official.unit_phone || official.unit_website;
  const visibleColleagues = showAllColleagues ? colleagues : colleagues.slice(0, 3);

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
        <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>
          {official.ministry_name}
          {official.unit_name && official.unit_name !== official.ministry_name && ` › ${official.unit_name}`}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 10,
              background: '#e8f4f0',
              color: '#1d6f5c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials(official.full_name)}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{displayName}</h1>
            <div style={{ fontSize: 12.5, color: '#666', marginTop: 2 }}>{official.role}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-ai" onClick={toggleSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ti ${saved ? 'ti-bookmark-filled' : 'ti-bookmark'}`}></i> {saved ? 'Guardado' : 'Guardar'}
          </button>
          <Link
            href="/institutions/ministries"
            style={{ marginLeft: 'auto', fontSize: 12, color: '#1d6f5c', fontWeight: 600, textDecoration: 'none' }}
          >
            Ver ministerio →
          </Link>
        </div>
      </div>

      {hasContact && (
        <div className="card" style={{ padding: 18, marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Contacto de la unidad</div>
          <div style={{ fontSize: 12, color: '#555', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {official.unit_email && (
              <span>
                <i className="ti ti-mail" style={{ color: '#999', marginRight: 6 }}></i>
                <a href={`mailto:${official.unit_email}`} style={{ color: '#555', textDecoration: 'none' }}>
                  {official.unit_email}
                </a>
              </span>
            )}
            {official.unit_phone && (
              <span>
                <i className="ti ti-phone" style={{ color: '#999', marginRight: 6 }}></i>
                {official.unit_phone}
              </span>
            )}
            {official.unit_website && (
              <span>
                <i className="ti ti-world" style={{ color: '#999', marginRight: 6 }}></i>
                <a
                  href={official.unit_website.startsWith('http') ? official.unit_website : `https://${official.unit_website}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#555', textDecoration: 'none' }}
                >
                  {official.unit_website}
                </a>
              </span>
            )}
          </div>
        </div>
      )}

      {colleagues.length > 0 && (
        <div className="card" style={{ padding: 18, marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Otros cargos de {official.ministry_name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {visibleColleagues.map((c) => (
              <Link key={c.slug} href={`/institutions/ministries/persona/${c.slug}`} style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>
                {nameDisplay(c.full_name)} <span style={{ color: '#999' }}>— {c.role}</span>
              </Link>
            ))}
          </div>
          {!showAllColleagues && colleagues.length > 3 && (
            <span
              onClick={() => setShowAllColleagues(true)}
              style={{ fontSize: 11.5, color: '#1d6f5c', fontWeight: 600, cursor: 'pointer', display: 'inline-block', marginTop: 8 }}
            >
              Ver los {colleagues.length + 1} →
            </span>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos de la Agenda de la Comunicación (lamoncloa.gob.es), edición 2025 — actualización anual.
      </div>
    </div>
  );
}
