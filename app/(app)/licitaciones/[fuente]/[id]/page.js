'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';
import {
  ADJUDICADAS,
  ANUNCIOS,
  EN_PLAZO,
  ESTADOS,
  PROCEDIMIENTOS,
  TIPOS,
  TRAMITACION,
  duracionTexto,
  etiquetaDe,
  sectorDe,
  territorio,
} from '@/lib/contratacion/etiquetas';
import { ahoraMadrid } from '@/lib/contratacion/consulta';

/**
 * Ficha de una licitación (11-11-2026), maqueta F1 del canvas con la
 * fila de cifras de la F2: el contenido a la izquierda (datos, lotes,
 * criterios, adjudicación, documentos y cronología) y a la derecha, fijo
 * al bajar, lo que sirve para actuar: plazo o vencimiento, Seguir, Quién
 * decide y lo que ha contratado antes ese órgano. En el móvil la columna
 * derecha va primero.
 *
 * Ruta: /licitaciones/<fuente>/<id de la fuente> (el id de la tabla es
 * «fuente:id»). Datos: contratacion_expedientes (datos = lo que lee
 * lib/contratacion/placsp.js para la ficha), contratacion_adjudicaciones
 * y, para Quién decide, age_units y government_officials por DIR3.
 */

const MORADO = '#6d5aef';
const GRIS = '#6e6a63';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function euros(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return null;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n));
}

function fecha(iso, conHora = false) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, a, me, d, h, mi] = m;
  const hora = conHora && h && !(h === '00' && mi === '00') ? `, ${h === '23' && mi === '59' ? '23:59' : `${h}:${mi}`}` : '';
  return `${Number(d)} ${MESES[Number(me) - 1]} ${a}${hora}`;
}

function mesAnio(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${MESES[Number(m[2]) - 1]} ${m[1]}` : null;
}

// Días entre hoy (Madrid) y una fecha AAAA-MM-DD.
function diasHasta(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const hoy = ahoraMadrid().slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(hoy[0], hoy[1] - 1, hoy[2])) / 864e5);
}

function iniciales(n) {
  const [ap, nom] = String(n || '').split(',').map((s) => s.trim());
  return `${(nom || '')[0] || ''}${(ap || '')[0] || ''}`.toUpperCase();
}

function Tarjeta({ titulo, children, estilo, extra }) {
  return (
    <section className="gt-fl-card" style={estilo}>
      {(titulo || extra) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          {titulo && <h2 className="gt-fl-h2">{titulo}</h2>}
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

function Dato({ k, v }) {
  if (v == null || v === '') return null;
  return (
    <div className="gt-fl-dato">
      <small>{k}</small>
      <span>{v}</span>
    </div>
  );
}

function Cifra({ k, v, s, destacada }) {
  return (
    <div className="gt-fl-cifra">
      <small>{k}</small>
      <b style={{ color: destacada ? MORADO : undefined }}>{v || '—'}</b>
      {s && <small>{s}</small>}
    </div>
  );
}

export default function FichaLicitacion() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const id = `${params?.fuente}:${decodeURIComponent(params?.id || '')}`;

  const [l, setL] = useState(undefined);
  const [adjs, setAdjs] = useState([]);
  const [quien, setQuien] = useState(null);
  const [historial, setHistorial] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [{ data }, { data: a }] = await Promise.all([
        supabase.from('contratacion_expedientes').select('*').eq('id', id).maybeSingle(),
        supabase.from('contratacion_adjudicaciones').select('*').eq('expediente_id', id).order('orden'),
      ]);
      if (!vivo) return;
      setL(data || null);
      setAdjs(a || []);
      if (!data) return;

      // Quién decide: la unidad del órgano en el Directorio (por DIR3) y
      // su titular; si la unidad no tiene titular, el de la superior.
      if (data.organo_dir3) {
        const { data: u } = await supabase
          .from('age_units')
          .select('dir3_code, nombre, raiz_nombre, superior_code')
          .eq('dir3_code', data.organo_dir3)
          .maybeSingle();
        let persona = null;
        if (u) {
          for (const code of [u.dir3_code, u.superior_code].filter(Boolean)) {
            const { data: os } = await supabase
              .from('government_officials')
              .select('full_name, role, slug, es_titular')
              .eq('dir3_code', code)
              .eq('active', true)
              .order('es_titular', { ascending: false })
              .limit(1);
            if (os?.[0]) {
              persona = os[0];
              break;
            }
          }
        }
        if (vivo) setQuien({ unidad: u, persona });
      }

      // Lo que ha adjudicado antes el mismo órgano.
      if (data.organo_nombre) {
        const [{ count }, { data: ganadas }] = await Promise.all([
          supabase
            .from('contratacion_expedientes')
            .select('id', { count: 'exact', head: true })
            .eq('organo_nombre', data.organo_nombre)
            .in('estado', ADJUDICADAS)
            .neq('id', id),
          supabase
            .from('contratacion_adjudicaciones')
            .select('adjudicatario, importe, contratacion_expedientes!inner(organo_nombre)')
            .eq('contratacion_expedientes.organo_nombre', data.organo_nombre)
            .eq('persona_fisica', false)
            .neq('expediente_id', id)
            .limit(1000),
        ]);
        if (!vivo) return;
        const porEmpresa = new Map();
        let total = 0;
        for (const g of ganadas || []) {
          if (!g.adjudicatario) continue;
          const k = g.adjudicatario.trim();
          porEmpresa.set(k, (porEmpresa.get(k) || 0) + 1);
          total += Number(g.importe) || 0;
        }
        setHistorial({
          contratos: count || 0,
          importe: total,
          empresas: [...porEmpresa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
        });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, id]);

  if (l === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 1240 }}>
        <div className="spinner"></div>
      </div>
    );
  }
  if (!l) {
    return (
      <div className="sec" style={{ maxWidth: 1240 }}>
        <BackLink fallbackHref="/licitaciones" fallbackLabel="Licitaciones" />
        <div className="card" style={{ marginTop: 14 }}>
          <div className="empty-state">
            <i className="ti ti-file-off"></i>
            <p>No encontramos esta licitación.</p>
          </div>
        </div>
      </div>
    );
  }

  const d = l.datos || {};
  const enPlazo = EN_PLAZO.includes(l.estado) && (!l.fin_ofertas || ahoraMadrid() <= String(l.fin_ofertas).slice(0, 19));
  const adjudicada = ADJUDICADAS.includes(l.estado) || adjs.length > 0;
  const presupuesto = euros(l.importe_sin_iva ?? l.valor_estimado);
  const duracion = duracionTexto(d.duracion);
  const diasPlazo = diasHasta(l.fin_ofertas);
  const diasFin = diasHasta(l.fin_contrato);
  const fuenteNombre = l.fuente === 'ted' ? 'TED' : 'la Plataforma';
  const ref = l.expediente || (l.fuente === 'ted' ? `TED ${l.id_fuente || ''}` : null);
  const lugar = [d.contacto?.ciudad, territorio(l.nuts)].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
  const cpvs = (l.cpv || []).slice(0, 6);
  const importeAdjudicado = adjs.reduce((s, a) => s + (Number(a.importe) || 0), 0);
  const ofertas = adjs.map((a) => a.ofertas).filter((x) => x != null);
  const criterios = (d.criterios || []).filter((c) => c.peso != null || c.descripcion);
  const pesoTotal = criterios.reduce((s, c) => s + (Number(c.peso) || 0), 0) || 100;

  const documentos = [...(d.documentos || [])];
  if (l.fuente === 'ted' && d.pdf) documentos.push({ tipo: 'otro', nombre: 'Anuncio en TED (PDF)', url: d.pdf });

  const cronologia = [...(l.anuncios || [])]
    .filter((a) => a.fecha)
    .map((a) => ({ fecha: a.fecha.slice(0, 10), texto: ANUNCIOS[a.tipo] || (l.fuente === 'ted' ? 'Anuncio en TED' : 'Anuncio'), medio: a.medio }))
    .filter((x, i, arr) => arr.findIndex((y) => y.fecha === x.fecha && y.texto === x.texto) === i)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (enPlazo && l.fin_ofertas) cronologia.push({ fecha: l.fin_ofertas.slice(0, 10), texto: 'Fin de presentación de ofertas', futura: true });

  // Las tres cifras de arriba cambian si ya está adjudicada.
  const cifras = adjudicada
    ? [
        { k: 'Adjudicado por', v: euros(importeAdjudicado) || presupuesto, s: presupuesto && importeAdjudicado ? `Presupuesto ${presupuesto}` : null },
        { k: 'Ofertas recibidas', v: ofertas.length ? String(Math.max(...ofertas)) : null, s: adjs.length > 1 ? `${adjs.length} lotes` : null },
        {
          k: 'Fin del contrato',
          v: mesAnio(l.fin_contrato),
          s: l.fin_contrato ? (diasFin < 0 ? 'Ya ha terminado' : 'Sin contar prórrogas') : duracion,
          destacada: diasFin != null && diasFin >= 0 && diasFin < 365,
        },
      ]
    : [
        {
          k: 'Fin de presentación',
          v: enPlazo && diasPlazo != null ? (diasPlazo <= 0 ? 'Termina hoy' : diasPlazo === 1 ? 'Queda 1 día' : `Quedan ${diasPlazo} días`) : fecha(l.fin_ofertas) || 'Sin fecha',
          s: fecha(l.fin_ofertas, true),
          destacada: enPlazo,
        },
        { k: 'Presupuesto sin IVA', v: presupuesto, s: l.valor_estimado && euros(l.valor_estimado) !== presupuesto ? `Valor estimado ${euros(l.valor_estimado)}` : null },
        { k: 'Duración', v: duracion, s: d.prorrogas ? 'Con prórrogas' : null },
      ];

  return (
    <div className="sec gt-fl" style={{ maxWidth: 1240 }}>
      <style>{ESTILOS}</style>
      <BackLink fallbackHref="/licitaciones" fallbackLabel="Licitaciones" />

      <header className="gt-fl-cab">
        <div className="gt-fl-tags">
          {ESTADOS[l.estado] && <span className={`gt-fl-estado${enPlazo ? ' on' : ''}`}>{enPlazo ? 'En plazo' : ESTADOS[l.estado]}</span>}
          {ref && <span className="gt-fl-ref">{ref}</span>}
          {l.ambito === 'ue' && <span className="gt-fl-tag">Institución de la UE</span>}
          {l.es_menor && <span className="gt-fl-tag">Contrato menor</span>}
          <span style={{ fontSize: 12.5, color: GRIS }}>
            {[etiquetaDe(TIPOS, l.tipo), etiquetaDe(PROCEDIMIENTOS, l.procedimiento) && `procedimiento ${etiquetaDe(PROCEDIMIENTOS, l.procedimiento).toLowerCase()}`]
              .filter(Boolean)
              .join(', ')}
          </span>
        </div>
        <h1 className="gt-fl-h1">{l.titulo || 'Sin título'}</h1>
        <span style={{ fontSize: 14, color: '#3d3a35' }}>{l.organo_nombre}</span>
      </header>

      <div className="gt-fl-cifras">
        {cifras.map((c) => (
          <Cifra key={c.k} {...c} />
        ))}
      </div>

      <div className="gt-fl-cuerpo">
        <div className="gt-fl-main">
          <Tarjeta titulo="Datos del contrato">
            <div className="gt-fl-grid">
              <Dato k="Presupuesto sin IVA" v={presupuesto} />
              <Dato k="Valor estimado" v={euros(l.valor_estimado)} />
              <Dato k="Importe con IVA" v={euros(l.importe_total)} />
              <Dato k="Duración" v={duracion} />
              <Dato k="Tipo de contrato" v={etiquetaDe(TIPOS, l.tipo)} />
              <Dato k="Procedimiento" v={etiquetaDe(PROCEDIMIENTOS, l.procedimiento)} />
              <Dato k="Tramitación" v={TRAMITACION[d.urgencia]} />
              <Dato k="Lugar de ejecución" v={lugar || null} />
              <Dato k="Fondos europeos" v={d.fondos_ue && !/^no hay/i.test(d.fondos_ue) ? d.fondos_ue : null} />
              <Dato k="Regulación armonizada" v={d.sara ? 'Sí (sujeto a la directiva europea)' : null} />
            </div>
            {d.prorrogas && (
              <div className="gt-fl-nota">
                <small>Prórrogas</small>
                <span>{d.prorrogas}</span>
              </div>
            )}
            {cpvs.length > 0 && (
              <div className="gt-fl-nota">
                <small>Sector (CPV)</small>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {cpvs.map((c) => (
                    <span key={c} className="gt-fl-cpv" title={sectorDe(c) || undefined}>
                      {c}
                      {sectorDe(c) ? ` ${sectorDe(c)}` : ''}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </Tarjeta>

          {(d.lotes || []).length > 0 && (
            <Tarjeta titulo={`Lotes (${d.lotes.length})`}>
              <div className="gt-fl-tabla-caja">
                <table className="gt-fl-tabla">
                  <tbody>
                    {d.lotes.map((lo) => (
                      <tr key={lo.id || lo.objeto}>
                        <td style={{ width: 44, color: GRIS }}>{lo.id}</td>
                        <td>{lo.objeto}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{euros(lo.importe) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}

          {adjs.length > 0 && (
            <Tarjeta titulo="Adjudicación">
              <div className="gt-fl-tabla-caja">
                <table className="gt-fl-tabla">
                  <thead>
                    <tr>
                      {adjs.length > 1 && <th style={{ width: 44 }}>Lote</th>}
                      <th>Adjudicataria</th>
                      <th>Ofertas</th>
                      <th>Fecha</th>
                      <th style={{ textAlign: 'right' }}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjs.map((a) => (
                      <tr key={a.id}>
                        {adjs.length > 1 && <td style={{ color: GRIS }}>{a.orden}</td>}
                        <td>{a.persona_fisica ? 'Persona física' : a.adjudicatario || '—'}</td>
                        <td>{a.ofertas ?? '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fecha(a.fecha) || '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{euros(a.importe) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {presupuesto && importeAdjudicado > 0 && Number(l.importe_sin_iva) > importeAdjudicado && (
                <small style={{ color: GRIS }}>
                  Baja sobre el presupuesto: {Math.round((1 - importeAdjudicado / Number(l.importe_sin_iva)) * 100)} %.
                </small>
              )}
            </Tarjeta>
          )}

          {criterios.length > 0 && (
            <Tarjeta titulo="Criterios de adjudicación">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {criterios.map((c, i) => (
                  <div key={i} className="gt-fl-criterio">
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {c.descripcion || (c.tipo === 'SUBJ' ? 'Criterio de juicio de valor' : 'Criterio automático')}
                      <small style={{ display: 'block', color: GRIS }}>{c.tipo === 'SUBJ' ? 'Juicio de valor' : 'Fórmula'}</small>
                    </span>
                    {c.peso != null && (
                      <>
                        <span className="gt-fl-barra" aria-hidden="true">
                          <span style={{ width: `${Math.min(100, (Number(c.peso) / pesoTotal) * 100)}%` }} />
                        </span>
                        <b style={{ width: 40, textAlign: 'right' }}>{Number(c.peso).toLocaleString('es-ES')}</b>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Tarjeta>
          )}

          {documentos.length > 0 && (
            <Tarjeta titulo="Documentos">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {documentos.map((doc, i) => (
                  <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" className="gt-fl-doc">
                    <span className="gt-fl-doc-ic">{(String(doc.nombre || '').match(/\.(\w{2,4})$/)?.[1] || 'DOC').toUpperCase().slice(0, 4)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {doc.tipo === 'administrativo'
                        ? 'Pliego de cláusulas administrativas'
                        : doc.tipo === 'tecnico'
                          ? 'Pliego de prescripciones técnicas'
                          : doc.nombre?.replace(/\.\w{2,4}$/, '') || 'Documento'}
                      {doc.tipo !== 'otro' && doc.nombre && <small style={{ display: 'block', color: GRIS }}>{doc.nombre}</small>}
                    </span>
                    <i className="ti ti-external-link" style={{ color: GRIS }} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </Tarjeta>
          )}

          {cronologia.length > 0 && (
            <Tarjeta titulo="Cronología">
              <div>
                {cronologia.map((c, i) => (
                  <div key={i} className="gt-fl-hito">
                    <span className="gt-fl-hito-linea">
                      <span className={`gt-fl-punto${c.futura ? ' futuro' : ''}`} />
                      {i < cronologia.length - 1 && <span className="gt-fl-raya" />}
                    </span>
                    <span style={{ paddingBottom: 12 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{c.texto}</span>
                      <small style={{ display: 'block', color: GRIS }}>
                        {fecha(c.fecha)}
                        {c.medio && c.medio !== 'Perfil del contratante' ? `, ${c.medio}` : ''}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </Tarjeta>
          )}
        </div>

        <aside className="gt-fl-lado">
          {adjudicada && l.fin_contrato ? (
            <Tarjeta titulo={diasFin != null && diasFin < 0 ? 'El contrato terminó' : 'El contrato vence'}>
              <b className="gt-fl-grande">{mesAnio(l.fin_contrato)}</b>
              <span style={{ fontSize: 13, color: '#3d3a35', lineHeight: 1.5 }}>
                {[l.fecha_formalizacion && `Formalizado el ${fecha(l.fecha_formalizacion)}`, duracion].filter(Boolean).join(', ')}.
                {d.prorrogas ? ' Puede prorrogarse.' : ''}
                {diasFin != null && diasFin >= 0 && (
                  <b style={{ color: MORADO, display: 'block', marginTop: 4 }}>Lo normal es que se vuelva a licitar unos meses antes.</b>
                )}
              </span>
            </Tarjeta>
          ) : (
            l.fin_ofertas && (
              <Tarjeta titulo="Fin de presentación">
                <b className="gt-fl-grande">{fecha(l.fin_ofertas)}</b>
                <span style={{ fontSize: 13, color: '#3d3a35' }}>
                  {fecha(l.fin_ofertas, true)?.split(', ')[1] ? `a las ${fecha(l.fin_ofertas, true).split(', ')[1]}` : ''}
                  {enPlazo && diasPlazo != null && (
                    <b style={{ color: MORADO }}>
                      {' '}
                      {diasPlazo <= 0 ? 'termina hoy' : diasPlazo === 1 ? 'queda 1 día' : `quedan ${diasPlazo} días`}
                    </b>
                  )}
                  {!enPlazo && ' (plazo cerrado)'}
                </span>
              </Tarjeta>
            )
          )}

          <div className="gt-fl-acciones">
            <FollowButton kind="licitacion" refId={l.id} label={(l.titulo || '').slice(0, 300)} />
            {l.url && (
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="gt-fl-sec">
                Ver en {fuenteNombre}
              </a>
            )}
          </div>

          <Tarjeta titulo="Quién decide" estilo={{ borderColor: '#ddd8fc', background: '#fdfcff' }}>
            {quien?.persona ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="gt-fl-avatar">{iniciales(quien.persona.full_name)}</span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>{quien.persona.full_name}</b>
                  {quien.persona.role && <span style={{ fontSize: 13 }}>{quien.persona.role}</span>}
                  {quien.unidad?.nombre && <small style={{ color: GRIS }}>{quien.unidad.nombre}</small>}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: 13, color: '#55524c', lineHeight: 1.5 }}>
                {quien?.unidad
                  ? `Aún no tenemos el titular de ${quien.unidad.nombre} en el Directorio.`
                  : 'Aún no tenemos este órgano en el Directorio. Estos son sus datos de contacto en la Plataforma.'}
              </span>
            )}
            <div className="gt-fl-contacto">
              <span>
                <small>Órgano de contratación</small>
                {l.organo_nombre}
              </span>
              {d.contacto?.email && (
                <span>
                  <small>Correo</small>
                  <a href={`mailto:${d.contacto.email}`}>{d.contacto.email}</a>
                </span>
              )}
              {d.contacto?.telefono && (
                <span>
                  <small>Teléfono</small>
                  {d.contacto.telefono}
                </span>
              )}
              {d.perfil && (
                <a href={d.perfil} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                  Perfil del contratante
                </a>
              )}
            </div>
            {quien?.unidad && (
              <Link href={`/institutions/organismos/${quien.unidad.dir3_code}`} style={{ fontSize: 13, color: '#1a1a18' }}>
                Ver la institución y su organigrama
              </Link>
            )}
          </Tarjeta>

          {historial && historial.contratos > 0 && (
            <Tarjeta titulo="Este órgano ha adjudicado">
              <span style={{ fontSize: 13, color: '#3d3a35', lineHeight: 1.5 }}>
                {historial.contratos.toLocaleString('es-ES')} {historial.contratos === 1 ? 'contrato' : 'contratos'} más
                {historial.importe > 0 ? ` por ${euros(historial.importe)}` : ''}.
                {historial.empresas.length > 0 && ' Los ganaron sobre todo:'}
              </span>
              {historial.empresas.length > 0 && (
                <ul className="gt-fl-empresas">
                  {historial.empresas.map(([e, n]) => (
                    <li key={e}>
                      <span>{e}</span>
                      <small>{n}</small>
                    </li>
                  ))}
                </ul>
              )}
              <small style={{ color: GRIS }}>Con los datos cargados desde 2023.</small>
            </Tarjeta>
          )}
        </aside>
      </div>
    </div>
  );
}

const ESTILOS = `
.gt-fl-cab { display: flex; flex-direction: column; gap: 8px; margin: 14px 0 16px; }
.gt-fl-tags { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.gt-fl-estado { font-size: 12px; font-weight: 600; color: #55524c; background: #f1f0eb; border-radius: 6px; padding: 2px 9px; }
.gt-fl-estado.on { color: ${MORADO}; background: #f3f1fe; }
.gt-fl-ref { font-size: 11.5px; background: #f7f6f2; border: 1px solid #e5e4de; border-radius: 6px; padding: 1px 7px; font-family: ui-monospace, monospace; color: #55524c; }
.gt-fl-tag { font-size: 11.5px; border: 1px solid #e5e4de; border-radius: 6px; padding: 1px 7px; color: #55524c; }
.gt-fl-h1 { font-size: 22px; line-height: 1.3; margin: 0; letter-spacing: -.3px; font-weight: 600; max-width: 920px; }
.gt-fl-cifras { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
.gt-fl-cifra { background: #fff; border: 1px solid #e5e4de; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; }
.gt-fl-cifra small { color: ${GRIS}; font-size: 12px; }
.gt-fl-cifra b { font-size: 20px; letter-spacing: -.3px; }
.gt-fl-cuerpo { display: flex; gap: 18px; align-items: flex-start; }
.gt-fl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.gt-fl-lado { width: 340px; flex: 0 0 340px; display: flex; flex-direction: column; gap: 14px; position: sticky; top: 16px; }
.gt-fl-card { background: #fff; border: 1px solid #e5e4de; border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.gt-fl-h2 { font-size: 14.5px; font-weight: 600; margin: 0; }
.gt-fl-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 18px; }
.gt-fl-dato { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gt-fl-dato small, .gt-fl-nota small, .gt-fl-contacto small { color: ${GRIS}; font-size: 12px; display: block; }
.gt-fl-dato span { font-size: 13.5px; font-weight: 500; overflow-wrap: anywhere; }
.gt-fl-nota { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #efeee8; padding-top: 10px; font-size: 13.5px; line-height: 1.5; }
.gt-fl-cpv { font-size: 12.5px; background: #f7f6f2; border: 1px solid #ecebe5; border-radius: 6px; padding: 2px 8px; }
.gt-fl-tabla-caja { overflow-x: auto; }
.gt-fl-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
.gt-fl-tabla th { text-align: left; font-weight: 600; font-size: 12px; color: ${GRIS}; padding: 6px 8px 6px 0; }
.gt-fl-tabla td { padding: 8px 8px 8px 0; border-top: 1px solid #efeee8; vertical-align: top; }
.gt-fl-criterio { display: flex; gap: 12px; align-items: center; font-size: 13.5px; }
.gt-fl-barra { width: 140px; height: 6px; border-radius: 3px; background: #ecebe5; flex-shrink: 0; }
.gt-fl-barra span { display: block; height: 100%; border-radius: 3px; background: ${MORADO}; }
.gt-fl-doc { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid #ecebe5; border-radius: 9px; text-decoration: none; color: #1a1a18; font-size: 13.5px; }
.gt-fl-doc:hover { border-color: #c9c7bd; }
.gt-fl-doc-ic { width: 34px; height: 30px; border-radius: 7px; background: #f7f6f2; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #55524c; flex-shrink: 0; }
.gt-fl-hito { display: flex; gap: 12px; }
.gt-fl-hito-linea { display: flex; flex-direction: column; align-items: center; }
.gt-fl-punto { width: 10px; height: 10px; border-radius: 50%; background: ${MORADO}; margin-top: 4px; flex-shrink: 0; }
.gt-fl-punto.futuro { background: #fff; border: 2px solid #d6d4cc; box-sizing: border-box; }
.gt-fl-raya { flex: 1; width: 2px; background: #ecebe5; margin: 3px 0; }
.gt-fl-grande { font-size: 24px; letter-spacing: -.5px; }
.gt-fl-acciones { display: flex; gap: 8px; flex-wrap: wrap; }
.gt-fl-sec { display: inline-flex; align-items: center; font-size: 13.5px; text-decoration: none; color: #55524c; background: #fff; border: 1px solid #dcdbd4; border-radius: 9px; padding: 7px 14px; }
.gt-fl-sec:hover { border-color: #c9c7bd; color: #1a1a18; }
.gt-fl-avatar { width: 44px; height: 44px; border-radius: 50%; background: #e6e4dc; color: #55524c; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; flex-shrink: 0; }
.gt-fl-contacto { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #efeee8; padding-top: 10px; font-size: 13px; overflow-wrap: anywhere; }
.gt-fl-contacto a { color: #1a1a18; }
.gt-fl-empresas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.gt-fl-empresas li { display: flex; justify-content: space-between; gap: 10px; }
.gt-fl-empresas small { color: ${GRIS}; white-space: nowrap; }
@media (max-width: 960px) {
  .gt-fl-cuerpo { flex-direction: column-reverse; }
  .gt-fl-lado { width: 100%; flex: none; position: static; }
  .gt-fl-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .gt-fl-cifras { grid-template-columns: 1fr; }
}
`;
