'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';
import { GRUPO_COLORES, GRUPO_NOMBRES } from '../page';

const colorGrupo = (g) => GRUPO_COLORES[g] || '#b0aea6';
const nombreGrupo = (g) => GRUPO_NOMBRES[g] || g;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function fechaBreve(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

function iniciales(n) {
  return (n || '').split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
}

const CARD = { background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 18 };
const LABEL = { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 12 };

// Los seis hitos que resumen el ciclo legislativo. Se eligen de entre los
// 16 tipos de actividad porque son los que marcan un cambio de fase real;
// el resto son actuaciones intermedias que se ven en la lista completa.
const HITOS = [
  { tipos: ['REFERRAL'], label: 'Remisión', icon: 'file-text' },
  { tipos: ['COMMITTEE_ADOPTING_REPORT', 'COMMITTEE_TABLING_REPORT'], label: 'Informe', icon: 'users' },
  { tipos: ['PLENARY_VOTE', 'PLENARY_VOTE_RESULTS'], label: 'Pleno', icon: 'checkbox' },
  {
    tipos: ['PLENARY_REFER_COMMITTEE_INTERINSTITUTIONAL_NEGOTIATIONS', 'COMMITTEE_APPROVE_PROVISIONAL_AGREEMENT'],
    label: 'Trílogo',
    icon: 'arrows-shuffle',
  },
  { tipos: ['SIGNATURE'], label: 'Firma', icon: 'writing-sign' },
  { tipos: ['PUBLICATION_OFFICIAL_JOURNAL'], label: 'DOUE', icon: 'news' },
];

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
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: `.5px solid ${on ? '#6d5aef' : '#e0dfd8'}`,
        background: on ? '#EEEDFE' : '#fff',
        color: disabled ? '#ccc' : on ? '#6d5aef' : '#888',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all .15s ease',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <i className={`ti ti-${icon}`} style={{ fontSize: 15 }} aria-hidden="true"></i>
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
      {iniciales(nombre)}
    </div>
  );
}

/**
 * Reparto de ponentes por grupo, en semicírculo.
 *
 * Los arcos se calculan proporcionalmente sobre 180 grados. No hay orden
 * ideológico: se ordenan por tamaño, porque situar los grupos en un eje
 * izquierda-derecha sería una interpretación nuestra y no un dato.
 */
function SemiCirculo({ reparto, total }) {
  const arcos = useMemo(() => {
    if (!reparto?.length || !total) return [];
    const R = 125;
    const cx = 150;
    const cy = 140;
    let ang = 180;
    return reparto.map((g) => {
      const barrido = (g.n / total) * 180;
      const a1 = (ang * Math.PI) / 180;
      const a2 = ((ang - barrido) * Math.PI) / 180;
      const x1 = cx + R * Math.cos(a1);
      const y1 = cy - R * Math.sin(a1);
      const x2 = cx + R * Math.cos(a2);
      const y2 = cy - R * Math.sin(a2);
      ang -= barrido;
      return { ...g, d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}` };
    });
  }, [reparto, total]);

  if (arcos.length === 0) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0 12px' }}>
      <svg
        viewBox="0 0 300 160"
        style={{ width: '100%', maxWidth: 270, height: 'auto' }}
        role="img"
        aria-label={`Reparto de ${total} ponentes por grupo político`}
      >
        <title>Reparto por grupo</title>
        <g fill="none" strokeWidth="24">
          {arcos.map((a) => (
            <path key={a.grupo} d={a.d} stroke={colorGrupo(a.grupo)}>
              <title>{`${nombreGrupo(a.grupo)}: ${a.n}`}</title>
            </path>
          ))}
        </g>
        <text x="150" y="122" textAnchor="middle" fontSize="28" fontWeight="500" fill="#1a1a1a">
          {total}
        </text>
        <text x="150" y="140" textAnchor="middle" fontSize="10.5" fill="#999">
          ponentes
        </text>
      </svg>
    </div>
  );
}

export default function ProcedureDetailPage() {
  const supabase = createClient();
  const { slug } = useParams();

  const [item, setItem] = useState(undefined);
  const [people, setPeople] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [events, setEvents] = useState([]);
  const [userId, setUserId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('recorrido');
  const [verTodos, setVerTodos] = useState(false);
  const [soloEspanoles, setSoloEspanoles] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('ep_procedures_directory')
        .select('*')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setItem(null);
        return;
      }
      setItem(data);

      const [{ data: pe }, { data: co }, { data: ev }, { data: auth }] = await Promise.all([
        supabase
          .from('ep_procedure_people')
          .select('*')
          .eq('process_id', data.process_id)
          .order('orden_rol')
          .order('full_name'),
        supabase
          .from('ep_procedure_committees')
          .select('*')
          .eq('process_id', data.process_id)
          .order('bloque')
          .order('body_code'),
        supabase
          .from('ep_procedure_timeline')
          .select('*')
          .eq('process_id', data.process_id)
          .order('activity_date', { ascending: false }),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;
      setPeople(pe || []);
      setCommittees(co || []);
      setEvents(ev || []);

      const uid = auth?.user?.id || null;
      setUserId(uid);
      if (uid) {
        const { data: s } = await supabase
          .from('saved_ep_procedures')
          .select('id')
          .eq('user_id', uid)
          .eq('process_id', data.process_id)
          .limit(1)
          .maybeSingle();
        if (!cancelled) setSaved(!!s);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Para cada hito se busca la actividad más reciente de ese tipo. Si no
  // hay ninguna, el hito aparece apagado: el procedimiento aún no ha
  // llegado ahí.
  const hitos = useMemo(() => {
    return HITOS.map((h) => {
      const encontrados = events.filter((e) => h.tipos.includes(e.activity_type));
      const ultimo = encontrados.sort((a, b) => String(b.activity_date || '').localeCompare(String(a.activity_date || '')))[0];
      return { ...h, fecha: ultimo?.activity_date || null, hecho: !!ultimo };
    });
  }, [events]);

  const porGrupo = useMemo(() => {
    const mapa = new Map();
    for (const p of people) {
      const g = p.political_group || 'NI';
      if (!mapa.has(g)) mapa.set(g, []);
      mapa.get(g).push(p);
    }
    return [...mapa.entries()]
      .map(([grupo, lista]) => ({
        grupo,
        lista,
        // El grupo que lleva el informe se destaca: es quien redacta.
        llevaInforme: lista.some((p) => p.orden_rol === 1),
        espanoles: lista.filter((p) => p.country_code === 'ES').length,
      }))
      .sort((a, b) => {
        if (a.llevaInforme !== b.llevaInforme) return a.llevaInforme ? -1 : 1;
        return b.lista.length - a.lista.length;
      });
  }, [people]);

  const gruposVisibles = verTodos ? porGrupo : porGrupo.slice(0, 3);

  const bloquesComision = useMemo(() => {
    const mapa = new Map();
    for (const c of committees) {
      if (!mapa.has(c.bloque)) mapa.set(c.bloque, { label: c.bloque_label, lista: [] });
      mapa.get(c.bloque).lista.push(c);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([bloque, v]) => ({ bloque, ...v }));
  }, [committees]);

  const pestanas = useMemo(
    () => [
      { id: 'recorrido', label: `Recorrido${events.length ? ` (${events.length})` : ''}`, activa: events.length > 0 },
      { id: 'actores', label: `Actores${people.length ? ` (${people.length})` : ''}`, activa: people.length > 0 },
      { id: 'comisiones', label: `Comisiones${committees.length ? ` (${committees.length})` : ''}`, activa: committees.length > 0 },
      { id: 'resumen', label: 'Resumen', activa: false },
      { id: 'votaciones', label: 'Votaciones', activa: false },
    ],
    [events, people, committees]
  );

  useEffect(() => {
    const actual = pestanas.find((p) => p.id === tab);
    if (actual && !actual.activa) {
      const primera = pestanas.find((p) => p.activa);
      if (primera) setTab(primera.id);
    }
  }, [pestanas, tab]);

  async function toggleSave() {
    if (!userId) {
      toast('Inicia sesión para guardar procedimientos');
      return;
    }
    if (saved) {
      setSaved(false);
      const { error } = await supabase
        .from('saved_ep_procedures')
        .delete()
        .eq('user_id', userId)
        .eq('process_id', item.process_id);
      if (error) setSaved(true);
      else toast('Eliminado de guardados');
    } else {
      setSaved(true);
      const { error } = await supabase
        .from('saved_ep_procedures')
        .insert({ user_id: userId, process_id: item.process_id });
      if (error) setSaved(false);
      else toast('Procedimiento guardado ✓');
    }
  }

  if (item === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 900 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (item === null) {
    return (
      <div className="sec" style={{ maxWidth: 900 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-file-off"></i>
            No se ha encontrado este procedimiento.
          </div>
        </div>
        <BackLink fallbackHref="/procedures" fallbackLabel="Volver a Procedimientos" />
      </div>
    );
  }

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      {/* El atrás va antes de la miga de pan: la miga dice DÓNDE estás,
          el atrás dice de dónde VIENES, y con cuatro caminos posibles a la
          misma ficha esa distinción importa. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/procedures" fallbackLabel="Procedimientos" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/procedures" style={{ color: '#999', textDecoration: 'none' }}>
            Procedimientos
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{item.label}</span>
        </span>
      </div>

      <div style={{ ...CARD, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 13 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{item.title}</h1>
            <div style={{ fontSize: 11.5, color: '#666', marginTop: 5 }}>
              Procedimiento legislativo ordinario · Parlamento Europeo
              {item.comision_competente && ` · ${item.comision_competente}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <CircleButton icon="bell" label="Seguir en Radar" title="Seguir en Radar · próximamente" disabled />
            {userId && (
              <CircleButton
                icon={saved ? 'bookmark-filled' : 'bookmark'}
                label={saved ? 'Quitar de guardados' : 'Guardar procedimiento'}
                active={saved}
                onClick={toggleSave}
              />
            )}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 14,
            paddingTop: 14,
            borderTop: '.5px solid #f0f0eb',
            alignItems: 'start',
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Estado</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: item.is_closed ? '#0F6E56' : '#3C3489', lineHeight: 1.3 }}>
              {item.is_closed ? 'Concluido' : item.current_stage_label || 'En tramitación'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Referencia</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Ponente</div>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
              {item.ponente || '—'}
              {item.ponente_grupo && (
                <span style={{ fontSize: 10.5, color: '#aaa', fontWeight: 400 }}> · {item.ponente_grupo}</span>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Españoles</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {item.n_espanoles} de {item.n_ponentes}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14, overflowX: 'auto' }}>
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={p.activa ? () => setTab(p.id) : undefined}
            aria-disabled={!p.activa ? 'true' : undefined}
            title={!p.activa ? 'Sin datos para este procedimiento' : undefined}
            style={{
              fontSize: 12.5,
              fontWeight: tab === p.id ? 600 : 400,
              color: !p.activa ? '#ccc' : tab === p.id ? '#6d5aef' : '#999',
              border: 'none',
              borderBottom: `2px solid ${tab === p.id && p.activa ? '#6d5aef' : 'transparent'}`,
              background: 'none',
              padding: '0 0 8px',
              cursor: p.activa ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {tab === 'recorrido' && (
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
            {hitos.map((h, i) => (
              <div key={h.label} style={{ display: 'contents' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56, flex: 1 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: h.hecho ? (i === hitos.length - 1 ? '#0F6E56' : '#E1F5EE') : '#f0efe9',
                      color: h.hecho ? (i === hitos.length - 1 ? '#fff' : '#0F6E56') : '#c5c3bb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i className={`ti ti-${h.icon}`} style={{ fontSize: 14 }} aria-hidden="true"></i>
                  </div>
                  <div style={{ fontSize: 9.5, marginTop: 6, textAlign: 'center', color: h.hecho ? '#1a1a1a' : '#bbb' }}>
                    {h.label}
                  </div>
                  <div style={{ fontSize: 9, color: h.hecho ? '#aaa' : '#ccc' }}>{fechaBreve(h.fecha) || '—'}</div>
                </div>
                {i < hitos.length - 1 && (
                  <div style={{ height: 1.5, background: hitos[i + 1].hecho ? '#c9e5da' : '#eeede7', flex: 1, marginTop: 14, minWidth: 8 }}></div>
                )}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '.5px solid #f0f0eb', paddingTop: 14 }}>
            <div style={LABEL}>Actuaciones</div>
            {events.slice(0, verTodos ? events.length : 6).map((e) => (
              <div
                key={e.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '7px 0',
                  borderBottom: '.5px solid #f0f0eb',
                }}
              >
                <span style={{ fontSize: 11.5, minWidth: 0 }}>{e.activity_label}</span>
                <span style={{ fontSize: 10.5, color: '#aaa', flexShrink: 0 }}>{fechaCorta(e.activity_date) || '—'}</span>
              </div>
            ))}
            {events.length > 6 && (
              <button
                type="button"
                onClick={() => setVerTodos((v) => !v)}
                style={{ fontSize: 11.5, color: '#6d5aef', background: 'none', border: 'none', padding: '11px 0 0', cursor: 'pointer' }}
              >
                {verTodos ? 'Ver solo las últimas' : `Ver las ${events.length} actuaciones`}
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'actores' && (
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
            <span style={LABEL}>Reparto por grupo</span>
            {item.n_espanoles > 0 && (
              <button
                type="button"
                onClick={() => setSoloEspanoles((v) => !v)}
                style={{
                  fontSize: 11,
                  color: soloEspanoles ? '#fff' : '#6d5aef',
                  background: soloEspanoles ? '#6d5aef' : 'none',
                  border: `.5px solid ${soloEspanoles ? '#6d5aef' : 'transparent'}`,
                  borderRadius: 20,
                  padding: '4px 11px',
                  cursor: 'pointer',
                }}
              >
                {item.n_espanoles} españoles de {item.n_ponentes}
              </button>
            )}
          </div>

          <SemiCirculo reparto={item.reparto_grupos} total={item.n_ponentes} />

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 15 }}>
            {(item.reparto_grupos || []).map((g) => (
              <span key={g.grupo} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#666' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: colorGrupo(g.grupo) }}></span>
                {g.grupo} {g.n}
              </span>
            ))}
          </div>

          <div style={{ borderTop: '.5px solid #f0f0eb', paddingTop: 14 }}>
            {gruposVisibles.map((g) => {
              const lista = soloEspanoles ? g.lista.filter((p) => p.country_code === 'ES') : g.lista;
              if (lista.length === 0) return null;
              return (
                <div key={g.grupo} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, flexWrap: 'wrap' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: colorGrupo(g.grupo), flexShrink: 0 }}></span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{g.grupo}</span>
                    {g.llevaInforme && (
                      <span style={{ fontSize: 9.5, background: '#EEEDFE', color: '#3C3489', padding: '2px 7px', borderRadius: 9 }}>
                        Lleva el informe
                      </span>
                    )}
                  </div>
                  {lista.map((p) => (
                    <Link
                      key={p.mep_id}
                      href={`/institutions/eu-parliament/${p.slug}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: '8px 0',
                        borderBottom: '.5px solid #f0f0eb',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <Avatar nombre={p.full_name} url={p.photo_url} />
                      <span style={{ flex: 1, fontSize: 11.5, minWidth: 0 }}>
                        {p.full_name}
                        {p.country_code === 'ES' && (
                          <span style={{ fontSize: 9, background: '#EEEDFE', color: '#3C3489', padding: '1px 6px', borderRadius: 8, marginLeft: 6 }}>
                            ES
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 10, color: '#999', flexShrink: 0, textAlign: 'right' }}>
                        {p.role_label}
                        {p.comisiones && ` · ${p.comisiones}`}
                      </span>
                      <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
                    </Link>
                  ))}
                </div>
              );
            })}

            {porGrupo.length > 3 && (
              <button
                type="button"
                onClick={() => setVerTodos((v) => !v)}
                style={{ fontSize: 11.5, color: '#6d5aef', background: 'none', border: 'none', padding: '2px 0 0', cursor: 'pointer' }}
              >
                {verTodos ? 'Ver menos grupos' : `Ver los ${porGrupo.length - 3} grupos restantes`}
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'comisiones' && (
        <div style={CARD}>
          {bloquesComision.map((b) => (
            <div key={b.bloque} style={{ marginBottom: 16 }}>
              <div style={LABEL}>{b.label}</div>
              {b.lista.map((c, i) => (
                <div
                  key={`${c.body_code}-${c.role}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 0',
                    borderBottom: '.5px solid #f0f0eb',
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: c.bloque === 1 ? '#EEEDFE' : '#f0efe9',
                      color: c.bloque === 1 ? '#3C3489' : '#8d8b83',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: c.body_code.length > 4 ? 8.5 : 9.5,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {c.body_code}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.body_name}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>{c.role_label}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos abiertos del Parlamento Europeo. El grupo político mostrado es el que tenía cada eurodiputado al participar.
      </div>
    </div>
  );
}
