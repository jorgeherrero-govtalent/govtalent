'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import UpgradeModal from '@/components/UpgradeModal';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'cargos', label: 'Cargos y comisiones' },
  { id: 'actividad', label: 'Actividad' },
  { id: 'biografia', label: 'Biografía' },
];

function initials(fullName) {
  const [last, first] = fullName.split(',').map((s) => s.trim());
  return `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase();
}

function fullNameDisplay(officialName) {
  const [last, first] = officialName.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

  useEffect(() => {
    load();
  }, [slug]);

  async function load() {
    const { data: d } = await supabase.from('deputies').select('*').eq('slug', slug).maybeSingle();
    if (!d) {
      setNotFound(true);
      return;
    }
    setDeputy(d);

    const [{ data: g }, { data: leg }, { data: rolesData }, { data: authData }] = await Promise.all([
      d.parliamentary_group_id
        ? supabase.from('parliamentary_groups').select('id, name, short_name, slug').eq('id', d.parliamentary_group_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('legislatures').select('code, name').eq('id', d.legislature_id).maybeSingle(),
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
  const mainRole = activeRoles[0];
  const uniqueBodies = [...new Set(activeRoles.map((r) => r.parliamentary_bodies?.name).filter(Boolean))];
  const mandateYear = deputy.mandate_start ? new Date(deputy.mandate_start).getFullYear() : null;

  const officialFichaUrl = deputy.cod_parlamentario
    ? `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${deputy.cod_parlamentario}&idLegislatura=${legislature?.code || 'XV'}&mostrarAgenda=false`
    : `https://www.congreso.es/es/busqueda-de-diputados?texto=${encodeURIComponent(fullNameDisplay(deputy.full_name))}`;

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 10, fontSize: 12, color: '#888' }}>
        <Link href="/institutions" style={{ color: '#888', textDecoration: 'none' }}>
          Instituciones
        </Link>{' '}
        /{' '}
        <Link href="/institutions/deputies" style={{ color: '#888', textDecoration: 'none' }}>
          Diputados
        </Link>{' '}
        / <span style={{ color: '#555' }}>{fullNameDisplay(deputy.full_name)}</span>
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
            {deputy.photo_url ? (
              <img src={deputy.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initials(deputy.full_name)
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{fullNameDisplay(deputy.full_name)}</h1>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Diputado/a por {deputy.constituency}</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{group?.name || 'Grupo Mixto / sin asignar'}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {legislature && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#666', background: '#f0efe9', padding: '3px 9px', borderRadius: 10 }}>
                  {legislature.code} Legislatura
                </span>
              )}
              {mandateYear && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#666', background: '#f0efe9', padding: '3px 9px', borderRadius: 10 }}>
                  Desde {mandateYear}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ai" onClick={toggleSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ti ${saved ? 'ti-bookmark-filled' : 'ti-bookmark'}`}></i> {saved ? 'Guardado' : 'Guardar diputado'}
          </button>
          <button className="icon-circle-btn" title="Compartir" onClick={copyLink}>
            <i className="ti ti-share"></i>
          </button>
          <a
            href={officialFichaUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-o"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
          >
            Ver ficha oficial <i className="ti ti-external-link" style={{ fontSize: 13 }}></i>
          </a>
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
                    <div style={{ fontSize: 11.5, color: '#888' }}>{r.parliamentary_bodies?.name || r.parliamentary_groups?.name}</div>
                  </div>
                ))}
                {activeRoles.length > 3 && (
                  <span onClick={() => setTab('cargos')} style={{ fontSize: 11.5, color: '#1d6f5c', fontWeight: 600, cursor: 'pointer' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: pastRoles.length > 0 ? 20 : 0 }}>
              {activeRoles.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '.5px solid #f0f0eb' }}>
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
                    <span style={{ color: '#555' }}>{r.role}</span> · {r.parliamentary_bodies?.name || r.parliamentary_groups?.name} ·{' '}
                    {formatDate(r.start_date)} – {formatDate(r.end_date)}
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
            }}
          >
            <span style={{ background: '#6d5aef', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}>PRO</span>
            <div style={{ flex: 1, fontSize: 12.5, color: '#4a3fb0' }}>Accede a la actividad completa con GovTalent Pro.</div>
            <button
              className="btn-ai"
              style={{ fontSize: 12, padding: '7px 14px' }}
              onClick={() =>
                setUpgradeModal({
                  title: 'Actividad parlamentaria',
                  message: 'Consulta iniciativas, intervenciones y votaciones de este diputado. Disponible en el plan Pro.',
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
            <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{deputy.official_bio}</div>
          ) : (
            <div className="empty-state">
              <i className="ti ti-file-off"></i>
              El Congreso no ha publicado una biografía oficial para este diputado.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos del Congreso de los Diputados. Última actualización:{' '}
        {deputy.source_updated_at ? formatDate(deputy.source_updated_at) : '—'}.{' '}
        <a href="https://www.congreso.es/es/opendata/diputados" target="_blank" rel="noreferrer" style={{ color: '#1d6f5c' }}>
          Ver fuente oficial ↗
        </a>
      </div>

      {upgradeModal && <UpgradeModal title={upgradeModal.title} message={upgradeModal.message} onClose={() => setUpgradeModal(false)} />}
    </div>
  );
}
