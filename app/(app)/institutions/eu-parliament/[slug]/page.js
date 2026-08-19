'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';

const GROUP_COLORS = {
  PPE: '#378ADD',
  'S&D': '#D4537E',
  Renew: '#BA7517',
  'Verts/ALE': '#639922',
  ECR: '#185FA5',
  PfE: '#7F77DD',
  'The Left': '#E24B4A',
  ESN: '#1D9E75',
  NI: '#888780',
};

const COUNTRIES = {
  AT: 'Austria', BE: 'Bélgica', BG: 'Bulgaria', CY: 'Chipre', CZ: 'Chequia',
  DE: 'Alemania', DK: 'Dinamarca', EE: 'Estonia', ES: 'España', FI: 'Finlandia',
  FR: 'Francia', GR: 'Grecia', HR: 'Croacia', HU: 'Hungría', IE: 'Irlanda',
  IT: 'Italia', LT: 'Lituania', LU: 'Luxemburgo', LV: 'Letonia', MT: 'Malta',
  NL: 'Países Bajos', PL: 'Polonia', PT: 'Portugal', RO: 'Rumanía',
  SE: 'Suecia', SI: 'Eslovenia', SK: 'Eslovaquia',
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Las fechas de la API son 'YYYY-MM-DD'. Se parten a mano en vez de usar
// new Date(): con la cadena suelta, el navegador la interpreta en UTC y
// según la zona horaria puede restar un día.
function parseDate(s) {
  if (!s || typeof s !== 'string') return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

function shortDate(s) {
  const p = parseDate(s);
  return p ? `${MONTHS[p.m]} ${p.y}` : '';
}

function longDate(s) {
  const p = parseDate(s);
  return p ? `${p.d} de ${MONTHS_LONG[p.m]} de ${p.y}` : '';
}

const countryName = (c) => COUNTRIES[c] || c || '—';

// Todos los roles que devuelve la API. Antes solo se traducían MEMBER y
// MEMBER_SUBSTITUTE y el resto se mostraba como código crudo o se perdía:
// hay 90 presidencias de comisión, 361 vicepresidencias, 14 vicepresidencias
// del Parlamento y 5 cuestores que no se estaban viendo.
const ROLE_LABELS = {
  MEMBER: 'Titular',
  MEMBER_SUBSTITUTE: 'Suplente',
  MEMBER_PARLIAMENT: 'Eurodiputado/a',
  CHAIR: 'Presidencia',
  CHAIR_VICE: 'Vicepresidencia',
  CHAIR_CO: 'Copresidencia',
  MEMBER_BUREAU: 'Miembro de la Mesa',
  PRESIDENT: 'Presidencia',
  PRESIDENT_VICE: 'Vicepresidencia',
  QUAESTOR: 'Cuestor/a',
  TREASURER: 'Tesorería',
  TREASURER_CO: 'Cotesorería',
  PRESIDENT_PARLIAMENT_STOA: 'Presidencia de STOA',
  CHAIR_VICE_BUREAU_TREASURER: 'Vicepresidencia y tesorería',
};

// Cargos de responsabilidad: se destacan frente a la simple pertenencia.
const ROLES_DESTACADOS = new Set([
  'CHAIR',
  'CHAIR_CO',
  'PRESIDENT',
  'PRESIDENT_VICE',
  'QUAESTOR',
  'PRESIDENT_PARLIAMENT_STOA',
]);

// Convierte un código sin traducir en algo legible, en lugar de enseñarlo
// tal cual: MEMBER_ALTERNATE -> "Member alternate".
function roleLabel(code) {
  if (!code) return null;
  if (ROLE_LABELS[code]) return ROLE_LABELS[code];
  const limpio = code.replace(/_/g, ' ').toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

const BODY_TYPE_LABELS = {
  committee: 'Comisión',
  subcommittee: 'Subcomisión',
  delegation: 'Delegación',
  working_group: 'Grupo de trabajo',
  governing: 'Órgano de gobierno',
  eu_group: 'Grupo político',
  national_party: 'Partido nacional',
};

// Se excluye la pertenencia a la institución en sí (el propio Parlamento)
// y al partido nacional: ya salen en la cabecera y como línea serían ruido.
const HIDDEN_TYPES = new Set(['institution', 'national_party']);

function Photo({ url, name, size = 70, radius = 12 }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const base = { width: size, height: size, borderRadius: radius, flexShrink: 0, objectFit: 'cover', background: '#ece9e2' };

  if (!url || failed) {
    return (
      <div
        style={{
          ...base,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8d8b83',
          fontSize: Math.round(size * 0.3),
          fontWeight: 600,
        }}
        aria-hidden="true"
      >
        {initials}
      </div>
    );
  }
  return <img src={url} alt="" width={size} height={size} style={base} onError={() => setFailed(true)} />;
}

function RoleTag({ role }) {
  const label = roleLabel(role);
  if (!label) return null;
  const destacado = ROLES_DESTACADOS.has(role);
  const titular = role === 'MEMBER';
  // Tres niveles: cargo de responsabilidad en morado, titular en verde,
  // suplente y demás en gris. Así se distingue de un vistazo quién manda
  // en cada órgano.
  const estilo = destacado
    ? { background: '#EEEDFE', color: '#3C3489' }
    : titular
      ? { background: '#E1F5EE', color: '#0F6E56' }
      : { background: '#F1EFE8', color: '#5F5E5A' };
  return (
    <span style={{ fontSize: 10.5, padding: '3px 9px', borderRadius: 12, whiteSpace: 'nowrap', ...estilo }}>
      {label}
    </span>
  );
}

function Timeline({ items, past }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      <div
        style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 1.5, background: past ? '#f0efe9' : '#e0dfd8' }}
      ></div>
      {items.map((it, i) => (
        <div key={it.id} style={{ position: 'relative', marginBottom: i === items.length - 1 ? 0 : 16 }}>
          <div
            style={{
              position: 'absolute',
              left: -20,
              top: 4,
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: past ? '#d5d3c9' : '#1d6f5c',
              border: '2px solid #faf9f5',
            }}
          ></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: past ? 400 : 600, color: past ? '#666' : '#1a1a1a' }}>
                {it.name}
              </div>
              <div style={{ fontSize: 11, color: past ? '#aaa' : '#999', marginTop: 2 }}>
                {it.typeLabel}
                {it.code ? ` ${it.code}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {!past && <RoleTag role={it.role} />}
              <div style={{ fontSize: 10.5, color: '#aaa', marginTop: past ? 0 : 4 }}>
                {past
                  ? `${shortDate(it.start_date)} – ${shortDate(it.end_date)}`
                  : `${shortDate(it.start_date)} →`}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const CARD = { background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 18 };
const LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 14,
};

export default function MepDetailPage() {
  const supabase = createClient();
  const params = useParams();
  const slug = params?.slug;

  const [mep, setMep] = useState(undefined); // undefined = cargando, null = no existe
  const [memberships, setMemberships] = useState([]);
  const [tab, setTab] = useState('actividad');
  const [userId, setUserId] = useState(null);
  const [showAllPast, setShowAllPast] = useState(false);
  const [radarNote, setRadarNote] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data: m } = await supabase
        .from('eu_meps')
        .select('*, national_party:eu_bodies!eu_meps_national_party_id_fkey(code, name_es)')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!m) {
        setMep(null);
        return;
      }
      setMep(m);

      const [{ data: mm }, { data: auth }] = await Promise.all([
        supabase
          .from('eu_mep_memberships')
          .select('id, role, start_date, end_date, is_current, eu_bodies(id, code, name_es, name_en, short_name_es, body_type)')
          .eq('mep_id', m.id),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;
      setMemberships(mm || []);

      const uid = auth?.user?.id || null;
      setUserId(uid);
      if (uid) {
        // FollowButton comprueba por su cuenta si se sigue.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const { current, past } = useMemo(() => {
    const mapped = (memberships || [])
      .filter((x) => x.eu_bodies && !HIDDEN_TYPES.has(x.eu_bodies.body_type))
      .map((x) => ({
        id: x.id,
        role: x.role,
        start_date: x.start_date,
        end_date: x.end_date,
        is_current: x.is_current,
        code: x.eu_bodies.code,
        name:
          x.eu_bodies.name_es ||
          x.eu_bodies.short_name_es ||
          x.eu_bodies.name_en ||
          x.eu_bodies.code,
        typeLabel: BODY_TYPE_LABELS[x.eu_bodies.body_type] || 'Órgano',
      }));

    const byStartDesc = (a, b) => (b.start_date || '').localeCompare(a.start_date || '');
    // Peso por rol: los cargos de responsabilidad van primero, luego los
    // titulares y al final suplencias. Es lo que primero busca alguien que
    // quiere saber quién decide.
    const peso = (r) => (ROLES_DESTACADOS.has(r) ? 0 : r === 'MEMBER' ? 1 : 2);

    return {
      current: mapped
        .filter((x) => x.is_current)
        .sort((a, b) => {
          const d = peso(a.role) - peso(b.role);
          return d !== 0 ? d : byStartDesc(a, b);
        }),
      past: mapped.filter((x) => !x.is_current).sort((a, b) => (b.end_date || '').localeCompare(a.end_date || '')),
    };
  }, [memberships]);

  if (mep === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 720 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (mep === null) {
    return (
      <div className="sec" style={{ maxWidth: 720 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No se ha encontrado este eurodiputado.
          </div>
        </div>
        <BackLink fallbackHref="/institutions/eu-parliament" fallbackLabel="Volver al Parlamento Europeo" />
      </div>
    );
  }

  const groupColor = GROUP_COLORS[mep.political_group_code] || '#888780';
  const partyCode = mep.national_party?.code;
  const pastShown = showAllPast ? past : past.slice(0, 4);

  const tabs = [
    { id: 'actividad', label: 'Actividad' },
    { id: 'trayectoria', label: `Trayectoria${past.length ? ` (${past.length})` : ''}` },
    { id: 'contacto', label: 'Contacto' },
  ];

  return (
    <div className="sec" style={{ maxWidth: 720 }}>
      {/* A esta ficha se llega desde cuatro sitios: el directorio del PE,
          una comisión, los actores de un expediente y los ponentes de un
          procedimiento. El atrás devuelve a donde estabas; la miga de pan
          sigue diciendo dónde está la página en la estructura. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/institutions/eu-parliament" fallbackLabel="Parlamento Europeo" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>Instituciones</Link>
          {' › '}
          <Link href="/institutions/eu-parliament" style={{ color: '#999', textDecoration: 'none' }}>Parlamento Europeo</Link>
          {' › '}
          <span style={{ color: '#666' }}>{mep.full_name}</span>
        </span>
      </div>

      <div style={{ ...CARD, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
            <Photo url={mep.photo_url} name={mep.full_name} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25, margin: 0 }}>{mep.full_name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: groupColor, flexShrink: 0 }}></span>
                <span style={{ fontSize: 12, color: '#555' }}>
                  {mep.political_group_code || '—'}
                  {partyCode ? ` · ${partyCode}` : ''} · {countryName(mep.country_code)}
                </span>
              </div>
              {mep.mandate_start && (
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>
                  Eurodiputado/a desde {longDate(mep.mandate_start)}
                </div>
              )}
            </div>
          </div>

          {/* Solo seguir: el correo vive en la pestaña de Contacto, que
              es donde el usuario lo busca. */}
          <div style={{ flexShrink: 0 }}>
            <FollowButton kind="eurodiputado" refId={mep.slug} label={mep.full_name} />
          </div>
        </div>

        {radarNote && (
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 12, paddingTop: 11, borderTop: '.5px solid #f0f0eb' }}>
            El seguimiento en Radar estará disponible próximamente.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14 }}>
        {tabs.map((t) => (
          <span
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontSize: 13,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#1d6f5c' : '#999',
              borderBottom: tab === t.id ? '2px solid #1d6f5c' : '2px solid transparent',
              paddingBottom: 8,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {tab === 'actividad' && (
        <div style={CARD}>
          <div style={LABEL}>Ahora mismo · 10ª legislatura</div>
          {current.length === 0 ? (
            <div style={{ fontSize: 12, color: '#aaa' }}>Sin comisiones ni delegaciones registradas.</div>
          ) : (
            <Timeline items={current} past={false} />
          )}
        </div>
      )}

      {tab === 'trayectoria' && (
        <div style={CARD}>
          <div style={LABEL}>Cargos anteriores</div>
          {past.length === 0 ? (
            <div style={{ fontSize: 12, color: '#aaa' }}>No hay cargos anteriores registrados.</div>
          ) : (
            <>
              <Timeline items={pastShown} past={true} />
              {past.length > 4 && (
                <div
                  onClick={() => setShowAllPast((v) => !v)}
                  style={{ fontSize: 11.5, color: '#1d6f5c', marginTop: 13, cursor: 'pointer' }}
                >
                  {showAllPast ? 'Ver menos' : `Ver los ${past.length} cargos anteriores →`}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'contacto' && (
        <>
          <div style={{ ...CARD, marginBottom: 12 }}>
            <div style={LABEL}>Cómo contactar</div>

            {(mep.office_brussels || mep.office_strasbourg) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {mep.office_brussels && (
                  <div style={{ background: '#faf9f5', borderRadius: 9, padding: 13 }}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>Bruselas</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>
                      Despacho {mep.office_brussels}
                    </div>
                    {mep.phone_brussels && <div style={{ fontSize: 11.5, color: '#666' }}>{mep.phone_brussels}</div>}
                  </div>
                )}
                {mep.office_strasbourg && (
                  <div style={{ background: '#faf9f5', borderRadius: 9, padding: 13 }}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>Estrasburgo</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>
                      Despacho {mep.office_strasbourg}
                    </div>
                    {mep.phone_strasbourg && <div style={{ fontSize: 11.5, color: '#666' }}>{mep.phone_strasbourg}</div>}
                  </div>
                )}
              </div>
            )}

            {mep.email && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  marginTop: mep.office_brussels || mep.office_strasbourg ? 12 : 0,
                  paddingTop: mep.office_brussels || mep.office_strasbourg ? 12 : 0,
                  borderTop: mep.office_brussels || mep.office_strasbourg ? '.5px solid #f0f0eb' : 'none',
                }}
              >
                <i className="ti ti-mail" style={{ fontSize: 14, color: '#6d5aef' }}></i>
                <a
                  href={`mailto:${mep.email}`}
                  style={{ fontSize: 11.5, color: '#555', wordBreak: 'break-all', textDecoration: 'none' }}
                >
                  {mep.email}
                </a>
              </div>
            )}

            {Array.isArray(mep.socials) && mep.socials.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '.5px solid #f0f0eb' }}>
                {mep.socials.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.tipo}
                    title={s.tipo}
                    style={{
                      border: '.5px solid #e0dfd8',
                      borderRadius: 7,
                      padding: '7px 9px',
                      color: '#555',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <i
                      className={`ti ti-brand-${s.tipo === 'x' ? 'x' : s.tipo}`}
                      style={{ fontSize: 15 }}
                      aria-hidden="true"
                    ></i>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div style={CARD}>
            <div style={LABEL}>Datos personales</div>
            <div style={{ fontSize: 11.5, color: '#555', lineHeight: 1.9 }}>
              {mep.birth_date && (
                <div>
                  <span style={{ color: '#999' }}>Nacimiento</span> · {longDate(mep.birth_date)}
                </div>
              )}
              {mep.place_of_birth && (
                <div>
                  <span style={{ color: '#999' }}>Lugar</span> · {mep.place_of_birth}
                </div>
              )}
              {mep.national_party?.name_es && (
                <div>
                  <span style={{ color: '#999' }}>Partido</span> · {mep.national_party.name_es}
                </div>
              )}
              {!mep.birth_date && !mep.place_of_birth && !mep.national_party?.name_es && (
                <div style={{ color: '#aaa' }}>Sin datos personales registrados.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
