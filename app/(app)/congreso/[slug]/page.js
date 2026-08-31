'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';
import PanelBloqueado, { FILAS_CONGRESO } from '@/components/PanelBloqueado';
import FollowButton from '@/components/FollowButton';
import { groupColor, grupoCorto, colorSigla, nombreSigla } from '@/lib/grupos';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// enlaces_bocg llega como texto y puede traer varias URL separadas por
// saltos o comas. Se coge la primera, que es la publicación del texto.
function primerEnlace(texto) {
  if (!texto) return null;
  const m = String(texto).match(/https?:\/\/[^\s,;"']+/);
  return m ? m[0] : null;
}

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
  const [ap, nom] = (n || '').split(',').map((s) => s.trim());
  return `${(nom || '')[0] || ''}${(ap || '')[0] || ''}`.toUpperCase();
}

// "Del Canto Soriano, Lydia" -> "Lydia Del Canto Soriano"
function nombreLegible(oficial) {
  const [ap, nom] = (oficial || '').split(',').map((s) => s.trim());
  return nom ? `${nom} ${ap}` : oficial;
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

function Avatar({ nombre, url, size = 30 }) {
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

export default function CongresoDetailPage() {
  const supabase = createClient();
  const { slug } = useParams();

  const [item, setItem] = useState(undefined);
  const [etapas, setEtapas] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [comision, setComision] = useState(null);
  const [esPro, setEsPro] = useState(null);
  // El recuento que sigue enseñándose sin plan: la pestaña dice cuántos
  // actores hay, no quiénes son.
  const [nPersonasBloqueadas, setNPersonasBloqueadas] = useState(0);
  const [userId, setUserId] = useState(null);
  const [tab, setTab] = useState('recorrido');
  const [verTodo, setVerTodo] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('es_initiatives_directory')
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

      // FollowButton comprueba por su cuenta si se sigue; aquí el
      // usuario hace falta antes, para saber el plan.
      const { data: auth } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = auth?.user?.id || null;
      setUserId(uid);

      // El plan decide qué se pide. Traerlo todo y esconderlo con un
      // desenfoque no protege nada: lo que baja al navegador se lee
      // desde el inspector.
      let pro = false;
      if (uid) {
        const { data: perfil } = await supabase.from('users').select('plan').eq('id', uid).single();
        pro = perfil?.plan === 'pro';
      }
      if (cancelled) return;
      setEsPro(pro);

      const [{ data: et }, personasRes, comisionRes] = await Promise.all([
        // El recorrido son fases y fechas, sin personas: se pide siempre.
        supabase
          .from('es_initiative_timeline')
          .select('*')
          .eq('num_expediente', data.num_expediente)
          .order('ord'),
        // Sin plan, el recuento y no las filas: la pestaña puede decir
        // "Actores (6)" sin que los seis nombres salgan del servidor.
        pro
          ? supabase.from('es_initiative_actors').select('*').eq('num_expediente', data.num_expediente)
          : supabase
              .from('es_initiative_actors')
              .select('num_expediente', { count: 'exact', head: true })
              .eq('num_expediente', data.num_expediente),
        // La comisión competente con sus portavoces: quienes negocian
        // este texto por cada grupo. Sin plan basta saber si la hay,
        // porque de eso depende que la pestaña esté activa.
        pro
          ? supabase
              .from('es_initiative_committee')
              .select('*')
              .eq('num_expediente', data.num_expediente)
              .limit(1)
              .maybeSingle()
          : supabase
              .from('es_initiative_committee')
              .select('num_expediente', { count: 'exact', head: true })
              .eq('num_expediente', data.num_expediente),
      ]);

      if (cancelled) return;
      setEtapas(et || []);

      if (pro) {
        setPersonas(personasRes.data || []);
        setComision(comisionRes.data || null);
      } else {
        setPersonas([]);
        setComision(null);
        setNPersonasBloqueadas((personasRes.count || 0) + (comisionRes.count || 0));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const ponentes = useMemo(() => personas.filter((p) => p.role === 'ponente'), [personas]);
  const autores = useMemo(() => personas.filter((p) => p.role === 'autor'), [personas]);

  const documentos = useMemo(() => {
    if (!item) return [];
    const partir = (t, etiqueta) =>
      String(t || '')
        .split(/\s*\n\s*/)
        .map((u) => u.trim())
        .filter((u) => u.startsWith('http'))
        .map((url) => ({ url, etiqueta }));
    // Los enlaces vienen en dos campos: boletín oficial y diario de
    // sesiones. Se juntan distinguiendo el origen.
    return [...partir(item.enlaces_bocg, 'Boletín Oficial'), ...partir(item.enlaces_ds, 'Diario de Sesiones')];
  }, [item]);

  const nActores = esPro ? personas.length + (comision ? 1 : 0) : nPersonasBloqueadas;

  const pestanas = useMemo(
    () => [
      { id: 'recorrido', label: `Recorrido${etapas.length ? ` (${etapas.length})` : ''}`, activa: etapas.length > 0 },
      // Sin plan las filas no se piden, así que el número sale del
      // recuento. La pestaña sigue activa: se entra y se ve el panel,
      // que es justo lo que se quiere enseñar.
      {
        id: 'actores',
        label: `Actores${nActores ? ` (${nActores})` : ''}`,
        activa: nActores > 0 || (item?.grupos || []).length > 0,
      },
      { id: 'plazos', label: 'Plazos', activa: !!item?.texto_plazos },
      { id: 'docs', label: `Documentos${documentos.length ? ` (${documentos.length})` : ''}`, activa: documentos.length > 0 },
    ],
    [etapas, item, documentos, nActores]
  );

  useEffect(() => {
    const actual = pestanas.find((p) => p.id === tab);
    if (actual && !actual.activa) {
      const primera = pestanas.find((p) => p.activa);
      if (primera) setTab(primera.id);
    }
  }, [pestanas, tab]);

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
            No se ha encontrado esta iniciativa.
          </div>
        </div>
        <BackLink fallbackHref="/congreso" fallbackLabel="Volver al Congreso" />
      </div>
    );
  }

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/congreso" fallbackLabel="Congreso" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/regulatorio" style={{ color: '#999', textDecoration: 'none' }}>
            Regulatorio
          </Link>
          {' › '}
          <Link href="/congreso" style={{ color: '#999', textDecoration: 'none' }}>
            Congreso
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{item.num_expediente}</span>
        </span>
      </div>

      <div style={{ ...CARD, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 13 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{item.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: '#666' }}>{item.kind_label}</span>
              <span style={{ color: '#ddd' }}>·</span>
              <span style={{ fontSize: 11.5, color: '#666' }}>Congreso de los Diputados</span>
              {item.fecha_presentacion && (
                <>
                  <span style={{ color: '#ddd' }}>·</span>
                  <span style={{ fontSize: 11.5, color: '#666' }}>
                    Presentada el {fechaCorta(item.fecha_presentacion)}
                  </span>
                </>
              )}
              {item.tipo_tramitacion === 'Urgente' && (
                <span style={{ fontSize: 10, background: '#EEEDFE', color: '#3C3489', padding: '2px 8px', borderRadius: 10 }}>
                  Tramitación urgente
                </span>
              )}
            </div>
          </div>
          {/* Un solo concepto. Guardar desaparece absorbido por seguir:
              era un marcador que no avisaba de nada, y tener dos cosas
              parecidas confundía sin aportar. */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            <FollowButton kind="ley" refId={item.num_expediente} label={item.title} />
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
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                lineHeight: 1.3,
                color: item.is_closed ? '#666' : item.is_blocked ? '#8d8b83' : '#3C3489',
              }}
            >
              {item.is_closed ? 'Concluida' : item.is_blocked ? 'Bloqueada' : 'En progreso'}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Dónde está</div>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
              {item.situacion || '—'}
              {item.fase && <span style={{ fontSize: 10.5, color: '#aaa', fontWeight: 400 }}> · {item.fase}</span>}
            </div>
          </div>
          {/* El expediente sale de aquí: es la referencia técnica y
              ocupaba el mismo peso que el estado. La fecha sube al
              subtítulo, que es contexto y no un dato que se consulte.

              En su sitio, quién presenta la iniciativa: distingue un
              proyecto del Gobierno de una proposición de un grupo, que
              es lo primero que se mira. El dato ya estaba guardado y no
              se mostraba.

              "Tramitación" no entra: en la mayoría dice "Normal" y no
              informa de nada. Cuando es urgente ya se avisa arriba. */}
          {item.autor && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>Quién la presenta</div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{item.autor}</div>
            </div>
          )}
        </div>

        {/* El motivo del bloqueo se explica, no se deja como etiqueta
            suelta: es una lectura nuestra y hay que justificarla. */}
        {item.is_blocked && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              marginTop: 14,
              paddingTop: 13,
              borderTop: '.5px solid #f0f0eb',
            }}
          >
            <i className="ti ti-clock-pause" style={{ fontSize: 15, color: '#b0aea6', flexShrink: 0, marginTop: 1 }}></i>
            <div style={{ fontSize: 11.5, color: '#888', lineHeight: 1.6 }}>
              {item.motivo_bloqueo === 'prorrogas'
                ? `El plazo de enmiendas se ha prorrogado ${item.n_prorrogas} veces y no hay actuaciones desde ${fechaCorta(item.ultima_actuacion)}.`
                : `No hay actuaciones desde ${fechaCorta(item.ultima_actuacion)} y el plazo de enmiendas está vencido.`}
            </div>
          </div>
        )}

        {!item.is_blocked && !item.is_closed && item.dias_plazo !== null && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              marginTop: 14,
              paddingTop: 13,
              borderTop: '.5px solid #f0f0eb',
              // En móvil el enlace del BOCG baja de línea en vez de
              // apretar el texto del plazo.
              flexWrap: 'wrap',
            }}
          >
            <i className="ti ti-calendar" style={{ fontSize: 15, color: '#6d5aef', flexShrink: 0 }}></i>
            <div style={{ fontSize: 11.5, color: '#555', flex: 1, minWidth: 0 }}>
              Plazo de enmiendas abierto hasta el {fechaCorta(item.plazo_enmiendas)}
              {item.n_prorrogas > 0 && (
                <span style={{ color: '#999' }}>
                  {' '}
                  · prorrogado {item.n_prorrogas} {item.n_prorrogas === 1 ? 'vez' : 'veces'}
                </span>
              )}
            </div>
            {/* Si hay plazo abierto, lo siguiente que se quiere ver es qué
                se ha presentado. El BOCG es donde se publican. */}
            {primerEnlace(item.enlaces_bocg) && (
              <a
                href={primerEnlace(item.enlaces_bocg)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11.5, color: '#6d5aef', textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                <i className="ti ti-external-link" style={{ fontSize: 12, verticalAlign: -2, marginRight: 4 }}></i>
                Ver en el BOCG
              </a>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14, overflowX: 'auto' }}>
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={p.activa ? () => setTab(p.id) : undefined}
            aria-disabled={!p.activa ? 'true' : undefined}
            title={!p.activa ? 'Sin datos para esta iniciativa' : undefined}
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
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 1.5, background: '#e0dfd8' }}></div>
            {etapas.map((e, i) => (
              <div key={e.ord} style={{ position: 'relative', marginBottom: i === etapas.length - 1 ? 0 : 15 }}>
                <div
                  style={{
                    position: 'absolute',
                    left: -20,
                    top: 3,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: e.es_actual ? '#6d5aef' : '#d5d3c9',
                    border: '2px solid #fff',
                  }}
                ></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: e.es_actual ? 600 : 400, color: e.es_actual ? '#1a1a1a' : '#666' }}>
                      {e.organo}
                    </div>
                    {e.fase && <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>{e.fase}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {e.es_actual && (
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
                    <div style={{ fontSize: 10.5, color: '#aaa', marginTop: e.es_actual ? 4 : 0 }}>
                      {fechaBreve(e.fecha_inicio) || '—'}
                      {e.fecha_fin ? ` – ${fechaBreve(e.fecha_fin)}` : ''}
                      {/* Una etapa que dura más de un año señala dónde se
                          atascó el expediente. */}
                      {e.dias > 365 && <span style={{ color: '#b0aea6' }}> · {Math.round(e.dias / 30)} meses</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* La siguiente fase, y solo esa. Cuando se cierra el plazo de
                enmiendas se designa ponencia: eso es seguro. Lo que venga
                después depende de si hay competencia legislativa plena, si
                va por urgencia o si pasa al Senado, y dibujar un camino
                que no conocemos sería inventarlo.

                Sirve además para explicar por qué el bloque de ponentes
                está vacío. */}
            {!item.is_closed && !item.is_blocked && item.plazo_enmiendas && (
              <div style={{ position: 'relative', marginTop: 15 }}>
                <div
                  style={{
                    position: 'absolute',
                    left: -20,
                    top: 3,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: '#fff',
                    border: '1.5px solid #d5d3c9',
                  }}
                ></div>
                <div style={{ fontSize: 12.5, color: '#a8a49c' }}>Ponencia</div>
                <div style={{ fontSize: 10.5, color: '#c2beb6', marginTop: 2, lineHeight: 1.5 }}>
                  Los ponentes se designarán al cerrarse el plazo de enmiendas
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'actores' && esPro === false && (
        <div style={CARD}>
          <PanelBloqueado
            titulo="Quién decide y quién presenta esta ley"
            descripcion="La comisión competente, sus portavoces por grupo, los ponentes designados y los grupos autores. Con nombre, grupo y ficha de cada uno a un solo clic."
            filas={FILAS_CONGRESO}
          />
        </div>
      )}

      {tab === 'actores' && esPro && (
        <div style={CARD}>
          {/* La comisión competente va primero: es quien decide el texto.
              Vive en Instituciones como órgano, pero aquí aparece como
              actor de esta norma concreta — mismo patrón que la dirección
              general en los expedientes europeos. */}
          {comision && (
            <>
              <div style={LABEL}>Quién lo decide</div>
              <Link
                href={`/institutions/comisiones/${comision.committee_slug}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 0',
                  borderBottom: '.5px solid #f0f0eb',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: '#EEEDFE',
                    color: '#3C3489',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className="ti ti-users" style={{ fontSize: 16 }} aria-hidden="true"></i>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{comision.committee_name}</div>
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                    Comisión competente · {comision.n_members} miembros
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
              </Link>

              {comision.presidente && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '.5px solid #f0f0eb' }}>
                  <Avatar nombre={comision.presidente} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nombreLegible(comision.presidente)}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>Preside la comisión</div>
                  </div>
                  {comision.presidente_grupo && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: colorSigla(comision.presidente_grupo) }}></span>
                      <span style={{ fontSize: 10.5, color: '#888' }}>{nombreSigla(comision.presidente_grupo)}</span>
                    </span>
                  )}
                </div>
              )}

              {(comision.portavoces || []).length > 0 && (
                <>
                  <div style={{ ...LABEL, marginTop: 18 }}>
                    Portavoces en la comisión · {comision.portavoces.length}
                  </div>
                  {comision.portavoces.map((p, i) => {
                    const cuerpo = (
                      <>
                        <Avatar nombre={p.nombre} url={p.foto} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{nombreLegible(p.nombre)}</div>
                          {p.senador && <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>Senado</div>}
                        </div>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{ width: 9, height: 9, borderRadius: 2, background: colorSigla(p.grupo) }}></span>
                          <span style={{ fontSize: 10.5, color: '#888' }}>{nombreSigla(p.grupo)}</span>
                        </span>
                        {p.slug && <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>}
                      </>
                    );
                    const estilo = {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '.5px solid #f0f0eb',
                      textDecoration: 'none',
                      color: 'inherit',
                    };
                    return p.slug ? (
                      <Link key={`pv-${i}`} href={`/institutions/deputies/${p.slug}`} style={estilo}>
                        {cuerpo}
                      </Link>
                    ) : (
                      <div key={`pv-${i}`} style={estilo}>
                        {cuerpo}
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}

          {(item.grupos || []).length > 0 && (
            <>
              <div style={{ ...LABEL, marginTop: comision ? 18 : 0 }}>Quién la presenta</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                {item.grupos.map((g) => (
                  <span
                    key={g.grupo}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      border: '.5px solid #e0dfd8',
                      borderRadius: 20,
                      padding: '5px 12px',
                    }}
                  >
                    <span
                      style={{ width: 9, height: 9, borderRadius: 2, background: groupColor(g.grupo), flexShrink: 0 }}
                    ></span>
                    <span style={{ fontSize: 11.5 }}>{grupoCorto(g.grupo)}</span>
                  </span>
                ))}
              </div>
            </>
          )}

          {ponentes.length > 0 && (
            <>
              <div style={LABEL}>Ponencia · {ponentes.length}</div>
              {ponentes.map((p, i) => {
                const contenido = (
                  <>
                    <Avatar nombre={p.nombre} url={p.photo_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nombreLegible(p.full_name || p.nombre)}</div>
                      <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                        {[p.grupo_nombre ? grupoCorto(p.grupo_nombre) : null, p.constituency].filter(Boolean).join(' · ') ||
                          'No está en el directorio'}
                      </div>
                    </div>
                    {p.grupo_nombre && (
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          background: groupColor(p.grupo_nombre),
                          flexShrink: 0,
                        }}
                      ></span>
                    )}
                    {p.slug && <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>}
                  </>
                );
                const estilo = {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '.5px solid #f0f0eb',
                  textDecoration: 'none',
                  color: 'inherit',
                };
                // El 96% de los ponentes enlaza con el directorio. Los que
                // no, se muestran igual pero sin enlace.
                return p.slug ? (
                  <Link key={`${p.nombre}-${i}`} href={`/institutions/deputies/${p.slug}`} style={estilo}>
                    {contenido}
                  </Link>
                ) : (
                  <div key={`${p.nombre}-${i}`} style={estilo}>
                    {contenido}
                  </div>
                );
              })}
            </>
          )}

          {autores.length > 0 && (
            <>
              <div style={{ ...LABEL, marginTop: 18 }}>Firmantes · {autores.length}</div>
              {autores.map((p, i) => (
                <div
                  key={`a-${p.nombre}-${i}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '.5px solid #f0f0eb' }}
                >
                  <Avatar nombre={p.nombre} url={p.photo_url} size={26} />
                  <span style={{ flex: 1, fontSize: 11.5, minWidth: 0 }}>{nombreLegible(p.full_name || p.nombre)}</span>
                  {p.grupo_texto && <span style={{ fontSize: 10, color: '#999' }}>{p.grupo_texto}</span>}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'plazos' && (
        <div style={CARD}>
          <div style={LABEL}>Plazos de enmiendas</div>
          {item.n_prorrogas > 0 && (
            <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6, marginBottom: 13 }}>
              El plazo se ha ampliado <strong style={{ fontWeight: 600 }}>{item.n_prorrogas} veces</strong>. En el Congreso
              las prórrogas se acuerdan en bloque cada semana, así que un número alto indica que el expediente lleva
              tiempo sin cerrarse.
            </div>
          )}
          <div
            style={{
              fontSize: 11.5,
              color: '#666',
              lineHeight: 1.8,
              whiteSpace: 'pre-line',
              maxHeight: verTodo ? 'none' : 240,
              overflow: 'hidden',
            }}
          >
            {item.texto_plazos}
          </div>
          {(item.texto_plazos || '').split('\n').length > 8 && (
            <button
              type="button"
              onClick={() => setVerTodo((v) => !v)}
              style={{ fontSize: 11.5, color: '#6d5aef', background: 'none', border: 'none', padding: '11px 0 0', cursor: 'pointer' }}
            >
              {verTodo ? 'Ver menos' : 'Ver todos los plazos'}
            </button>
          )}
        </div>
      )}

      {tab === 'docs' && (
        <div style={CARD}>
          <div style={{ fontSize: 11.5, color: '#888', marginBottom: 13 }}>
            Publicaciones oficiales de esta iniciativa.
          </div>
          {documentos.map((d, i) => (
            <a
              key={`${d.url}-${i}`}
              href={d.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 0',
                borderBottom: '.5px solid #f0f0eb',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <i
                className="ti ti-file-type-pdf"
                style={{ fontSize: 18, color: '#A32D2D', width: 26, textAlign: 'center', flexShrink: 0 }}
                aria-hidden="true"
              ></i>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{d.etiqueta}</div>
                <div style={{ fontSize: 10, color: '#aaa', wordBreak: 'break-all' }}>
                  {d.url.split('/').pop().replace(/#.*$/, '')}
                </div>
              </div>
              <i className="ti ti-external-link" style={{ fontSize: 14, color: '#6d5aef', flexShrink: 0 }}></i>
            </a>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos abiertos del Congreso de los Diputados.
      </div>
    </div>
  );
}
