'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

function initials(fullName) {
  const parts = (fullName || '').replace(',', '').trim().split(' ');
  return `${parts[0]?.[0] || ''}${parts[parts.length - 1]?.[0] || ''}`.toUpperCase();
}

// "Del Canto Soriano, Lydia" -> "Lydia Del Canto Soriano"
function nameDisplay(officialName) {
  const [last, first] = (officialName || '').split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}

function CircleButton({ icon, label, onClick, href, active, disabled, title, external }) {
  const [hover, setHover] = useState(false);
  const on = active || (hover && !disabled);

  const style = {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: `.5px solid ${on ? '#1d6f5c' : '#e0dfd8'}`,
    background: on ? '#e8f4f0' : '#fff',
    color: disabled ? '#ccc' : on ? '#1d6f5c' : '#888',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s ease',
    padding: 0,
    flexShrink: 0,
  };

  const inner = <i className={`ti ti-${icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>;

  if (href && !disabled) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        aria-label={label}
        title={title || label}
        style={{ ...style, textDecoration: 'none' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      {inner}
    </button>
  );
}

const CARD_LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 14,
};

export default function GovernmentOfficialProfilePage() {
  const { slug } = useParams();
  const supabase = createClient();

  const [official, setOfficial] = useState(null);
  const [colleagues, setColleagues] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [userId, setUserId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('contacto');
  const [radarNote, setRadarNote] = useState(false);

  useEffect(() => {
    // .limit(1) antes de .maybeSingle(): sin él la consulta falla en silencio
    // si hay más de una fila que encaje.
    supabase
      .from('government_officials')
      .select('*')
      .eq('slug', slug)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => (data ? setOfficial(data) : setNotFound(true)));
  }, [slug]);

  useEffect(() => {
    if (!official) return;

    supabase
      .from('government_officials')
      .select('slug, full_name, role')
      // Sin este filtro salían también los cargos dados de baja: al desactivar
      // a alguien seguía apareciendo como compañero de ministerio.
      .eq('active', true)
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
        .limit(1)
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
      await supabase
        .from('saved_government_officials')
        .delete()
        .eq('user_id', userId)
        .eq('government_official_id', official.id);
      setSaved(false);
      toast('Eliminado de guardados');
    } else {
      await supabase
        .from('saved_government_officials')
        .insert({ user_id: userId, government_official_id: official.id });
      setSaved(true);
      toast('Guardado ✓');
    }
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
  const hasUnit = official.unit_name && official.unit_name !== official.ministry_name;

  const avatarStyle = {
    width: 70,
    height: 70,
    borderRadius: 12,
    flexShrink: 0,
    background: '#ece9e2',
  };

  const tabs = [
    { id: 'contacto', label: 'Contacto' },
    { id: 'equipo', label: `Equipo del ministerio${colleagues.length ? ` (${colleagues.length})` : ''}` },
  ];

  return (
    <div className="sec" style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 12, fontSize: 11.5, color: '#999' }}>
        <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
          Instituciones
        </Link>
        {' › '}
        <Link href="/institutions/ministries" style={{ color: '#999', textDecoration: 'none' }}>
          Ministerios
        </Link>
        {' › '}
        <span style={{ color: '#666' }}>{displayName}</span>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 200, flex: 1 }}>
            <div
              style={{
                ...avatarStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 21,
                fontWeight: 700,
                color: '#8d8b83',
              }}
              aria-hidden="true"
            >
              {initials(official.full_name)}
            </div>

            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.25 }}>{displayName}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: '#6d5aef', flexShrink: 0 }}></span>
                <span style={{ fontSize: 12, color: '#555' }}>{official.role}</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>
                {official.ministry_name}
                {hasUnit ? ` · ${official.unit_name}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            <CircleButton icon="share" label="Copiar enlace" onClick={copyLink} />
            {official.unit_email && (
              <CircleButton icon="mail" label="Escribir a la unidad" href={`mailto:${official.unit_email}`} />
            )}
            <CircleButton
              icon="bell"
              label="Seguir en Radar"
              title="Seguir en Radar · próximamente"
              disabled
              onClick={() => setRadarNote(true)}
            />
            <CircleButton
              icon={saved ? 'bookmark-filled' : 'bookmark'}
              label={saved ? 'Quitar de guardados' : 'Guardar'}
              active={saved}
              onClick={toggleSave}
            />
          </div>
        </div>

        {radarNote && (
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 12, paddingTop: 11, borderTop: '.5px solid #f0f0eb' }}>
            El seguimiento en Radar estará disponible próximamente.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', margin: '18px 0', overflowX: 'auto' }}>
        {tabs.map((t) => (
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

      {tab === 'contacto' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={CARD_LABEL}>Contacto de la unidad</div>

          {hasUnit && (
            <div style={{ background: '#faf9f5', borderRadius: 9, padding: 13, marginBottom: hasContact ? 12 : 0 }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Unidad</div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{official.unit_name}</div>
            </div>
          )}

          {!hasContact ? (
            <div className="empty-state">
              <i className="ti ti-address-book-off"></i>
              No tenemos datos de contacto para esta unidad.
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: '#555', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {official.unit_phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <i className="ti ti-phone" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                  {official.unit_phone}
                </div>
              )}
              {official.unit_email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <i className="ti ti-mail" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                  <a
                    href={`mailto:${official.unit_email}`}
                    style={{ color: '#555', textDecoration: 'none', wordBreak: 'break-all' }}
                  >
                    {official.unit_email}
                  </a>
                </div>
              )}
              {official.unit_website && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <i className="ti ti-world" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                  <a
                    href={official.unit_website.startsWith('http') ? official.unit_website : `https://${official.unit_website}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#555', textDecoration: 'none', wordBreak: 'break-all' }}
                  >
                    {official.unit_website}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'equipo' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={CARD_LABEL}>Otros cargos de {official.ministry_name}</div>
          {colleagues.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-users-off"></i>
              No hay más cargos registrados en este ministerio.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {colleagues.map((c, i) => (
                <Link
                  key={c.slug}
                  href={`/institutions/ministries/persona/${c.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 0',
                    borderBottom: i === colleagues.length - 1 ? 'none' : '.5px solid #f0f0eb',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: '#ece9e2',
                      color: '#8d8b83',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {initials(c.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nameDisplay(c.full_name)}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{c.role}</div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14 }}></i>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos de la Agenda de la Comunicación (lamoncloa.gob.es), edición 2025 — actualización anual.
      </div>
    </div>
  );
}
