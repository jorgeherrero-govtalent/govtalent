'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';
import Aportaciones from '@/components/Aportaciones';

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

const actLabel = (c) => ACT_TYPES[c] || legible(c);

// Convierte un código sin traducir en algo leíble en vez de enseñarlo en
// crudo: OPC_LAUNCHED -> "Opc launched" es feo, pero PROP_REG a secas lo
// es más.
function legible(code) {
  if (!code) return '—';
  const l = code.replace(/_/g, ' ').toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

// stageLabel se retiró: las fases llegan ya traducidas desde
// eu_initiative_recorrido, que es donde debe vivir el diccionario.

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

function Persona({ av, nombre, sub, extra, href, seguir }) {
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
    textDecoration: 'none',
    color: 'inherit',
    flex: 1,
    minWidth: 0,
  };

  // El botón de seguir va fuera del enlace: si estuviera dentro,
  // pulsarlo navegaría en vez de seguir.
  if (seguir) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '.5px solid #f0f0eb' }}>
        {href ? (
          <Link href={href} style={estilo}>
            {cuerpo}
          </Link>
        ) : (
          <div style={estilo}>{cuerpo}</div>
        )}
        <div style={{ flexShrink: 0 }}>
          <FollowButton kind={seguir.kind} refId={seguir.refId} label={seguir.label} conProyecto={false} />
        </div>
        {href && <i className="ti ti-chevron-right" style={{ color: '#d6d2ca', fontSize: 14, flexShrink: 0 }}></i>}
      </div>
    );
  }

  return href ? (
    <Link href={href} style={{ ...estilo, borderBottom: '.5px solid #f0f0eb' }}>
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

/**
 * La pestaña que se ve sin plan.
 *
 * Debajo del cartel hay una lista inventada, no la real difuminada. La
 * diferencia importa: un blur de CSS no oculta nada —el texto sigue en
 * el DOM y se lee desde el inspector— y aquí lo que habría debajo son
 * nombres y correos de funcionarios. Así que no se piden siquiera; lo
 * borroso es atrezo.
 *
 * Se enseña la forma real de la pestaña (cargo, avatar, columna de
 * correo a la derecha) porque eso es justo lo que se está vendiendo:
 * que existe y qué aspecto tiene.
 */
function PanelBloqueado({ titulo, descripcion, filas }) {
  return (
    <div style={{ position: 'relative', minHeight: 190 }}>
      <div style={{ filter: 'blur(4px)', opacity: 0.55, pointerEvents: 'none', userSelect: 'none' }} aria-hidden="true">
        {filas.map((f, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderBottom: i < filas.length - 1 ? '.5px solid #f0f0eb' : 'none',
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: '#f0eefe',
                color: '#6d5aef',
                fontSize: 10.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {f.iniciales}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5 }}>{f.nombre}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: '#a8a49c' }}>{f.cargo}</span>
            </span>
            <span style={{ fontSize: 11, color: '#a8a49c', flexShrink: 0 }}>nombre.apellido@ec.europa.eu</span>
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 12,
            boxShadow: '0 6px 22px rgba(0,0,0,.08)',
            padding: '16px 20px',
            textAlign: 'center',
            maxWidth: 380,
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 5 }}>{titulo}</div>
          <p style={{ fontSize: 12, color: '#666', lineHeight: 1.55, margin: '0 0 13px' }}>{descripcion}</p>
          <Link
            href="/precios"
            target="_blank"
            className="btn-ai"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <i className="ti ti-bolt"></i> Ver con Pro
          </Link>
        </div>
      </div>
    </div>
  );
}

// Atrezo. Cargos genéricos, nunca personas reales: si alguien quita el
// desenfoque tiene que encontrar esto y no un nombre de verdad.
const FILAS_ACTORES = [
  { iniciales: 'DG', nombre: 'Nombre del director general', cargo: 'Director-General' },
  { iniciales: 'DA', nombre: 'Nombre del director adjunto', cargo: 'Deputy Director-General' },
  { iniciales: 'JU', nombre: 'Nombre del jefe de unidad', cargo: 'Head of Unit' },
  { iniciales: 'AS', nombre: 'Nombre del asistente', cargo: 'Assistant to the Director-General' },
];

const FILAS_PARLAMENTO = [
  { iniciales: 'PO', nombre: 'Nombre del ponente', cargo: 'Ponente · Comisión competente' },
  { iniciales: 'PA', nombre: 'Nombre del ponente alternativo', cargo: 'Ponente alternativo' },
  { iniciales: 'ED', nombre: 'Nombre del eurodiputado', cargo: 'Miembro titular · España' },
  { iniciales: 'ES', nombre: 'Nombre del eurodiputado', cargo: 'Miembro suplente · España' },
];

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
  const [esPro, setEsPro] = useState(null);
  // Los recuentos que se enseñan aunque no haya plan: la pestaña sigue
  // diciendo cuántos actores hay, solo que no quiénes son.
  const [nActoresBloqueado, setNActoresBloqueado] = useState(0);
  const [tab, setTab] = useState('resumen');
  const [verSecundarios, setVerSecundarios] = useState(false);
  const [comisario, setComisario] = useState(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      // El plan primero, porque decide qué se pide después. Sin esto
      // habría que traerlo todo y esconder la mitad, y esconder no es
      // proteger: lo que baja al navegador se lee desde el inspector
      // aunque esté difuminado por CSS.
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = auth?.user?.id || null;
      setUserId(uid);

      let pro = false;
      if (uid) {
        const { data: perfil } = await supabase.from('users').select('plan').eq('id', uid).single();
        pro = perfil?.plan === 'pro';
      }
      if (cancelled) return;
      setEsPro(pro);

      // Las columnas por nombre y no select('*'): author_email solo se
      // pide con plan. Es un correo de contacto del expediente y no
      // tiene por qué viajar hasta quien no puede verlo.
      const COLUMNAS_BASE =
        'id, slug, reference, title, title_es, title_en, summary_es, summary_en, ' +
        'act_type, topics, dg_code, source_url, attachments, feedback_end, ' +
        'dias_restantes, is_open, is_major, is_evaluation, n_contribuciones, author_name';

      const { data } = await supabase
        .from('eu_initiatives_directory')
        .select(pro ? `${COLUMNAS_BASE}, author_email` : COLUMNAS_BASE)
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setItem(null);
        return;
      }
      setItem(data);

      const [{ data: st }, actoresRes, { data: res }, comisarioRes] = await Promise.all([
        // Las fases completas, no solo la actual: eu_initiative_stages
        // guardaba una sola entrada por expediente.
        supabase.from('eu_initiative_recorrido').select('*').eq('initiative_id', data.id).order('orden'),
        // Sin plan se pide el recuento y no las filas. head:true no trae
        // ninguna, así que la pestaña puede decir "Actores (10)" sin que
        // los diez nombres bajen al navegador.
        pro
          ? supabase
              .from('eu_initiative_actors')
              .select('*')
              .eq('initiative_id', data.id)
              .order('orden_relevancia')
              .order('orden_cargo')
              .order('full_name')
          : supabase
              .from('eu_initiative_actors')
              .select('id', { count: 'exact', head: true })
              .eq('initiative_id', data.id),
        // El resumen del Parlamento son cifras agregadas, sin nombres:
        // se pide siempre, porque es lo que da el contador de la pestaña.
        supabase
          .from('eu_initiative_meps_resumen')
          .select('*')
          .eq('initiative_id', data.id)
          .limit(1)
          .maybeSingle(),
        // El nivel político de la dirección general. Un funcionario
        // tramita; quien decide políticamente es el comisario, y eso
        // faltaba en la ficha.
        data.dg_code
          ? pro
            ? supabase.from('ec_dg_political').select('*').eq('dg_code', data.dg_code).limit(1).maybeSingle()
            : supabase
                .from('ec_dg_political')
                .select('dg_code', { count: 'exact', head: true })
                .eq('dg_code', data.dg_code)
          : Promise.resolve({ data: null, count: 0 }),
      ]);

      if (cancelled) return;
      setStages(st || []);
      setResumenMeps(res || null);

      if (pro) {
        setActors(actoresRes.data || []);
        setComisario(comisarioRes.data || null);
      } else {
        setActors([]);
        setComisario(null);
        setNActoresBloqueado(
          (actoresRes.count || 0) + (comisarioRes.count || 0) + (data.author_name ? 1 : 0)
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // El orden viene de la API y es el del ciclo, así que no hace falta
  // reordenar por fecha: una fase futura puede no tenerla todavía.
  const recorrido = stages || [];

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
    // El comisario cuenta como actor: es quien responde políticamente.
    // Sin plan las filas no se han pedido, así que el número sale del
    // recuento. La pestaña dice lo mismo en los dos casos.
    const nActores = esPro
      ? (actors || []).length + (item?.author_name ? 1 : 0) + (comisario ? 1 : 0)
      : nActoresBloqueado;
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
  }, [item, actors, recorrido, comisario, esPro, nActoresBloqueado]);

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
    // Cerrojo de seguridad. Hoy no puede llegarse aquí sin plan —los
    // botones que la llaman viven dentro del panel de Parlamento, que
    // sin plan no se pinta— pero la lista trae nombres de personas y no
    // conviene que eso dependa de dónde esté un botón.
    if (!esPro) return;
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
          <Link href="/regulatorio" style={{ color: '#999', textDecoration: 'none' }}>
            Regulatorio
          </Link>
          {' › '}
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
            {/* "Iniciativa principal" no decía nada por sí solo: es la
                marca que pone la Comisión a lo que considera de mayor
                calado, y conviene explicarlo. También se enseña si es
                una evaluación, que es otro tipo de trámite. */}
            {(item.is_major || item.is_evaluation) && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {item.is_major && (
                  <span
                    title="La Comisión la considera una de sus iniciativas prioritarias"
                    style={{
                      display: 'inline-block',
                      fontSize: 10,
                      background: '#f0eefe',
                      color: '#3C3489',
                      padding: '3px 9px',
                      borderRadius: 11,
                    }}
                  >
                    Prioritaria para la Comisión
                  </span>
                )}
                {item.is_evaluation && (
                  <span
                    title="Revisa cómo está funcionando una norma ya en vigor"
                    style={{
                      display: 'inline-block',
                      fontSize: 10,
                      background: '#f5f4f1',
                      color: '#57534e',
                      padding: '3px 9px',
                      borderRadius: 11,
                    }}
                  >
                    Evaluación de una norma vigente
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            <FollowButton kind="expediente" refId={item.id} label={item.title_es || item.title_en} />
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
          {/* Solo lo accionable, y en grande: cuánto queda y cuántos se
              han pronunciado. El nombre de la DG, la persona de contacto
              y los españoles del Parlamento bajan a sus pestañas, que es
              donde se buscan. */}
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: abierta ? '#6d5aef' : '#888',
                lineHeight: 1,
                letterSpacing: '-.5px',
              }}
            >
              {abierta ? (item.dias_restantes === 0 ? 'Hoy' : item.dias_restantes) : '—'}
            </div>
            <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 5 }}>
              {abierta
                ? item.dias_restantes === 0
                  ? 'cierra el plazo'
                  : item.dias_restantes === 1
                    ? 'día de plazo'
                    : 'días de plazo'
                : item.feedback_end
                  ? 'plazo cerrado'
                  : 'sin ventana de aportaciones'}
            </div>
          </div>

          {item.n_contribuciones > 2 && (
            <div>
              <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1, letterSpacing: '-.5px' }}>
                {item.n_contribuciones}
              </div>
              <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 5 }}>
                {item.n_contribuciones === 1 ? 'organización se ha pronunciado' : 'organizaciones se han pronunciado'}
              </div>
            </div>
          )}

          <div style={{ flex: 1 }}></div>

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
                    background: s.es_actual ? '#6d5aef' : s.momento === 'proxima' ? '#e0dfd8' : '#d5d3c9',
                    border: '2px solid #fff',
                  }}
                ></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: s.es_actual ? 600 : 400,
                        color: s.es_actual ? '#1a1a1a' : s.momento === 'proxima' ? '#a8a49c' : '#666',
                      }}
                    >
                      {s.fase}
                    </div>
                    {/* Cuánta gente se pronunció en cada fase: dice si el
                        asunto movió al sector o pasó desapercibido. */}
                    {s.total_feedback > 0 && (
                      <div style={{ fontSize: 10.5, color: '#999', marginTop: 3 }}>
                        {s.total_feedback.toLocaleString('es-ES')}{' '}
                        {s.total_feedback === 1 ? 'aportación' : 'aportaciones'}
                      </div>
                    )}
                    {s.momento === 'proxima' && (
                      <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 3 }}>Aún no ha empezado</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {s.es_actual && (
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
                        {s.dias_restantes > 0 ? `Quedan ${s.dias_restantes} días` : 'Abierta'}
                      </span>
                    )}
                    <div style={{ fontSize: 10.5, color: '#aaa', marginTop: s.es_actual ? 4 : 0 }}>
                      {fechaCorta(s.fecha_inicio) || '—'}
                      {s.fecha_fin ? ` – ${fechaCorta(s.fecha_fin)}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'actores' && esPro === false && (
        <div style={CARD}>
          <PanelBloqueado
            titulo="Los actores de este expediente"
            descripcion="Quién responde políticamente, quién tramita el expediente y quién se ha pronunciado. Con nombres, cargos y direcciones de unidad a un solo clic."
            filas={FILAS_ACTORES}
          />
        </div>
      )}

      {tab === 'actores' && esPro && (
        <div style={CARD}>
          {/* El comisario va primero: es el nivel político, y quien
              responde del expediente ante el Parlamento. */}
          {comisario && (
            <>
              <div style={LABEL}>Quién responde políticamente</div>
              {/* A su ficha, no a commission.europa.eu: dentro está su
                  gabinete, lo que dirige y lo que se tramita bajo su
                  cartera. */}
              <Persona
                av={<Avatar texto={iniciales(comisario.full_name)} url={comisario.photo_url} />}
                nombre={comisario.full_name}
                sub={[comisario.portfolio_es, comisario.country_name].filter(Boolean).join(' · ')}
                href={`/institutions/eu-commission/comisarios/${comisario.slug}`}
                seguir={{ kind: 'comisario', refId: comisario.slug, label: comisario.full_name }}
              />
            </>
          )}

          {(item.dg_code || item.author_name) && (
            <>
              <div style={{ ...LABEL, marginTop: comisario ? 18 : 0 }}>Quién lo tramita</div>
              {item.dg_code && (
                <Persona
                  av={<Avatar texto={item.dg_code} morado />}
                  nombre={dgNombre || item.dg_code}
                  sub={
                    item.author_name
                      ? `Dirección general · ${item.author_name} es la persona de contacto`
                      : 'Dirección general responsable'
                  }
                  href={`/institutions/eu-commission/${item.dg_code}`}
                  seguir={{ kind: 'direccion', refId: item.dg_code, label: dgNombre || item.dg_code }}
                />
              )}

              {resumenMeps?.total > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={LABEL}>En el Parlamento Europeo</div>
                  <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6 }}>
                    {resumenMeps.total} eurodiputados participan en su tramitación
                    {resumenMeps.espanoles > 0 && `, ${resumenMeps.espanoles} de ellos españoles`}.{' '}
                    <button
                      type="button"
                      onClick={() => setTab('parlamento')}
                      style={{ color: '#6d5aef', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5 }}
                    >
                      Ver quiénes →
                    </button>
                  </div>
                </div>
              )}

              {/* Quién intenta influir, no solo quién tramita: es lo que
                  faltaba para responder "quién está detrás de esto". */}
              <div style={{ marginTop: 22, paddingTop: 18, borderTop: '.5px solid #f0f0eb' }}>
                <Aportaciones initiativeId={item.id} diasRestantes={item.dias_restantes} />
              </div>
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

      {tab === 'parlamento' && esPro === false && resumenMeps && (
        <div style={CARD}>
          <PanelBloqueado
            titulo={`Los ${resumenMeps.total} eurodiputados que lo tramitan`}
            descripcion="Quién responde políticamente, quién tramita el expediente y quién se ha pronunciado. Con nombres, cargos y direcciones de unidad a un solo clic."
            filas={FILAS_PARLAMENTO}
          />
        </div>
      )}

      {tab === 'parlamento' && esPro && resumenMeps && (
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
