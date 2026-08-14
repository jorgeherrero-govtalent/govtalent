'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import UpgradeModal from '@/components/UpgradeModal';
import BackLink from '@/components/BackLink';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'cargos', label: 'Cargos y comisiones' },
  { id: 'actividad', label: 'Actividad' },
  { id: 'biografia', label: 'Biografía' },
];

// Color identificativo por grupo parlamentario, en la misma línea que el
// cuadrito de grupo político del Parlamento Europeo. Se busca por fragmento
// del nombre porque la denominación oficial varía ("Grupo Parlamentario
// Popular en el Congreso", "Grupo Parlamentario Plurinacional SUMAR"...).
const GROUP_COLORS = [
  [/popular/i, '#1D6FB8'],
  [/socialista/i, '#D4373F'],
  [/vox/i, '#5B9E28'],
  [/sumar/i, '#D6318C'],
  [/republicano|esquerra/i, '#E0A32E'],
  [/junts/i, '#12A89D'],
  [/bildu|euskal herria/i, '#9DB81A'],
  [/vasco|nacionalista vasco|eaj|pnv/i, '#3F9E52'],
  [/mixto/i, '#888780'],
];

function groupColor(name) {
  if (!name) return '#888780';
  const hit = GROUP_COLORS.find(([re]) => re.test(name));
  return hit ? hit[1] : '#888780';
}

function initials(fullName) {
  const [last, first] = (fullName || '').split(',').map((s) => s.trim());
  return `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase();
}

function fullNameDisplay(officialName) {
  const [last, first] = (officialName || '').split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Botón circular gris que pasa a verde al pasar el ratón. Mismo componente
// visual en las cuatro fichas del módulo de Instituciones.
function CircleButton({ icon, label, onClick, href, active, disabled, title }) {
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
        target="_blank"
        rel="noreferrer"
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

export default function DeputyProfilePage() {
  const { slug } = useParams();
  const supabase = createClient();

  const [deputy, setDeputy] = useState(null);
  const [group, setGroup] = useState(null);
  const [legislature, setLegislature] = useState(null);
  const [roles, setRoles] = useState([]);
  const [userId, setUserId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('resumen');
  const [upgradeModal, setUpgradeModal] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [radarNote, setRadarNote] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    load();
  }, [slug]);

  async function load() {
    // .limit(1) antes de .maybeSingle(): sin él, la consulta falla en silencio
    // si por lo que sea hay más de una fila que encaje.
    const { data: d } = await supabase.from('deputies').select('*').eq('slug', slug).limit(1).maybeSingle();
    if (!d) {
      setNotFound(true);
      return;
    }
    setDeputy(d);

    const [{ data: g }, { data: leg }, { data: rolesData }, { data: authData }] = await Promise.all([
      d.parliamentary_group_id
        ? supabase
            .from('parliamentary_groups')
            .select('id, name, short_name, slug')
            .eq('id', d.parliamentary_group_id)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('legislatures').select('code, name').eq('id', d.legislature_id).limit(1).maybeSingle(),
      supabase
        .from('deputy_roles')
        .select('id, role, start_date, end_date, active, parliamentary_bodies(name), parliamentary_groups(name)')
        .eq('deputy_id', d.id)
        .order('start_date', { ascending: false }),
      supabase.auth.getUser(),
    ]);

    setGroup(g);
    setLegislature(leg);
    setRoles(rolesData || []);

    const uid = authData.user?.id;
    if (uid) {
      setUserId(uid);
      const { data: savedRow } = await supabase
        .from('saved_deputies')
        .select('id')
        .eq('user_id', uid)
        .eq('deputy_id', d.id)
        .limit(1)
        .maybeSingle();
      setSaved(!!savedRow);
    }
  }

  async function toggleSave() {
    if (!userId) {
      toast('Inicia sesión para guardar diputados');
      return;
    }
    if (saved) {
      await supabase.from('saved_deputies').delete().eq('user_id', userId).eq('deputy_id', deputy.id);
      setSaved(false);
      toast('Eliminado de guardados');
    } else {
      await supabase.from('saved_deputies').insert({ user_id: userId, deputy_id: deputy.id });
      setSaved(true);
      toast('Diputado guardado ✓');
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
            No hemos encontrado a este diputado.
            <div style={{ marginTop: 10 }}>
              <Link href="/institutions/deputies" className="btn-o" style={{ textDecoration: 'none' }}>
                Volver al directorio
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!deputy) return <div className="spinner"></div>;

  const activeRoles = roles.filter((r) => r.active);
  const pastRoles = roles.filter((r) => !r.active);
  const uniqueBodies = [...new Set(activeRoles.map((r) => r.parliamentary_bodies?.name).filter(Boolean))];
  const mandateYear = deputy.mandate_start ? new Date(deputy.mandate_start).getFullYear() : null;
  const groupName = group?.name || 'Grupo Mixto / sin asignar';

  const officialFichaUrl = deputy.cod_parlamentario
    ? `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${deputy.cod_parlamentario}&idLegislatura=${legislature?.code || 'XV'}&mostrarAgenda=false`
    : `https://www.congreso.es/es/busqueda-de-diputados?texto=${encodeURIComponent(fullNameDisplay(deputy.full_name))}`;

  const avatarStyle = {
    width: 70,
    height: 70,
    borderRadius: 12,
    flexShrink: 0,
    objectFit: 'cover',
    background: '#ece9e2',
  };

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      {/* El atrás va antes de la miga: la miga dice DÓNDE estás, el atrás
          de dónde VIENES. A esta ficha se llega desde el directorio, desde
          una comisión y desde un grupo parlamentario. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/institutions/deputies" fallbackLabel="Diputados" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/deputies" style={{ color: '#999', textDecoration: 'none' }}>
            Diputados
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{fullNameDisplay(deputy.full_name)}</span>
        </span>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 200, flex: 1 }}>
            {deputy.photo_url && !photoFailed ? (
              <img
                src={deputy.photo_url}
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
                {initials(deputy.full_name)}
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.25 }}>
                {fullNameDisplay(deputy.full_name)}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
                <span
                  style={{ width: 9, height: 9, borderRadius: 2, background: groupColor(groupName), flexShrink: 0 }}
                ></span>
                <span style={{ fontSize: 12, color: '#555' }}>{groupName}</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>
                Diputado/a por {deputy.constituency}
                {legislature?.code ? ` · ${legislature.code} Legislatura` : ''}
                {mandateYear ? ` · desde ${mandateYear}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            <CircleButton icon="share" label="Copiar enlace" onClick={copyLink} />
            <CircleButton icon="external-link" label="Ver ficha oficial" href={officialFichaUrl} />
            <CircleButton
              icon="bell"
              label="Seguir en Radar"
              title="Seguir en Radar · próximamente"
              disabled
              onClick={() => setRadarNote(true)}
            />
            <CircleButton
              icon={saved ? 'bookmark-filled' : 'bookmark'}
              label={saved ? 'Quitar de guardados' : 'Guardar diputado'}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Representación</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: '#555' }}>
              <div>
                <span style={{ color: '#999' }}>Circunscripción: </span>
                {deputy.constituency}
              </div>
              {deputy.seat_number && (
                <div>
                  <span style={{ color: '#999' }}>Nº de escaño: </span>
                  {deputy.seat_number}
                </div>
              )}
              {formatDate(deputy.mandate_start) && (
                <div>
                  <span style={{ color: '#999' }}>Inicio de mandato: </span>
                  {formatDate(deputy.mandate_start)}
                </div>
              )}
              <div>
                <span style={{ color: '#999' }}>Grupo: </span>
                {group?.name || '—'}
              </div>
              {deputy.email && (
                <div>
                  <span style={{ color: '#999' }}>Correo institucional: </span>
                  <a href={`mailto:${deputy.email}`} style={{ color: '#1d6f5c' }}>
                    {deputy.email}
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Responsabilidades parlamentarias</div>
            {activeRoles.length === 0 ? (
              <div style={{ fontSize: 12, color: '#999' }}>
                Aún no disponible — estamos ampliando la sincronización para traer cargos y comisiones.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeRoles.slice(0, 3).map((r) => (
                  <div key={r.id}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#333' }}>{r.role}</div>
                    <div style={{ fontSize: 11.5, color: '#888' }}>
                      {r.parliamentary_bodies?.name || r.parliamentary_groups?.name}
                    </div>
                  </div>
                ))}
                {activeRoles.length > 3 && (
                  <span
                    onClick={() => setTab('cargos')}
                    style={{ fontSize: 11.5, color: '#1d6f5c', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Ver todas las responsabilidades ({activeRoles.length}) →
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 18, gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Datos rápidos</div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{uniqueBodies.length || '—'}</div>
                <div style={{ fontSize: 11, color: '#888' }}>comisiones</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{activeRoles.length || '—'}</div>
                <div style={{ fontSize: 11, color: '#888' }}>cargos</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{mandateYear || '—'}</div>
                <div style={{ fontSize: 11, color: '#888' }}>desde</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'cargos' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Cargos en el Congreso</div>
          {activeRoles.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-gavel"></i>
              Aún no tenemos los cargos y comisiones de este diputado — es la siguiente ampliación prevista de la
              sincronización.
            </div>
          ) : (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: pastRoles.length > 0 ? 20 : 0 }}
            >
              {activeRoles.map((r) => (
                <div
                  key={r.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '.5px solid #f0f0eb' }}
                >
                  <i className="ti ti-point-filled" style={{ color: '#1d6f5c', fontSize: 10 }}></i>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.role}</div>
                    <div style={{ fontSize: 11.5, color: '#888' }}>
                      {r.parliamentary_bodies?.name || r.parliamentary_groups?.name}
                      {formatDate(r.start_date) ? ` · Desde ${formatDate(r.start_date)}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pastRoles.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Histórico</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pastRoles.map((r) => (
                  <div key={r.id} style={{ fontSize: 12, color: '#888' }}>
                    <span style={{ color: '#555' }}>{r.role}</span> ·{' '}
                    {r.parliamentary_bodies?.name || r.parliamentary_groups?.name} · {formatDate(r.start_date)} –{' '}
                    {formatDate(r.end_date)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'actividad' && (
        <div className="card" style={{ padding: 20 }}>
          <div
            style={{
              background: '#eeecfd',
              border: '.5px solid #6d5aef',
              borderRadius: 10,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 4,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{ background: '#6d5aef', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}
            >
              PRO
            </span>
            <div style={{ flex: 1, fontSize: 12.5, color: '#4a3fb0' }}>
              Accede a la actividad completa con GovTalent Pro.
            </div>
            <button
              className="btn-ai"
              style={{ fontSize: 12, padding: '7px 14px' }}
              onClick={() =>
                setUpgradeModal({
                  title: 'Actividad parlamentaria',
                  message:
                    'Consulta iniciativas, intervenciones y votaciones de este diputado. Disponible en el plan Pro.',
                })
              }
            >
              Ver planes
            </button>
          </div>
        </div>
      )}

      {tab === 'biografia' && (
        <div className="card" style={{ padding: 18 }}>
          {deputy.official_bio ? (
            <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              {deputy.official_bio}
            </div>
          ) : (
            <div className="empty-state">
              <i className="ti ti-file-off"></i>
              El Congreso no ha publicado una biografía oficial para este diputado.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos del Congreso de los Diputados. Última actualización:{' '}
        {deputy.source_updated_at ? formatDate(deputy.source_updated_at) : '—'}.{' '}
        <a
          href="https://www.congreso.es/es/opendata/diputados"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#1d6f5c' }}
        >
          Ver fuente oficial ↗
        </a>
      </div>

      {upgradeModal && (
        <UpgradeModal title={upgradeModal.title} message={upgradeModal.message} onClose={() => setUpgradeModal(false)} />
      )}
    </div>
  );
}
