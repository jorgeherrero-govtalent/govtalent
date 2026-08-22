'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';

function initials(fullName) {
  const parts = (fullName || '').trim().split(' ');
  return `${parts[0]?.[0] || ''}${parts[parts.length - 1]?.[0] || ''}`.toUpperCase();
}

// "Del Canto Soriano, Lydia" -> "Lydia Del Canto Soriano"
function nameDisplay(officialName) {
  const [last, first] = (officialName || '').split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}

function normalizePerson(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Mismas reglas que el organigrama: government_members guarda "Sanidad" y
// government_officials "Ministerio de Sanidad".
function normalizeMinistry(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^ministerio\s+(de\s+la\s+|de\s+los\s+|de\s+las\s+|de\s+|del\s+|para\s+la\s+|para\s+el\s+)?/, '')
    .trim();
}

// La Moncloa añade coletillas ("... y portavoz del Gobierno") que la Agenda de
// la Comunicación no lleva: se compara por prefijo en ambos sentidos.
function ministryMatches(a, b) {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

// Cargos del propio titular, que no deben repetirse dentro de su equipo.
const TOP_ROLE = /^(ministro|ministra|vicepresident|president[ea] del gobierno)/;

const ORDINALS = ['primera', 'segunda', 'tercera'];


const CARD_LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 14,
};

export default function GovernmentMemberProfilePage() {
  const { slug } = useParams();
  const supabase = createClient();

  const [member, setMember] = useState(null);
  const [officials, setOfficials] = useState([]);
  const [vicepresidents, setVicepresidents] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState('trayectoria');
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // .limit(1) antes de .maybeSingle(): sin él la consulta falla en
      // silencio si hay más de una fila que encaje.
      const { data } = await supabase
        .from('government_members')
        .select('*')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setNotFound(true);
        return;
      }
      setMember(data);

      const [{ data: offs }, { data: vps }] = await Promise.all([
        supabase.from('government_officials').select('full_name, slug, role, ministry_name, unit_name').eq('active', true),
        // Solo hace falta para los vicepresidentes: su equipo vive en dos
        // secciones distintas de la fuente y hay que saber su ordinal.
        data.rank === 'vicepresidente'
          ? supabase
              .from('government_members')
              .select('slug')
              .eq('active', true)
              .eq('rank', 'vicepresidente')
              .order('order_index', { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

      if (cancelled) return;
      setOfficials(offs || []);
      setVicepresidents(vps || []);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const team = useMemo(() => {
    if (!member) return [];

    const sections = [];
    if (member.rank === 'presidente') sections.push('presidencia del gobierno');
    if (member.rank === 'vicepresidente') {
      const idx = vicepresidents.findIndex((v) => v.slug === member.slug);
      if (idx >= 0 && ORDINALS[idx]) sections.push(`vicepresidencia ${ORDINALS[idx]} del gobierno`);
    }
    if (member.ministry_name) sections.push(normalizeMinistry(member.ministry_name));

    const memberKey = normalizePerson(member.full_name);

    return officials.filter((o) => {
      const key = normalizeMinistry(o.ministry_name);
      if (!sections.some((s) => ministryMatches(s, key))) return false;
      // La Agenda incluye al propio titular en el listado de su ministerio.
      if (normalizePerson(nameDisplay(o.full_name)) === memberKey) return false;
      if (TOP_ROLE.test(normalizePerson(o.role))) return false;
      return true;
    });
  }, [member, officials, vicepresidents]);


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

  const avatarStyle = {
    width: 70,
    height: 70,
    borderRadius: 12,
    flexShrink: 0,
    objectFit: 'cover',
    background: '#ece9e2',
  };

  const tabs = [
    { id: 'trayectoria', label: 'Trayectoria' },
    { id: 'equipo', label: `Equipo${team.length ? ` (${team.length})` : ''}` },
    { id: 'contacto', label: 'Contacto' },
  ];

  return (
    <div className="sec" style={{ maxWidth: 800 }}>
      {/* El atrás va antes de la miga: la miga dice DÓNDE estás, el atrás
          de dónde VIENES. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/institutions/ministries" fallbackLabel="Ministerios" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/ministries" style={{ color: '#999', textDecoration: 'none' }}>
            Ministerios
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{member.full_name}</span>
        </span>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 200, flex: 1 }}>
            {member.photo_url && !photoFailed ? (
              <img
                src={member.photo_url}
                alt=""
                width={70}
                height={70}
                style={avatarStyle}
                onError={() => setPhotoFailed(true)}
              />
            ) : (
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
                {initials(member.full_name)}
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.25 }}>{member.full_name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: '#6d5aef', flexShrink: 0 }}></span>
                <span style={{ fontSize: 12, color: '#555' }}>{member.role}</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>
                {member.ministry_name ? `Ministerio de ${member.ministry_name} · ` : ''}Gobierno de España
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            {/* Era la única ficha de la plataforma sin seguir ni proyecto:
                usaba saved_government_members, la tabla anterior a
                follows, y un botón de Radar en gris. Ahora usa el mismo
                contrato (kind + ref_id) que el resto, así que sus avisos
                llegan por el mismo camino. Va con kind "cargo": se
                comprobó que ningún slug se repite entre
                government_members y government_officials. */}
            <FollowButton kind="cargo" refId={member.slug} label={member.full_name} />
          </div>
        </div>


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

      {tab === 'trayectoria' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={CARD_LABEL}>Trayectoria</div>
          {member.bio_text ? (
            <div style={{ fontSize: 12.5, color: '#444', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
              {member.bio_text}
            </div>
          ) : (
            <div className="empty-state">
              <i className="ti ti-file-off"></i>
              Aún no tenemos la trayectoria de esta persona.
            </div>
          )}
        </div>
      )}

      {tab === 'equipo' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={CARD_LABEL}>
            {member.ministry_name ? `Equipo del Ministerio de ${member.ministry_name}` : 'Equipo'}
          </div>
          {team.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-users-off"></i>
              No hay cargos registrados para este ministerio.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {team.map((o, i) => (
                <Link
                  key={o.slug}
                  href={`/institutions/ministries/persona/${o.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 0',
                    borderBottom: i === team.length - 1 ? 'none' : '.5px solid #f0f0eb',
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
                    {initials(nameDisplay(o.full_name))}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nameDisplay(o.full_name)}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{o.role}</div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14 }}></i>
                </Link>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 14, paddingTop: 11, borderTop: '.5px solid #f0f0eb' }}>
            Fuente: Agenda de la Comunicación 2025 · La Moncloa
          </div>
        </div>
      )}

      {tab === 'contacto' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={CARD_LABEL}>Contacto del ministerio</div>
          {!hasContact ? (
            <div className="empty-state">
              <i className="ti ti-address-book-off"></i>
              No tenemos datos de contacto para este ministerio.
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: '#555', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {member.ministry_phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <i className="ti ti-phone" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                  {member.ministry_phone}
                </div>
              )}
              {member.ministry_email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <i className="ti ti-mail" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                  <a href={`mailto:${member.ministry_email}`} style={{ color: '#555', textDecoration: 'none', wordBreak: 'break-all' }}>
                    {member.ministry_email}
                  </a>
                </div>
              )}
              {member.ministry_website && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <i className="ti ti-world" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                  <a
                    href={member.ministry_website.startsWith('http') ? member.ministry_website : `https://${member.ministry_website}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#555', textDecoration: 'none', wordBreak: 'break-all' }}
                  >
                    {member.ministry_website}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos de La Moncloa — Gobierno de España.{' '}
        <a
          href="https://www.lamoncloa.gob.es/gobierno/composiciondelgobierno/Paginas/index.aspx"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#1d6f5c' }}
        >
          Ver fuente oficial ↗
        </a>
      </div>
    </div>
  );
}
