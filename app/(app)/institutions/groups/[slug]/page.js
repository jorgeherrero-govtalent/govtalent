'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';
import UpgradeModal from '@/components/UpgradeModal';
import usePlanPro from '@/lib/usePlanPro';
import { groupColor, grupoCorto } from '@/lib/grupos';

/**
 * Ficha de un grupo parlamentario.
 *
 * Mismo patrón que la del diputado: resumen con lo más consultado y
 * pestañas para el detalle. Lo que aporta valor es conectar lo que ya
 * estaba cargado —portavoces, iniciativas, alianzas— y que hasta ahora
 * vivía suelto.
 *
 * Equipo es la pestaña que cierra el círculo: el portavoz es quien
 * habla, pero el asesor es quien redacta, y hasta ahora no
 * estaba en ninguna parte. Sale de `parliamentary_staff`, reconstruida
 * boletín a boletín del BOCG.
 */

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'portavoces', label: 'Portavoces' },
  { id: 'iniciativas', label: 'Iniciativas' },
  { id: 'diputados', label: 'Diputados' },
  { id: 'equipo', label: 'Equipo' },
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

// Los asesores llegan del BOCG como "Sara López Núñez", sin la coma que
// separa apellidos de nombre en los diputados. Pasarlos por initials()
// devolvería una sola letra.
function initialsPlano(nombre) {
  const p = (nombre || '').trim().split(/\s+/);
  return `${(p[0] || '')[0] || ''}${(p[1] || '')[0] || ''}`.toUpperCase();
}

function desdeCuando(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `desde ${MESES[d.getMonth()]} ${d.getFullYear()}`;
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

function Avatar({ nombre, url, size = 28, plano = false }) {
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
      {plano ? initialsPlano(nombre) : initials(nombre)}
    </div>
  );
}

// La píldora de la derecha en cada fila de asesor. Dice si hay correo,
// nunca cuál: el correo solo llega si /api/instituciones/asesores/contacto
// ha dicho que sí, y esa decisión se toma en el servidor.
function CeldaCorreo({ tiene, correo, onUpsell }) {
  if (!tiene) {
    return <span style={{ fontSize: 11, color: '#a8a49c', flexShrink: 0 }}>sin correo</span>;
  }
  if (correo) {
    return (
      <a
        href={`mailto:${correo}`}
        style={{ fontSize: 11, color: '#666', flexShrink: 0, textDecoration: 'none', borderBottom: '.5px solid #e0dfd8' }}
      >
        {correo}
      </a>
    );
  }
  return (
    <span
      onClick={onUpsell}
      style={{
        fontSize: 10,
        fontWeight: 600,
        background: '#f0eefe',
        color: '#6d5aef',
        padding: '3px 9px',
        borderRadius: 10,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <i className="ti ti-bolt" style={{ fontSize: 11 }}></i>
      Correo con Pro
    </span>
  );
}

export default function GroupDetailPage() {
  const supabase = createClient();
  const { slug } = useParams();

  const [grupo, setGrupo] = useState(undefined);
  const [portavoces, setPortavoces] = useState([]);
  const [aliados, setAliados] = useState([]);
  const [ultimas, setUltimas] = useState([]);
  const [diputados, setDiputados] = useState([]);
  const [tab, setTab] = useState('resumen');
  const [buscarPortavoz, setBuscarPortavoz] = useState('');
  const [soloConActividad, setSoloConActividad] = useState(false);
  const [comisionPortavoz, setComisionPortavoz] = useState('');
  const [buscarDiputado, setBuscarDiputado] = useState('');
  const [circunscripcion, setCircunscripcion] = useState('');
  const [soloDestacados, setSoloDestacados] = useState(false);
  const [userId, setUserId] = useState(null);
  const [asesores, setAsesores] = useState([]);
  const [buscarAsesor, setBuscarAsesor] = useState('');
  const [categoriaAsesor, setCategoriaAsesor] = useState('');
  const [correos, setCorreos] = useState(null);
  const [upsell, setUpsell] = useState(null);
  const esPro = usePlanPro();

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

      const [
        { data: pv },
        { data: al },
        { data: ult },
        { data: dip },
        { data: auth },
        { data: staff },
      ] = await Promise.all([
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
          // Personal eventual del grupo. Columnas explícitas y nunca
          // select('*'): sql/54 cerró `email` por columna, así que un
          // asterisco aquí devolvería un error de permisos. `tiene_email`
          // sí se puede leer y es lo que decide el candado.
          supabase
            .from('parliamentary_staff')
            .select('id, slug, full_name, categoria, cargo, fecha_alta, tiene_email, linkedin_url, boletin, boletin_url')
            .eq('parliamentary_group_id', data.group_id)
            .eq('active', true)
            .eq('objecion', false)
            .order('full_name'),
        ]);

      if (cancelled) return;
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
      setAsesores(staff || []);

      const uid = auth?.user?.id || null;
      setUserId(uid);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // El buscador global manda a los asesores a ?tab=equipo, porque no
  // tienen ficha propia. Se lee de window.location y no con
  // useSearchParams para no tener que envolver la pagina en un Suspense,
  // que es lo que exige Next 14 al compilar.
  useEffect(() => {
    try {
      const pedida = new URLSearchParams(window.location.search).get('tab');
      if (pedida && TABS.some((t) => t.id === pedida)) setTab(pedida);
    } catch {
      // Sin window o con una query rara, se queda en Resumen.
    }
  }, []);

  // Los correos se piden una sola vez por grupo, y solo cuando hay plan
  // y alguien ha abierto la pestaña. Mientras tanto la lista se pinta
  // igual: lo único que cambia es si la píldora vende Pro o enseña la
  // dirección.
  useEffect(() => {
    if (esPro !== true || tab !== 'equipo' || correos !== null) return;
    if (!grupo?.group_id || asesores.length === 0) return;
    let cancelado = false;

    (async () => {
      try {
        const res = await fetch(`/api/instituciones/asesores/contacto?grupo=${grupo.group_id}`);
        const json = await res.json();
        if (!cancelado) setCorreos(res.ok ? json.correos || {} : {});
      } catch {
        // Un fallo de red no debe romper la pestaña: se queda con el
        // candado puesto, que es el estado seguro.
        if (!cancelado) setCorreos({});
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [esPro, tab, correos, grupo, asesores.length]);

  const comisionesConPortavoz = useMemo(
    () => [...new Set(portavoces.map((p) => p.committee_name))].sort((a, b) => a.localeCompare(b)),
    [portavoces]
  );

  const portavocesFiltrados = useMemo(() => {
    let l = portavoces;
    if (comisionPortavoz) l = l.filter((p) => p.committee_name === comisionPortavoz);
    if (soloConActividad) l = l.filter((p) => p.n_actividad > 0);
    if (buscarPortavoz) {
      const q = normalize(buscarPortavoz);
      l = l.filter((p) => normalize(p.full_name).includes(q) || normalize(p.committee_name).includes(q));
    }
    return l;
  }, [portavoces, buscarPortavoz, soloConActividad, comisionPortavoz]);

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

  // Las categorías salen de los propios datos y no de una lista fija:
  // el BOCG usa "Asistente", "Asistente A", "Asistente técnico B" y
  // alguna más, y el reparto cambia de un grupo a otro.
  const categoriasAsesor = useMemo(() => {
    const cuenta = new Map();
    for (const a of asesores) {
      if (!a.categoria) continue;
      cuenta.set(a.categoria, (cuenta.get(a.categoria) || 0) + 1);
    }
    return [...cuenta.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  }, [asesores]);

  const asesoresFiltrados = useMemo(() => {
    let l = asesores;
    if (categoriaAsesor) l = l.filter((a) => a.categoria === categoriaAsesor);
    if (buscarAsesor) {
      const q = normalize(buscarAsesor);
      l = l.filter(
        (a) => normalize(a.full_name).includes(q) || normalize(a.cargo || '').includes(q)
      );
    }
    return l;
  }, [asesores, buscarAsesor, categoriaAsesor]);

  const asesoresConCorreo = useMemo(() => asesores.filter((a) => a.tiene_email).length, [asesores]);

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
                  asesores.length > 0
                    ? `${asesores.length} ${asesores.length === 1 ? 'asesor' : 'asesores'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            <FollowButton kind="grupo" refId={grupo.slug} label={grupo.name} />
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
                  : t.id === 'equipo'
                    ? asesores.length
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

              {/* El portavoz da la cara, pero quien redacta casi nunca es
                  él. Aquí caben tres; los demás, en la pestaña Equipo. */}
              {asesores.length > 0 && (
                <div style={{ borderTop: '.5px solid #f0f0eb', marginTop: 13, paddingTop: 14 }}>
                  <div style={{ ...LABEL, marginBottom: 11 }}>Equipo del grupo</div>
                  {asesores.slice(0, 3).map((a) => (
                    <div key={a.id} style={{ ...FILA, padding: '6px 0' }} title={a.cargo}>
                      <Avatar nombre={a.full_name} size={26} plano />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{a.full_name}</div>
                        <div style={{ fontSize: 10, color: '#999' }}>{a.categoria}</div>
                      </div>
                    </div>
                  ))}
                  <div onClick={() => setTab('equipo')} style={VER_MAS}>
                    Ver los {asesores.length} →
                  </div>
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

          {portavoces.length === 0 && ultimas.length === 0 && aliados.length === 0 && asesores.length === 0 && (
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
            {/* Desplegable además del buscador: así se ve de entrada en
                qué comisiones tiene portavoz el grupo, sin adivinar. */}
            {comisionesConPortavoz.length > 1 && (
              <select
                value={comisionPortavoz}
                onChange={(e) => setComisionPortavoz(e.target.value)}
                aria-label="Filtrar por comisión"
                style={{ ...chip(!!comisionPortavoz), appearance: 'none', paddingRight: 28 }}
              >
                <option value="">Comisión</option>
                {comisionesConPortavoz.map((c) => (
                  <option key={c} value={c}>
                    {limpiarComision(c)}
                  </option>
                ))}
              </select>
            )}
            <span onClick={() => setSoloConActividad((v) => !v)} style={chip(soloConActividad)}>
              Solo con actividad
            </span>
            {(buscarPortavoz || soloConActividad || comisionPortavoz) && (
              <span
                onClick={() => {
                  setBuscarPortavoz('');
                  setSoloConActividad(false);
                  setComisionPortavoz('');
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
          {/* Morado y no verde: este enlace lleva a Regulatorio, y el
              color dice a dónde vas antes de pulsarlo. */}
          <Link
            href={`/congreso?tipo=pnl&grupo=${grupo.group_id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: '#6d5aef',
              color: '#fff',
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Ver todas en Actividad parlamentaria
            <i className="ti ti-arrow-right" style={{ fontSize: 14 }}></i>
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

      {tab === 'equipo' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={BUSCADOR}>
              <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
              <input
                value={buscarAsesor}
                onChange={(e) => setBuscarAsesor(e.target.value)}
                placeholder="Buscar por nombre o cargo..."
                aria-label="Buscar asesor"
                style={INPUT}
              />
            </div>
            {/* Desplegable y no chips: el BOCG distingue hasta ocho
                categorías y en fila no caben. */}
            {categoriasAsesor.length > 1 && (
              <select
                value={categoriaAsesor}
                onChange={(e) => setCategoriaAsesor(e.target.value)}
                aria-label="Filtrar por categoría"
                style={{ ...chip(!!categoriaAsesor), appearance: 'none', paddingRight: 28 }}
              >
                <option value="">Categoría</option>
                {categoriasAsesor.map(([c, n]) => (
                  <option key={c} value={c}>
                    {c} ({n})
                  </option>
                ))}
              </select>
            )}
            {(buscarAsesor || categoriaAsesor) && (
              <span
                onClick={() => {
                  setBuscarAsesor('');
                  setCategoriaAsesor('');
                }}
                style={{ fontSize: 11.5, color: '#999', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'center' }}
              >
                Limpiar
              </span>
            )}
          </div>

          <div style={CARD}>
            {asesoresFiltrados.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-users-group"></i>
                {asesores.length === 0
                  ? 'No consta personal eventual a disposición de este grupo.'
                  : 'Ningún asesor con estos filtros.'}
              </div>
            ) : (
              asesoresFiltrados.map((a) => (
                <div key={a.id} style={FILA} title={a.cargo}>
                  <Avatar nombre={a.full_name} size={32} plano />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.full_name}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                      {[a.categoria, desdeCuando(a.fecha_alta)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {a.linkedin_url && (
                    <a
                      href={a.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`LinkedIn de ${a.full_name}`}
                      style={{ color: '#a8a49c', flexShrink: 0, display: 'flex' }}
                    >
                      <i className="ti ti-brand-linkedin" style={{ fontSize: 15 }}></i>
                    </a>
                  )}
                  <CeldaCorreo
                    tiene={a.tiene_email}
                    correo={correos?.[a.slug]}
                    onUpsell={() =>
                      setUpsell({
                        title: 'El correo de los asesores',
                        message:
                          'La dirección de cada asesor del grupo, para escribir a quien prepara el expediente y no solo a quien lo defiende. Disponible en el plan Pro.',
                      })
                    }
                  />
                </div>
              ))
            )}
            {asesoresFiltrados.length > 0 && asesoresFiltrados.length < asesores.length && (
              <div style={{ fontSize: 11.5, color: '#888', paddingTop: 12 }}>
                {asesoresFiltrados.length} de {asesores.length} asesores
              </div>
            )}
            {asesores.length > 0 && asesoresFiltrados.length === asesores.length && (
              <div style={{ fontSize: 10.5, color: '#aaa', paddingTop: 12 }}>
                {asesoresConCorreo} de {asesores.length} con correo localizado.
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        {tab === 'equipo'
          ? 'Nombramientos publicados en el Boletín Oficial de las Cortes Generales.'
          : 'Datos abiertos del Congreso de los Diputados.'}
      </div>

      {upsell && (
        <UpgradeModal title={upsell.title} message={upsell.message} onClose={() => setUpsell(null)} />
      )}
    </div>
  );
}
