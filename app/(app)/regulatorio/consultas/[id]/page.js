'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';
import PanelBloqueado from '@/components/PanelBloqueado';

const CARD = { background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 18 };
const LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 12,
};

const TIPOS = {
  consulta_previa: 'Consulta pública previa',
  audiencia_publica: 'Audiencia e información pública',
};

const tipoLabel = (c) => TIPOS[c] || c || 'Trámite de participación';

function iniciales(n) {
  const p = (n || '').replace(',', '').trim().split(' ');
  return `${p[0]?.[0] || ''}${p[p.length - 1]?.[0] || ''}`.toUpperCase();
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Avatar({ texto, cuadrado }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 38,
        height: 38,
        borderRadius: cuadrado ? 9 : '50%',
        background: cuadrado ? '#f0eefe' : '#ece9e2',
        color: cuadrado ? '#3C3489' : '#8d8b83',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: cuadrado ? 10 : 11,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {texto}
    </div>
  );
}

// Misma estructura que la ficha de expediente: el botón de seguir va
// fuera del enlace, porque dentro pulsarlo navegaría en vez de seguir.
function Persona({ av, nombre, sub, href, seguir }) {
  const cuerpo = (
    <>
      {av}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{nombre}</div>
        {sub && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{sub}</div>}
      </div>
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
    <div style={{ ...estilo, borderBottom: '.5px solid #f0f0eb' }}>{cuerpo}</div>
  );
}

export default function ConsultaDetallePage() {
  const supabase = createClient();
  const { id } = useParams();

  const [item, setItem] = useState(undefined);
  const [esPro, setEsPro] = useState(null);
  const [unidad, setUnidad] = useState(null);
  const [cadena, setCadena] = useState([]);
  const [hijas, setHijas] = useState([]);
  const [politicos, setPoliticos] = useState([]);
  const [tab, setTab] = useState('resumen');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      // El plan primero, igual que en la ficha de expediente: decide qué
      // se pide después. Esconder con CSS no protege nada, porque lo que
      // baja al navegador se lee desde el inspector.
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = auth?.user?.id || null;

      let pro = false;
      if (uid) {
        const { data: perfil } = await supabase.from('users').select('plan').eq('id', uid).single();
        pro = perfil?.plan === 'pro';
      }
      if (cancelled) return;
      setEsPro(pro);

      const { data } = await supabase
        .from('consultas_estado')
        .select('*')
        .eq('id', id)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setItem(null);
        return;
      }
      setItem(data);

      // Los actores solo se piden con plan: son unidades y personas del
      // directorio, y no tiene sentido traerlos para no enseñarlos.
      if (!pro || !data.fuente_id) return;

      // El órgano que tramita se deduce del buzón. Es una inferencia y se
      // dice como tal en la propia pantalla.
      const { data: unidades } = await supabase
        .from('organigrama_unidades')
        .select('id, nombre, categoria, superior_id, titular, telefono')
        .eq('fuente_id', data.fuente_id);

      if (cancelled || !unidades?.length) return;

      const porId = new Map(unidades.map((u) => [u.id, u]));
      const prefijo = (data.buzon || '').split('@')[0].toLowerCase();

      // Se busca la unidad cuyo nombre comparte más palabras con el
      // prefijo del buzón: "cpncartera" -> "Cartera Común de Servicios".
      let tramita = null;
      if (prefijo.length >= 4) {
        let mejor = 0;
        for (const u of unidades) {
          const n = u.nombre
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
          let puntos = 0;
          for (const w of n.split(/\s+/)) {
            if (w.length > 4 && prefijo.includes(w.slice(0, 6))) puntos += 1;
          }
          if (puntos > mejor) {
            mejor = puntos;
            tramita = u;
          }
        }
      }

      if (!tramita) return;
      setUnidad(tramita);

      // Cadena de mando hacia arriba, y unidades que cuelgan hacia abajo.
      const arriba = [];
      let actual = porId.get(tramita.superior_id);
      let guarda = 0;
      while (actual && guarda < 10) {
        arriba.unshift(actual);
        actual = porId.get(actual.superior_id);
        guarda += 1;
      }
      setCadena(arriba);
      setHijas(unidades.filter((u) => u.superior_id === tramita.id));

      // Quien responde políticamente: los eslabones de la cadena que son
      // ministerio o secretaría, y que tienen titular conocido.
      setPoliticos(
        arriba.filter(
          (u) =>
            ['ministerio', 'secretaria_estado', 'subsecretaria'].includes(u.categoria) && u.titular
        )
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const nActores = useMemo(() => {
    if (!esPro) return null;
    return (unidad ? 1 : 0) + hijas.length + politicos.length;
  }, [esPro, unidad, hijas, politicos]);

  const pestanas = useMemo(() => {
    if (!item) return [];
    return [
      { id: 'resumen', label: 'Resumen', n: null, activa: !!item.resumen },
      { id: 'participar', label: 'Cómo participar', n: null, activa: true },
      // Con plan se sabe cuántos hay; sin plan la pestaña se ofrece igual
      // y al entrar aparece el panel de mejora, como en Expedientes.
      { id: 'actores', label: 'Actores', n: nActores || null, activa: true },
      { id: 'docs', label: 'Documentos', n: item.url_documento ? 1 : null, activa: !!item.url_documento },
    ];
  }, [item, nActores]);

  useEffect(() => {
    const actual = pestanas.find((p) => p.id === tab);
    if (pestanas.length && actual && !actual.activa) {
      const primera = pestanas.find((p) => p.activa);
      if (primera) setTab(primera.id);
    }
  }, [pestanas, tab]);

  if (item === undefined) return <div className="spinner"></div>;

  if (item === null) {
    return (
      <div className="sec" style={{ maxWidth: 900 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-message-off"></i>
            No se ha encontrado esta consulta.
          </div>
        </div>
        <BackLink fallbackHref="/regulatorio/consultas" fallbackLabel="Volver a Consultas públicas" />
      </div>
    );
  }

  const abierta = item.estado === 'abierta' || item.estado === 'urgente';

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/regulatorio/consultas" fallbackLabel="Consultas públicas" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/regulatorio" style={{ color: '#999', textDecoration: 'none' }}>
            Regulatorio
          </Link>
          {' › '}
          <Link href="/regulatorio/consultas" style={{ color: '#999', textDecoration: 'none' }}>
            Consultas públicas
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{item.referencia || item.ministerio}</span>
        </span>
      </div>

      <div style={{ ...CARD, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{item.titulo}</h1>
            <div style={{ fontSize: 11.5, color: '#666', marginTop: 5 }}>
              {tipoLabel(item.tipo)} · {item.ministerio}
              {unidad ? ` · ${unidad.nombre}` : ''}
            </div>
            {item.referencia && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <span
                  title="Referencia del expediente que exige el ministerio en el asunto"
                  style={{
                    display: 'inline-block',
                    fontSize: 10,
                    background: '#f0eefe',
                    color: '#3C3489',
                    padding: '3px 9px',
                    borderRadius: 11,
                  }}
                >
                  {item.referencia}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            <FollowButton kind="consulta" refId={item.id} label={item.titulo} />
          </div>
        </div>

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
                : item.fecha_fin
                  ? 'plazo cerrado'
                  : 'sin plazo publicado'}
            </div>
          </div>

          {item.fecha_fin && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginTop: 2 }}>
                {formatDate(item.fecha_fin)}
              </div>
              <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 5 }}>fecha límite</div>
            </div>
          )}

          <div style={{ flex: 1 }}></div>

          {/* Al trámite original, no al buzón: el correo puede estar
              incompleto o haber cambiado, y la web del ministerio es
              siempre la referencia buena. */}
          {abierta && item.url_origen && (
            <a
              href={item.url_origen}
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
            onClick={p.activa ? () => setTab(p.id) : undefined}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 12.5,
              fontWeight: tab === p.id ? 600 : 400,
              color: !p.activa ? '#ccc' : tab === p.id ? '#6d5aef' : '#999',
              padding: '0 0 9px',
              borderBottom: `2px solid ${tab === p.id && p.activa ? '#6d5aef' : 'transparent'}`,
              cursor: p.activa ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            {p.label}
            {p.n ? ` (${p.n})` : ''}
          </button>
        ))}
      </div>

      {tab === 'resumen' && item.resumen && (
        <div style={CARD}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{item.resumen}</p>
          <p style={{ margin: '14px 0 0', fontSize: 11, color: '#a8a49c' }}>
            Texto publicado por el ministerio en la ficha del trámite.
          </p>
        </div>
      )}

      {tab === 'participar' && (
        <div style={CARD}>
          <div style={LABEL}>Cómo presentar una aportación</div>

          {item.buzon ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: '#555' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <i className="ti ti-mail" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                <a href={`mailto:${item.buzon}`} style={{ color: '#555', textDecoration: 'none', wordBreak: 'break-all' }}>
                  {item.buzon}
                </a>
              </div>

              {/* El asunto no es un detalle: si no coincide, el ministerio
                  puede no dar la aportación por presentada. */}
              {item.asunto_requerido && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                  <i className="ti ti-tag" style={{ color: '#6d5aef', fontSize: 14, marginTop: 2 }}></i>
                  <span>
                    Asunto exigido: <strong>{item.asunto_requerido}</strong>
                  </span>
                </div>
              )}

              {item.fecha_fin && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <i className="ti ti-calendar" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                  Hasta el {formatDate(item.fecha_fin)}
                  {item.fecha_inicio ? `, desde el ${formatDate(item.fecha_inicio)}` : ''}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, color: '#888' }}>
                <i className="ti ti-user-check" style={{ fontSize: 14, marginTop: 2 }}></i>
                <span>Solo se consideran las aportaciones en las que el remitente esté identificado.</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.7 }}>
              El ministerio no publica el buzón de aportaciones en la web de este trámite. Consúltalo en
              el trámite original antes de enviar nada.
            </div>
          )}

          {item.nota && (
            <div style={{ fontSize: 11.5, color: '#8a6d3b', marginTop: 14, lineHeight: 1.6 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 13, verticalAlign: -2, marginRight: 6 }}></i>
              {item.nota}
            </div>
          )}

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '.5px solid #f0f0eb' }}>
            <a
              href={item.url_origen}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: '#6d5aef', textDecoration: 'none' }}
            >
              <i className="ti ti-external-link" style={{ fontSize: 13, verticalAlign: -2, marginRight: 5 }}></i>
              Ver el trámite en la web del ministerio
            </a>
          </div>
        </div>
      )}

      {tab === 'actores' && esPro === false && (
        <div style={CARD}>
          <PanelBloqueado
            titulo="Los actores de este trámite"
            descripcion="Qué órgano lo tramita, qué subdirecciones redactan el texto y quién responde políticamente. Con la cadena de mando completa del ministerio."
          />
        </div>
      )}

      {tab === 'actores' && esPro && (
        <div style={CARD}>
          {!unidad ? (
            <div className="empty-state">
              <i className="ti ti-users-off"></i>
              No hemos podido determinar qué órgano tramita este trámite.
            </div>
          ) : (
            <>
              <div style={LABEL}>Quién lo tramita</div>
              <Persona
                av={<Avatar texto={iniciales(unidad.nombre)} cuadrado />}
                nombre={unidad.nombre}
                sub={[unidad.titular, item.buzon].filter(Boolean).join(' · ') || 'Titular no publicado'}
              />

              {hijas.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ ...LABEL, marginBottom: 4 }}>Unidades que lo trabajan</div>
                  <p style={{ margin: '0 0 8px', fontSize: 11.5, color: '#a8a49c' }}>
                    Subdirecciones que dependen del órgano que tramita. Son quienes redactan el texto.
                  </p>
                  {hijas.map((h) => (
                    <Persona
                      key={h.id}
                      av={<Avatar texto={iniciales(h.nombre)} cuadrado />}
                      nombre={h.nombre}
                      sub={[h.titular, h.telefono].filter(Boolean).join(' · ') || 'Titular no publicado'}
                    />
                  ))}
                </div>
              )}

              {politicos.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={LABEL}>Quién responde políticamente</div>
                  {politicos.map((p) => (
                    <Persona
                      key={p.id}
                      av={<Avatar texto={iniciales(p.titular)} />}
                      nombre={p.titular}
                      sub={p.nombre}
                    />
                  ))}
                </div>
              )}

              {cadena.length > 0 && (
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '.5px solid #f0f0eb' }}>
                  <div style={{ ...LABEL, marginBottom: 6 }}>Cadena de mando</div>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#888', lineHeight: 1.8 }}>
                    {cadena.map((c) => c.nombre).join(' › ')}
                    {' › '}
                    <span style={{ color: '#2C2C2A' }}>{unidad.nombre}</span>
                  </p>
                </div>
              )}

              <p style={{ margin: '16px 0 0', fontSize: 11, color: '#a8a49c', lineHeight: 1.6 }}>
                El órgano que tramita se deduce del buzón de aportaciones. La estructura procede del
                organigrama oficial del ministerio.
              </p>
            </>
          )}
        </div>
      )}

      {tab === 'docs' && item.url_documento && (
        <div style={CARD}>
          <div style={LABEL}>Documentos</div>
          <a
            href={item.url_documento}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#555', textDecoration: 'none' }}
          >
            <i className="ti ti-file-text" style={{ color: '#6d5aef', fontSize: 16 }}></i>
            Texto del proyecto
          </a>
        </div>
      )}

      <div
        style={{
          marginTop: 20,
          fontSize: 11,
          color: '#999',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos de la web del {item.ministerio}. Verifica el plazo en el trámite original antes de
        presentar nada.
      </div>
    </div>
  );
}
