'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';
import PanelBloqueado, { FILAS_CONGRESO } from '@/components/PanelBloqueado';
import { colorGrupo, base } from '@/lib/ccaa/composicionUI';
import { presentaLey, casarComision, enmendantes, comparecientes, cargosDeComision } from '@/lib/ccaa/actores';
import usePlanPro from '@/lib/usePlanPro';
import {
  MORADO, GRIS, CCAA, NOMBRE_PARLAMENTO, FASES, ETIQUETA_TIPO,
  fechaCorta, fechaLarga, finDePlazoTexto, tituloLegible, plazoEnDias,
} from '@/lib/ccaa/vista';

/**
 * Ficha de una ley de un parlamento autonómico.
 *
 * Diseño elegido el 04-10-2026 (opción C): barra de fases, una frase
 * «Ahora» con el punto en que está la ley y todos los trámites con su
 * fuente — la ficha del parlamento o el boletín y la página, si lo ha
 * leído GovTalent.
 *
 * Disciplina de nulos: si un plazo se da en días sin fecha final, se dice
 * así; no se calcula una fecha que el boletín no publica.
 */

const CARD = { background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };

// Atrezo del panel Pro: genérico, nunca leyes reales.
const FILAS_LEYES = [
  { iniciales: 'LEY', nombre: 'Ley autonómica modificada', cargo: 'Materia afectada' },
  { iniciales: 'LEY', nombre: 'Ley autonómica modificada', cargo: 'Materia afectada' },
  { iniciales: 'LEY', nombre: 'Ley autonómica modificada', cargo: 'Materia afectada' },
];

const SIGLA_VISIBLE = { VOX: 'Vox' };
const sigla = (g) => (g ? SIGLA_VISIBLE[g.sigla] || g.sigla : null);
const LABEL = { fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: GRIS, margin: '0 0 6px' };
const FILA = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '.5px solid #f0f0eb', textDecoration: 'none', color: 'inherit' };

function iniciales(n) {
  return String(n || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();
}

function Avatar({ nombre, url, size = 30 }) {
  const [falla, setFalla] = useState(false);
  const estilo = { width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover', background: '#ece9e2' };
  if (url && !falla) return <img src={url} alt="" width={size} height={size} style={estilo} onError={() => setFalla(true)} />;
  return (
    <div aria-hidden="true" style={{ ...estilo, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8d8b83', fontSize: Math.round(size * 0.33), fontWeight: 700 }}>
      {iniciales(nombre)}
    </div>
  );
}

function Sigla({ g }) {
  if (!g) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontSize: 10.5, color: '#888' }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: colorGrupo(g) }}></span>
      {sigla(g)}
    </span>
  );
}

function Persona({ c, p, sub, size = 30 }) {
  const d = c.diputado;
  const cuerpo = (
    <>
      <Avatar nombre={c.nombre} url={d?.foto_storage_url || d?.foto_url} size={size} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.nombre}</div>
        {sub && <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>{sub}</div>}
      </div>
      <Sigla g={c.grupo} />
      {d?.slug && <span style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}>›</span>}
    </>
  );
  return d?.slug ? (
    <Link href={`${base(p)}/diputados/${d.slug}`} style={FILA}>
      {cuerpo}
    </Link>
  ) : (
    <div style={FILA}>{cuerpo}</div>
  );
}

function Chips({ grupos, p }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
      {grupos.map((g) => (
        <Link
          key={g.id}
          href={`${base(p)}/grupos/${g.slug}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '.5px solid #e0dfd8', borderRadius: 20, padding: '5px 12px', fontSize: 11.5, textDecoration: 'none', color: 'inherit' }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 2, background: colorGrupo(g) }}></span>
          {sigla(g)}
        </Link>
      ))}
    </div>
  );
}

/**
 * «Quién decide y quién presenta esta ley»: el mismo bloque que la ficha
 * del Congreso (maqueta aprobada el 30-10-2026), más quién ha enmendado y
 * quién comparece, que salen de los trámites del boletín.
 */
function QuienDecide({ e, actores }) {
  const p = e.parlamento;
  const { comision, mesa, presenta, enm, comp } = actores;
  const pv = (g) => mesa?.[g] && `${mesa[g].nombre}${mesa[g].grupo ? ` (${sigla(mesa[g].grupo)})` : ''}`;
  const resto = [pv('vicepresidencia') && `Vicepresidencia: ${pv('vicepresidencia')}`, pv('secretaria') && `Secretaría: ${pv('secretaria')}`].filter(Boolean);
  let margen = 0;
  const arriba = () => {
    const m = margen;
    margen = 16;
    return m;
  };
  return (
    <div style={{ ...CARD, padding: '18px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Quién decide y quién presenta esta ley</div>

      {(comision || e.comision) && (
        <>
          <div style={{ ...LABEL, marginTop: arriba() }}>Quién lo decide</div>
          {comision ? (
            <Link href={`${base(p)}/comisiones/${comision.slug}`} style={FILA}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EEEDFE', color: '#3C3489', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-users" style={{ fontSize: 16 }} aria-hidden="true"></i>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{comision.nombre}</div>
                <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                  Comisión competente{mesa?.n_miembros ? ` · ${mesa.n_miembros} miembros` : ''}
                </div>
              </div>
              <span style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}>›</span>
            </Link>
          ) : (
            <div style={{ ...FILA, fontSize: 12.5, fontWeight: 600 }}>{e.comision}</div>
          )}
          {mesa?.presidencia && <Persona c={mesa.presidencia} p={p} sub="Preside la comisión" size={34} />}
          {resto.length > 0 && <div style={{ fontSize: 10.5, color: '#999', padding: '7px 0 2px', lineHeight: 1.5 }}>{resto.join(' · ')}</div>}

          {mesa?.portavoces?.length > 0 && (
            <>
              <div style={{ ...LABEL, marginTop: 16 }}>Portavoces en la comisión · {mesa.portavoces.length}</div>
              {mesa.portavoces.map((c) => (
                <Persona
                  key={c.id}
                  c={c}
                  p={p}
                  sub={c.adjunto ? `${/a$/i.test(c.adjunto.cargo || '') ? 'Adjunta' : 'Adjunto'}: ${c.adjunto.nombre}` : null}
                />
              ))}
            </>
          )}
        </>
      )}

      {presenta && (
        <>
          <div style={{ ...LABEL, marginTop: arriba() }}>Quién la presenta</div>
          <div style={{ display: 'inline-flex', border: '.5px solid #e0dfd8', borderRadius: 20, padding: '5px 12px', fontSize: 11.5, marginBottom: 6 }}>{presenta}</div>
        </>
      )}

      {(enm.totalidad.length > 0 || enm.articulado.length > 0) && (
        <>
          <div style={{ ...LABEL, marginTop: arriba() }}>Quién la ha enmendado</div>
          {enm.totalidad.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, color: '#999', margin: '0 0 6px' }}>
                A la totalidad{enm.totalidadRechazada ? ' (rechazadas en el Pleno)' : ''}
              </div>
              <Chips grupos={enm.totalidad} p={p} />
            </>
          )}
          {enm.articulado.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, color: '#999', margin: '4px 0 6px' }}>Al articulado</div>
              <Chips grupos={enm.articulado} p={p} />
            </>
          )}
        </>
      )}

      {comp.length > 0 && (
        <>
          <div style={{ ...LABEL, marginTop: arriba() }}>Quién comparece · {comp.length}</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{comp.join(' · ')}</div>
        </>
      )}

      {!e.is_closed && (
        <>
          <div style={{ ...LABEL, marginTop: arriba() }}>Ponencia</div>
          <div style={{ fontSize: 11.5, color: '#999', lineHeight: 1.5 }}>
            La ponencia aún no se ha publicado. Cuando aparezca en el boletín, sus miembros saldrán aquí con su ficha.
          </div>
        </>
      )}
    </div>
  );
}

const ORDEN_FASE = { admision: 0, enmiendas: 1, ponencia: 2, pleno: 3 };

function Ahora({ e, tramites }) {
  let texto;
  if (e.is_closed) {
    texto = e.resultado ? `Tramitación terminada: ${e.resultado}.` : 'Tramitación terminada.';
  } else if (e.plazo_abierto && e.plazo_enmiendas) {
    texto = `Plazo de enmiendas abierto hasta el ${finDePlazoTexto(e.plazo_enmiendas)}${e.n_ampliaciones ? ` (ampliado ${e.n_ampliaciones} ${e.n_ampliaciones === 1 ? 'vez' : 'veces'})` : ''}.`;
  } else if (plazoEnDias(e.plazo_en_dias)) {
    texto = `${e.plazo_en_dias.replace(/\.$/, '')}. El boletín no fija la fecha final.`;
  } else if (tramites[0]?.descripcion) {
    texto = `Último trámite (${fechaCorta(tramites[0].fecha) || 'sin fecha'}): ${tramites[0].descripcion}`;
  } else {
    texto = e.situacion || 'En tramitación.';
  }
  const fuente = tramites.find((t) => t.descripcion && texto.includes(t.descripcion)) || null;
  return (
    <div style={{ background: '#f6f4ff', borderRadius: 12, padding: '14px 16px', fontSize: 13, lineHeight: 1.55 }}>
      <b>Ahora:</b> {texto}
      {fuente?.url && (
        <>
          {' '}
          <a href={fuente.url} target="_blank" rel="noreferrer">
            Fuente ↗
          </a>
        </>
      )}
    </div>
  );
}

function Fuente({ t }) {
  if (!t.url && !['boletin_ia', 'boletin_relectura'].includes(t.origen)) return <span>Ficha del parlamento</span>;
  const texto = ['boletin_ia', 'boletin_relectura'].includes(t.origen) ? `Boletín${t.pagina ? `, pág. ${t.pagina}` : ''}` : 'Fuente';
  return (
    <>
      {t.url ? (
        <a href={t.url} target="_blank" rel="noreferrer">
          {texto} ↗
        </a>
      ) : (
        texto
      )}
      {['boletin_ia', 'boletin_relectura'].includes(t.origen) && <span style={{ color: MORADO }}> · leído por GovTalent</span>}
    </>
  );
}

export default function FichaParlamentoAutonomico() {
  const { slug } = useParams();
  const supabase = createClient();
  const esPro = usePlanPro();
  const [e, setE] = useState(undefined);
  const [tramites, setTramites] = useState([]);
  const [hermana, setHermana] = useState(null);
  const [actores, setActores] = useState(null);

  // Solo lectura de la composición: comisión, cargos, diputados y grupos.
  async function cargarActores(ley, tr) {
    const p = ley.parlamento;
    const [{ data: comisiones }, { data: grupos }] = await Promise.all([
      supabase.from('ccaa_comisiones').select('id, nombre, slug').eq('parlamento', p).eq('activo', true),
      supabase.from('ccaa_grupos').select('id, nombre, sigla, slug, color').eq('parlamento', p),
    ]);
    const gs = grupos || [];
    const comision = casarComision(ley.comision, comisiones || []);
    let mesa = null;
    if (comision) {
      const { data: cargos } = await supabase
        .from('ccaa_cargos')
        .select('id, nombre, diputado_id, grupo_id, cargo, cargo_norm, activo')
        .eq('comision_id', comision.id)
        .eq('activo', true);
      const ids = [...new Set((cargos || []).map((c) => c.diputado_id).filter(Boolean))];
      const { data: dips } = ids.length
        ? await supabase.from('ccaa_diputados').select('id, slug, grupo_id, foto_url, foto_storage_url').in('id', ids)
        : { data: [] };
      const porId = new Map((dips || []).map((d) => [d.id, d]));
      mesa = cargosDeComision(
        (cargos || []).map((c) => {
          const diputado = porId.get(c.diputado_id) || null;
          return { ...c, diputado, grupo: gs.find((g) => g.id === (c.grupo_id || diputado?.grupo_id)) || null };
        })
      );
    }
    return { comision, mesa, presenta: presentaLey(ley), enm: enmendantes(tr, gs), comp: comparecientes(tr) };
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('ccaa_resumen').select('*').eq('slug', slug).maybeSingle();
      setE(data || null);
      if (!data) return;
      const { data: tr } = await supabase
        .from('ccaa_tramites')
        .select('id, tipo, fecha, plazo_hasta, descripcion, organo, pagina, url, origen')
        .eq('expediente_id', data.id)
        .order('fecha', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      setTramites(tr || []);
      cargarActores(data, tr || []).then(setActores).catch(() => setActores(null));
      // Presupuestos y ley de acompañamiento del mismo año van juntos.
      const otra = data.tipo_norm === 'presupuestos' ? 'acompanamiento' : data.tipo_norm === 'acompanamiento' ? 'presupuestos' : null;
      const anio = String(data.titulo).match(/\b(20\d\d)\b/)?.[1];
      if (otra && anio) {
        const { data: h } = await supabase
          .from('ccaa_expedientes')
          .select('titulo, num_expediente, slug')
          .eq('parlamento', data.parlamento)
          .eq('tipo_norm', otra)
          .ilike('titulo', `%${anio}%`)
          .limit(1);
        setHermana(h?.[0] || null);
      }
    })();
  }, [slug]);

  if (e === undefined) return <div className="sec" style={{ maxWidth: 920, fontSize: 13, color: GRIS }}>Cargando…</div>;
  if (e === null) {
    return (
      <div className="sec" style={{ maxWidth: 920 }}>
        <BackLink fallbackHref="/parlamentos-autonomicos" fallbackLabel="Parlamentos autonómicos" />
        <p style={{ fontSize: 13, color: GRIS }}>No encontramos esta ley.</p>
      </div>
    );
  }

  const titulo = tituloLegible(e.titulo_es || e.titulo);
  const numVisible = e.num_expediente && !/^[IVX]+-[0-9A-F]{12}$/.test(e.num_expediente) ? e.num_expediente : null;
  const actual = e.is_closed ? 4 : ORDEN_FASE[e.fase] ?? -1;
  const fechasFase = {};
  for (const t of [...tramites].reverse()) {
    const f = ['pleno', 'aprobacion'].includes(t.tipo) ? 'pleno'
      : ['ponencia', 'comision', 'dictamen'].includes(t.tipo) ? 'ponencia'
      : ['plazo_enmiendas', 'ampliacion_plazo', 'enmiendas_totalidad', 'enmiendas_parciales', 'comparecencias'].includes(t.tipo) ? 'enmiendas'
      : ['registro', 'admision', 'publicacion', 'criterio_gobierno', 'toma_consideracion'].includes(t.tipo) ? 'admision' : null;
    if (f && t.fecha && !fechasFase[f]) fechasFase[f] = t.fecha;
  }
  const leyes = Array.isArray(e.leyes_modificadas) ? e.leyes_modificadas : null;

  return (
    <div className="sec" style={{ maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 12.5, color: GRIS }}>
        <BackLink fallbackHref="/parlamentos-autonomicos" fallbackLabel="Parlamentos autonómicos" />
        <span>
          <Link href="/parlamentos-autonomicos" style={{ color: GRIS, textDecoration: 'none' }}>
            Parlamentos autonómicos
          </Link>{' '}
          › {CCAA[e.parlamento]}
          {numVisible ? ` · ${numVisible}` : ''}
        </span>
      </div>

      <div style={{ ...CARD, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <div style={{ fontSize: 12, color: e.tipo_norm === 'presupuestos' || e.tipo_norm === 'acompanamiento' ? MORADO : GRIS }}>
              {[ETIQUETA_TIPO[e.tipo_norm] || e.tipo, e.autor].filter(Boolean).join(' · ')}
            </div>
            <h1 style={{ fontSize: 22, lineHeight: 1.3, fontWeight: 600, margin: '6px 0 0', letterSpacing: '-.3px' }}>{titulo}</h1>
          </div>
          <FollowButton kind="ccaa" refId={e.id} label={titulo} />
        </div>

        <div className="ccaa-barra" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
          {FASES.map((f, i) => {
            const hecha = i < actual;
            const ahora = i === actual;
            return (
              <div key={f.id}>
                <div style={{ height: 6, borderRadius: 3, background: ahora ? MORADO : hecha ? '#1d6f5c' : '#e6e4dc' }}></div>
                <div style={{ fontSize: 12, marginTop: 6, fontWeight: ahora ? 600 : 400, color: hecha || ahora ? '#1a1a18' : GRIS }}>{f.nombre}</div>
                {fechasFase[f.id] && <div style={{ fontSize: 11.5, color: GRIS }}>{fechaCorta(fechasFase[f.id])}</div>}
              </div>
            );
          })}
        </div>

        <Ahora e={e} tramites={tramites} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ ...CARD, flex: '999 1 520px', minWidth: 0, padding: '22px 26px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>Todos los trámites</h2>
          {tramites.length === 0 ? (
            <p style={{ fontSize: 13, color: GRIS, margin: 0 }}>Todavía no conocemos ningún trámite.</p>
          ) : (
            tramites.map((t) => (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr)', gap: 14, padding: '11px 0', borderTop: '1px solid #efeee8', fontSize: 13 }}>
                <div style={{ color: GRIS }}>{fechaCorta(t.fecha) || '—'}</div>
                <div>
                  <div>{t.descripcion || '—'}</div>
                  {t.plazo_hasta && <div style={{ fontSize: 12.5, color: '#4b3bc4', marginTop: 2 }}>Hasta el {finDePlazoTexto(t.plazo_hasta)}</div>}
                  <div style={{ fontSize: 12, color: GRIS, marginTop: 3 }}>
                    {t.organo ? `${t.organo} · ` : ''}
                    <Fuente t={t} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...CARD, padding: '18px 20px', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ color: GRIS }}>Parlamento</div>
              <div>{NOMBRE_PARLAMENTO[e.parlamento]}</div>
            </div>
            {e.fecha_presentacion && (
              <div>
                <div style={{ color: GRIS }}>Registro</div>
                <div>{fechaLarga(e.fecha_presentacion)}</div>
              </div>
            )}
            {e.comision && !esPro && (
              <div>
                <div style={{ color: GRIS }}>Comisión</div>
                <div>{e.comision}</div>
              </div>
            )}
            {hermana && (
              <div>
                <div style={{ color: GRIS }}>Va con</div>
                <Link href={`/parlamentos-autonomicos/${hermana.slug}`}>{tituloLegible(hermana.titulo)}</Link>
              </div>
            )}
            {e.url && (
              <a href={e.url} target="_blank" rel="noreferrer">
                Ver en el parlamento ↗
              </a>
            )}
          </div>

          {esPro === false && (
            <div style={{ ...CARD, padding: '18px 20px' }}>
              <PanelBloqueado
                titulo="Quién decide y quién presenta esta ley"
                descripcion="La comisión competente, sus portavoces por grupo, quién la ha enmendado y quién comparece. Con la ficha de cada uno a un solo clic."
                filas={FILAS_CONGRESO}
              />
            </div>
          )}
          {esPro && actores && <QuienDecide e={e} actores={actores} />}

          {e.tipo_norm === 'acompanamiento' && (
            <div style={{ ...CARD, padding: '18px 20px', fontSize: 12.5, lineHeight: 1.5 }}>
              <div style={{ color: MORADO, fontWeight: 600, marginBottom: 6 }}>Leyes que modifica</div>
              {esPro === null ? null : esPro === false ? (
                <PanelBloqueado
                  titulo="Qué leyes cambia esta ley de acompañamiento"
                  descripcion="Cada ley que modifica, con su materia, para saber si toca la tuya."
                  filas={FILAS_LEYES}
                  forma="organo"
                />
              ) : leyes ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {leyes.map((l, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {l.ley}
                      {l.materia ? <span style={{ color: GRIS }}> · {l.materia}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: GRIS }}>Se completa cuando GovTalent lee el texto publicado del proyecto.</div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .ccaa-barra { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; row-gap: 12px !important; }
        }
      `}</style>
    </div>
  );
}
