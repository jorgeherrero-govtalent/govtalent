'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';

// Tope de eurodiputados por lista. Un expediente transversal puede tocar
// muchas comisiones: la media es 162 y el máximo medido, 658.
const TOPE_MEPS = 60;

// Descarga de documentos. Verificada copiando el enlace desde el portal:
// api/download/{documentId}, un nivel por encima de brpapi. No se dedujo
// —el patrón no era adivinable— sino que se comprobó sobre un PDF real.
const BASE_DESCARGA = 'https://ec.europa.eu/info/law/better-regulation/api/download';

const ACT_TYPES = {
  REG: 'Reglamento',
  REG_DEL: 'Reglamento delegado',
  REG_IMPL: 'Reglamento de ejecución',
  PROP_REG: 'Propuesta de reglamento',
  DIR: 'Directiva',
  DIR_DEL: 'Directiva delegada',
  PROP_DIR: 'Propuesta de directiva',
  DEC: 'Decisión',
  DEC_DEL: 'Decisión delegada',
  DEC_IMPL: 'Decisión de ejecución',
  COM: 'Comunicación',
  SWD: 'Documento de trabajo',
  REC: 'Recomendación',
  RPT: 'Informe',
  OTHER: 'Otros',
};

const STAGES = {
  PLANNING_WORKFLOW: 'Planificación',
  ISC_WORKFLOW: 'Consulta entre servicios',
  ADOPTION_WORKFLOW: 'Adopción',
  FEEDBACK_WORKFLOW: 'Aportaciones',
  PUBLICATION_WORKFLOW: 'Publicación',
  INIT_PLANNED: 'Iniciativa planificada',
  CALL_FOR_EVIDENCE: 'Convocatoria de aportaciones',
  OPC_LAUNCHED: 'Consulta pública abierta',
};

const actLabel = (c) => ACT_TYPES[c] || legible(c);

// Convierte un código sin traducir en algo leíble en vez de enseñarlo en
// crudo: OPC_LAUNCHED -> "Opc launched" es feo, pero PROP_REG a secas lo
// es más.
function legible(code) {
  if (!code) return '—';
  const l = code.replace(/_/g, ' ').toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

const stageLabel = (c) => (c ? STAGES[c] || legible(c) : 'Etapa sin identificar');

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function iniciales(n) {
  return (n || '')
    .split(' ')
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function pesoLegible(bytes) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const CARD = { background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 18 };
const LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 12,
};

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

function Persona({ av, nombre, sub, extra, href }) {
  const cuerpo = (
    <>
      {av}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nombre}</div>
        <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>{sub}</div>
      </div>
      {extra}
    </>
  );
  const estilo = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 0',
    borderBottom: '.5px solid #f0f0eb',
    textDecoration: 'none',
    color: 'inherit',
  };
  return href ? (
    <Link href={href} style={estilo}>
      {cuerpo}
    </Link>
  ) : (
    <div style={estilo}>{cuerpo}</div>
  );
}

function Avatar({ texto, url, morado }) {
  const [falla, setFalla] = useState(false);
  if (url && !falla) {
    return (
      <img
        src={url}
        alt=""
        width={32}
        height={32}
        style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', background: '#ece9e2', flexShrink: 0 }}
        onError={() => setFalla(true)}
      />
    );
  }
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: morado ? '#EEEDFE' : '#ece9e2',
        color: morado ? '#3C3489' : '#8d8b83',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: texto && texto.length > 4 ? 8.5 : 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {texto}
    </div>
  );
}

export default function InitiativeDetailPage() {
  const supabase = createClient();
  const { slug } = useParams();

  const [item, setItem] = useState(undefined);
  const [stages, setStages] = useState([]);
  const [actors, setActors] = useState(null);
  const [resumenMeps, setResumenMeps] = useState(null);
  const [meps, setMeps] = useState(null);
  const [filtroMeps, setFiltroMeps] = useState(null);
  const [cargandoMeps, setCargandoMeps] = useState(false);
  const [userId, setUserId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('resumen');
  const [verSecundarios, setVerSecundarios] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('eu_initiatives_directory')
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

      const [{ data: st }, { data: act }, { data: res }, { data: auth }] = await Promise.all([
        supabase.from('eu_initiative_stages').select('*').eq('initiative_id', data.id).order('ord'),
        supabase
          .from('eu_initiative_actors')
          .select('*')
          .eq('initiative_id', data.id)
          .order('orden_relevancia')
          .order('orden_cargo')
          .order('full_name'),
        supabase
          .from('eu_initiative_meps_resumen')
          .select('*')
          .eq('initiative_id', data.id)
          .limit(1)
          .maybeSingle(),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;
      setStages(st || []);
      setActors(act || []);
      setResumenMeps(res || null);

      const uid = auth?.user?.id || null;
      setUserId(uid);
      if (uid) {
        const { data: s } = await supabase
          .from('saved_initiatives')
          .select('id')
          .eq('user_id', uid)
          .eq('initiative_id', data.id)
          .limit(1)
          .maybeSingle();
        if (!cancelled) setSaved(!!s);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const recorrido = useMemo(
    () =>
      [...stages].sort((a, b) => {
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return new Date(a.start_date) - new Date(b.start_date);
      }),
    [stages]
  );

  const dgNombre = useMemo(
    () => (actors || []).find((a) => a.body_code === item?.dg_code)?.body_name || null,
    [actors, item]
  );
  const principales = useMemo(() => (actors || []).filter((a) => a.relevance === 'principal'), [actors]);
  const secundarios = useMemo(() => (actors || []).filter((a) => a.relevance !== 'principal'), [actors]);
  // Los documentos vienen en las 24 lenguas oficiales: 40 adjuntos suelen
  // ser 2 documentos traducidos, no 40 distintos. No se pueden agrupar por
  // número de páginas —la misma propuesta tiene 46 en inglés y 53 en
  // búlgaro— ni por título, que cambia por completo. Se filtra por idioma:
  // español si existe, inglés si no.
  const { documentos, otrosIdiomas } = useMemo(() => {
    const todos = Array.isArray(item?.attachments) ? item.attachments : [];
    if (todos.length === 0) return { documentos: [], otrosIdiomas: 0 };

    const es = todos.filter((d) => d.idioma === 'ES');
    const en = todos.filter((d) => d.idioma === 'EN');
    const sinIdioma = todos.filter((d) => !d.idioma);

    const elegidos = es.length > 0 ? es : en.length > 0 ? en : sinIdioma.length > 0 ? sinIdioma : todos;
    return { documentos: elegidos, otrosIdiomas: todos.length - elegidos.length };
  }, [item]);

  // Las pestañas sin contenido se muestran en gris y no se pueden pulsar,
  // en vez de ocultarse: así el usuario sabe qué información existe para
  // otros expedientes y por qué en este no aparece.
  const pestanas = useMemo(() => {
    const resumen = !!(item?.summary_es || item?.summary_en);
    const nActores = (actors || []).length + (item?.author_name ? 1 : 0);
    return [
      { id: 'resumen', label: 'Resumen', n: null, activa: resumen },
      { id: 'recorrido', label: 'Recorrido', n: recorrido.length || null, activa: recorrido.length > 0 },
      { id: 'actores', label: 'Actores', n: nActores || null, activa: nActores > 0 },
      {
        id: 'parlamento',
        label: 'Parlamento',
        n: resumenMeps?.total || null,
        activa: !!resumenMeps?.total,
      },
      { id: 'docs', label: 'Documentos', n: documentos.length || null, activa: documentos.length > 0 },
    ];
  }, [item, actors, recorrido, resumenMeps, documentos]);

  // Si la pestaña activa se queda sin contenido, se salta a la primera que
  // tenga algo. Sin esto, un expediente sin resumen abriría en blanco.
  useEffect(() => {
    const actual = pestanas.find((p) => p.id === tab);
    if (actual && !actual.activa) {
      const primera = pestanas.find((p) => p.activa);
      if (primera) setTab(primera.id);
    }
  }, [pestanas, tab]);

  async function cargarMeps(modo) {
    if (filtroMeps === modo) {
      setFiltroMeps(null);
      setMeps(null);
      return;
    }
    setCargandoMeps(true);
    setFiltroMeps(modo);
    let q = supabase
      .from('eu_initiative_meps')
      .select('*')
      .eq('initiative_id', item.id)
      .order('orden_rol')
      .order('full_name')
      .limit(TOPE_MEPS);
    if (modo === 'ES') q = q.eq('country_code', 'ES');
    const { data } = await q;
    setMeps(data || []);
    setCargandoMeps(false);
  }

  async function toggleSave() {
    if (!userId) {
      toast('Inicia sesión para guardar expedientes');
      return;
    }
    if (saved) {
      setSaved(false);
      const { error } = await supabase
        .from('saved_initiatives')
        .delete()
        .eq('user_id', userId)
        .eq('initiative_id', item.id);
      if (error) setSaved(true);
      else toast('Eliminado de guardados');
    } else {
      setSaved(true);
      const { error } = await supabase.from('saved_initiatives').insert({ user_id: userId, initiative_id: item.id });
      if (error) setSaved(false);
      else toast('Expediente guardado ✓');
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
            No se ha encontrado este expediente.
          </div>
        </div>
        <BackLink fallbackHref="/initiatives" fallbackLabel="Volver a Expedientes" />
      </div>
    );
  }

  const abierta = item.is_open;

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/initiatives" fallbackLabel="Expedientes" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/initiatives" style={{ color: '#999', textDecoration: 'none' }}>
            Expedientes
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{item.reference || item.id}</span>
        </span>
      </div>

      <div style={{ ...CARD, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{item.title}</h1>
            <div style={{ fontSize: 11.5, color: '#666', marginTop: 5 }}>
              {actLabel(item.act_type)} · Comisión Europea
              {(item.topics || []).length > 0 && ` · ${item.topics.map((t) => t.label).join(', ')}`}
            </div>
            {item.is_major && (
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 10,
                  background: '#FAEEDA',
                  color: '#854F0B',
                  padding: '2px 8px',
                  borderRadius: 10,
                  marginTop: 7,
                }}
              >
                Iniciativa principal
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <CircleButton icon="bell" label="Seguir en Radar" title="Seguir en Radar · próximamente" disabled />
            {userId && (
              <CircleButton
                icon={saved ? 'bookmark-filled' : 'bookmark'}
                label={saved ? 'Quitar de guardados' : 'Guardar expediente'}
                active={saved}
                onClick={toggleSave}
              />
            )}
          </div>
        </div>

        {/* alignItems: start y no 'end': con nombres largos como "Comercio y
            Seguridad Económica" cada columna crecía por su lado y las demás
            quedaban descolgadas. Ahora todas arrancan a la misma altura y el
            botón se ancla abajo con alignSelf. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 14,
            paddingTop: 14,
            marginTop: 14,
            borderTop: '.5px solid #f0f0eb',
            alignItems: 'start',
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Plazo</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: abierta ? '#3C3489' : '#888' }}>
              {abierta
                ? item.dias_restantes === 0
                  ? 'Cierra hoy'
                  : `${item.dias_restantes} días`
                : fechaCorta(item.feedback_end)
                  ? 'Cerrado'
                  : 'Sin ventana'}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Lo tramita</div>
            {/* El nombre completo, no la sigla: "RTD" no dice nada a nadie.
                La sigla queda debajo para quien la reconozca. */}
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
              {dgNombre || item.dg_code || '—'}
              {dgNombre && item.dg_code && (
                <span style={{ fontSize: 10.5, color: '#aaa', fontWeight: 400 }}> · {item.dg_code}</span>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Responsable</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{item.author_name || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Españoles</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {resumenMeps ? `${resumenMeps.espanoles} de ${resumenMeps.total}` : '—'}
            </div>
          </div>
          {abierta && item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              style={{
                background: '#6d5aef',
                color: '#fff',
                borderRadius: 7,
                padding: '9px 14px',
                fontSize: 11.5,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                textAlign: 'center',
                alignSelf: 'center',
              }}
            >
              Participar ↗
            </a>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          borderBottom: '.5px solid #e0dfd8',
          marginBottom: 14,
          overflowX: 'auto',
        }}
      >
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={p.activa ? () => setTab(p.id) : undefined}
            aria-disabled={!p.activa ? 'true' : undefined}
            title={!p.activa ? 'Sin datos para este expediente' : undefined}
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
            {p.n ? ` (${p.n})` : ''}
          </button>
        ))}
      </div>

      {!pestanas.some((p) => p.activa) && (
        <div style={CARD}>
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6 }}>
            Todavía no hemos descargado el detalle de este expediente. La carga se completa sola cada noche; vuelve a
            consultarlo en unas horas.
          </div>
        </div>
      )}

      {tab === 'resumen' && (item.summary_es || item.summary_en) && (
        <div style={CARD}>
          <div style={{ fontSize: 13, color: '#333', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
            {item.summary_es || item.summary_en}
          </div>
          {!item.summary_es && item.summary_en && (
            <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 12 }}>
              La Comisión no ha publicado versión en español de este resumen.
            </div>
          )}
        </div>
      )}

      {tab === 'recorrido' && (
        <div style={CARD}>
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 1.5, background: '#e0dfd8' }}></div>
            {recorrido.map((s, i) => (
              <div key={i} style={{ position: 'relative', marginBottom: i === recorrido.length - 1 ? 0 : 16 }}>
                <div
                  style={{
                    position: 'absolute',
                    left: -20,
                    top: 3,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: s.is_current ? '#6d5aef' : '#d5d3c9',
                    border: '2px solid #fff',
                  }}
                ></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: s.is_current ? 600 : 400, color: s.is_current ? '#1a1a1a' : '#666' }}>
                      {stageLabel(s.stage)}
                    </div>
                    {s.feedback_status && s.feedback_status !== 'CLOSED' && (
                      <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>
                        Aportaciones · {s.feedback_status === 'OPEN' ? 'abiertas' : s.feedback_status.toLowerCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {s.is_current && (
                      <span
                        style={{
                          fontSize: 10,
                          background: '#EEEDFE',
                          color: '#3C3489',
                          padding: '3px 9px',
                          borderRadius: 12,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Etapa actual
                      </span>
                    )}
                    <div style={{ fontSize: 10.5, color: '#aaa', marginTop: s.is_current ? 4 : 0 }}>
                      {fechaCorta(s.start_date) || '—'}
                      {s.end_date ? ` – ${fechaCorta(s.end_date)}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'actores' && (
        <div style={CARD}>
          {(item.dg_code || item.author_name) && (
            <>
              <div style={LABEL}>Quién lo tramita</div>
              {item.dg_code && (
                <Persona
                  av={<Avatar texto={item.dg_code} morado />}
                  nombre={dgNombre || item.dg_code}
                  sub="Dirección general responsable"
                />
              )}
              {item.author_name && (
                <Persona
                  av={<Avatar texto={iniciales(item.author_name)} />}
                  nombre={item.author_name}
                  sub="Responsable del expediente"
                  extra={
                    item.author_email && (
                      <span style={{ fontSize: 10.5, color: '#999', textAlign: 'right', maxWidth: 190, wordBreak: 'break-all' }}>
                        {item.author_email}
                      </span>
                    )
                  }
                />
              )}
            </>
          )}

          {principales.length > 0 && (
            <>
              <div style={{ ...LABEL, marginTop: item.dg_code || item.author_name ? 18 : 0 }}>
                Quién decide sobre esta materia
              </div>
              {principales.map((a) => (
                <Persona
                  key={`${a.ambito}-${a.person_id}`}
                  av={<Avatar texto={iniciales(a.full_name)} url={a.photo_url} />}
                  nombre={a.full_name}
                  sub={`${a.role} · ${a.body_code}`}
                  href={a.ambito === 'parlamento' && a.person_slug ? `/institutions/eu-parliament/${a.person_slug}` : null}
                  extra={
                    a.email && (
                      <span style={{ fontSize: 10.5, color: '#999', textAlign: 'right', maxWidth: 175, wordBreak: 'break-all' }}>
                        {a.email}
                      </span>
                    )
                  }
                />
              ))}

              {secundarios.length > 0 && (
                <>
                  {verSecundarios &&
                    secundarios.map((a) => (
                      <Persona
                        key={`${a.ambito}-${a.person_id}`}
                        av={<Avatar texto={iniciales(a.full_name)} url={a.photo_url} />}
                        nombre={a.full_name}
                        sub={`${a.role} · ${a.body_code}`}
                        href={a.ambito === 'parlamento' && a.person_slug ? `/institutions/eu-parliament/${a.person_slug}` : null}
                      />
                    ))}
                  <button
                    type="button"
                    onClick={() => setVerSecundarios((v) => !v)}
                    style={{ fontSize: 11.5, color: '#6d5aef', background: 'none', border: 'none', padding: '10px 0 0', cursor: 'pointer' }}
                  >
                    {verSecundarios ? 'Ocultar los que también intervienen' : `Ver ${secundarios.length} más que también intervienen`}
                  </button>
                </>
              )}

              {/* La nota de "aproximación por materia" ya no aplica a la
                  Comisión: dg_code está en las 3.790 iniciativas, así que
                  la dirección general es atribución, no deducción. Sigue
                  siéndolo en el Parlamento, y ahí lo dice cada motivo. */}
            </>
          )}
        </div>
      )}

      {tab === 'parlamento' && resumenMeps && (
        <div style={CARD}>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>
            {resumenMeps.total} eurodiputados en las comisiones que tramitarán este expediente
            {resumenMeps.espanoles > 0 && (
              <>
                , <strong style={{ fontWeight: 600 }}>{resumenMeps.espanoles} de España</strong>
              </>
            )}
            .
          </div>

          <div style={{ display: 'flex', gap: 7, marginBottom: 13, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => cargarMeps('ES')}
              disabled={resumenMeps.espanoles === 0}
              style={{
                background: filtroMeps === 'ES' ? '#6d5aef' : '#fff',
                color: filtroMeps === 'ES' ? '#fff' : resumenMeps.espanoles === 0 ? '#ccc' : '#555',
                border: `.5px solid ${filtroMeps === 'ES' ? '#6d5aef' : '#e0dfd8'}`,
                borderRadius: 20,
                padding: '6px 13px',
                fontSize: 11.5,
                cursor: resumenMeps.espanoles === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Españoles ({resumenMeps.espanoles})
            </button>
            <button
              type="button"
              onClick={() => cargarMeps('todos')}
              style={{
                background: filtroMeps === 'todos' ? '#6d5aef' : '#fff',
                color: filtroMeps === 'todos' ? '#fff' : '#555',
                border: `.5px solid ${filtroMeps === 'todos' ? '#6d5aef' : '#e0dfd8'}`,
                borderRadius: 20,
                padding: '6px 13px',
                fontSize: 11.5,
                cursor: 'pointer',
              }}
            >
              Todos ({resumenMeps.total})
            </button>
          </div>

          {cargandoMeps && <div style={{ fontSize: 12, color: '#aaa' }}>Cargando…</div>}

          {meps && meps.length >= TOPE_MEPS && (
            <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
              Se muestran los {TOPE_MEPS} primeros por orden de responsabilidad. Filtra por España para acotar.
            </div>
          )}

          {meps &&
            meps.map((m) => (
              <Persona
                key={m.mep_id}
                av={<Avatar texto={iniciales(m.full_name)} url={m.photo_url} />}
                nombre={m.full_name}
                sub={`${m.political_group_code} · ${m.country_code} · ${m.comisiones}`}
                href={`/institutions/eu-parliament/${m.slug}`}
                extra={
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      borderRadius: 10,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      background: m.orden_rol <= 3 ? '#EEEDFE' : m.orden_rol === 4 ? '#E1F5EE' : '#F1EFE8',
                      color: m.orden_rol <= 3 ? '#3C3489' : m.orden_rol === 4 ? '#0F6E56' : '#5F5E5A',
                    }}
                  >
                    {m.role_label}
                  </span>
                }
              />
            ))}
        </div>
      )}

      {tab === 'docs' && (
        <div style={CARD}>
          <div style={{ fontSize: 11.5, color: '#888', marginBottom: 13 }}>
            Documentos publicados por la Comisión en este expediente.
            {otrosIdiomas > 0 && ` Hay ${otrosIdiomas} versiones más en otras lenguas oficiales.`}
          </div>
          {documentos.map((d, i) => {
            const url = d.documento_id ? `${BASE_DESCARGA}/${d.documento_id}` : null;
            const contenido = (
              <>
                <i
                  className="ti ti-file-type-pdf"
                  style={{ fontSize: 20, color: '#A32D2D', width: 32, textAlign: 'center', flexShrink: 0 }}
                  aria-hidden="true"
                ></i>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>{d.titulo}</div>
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 3 }}>
                    {[d.paginas ? `${d.paginas} páginas` : null, pesoLegible(d.bytes), fechaCorta(d.fecha)]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                {url && (
                  <i
                    className="ti ti-download"
                    style={{ fontSize: 16, color: '#6d5aef', flexShrink: 0 }}
                    aria-hidden="true"
                  ></i>
                )}
              </>
            );
            const estilo = {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 0',
              borderBottom: '.5px solid #f0f0eb',
              textDecoration: 'none',
              color: 'inherit',
            };
            // Sin documento_id no hay enlace posible: se muestra igual pero
            // sin simular que se puede descargar.
            return url ? (
              <a
                key={d.documento_id}
                href={url}
                target="_blank"
                rel="noreferrer"
                style={estilo}
                title="Descargar de la Comisión Europea"
              >
                {contenido}
              </a>
            ) : (
              <div key={i} style={estilo}>
                {contenido}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos de la Comisión Europea. Verifica los plazos en el trámite original antes de presentar nada.
      </div>
    </div>
  );
}
