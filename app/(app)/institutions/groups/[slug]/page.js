'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';
import { groupColor, grupoCorto } from '@/lib/grupos';

/**
 * Ficha de un grupo parlamentario.
 *
 * Mismo patrón que la del diputado: resumen con lo más consultado y
 * pestañas para el detalle. Lo que aporta valor es conectar lo que ya
 * estaba cargado —portavoces, iniciativas, alianzas— y que hasta ahora
 * vivía suelto.
 */

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'portavoces', label: 'Portavoces' },
  { id: 'iniciativas', label: 'Iniciativas' },
  { id: 'diputados', label: 'Diputados' },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function haceCuanto(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias < 1) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function initials(fullName) {
  const [ap, nom] = (fullName || '').split(',').map((s) => s.trim());
  return `${(nom || '')[0] || ''}${(ap || '')[0] || ''}`.toUpperCase();
}

function fullNameDisplay(oficial) {
  const [ap, nom] = (oficial || '').split(',').map((s) => s.trim());
  return nom ? `${nom} ${ap}` : oficial;
}

function normalize(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// "Comisión de Sanidad" -> "Sanidad"
function limpiarComision(n) {
  return (n || '').replace(/^Comisión\s+(de\s+la\s+|del\s+|de\s+)?/i, '').trim() || n;
}

const CARD = { background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 18 };
const LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 13,
};
const FILA = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 0',
  borderBottom: '.5px solid #f0f0eb',
  textDecoration: 'none',
  color: 'inherit',
};
const BUSCADOR = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: '#fff',
  border: '.5px solid #e0dfd8',
  borderRadius: 20,
  padding: '7px 14px',
  flex: '1 1 180px',
};

const INPUT = { border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' };

const chip = (activo) => ({
  background: activo ? '#e8f4f0' : '#fff',
  border: `.5px solid ${activo ? '#1d6f5c' : '#e0dfd8'}`,
  color: activo ? '#1d6f5c' : '#555',
  borderRadius: 20,
  padding: '7px 13px',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

const VER_MAS = { fontSize: 11, color: '#1d6f5c', fontWeight: 600, paddingTop: 10, cursor: 'pointer' };

function CircleButton({ icon, label, onClick, active, disabled, title }) {
  const [hover, setHover] = useState(false);
  const on = active || (hover && !disabled);
  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
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
        padding: 0,
        flexShrink: 0,
      }}
    >
      <i className={`ti ti-${icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
    </button>
  );
}

function Avatar({ nombre, url, size = 28 }) {
  const [falla, setFalla] = useState(false);
  const base = { width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover', background: '#ece9e2' };
  if (url && !falla) {
    return <img src={url} alt="" width={size} height={size} style={base} onError={() => setFalla(true)} />;
  }
  return (
    <div
      style={{
        ...base,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8d8b83',
        fontSize: Math.round(size * 0.33),
        fontWeight: 700,
      }}
      aria-hidden="true"
    >
      {initials(nombre)}
    </div>
  );
}

export default function GroupDetailPage() {
  const supabase = createClient();
  const { slug } = useParams();

  const [grupo, setGrupo] = useState(undefined);
  const [comisiones, setComisiones] = useState([]);
  const [portavoces, setPortavoces] = useState([]);
  const [aliados, setAliados] = useState([]);
  const [ultimas, setUltimas] = useState([]);
  const [diputados, setDiputados] = useState([]);
  const [tab, setTab] = useState('resumen');
  const [buscarPortavoz, setBuscarPortavoz] = useState('');
  const [soloConActividad, setSoloConActividad] = useState(false);
  const [buscarDiputado, setBuscarDiputado] = useState('');
  const [circunscripcion, setCircunscripcion] = useState('');
  const [soloDestacados, setSoloDestacados] = useState(false);
  const [userId, setUserId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [siguiendo, setSiguiendo] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.from('group_profile').select('*').eq('slug', slug).limit(1).maybeSingle();
      if (cancelled) return;
      if (!data) {
        setGrupo(null);
        return;
      }
      setGrupo(data);

      const [{ data: com }, { data: pv }, { data: al }, { data: ult }, { data: dip }, { data: auth }] =
        await Promise.all([
          supabase
            .from('group_committees')
            .select('*')
            .eq('group_id', data.group_id)
            .order('n_vivas', { ascending: false })
            .limit(30),
          supabase
            .from('group_spokespersons')
            .select('*')
            .eq('group_id', data.group_id)
            .order('n_actividad', { ascending: false }),
          supabase
            .from('group_allies')
            .select('*')
            .eq('group_id', data.group_id)
            .order('veces', { ascending: false })
            .limit(6),
          // Lo último que ha presentado. Se piden los expedientes del
          // grupo y luego sus datos en una segunda consulta: el join
          // anidado de Supabase depende de que la relación esté
          // declarada, y aquí es más seguro no darlo por hecho.
          supabase
            .from('es_activity_authors')
            .select('num_expediente')
            .eq('group_id', data.group_id)
            .limit(60),
          supabase
            .from('deputies')
            .select('id, slug, full_name, photo_url, constituency')
            .eq('parliamentary_group_id', data.group_id)
            .eq('active', true)
            .order('last_name'),
          supabase.auth.getUser(),
        ]);

      if (cancelled) return;
      setComisiones(com || []);
      setPortavoces(pv || []);
      setAliados(al || []);
      // Con los expedientes en mano se piden los que siguen vivos, ya
      // ordenados por fecha.
      const nums = (ult || []).map((r) => r.num_expediente);
      if (nums.length > 0) {
        const { data: act } = await supabase
          .from('es_activity')
          .select('slug, titulo, situacion, fecha_presentacion')
          .in('num_expediente', nums)
          .eq('is_closed', false)
          .order('fecha_presentacion', { ascending: false })
          .limit(4);
        if (!cancelled) setUltimas(act || []);
      }
      setDiputados(dip || []);

      const uid = auth?.user?.id || null;
      setUserId(uid);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const portavocesFiltrados = useMemo(() => {
    let l = portavoces;
    if (soloConActividad) l = l.filter((p) => p.n_actividad > 0);
    if (buscarPortavoz) {
      const q = normalize(buscarPortavoz);
      l = l.filter((p) => normalize(p.full_name).includes(q) || normalize(p.committee_name).includes(q));
    }
    return l;
  }, [portavoces, buscarPortavoz, soloConActividad]);

  // Los diputados con portavocía: es lo que distingue a quien negocia
  // por el grupo de quien solo ocupa escaño en la comisión.
  const conPortavocia = useMemo(() => new Set(portavoces.map((p) => p.deputy_id)), [portavoces]);

  const circunscripciones = useMemo(
    () => [...new Set(diputados.map((d) => d.constituency).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [diputados]
  );

  const diputadosFiltrados = useMemo(() => {
    let l = diputados;
    if (soloDestacados) l = l.filter((d) => conPortavocia.has(d.id));
    if (circunscripcion) l = l.filter((d) => d.constituency === circunscripcion);
    if (buscarDiputado) {
      const q = normalize(buscarDiputado);
      l = l.filter((d) => normalize(d.full_name).includes(q) || normalize(d.constituency || '').includes(q));
    }
    return l;
  }, [diputados, buscarDiputado, circunscripcion, soloDestacados, conPortavocia]);

  // Para las barras: la comisión con más actividad marca el 100%
  const maxVivas = useMemo(() => Math.max(1, ...comisiones.map((c) => c.n_vivas || 0)), [comisiones]);

  if (grupo === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 900 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (grupo === null) {
    return (
      <div className="sec" style={{ maxWidth: 900 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-flag-off"></i>
            No se ha encontrado este grupo parlamentario.
          </div>
        </div>
        <BackLink fallbackHref="/institutions/groups" fallbackLabel="Volver a Grupos" />
      </div>
    );
  }

  const color = groupColor(grupo.name);

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/institutions/groups" fallbackLabel="Grupos" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/groups" style={{ color: '#999', textDecoration: 'none' }}>
            Grupos
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{grupoCorto(grupo.name)}</span>
        </span>
      </div>

      <div style={{ ...CARD, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 200, flex: 1 }}>
            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: `${color}18`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ width: 20, height: 20, borderRadius: 4, background: color }}></span>
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{grupo.name}</h1>
              <div style={{ fontSize: 12, color: '#555', marginTop: 5, lineHeight: 1.6 }}>
                {[
                  `${grupo.n_diputados} ${grupo.n_diputados === 1 ? 'diputado' : 'diputados'}`,
                  grupo.n_portavocias > 0
                    ? `portavoz en ${grupo.n_portavocias} ${grupo.n_portavocias === 1 ? 'comisión' : 'comisiones'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            <CircleButton
              icon="bell"
              label="Seguir este grupo"
              title="Seguir · próximamente"
              active={siguiendo}
              onClick={() => {
                setSiguiendo((v) => !v);
                toast(siguiendo ? 'Has dejado de seguir este grupo' : 'Seguirás la actividad de este grupo ✓');
              }}
            />
            <CircleButton
              icon={saved ? 'bookmark-filled' : 'bookmark'}
              label={saved ? 'Quitar de guardados' : 'Guardar grupo'}
              active={saved}
              onClick={() => {
                if (!userId) {
                  toast('Inicia sesión para guardar');
                  return;
                }
                setSaved((v) => !v);
                toast(saved ? 'Eliminado de guardados' : 'Guardado ✓');
              }}
            />
          </div>
        </div>

        {/* Lo vivo y lo registrado separados: mezclarlos hacía dudar qué
            número mirar, igual que pasaba en Regulatorio. */}
        <div style={{ display: 'flex', gap: 26, paddingTop: 15, marginTop: 15, borderTop: '.5px solid #f0f0eb', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#1d6f5c' }}>
              {(grupo.n_vivas || 0).toLocaleString('es-ES')}
            </div>
            <div style={{ fontSize: 10.5, color: '#999' }}>en trámite</div>
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{(grupo.n_presentadas || 0).toLocaleString('es-ES')}</div>
            <div style={{ fontSize: 10.5, color: '#999' }}>presentadas</div>
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{grupo.n_leyes || 0}</div>
            <div style={{ fontSize: 10.5, color: '#999' }}>leyes</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, borderBottom: '.5px solid #e0dfd8', marginBottom: 15, overflowX: 'auto' }}>
        {TABS.map((t) => {
          const n =
            t.id === 'portavoces'
              ? portavoces.length
              : t.id === 'iniciativas'
                ? grupo.n_presentadas
                : t.id === 'diputados'
                  ? diputados.length
                  : null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                fontSize: 12.5,
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? '#1d6f5c' : '#888',
                border: 'none',
                borderBottom: `2px solid ${tab === t.id ? '#1d6f5c' : 'transparent'}`,
                background: 'none',
                padding: '0 0 9px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}{' '}
              {n !== null && n > 0 && (
                <span style={{ color: tab === t.id ? '#9cc4b8' : '#bbb' }}>{n.toLocaleString('es-ES')}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {comisiones.length > 0 && (
            <div style={CARD}>
              <div style={LABEL}>Dónde concentra su actividad</div>
              {comisiones.slice(0, 5).map((c) => (
                <div key={c.comision} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{limpiarComision(c.comision)}</div>
                  <div style={{ width: 76, height: 5, background: '#f0efe9', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ width: `${(c.n_vivas / maxVivas) * 100}%`, height: '100%', background: color }}></div>
                  </div>
                  <span style={{ fontSize: 11, color: '#666', width: 34, textAlign: 'right', flexShrink: 0 }}>
                    {c.n_vivas}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 10.5, color: '#aaa', paddingTop: 10 }}>
                De {(grupo.n_vivas || 0).toLocaleString('es-ES')} en trámite en {comisiones.length} comisiones.
              </div>
            </div>
          )}

          {portavoces.length > 0 && (
            <div style={CARD}>
              <div style={LABEL}>A quién dirigirte</div>
              {portavoces.slice(0, 3).map((p) => (
                <Link key={`${p.deputy_id}-${p.committee_id}`} href={`/institutions/deputies/${p.deputy_slug}`} style={FILA}>
                  <Avatar nombre={p.full_name} url={p.photo_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{fullNameDisplay(p.full_name)}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>{limpiarComision(p.committee_name)}</div>
                  </div>
                  <span style={{ fontSize: 10, color: '#999', flexShrink: 0 }}>{p.n_actividad}</span>
                </Link>
              ))}
              {portavoces.length > 3 && (
                <div onClick={() => setTab('portavoces')} style={VER_MAS}>
                  Ver los {portavoces.length} →
                </div>
              )}
            </div>
          )}

          {ultimas.length > 0 && (
            <div style={CARD}>
              <div style={LABEL}>Lo último que pide</div>
              {ultimas.slice(0, 2).map((u) => (
                <Link
                  key={u.slug}
                  href={`/congreso/actividad/${u.slug}`}
                  style={{ ...FILA, alignItems: 'flex-start' }}
                >
                  <span style={{ width: 3, alignSelf: 'stretch', background: '#6d5aef', borderRadius: 2, flexShrink: 0 }}></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4 }}>{u.titulo}</div>
                    <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                      {[limpiarComision(u.situacion), haceCuanto(u.fecha_presentacion)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </Link>
              ))}
              <Link href={`/congreso?tipo=pnl&grupo=${grupo.group_id}`} style={{ ...VER_MAS, textDecoration: 'none', display: 'block' }}>
                Ver las {(grupo.n_vivas || 0).toLocaleString('es-ES')} →
              </Link>
            </div>
          )}

          {aliados.length > 0 && (
            <div style={CARD}>
              <div style={LABEL}>Con quién firma</div>
              {aliados.map((a) => (
                <Link key={a.ally_id} href={`/institutions/groups/${a.ally_slug}`} style={FILA}>
                  <span
                    style={{ width: 9, height: 9, borderRadius: 2, background: groupColor(a.ally_name), flexShrink: 0 }}
                  ></span>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{grupoCorto(a.ally_name)}</div>
                  <span style={{ fontSize: 10, color: '#999', flexShrink: 0 }}>{a.veces}</span>
                </Link>
              ))}
              <div style={{ fontSize: 10.5, color: '#aaa', paddingTop: 10 }}>Iniciativas presentadas conjuntamente.</div>
            </div>
          )}

          {comisiones.length === 0 && portavoces.length === 0 && (
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="empty-state">
                <i className="ti ti-file-off"></i>
                Aún no tenemos actividad registrada de este grupo.
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'portavoces' && (
        <>
          {/* Con 74 portavocías en el PP, buscar por comisión es la
              forma normal de llegar al interlocutor. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={BUSCADOR}>
              <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
              <input
                value={buscarPortavoz}
                onChange={(e) => setBuscarPortavoz(e.target.value)}
                placeholder="Buscar por nombre o comisión..."
                aria-label="Buscar portavoz"
                style={INPUT}
              />
            </div>
            <span onClick={() => setSoloConActividad((v) => !v)} style={chip(soloConActividad)}>
              Solo con actividad
            </span>
            {(buscarPortavoz || soloConActividad) && (
              <span
                onClick={() => {
                  setBuscarPortavoz('');
                  setSoloConActividad(false);
                }}
                style={{ fontSize: 11.5, color: '#999', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'center' }}
              >
                Limpiar
              </span>
            )}
          </div>

        <div style={CARD}>
          {portavocesFiltrados.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-microphone-off"></i>
              {portavoces.length === 0
                ? 'No consta ningún portavoz de este grupo en las comisiones.'
                : 'Ningún portavoz con estos filtros.'}
            </div>
          ) : (
            portavocesFiltrados.map((p) => (
              <Link key={`${p.deputy_id}-${p.committee_id}`} href={`/institutions/deputies/${p.deputy_slug}`} style={FILA}>
                <Avatar nombre={p.full_name} url={p.photo_url} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{fullNameDisplay(p.full_name)}</div>
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                    {[`Portavoz en ${limpiarComision(p.committee_name)}`, p.constituency].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {p.n_actividad > 0 && (
                  <span
                    style={{
                      fontSize: 10.5,
                      background: '#EEEDFE',
                      color: '#3C3489',
                      padding: '3px 9px',
                      borderRadius: 10,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {p.n_actividad}
                  </span>
                )}
                <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
              </Link>
            ))
          )}
          {portavocesFiltrados.length > 0 && portavocesFiltrados.length < portavoces.length && (
            <div style={{ fontSize: 11.5, color: '#888', paddingTop: 12 }}>
              {portavocesFiltrados.length} de {portavoces.length} portavoces
            </div>
          )}
        </div>
        </>
      )}

      {tab === 'iniciativas' && (
        <div style={CARD}>
          <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6, marginBottom: 14 }}>
            Este grupo ha presentado {(grupo.n_presentadas || 0).toLocaleString('es-ES')} iniciativas, de las que{' '}
            {(grupo.n_vivas || 0).toLocaleString('es-ES')} siguen en trámite.
          </div>
          <Link
            href={`/congreso?tipo=pnl&grupo=${grupo.group_id}`}
            className="btn-o"
            style={{ textDecoration: 'none', display: 'inline-block' }}
          >
            Ver todas en Actividad parlamentaria
          </Link>
        </div>
      )}

      {tab === 'diputados' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={BUSCADOR}>
              <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
              <input
                value={buscarDiputado}
                onChange={(e) => setBuscarDiputado(e.target.value)}
                placeholder="Buscar por nombre o circunscripción..."
                aria-label="Buscar diputado"
                style={INPUT}
              />
            </div>
            {circunscripciones.length > 1 && (
              <select
                value={circunscripcion}
                onChange={(e) => setCircunscripcion(e.target.value)}
                aria-label="Filtrar por circunscripción"
                style={{ ...chip(!!circunscripcion), appearance: 'none', paddingRight: 28 }}
              >
                <option value="">Circunscripción</option>
                {circunscripciones.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            {/* Separa a quien negocia por el grupo de quien solo ocupa
                escaño: con 137 diputados es la diferencia que importa. */}
            <span onClick={() => setSoloDestacados((v) => !v)} style={chip(soloDestacados)}>
              Con portavocía ({conPortavocia.size})
            </span>
            {(buscarDiputado || circunscripcion || soloDestacados) && (
              <span
                onClick={() => {
                  setBuscarDiputado('');
                  setCircunscripcion('');
                  setSoloDestacados(false);
                }}
                style={{ fontSize: 11.5, color: '#999', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'center' }}
              >
                Limpiar
              </span>
            )}
          </div>

        <div style={CARD}>
          {diputadosFiltrados.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-user-off"></i>
              {diputados.length === 0
                ? 'No hay diputados registrados en este grupo.'
                : 'Ningún diputado con estos filtros.'}
            </div>
          ) : (
            diputadosFiltrados.map((d) => (
              <Link key={d.id} href={`/institutions/deputies/${d.slug}`} style={FILA}>
                <Avatar nombre={d.full_name} url={d.photo_url} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{fullNameDisplay(d.full_name)}</div>
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>{d.constituency}</div>
                </div>
                {conPortavocia.has(d.id) && (
                  <span
                    style={{
                      fontSize: 10,
                      background: '#e8f4f0',
                      color: '#1d6f5c',
                      padding: '3px 9px',
                      borderRadius: 10,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Portavoz
                  </span>
                )}
                <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
              </Link>
            ))
          )}
          {diputadosFiltrados.length > 0 && diputadosFiltrados.length < diputados.length && (
            <div style={{ fontSize: 11.5, color: '#888', paddingTop: 12 }}>
              {diputadosFiltrados.length} de {diputados.length} diputados
            </div>
          )}
        </div>
        </>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos abiertos del Congreso de los Diputados.
      </div>
    </div>
  );
}
