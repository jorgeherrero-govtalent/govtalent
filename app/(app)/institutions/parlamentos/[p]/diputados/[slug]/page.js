'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import BuscarCorreo, { useCorreosEncontrados } from '@/components/BuscarCorreo';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';
import UpgradeModal from '@/components/UpgradeModal';
import { Vacio } from '@/components/ParlamentoAutonomico';
import { PARLAMENTOS_UI, base, useComposicion, colorGrupo, limpiarComision, fechaCorta, esComision } from '@/lib/ccaa/composicionUI';

/**
 * Ficha de un diputado autonómico. Copia de la del Congreso: cabecera con
 * foto, grupo y correo (este, solo con el Directorio y pedido al
 * servidor), y pestañas Resumen · Comisiones · Actividad. La Asamblea no
 * publica biografía; en su lugar va la actividad parlamentaria que sí
 * publica en la ficha (iniciativas por tipo y legislaturas).
 */

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'comisiones', label: 'Comisiones' },
  { id: 'actividad', label: 'Actividad' },
];

const TIPOS_ACTIVIDAD = [
  ['PNL', 'Proposiciones no de ley'],
  ['PCOP', 'Preguntas orales en Pleno'],
  ['PCOC', 'Preguntas orales en Comisión'],
  ['PE', 'Preguntas por escrito'],
  ['PI', 'Peticiones de información'],
  ['C', 'Comparecencias'],
  ['I', 'Interpelaciones'],
];

const LABEL = { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 13 };
const FILA = { display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '.5px solid #f0f0eb', textDecoration: 'none', color: 'inherit' };
const ICONO_VERDE = { width: 32, height: 32, borderRadius: 8, background: '#e8f4f0', color: '#1d6f5c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const ICONO_GRIS = { ...ICONO_VERDE, background: '#f4f4f0', color: '#999' };
const BARRA_CORREO = { display: 'inline-block', width: 74, height: 9, borderRadius: 3, background: 'linear-gradient(90deg, #e6e4f6, #efeef9)', verticalAlign: -1, marginRight: 4 };
const BOTON_ICONO = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 5, borderRadius: 6, border: 'none', background: 'transparent', color: '#a8a49c', cursor: 'pointer', flexShrink: 0 };

function iniciales(n) {
  return (n || '').split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
}

function lista(partes) {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

export default function DiputadoAutonomicoPage() {
  const { p, slug } = useParams();
  const cfg = PARLAMENTOS_UI[p];
  const { datos, error } = useComposicion(p);
  const [tab, setTab] = useState('resumen');
  const [upsell, setUpsell] = useState(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  // 'cargando' | 'ok' | 'sin-correo' | 'sin-plan'
  const [contacto, setContacto] = useState({ estado: 'cargando', email: null });

  const d = useMemo(() => datos?.diputados.find((x) => x.slug === slug) || null, [datos, slug]);
  const grupo = d ? datos.grupoPorId[d.grupo_id] : null;
  const idPro = d ? `ccaa-legislativo:${d.id}` : null;
  const { encontrados, probables, apuntar } = useCorreosEncontrados([idPro], contacto.estado === 'sin-correo' && !!idPro);

  useEffect(() => {
    if (!d) return;
    let vivo = true;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) {
        if (vivo) setContacto({ estado: 'sin-plan', email: null });
        return;
      }
      try {
        const res = await fetch(`/api/parlamentos-autonomicos/diputados/contacto?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (res.ok && json.email) setContacto({ estado: 'ok', email: json.email });
        else if (res.ok) setContacto({ estado: 'sin-correo', email: null });
        else setContacto({ estado: 'sin-plan', email: null });
      } catch {
        if (vivo) setContacto({ estado: 'sin-correo', email: null });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [d, slug]);

  if (!cfg) return <div className="sec"><Vacio texto="No tenemos este parlamento." /></div>;
  if (error) return <div className="sec"><Vacio icono="ti-alert-circle" texto="No se ha podido cargar la ficha. Inténtalo de nuevo en un momento." /></div>;
  if (!datos) return <div className="spinner"></div>;
  if (!d) {
    return (
      <div className="sec">
        <Vacio icono="ti-user-off" texto="No hemos encontrado a este diputado.">
          <div style={{ marginTop: 10 }}>
            <Link href={`${base(p)}/diputados`} className="btn-o" style={{ textDecoration: 'none' }}>
              Volver al directorio
            </Link>
          </div>
        </Vacio>
      </div>
    );
  }

  const cargos = (datos.porDiputado[d.id] || []).map((c) => ({ ...c, com: datos.comisionPorId[c.comision_id] })).filter((c) => c.com);
  const comisiones = cargos.filter((c) => esComision(c.com));
  const organos = cargos.filter((c) => c.com.tipo === 'organo');
  // Fuera de la cámara: Gobierno, Consejerías, Senado y consejos donde la
  // Asamblea designa vocales.
  const fuera = cargos.filter((c) => c.com.tipo === 'otro');
  const portavocias = comisiones.filter((c) => c.cargo_norm === 'portavoz');
  const resto = comisiones.filter((c) => c.cargo_norm !== 'portavoz');
  const enGrupo = (datos.delGrupo[d.grupo_id] || []).filter((c) => c.diputado_id === d.id);
  const actividad = d.datos?.actividad || {};
  const legislaturas = d.datos?.legislaturas || [];
  const groupName = grupo?.nombre || 'Sin grupo asignado';
  const diputadoA = d.sexo === 'M' ? 'Diputada' : d.sexo === 'H' ? 'Diputado' : 'Diputado/a';
  const desde = d.fecha_alta ? new Date(d.fecha_alta).getFullYear() : null;

  // La frase del perfil, de los datos: cargo en el grupo, portavocías,
  // comisiones e iniciativas. Sin nada, no hay bloque.
  const frase = (() => {
    const partes = [];
    const gob = fuera.find((c) => /^(gobierno|consejer)/i.test(c.com.nombre));
    if (gob) partes.push(/^gobierno$/i.test(gob.com.nombre) ? `Es ${gob.cargo} de la ${cfg.ccaa}` : `Es ${gob.cargo} de ${gob.com.nombre.replace(/^Consejer[ií]a de\s*/i, '')}`);
    const rol = organos.find((c) => /junta de portavoces/i.test(c.com.nombre) && (c.cargo_norm === 'portavoz' || c.cargo_norm === 'portavoz_adjunto'));
    if (rol) partes.push(`${partes.length ? 'es' : 'Es'} ${rol.cargo.charAt(0).toLowerCase() + rol.cargo.slice(1)} de su grupo`);
    const sen = fuera.find((c) => /^senado$/i.test(c.com.nombre));
    if (sen) partes.push(`${partes.length ? 'es' : 'Es'} ${sen.cargo.toLowerCase()} por designación de la ${cfg.nombre}`);
    const mesa = organos.find((c) => /^mesa/i.test(c.com.nombre));
    if (mesa) partes.push(`${partes.length ? 'forma' : 'Forma'} parte de la Mesa (${mesa.cargo})`);
    if (portavocias.length) partes.push(`${partes.length ? 'lleva' : 'Lleva'} la voz de su grupo en ${lista(portavocias.map((c) => limpiarComision(c.com.nombre)))}`);
    if (comisiones.length) partes.push(`${partes.length ? 'está' : 'Está'} en ${comisiones.length} ${comisiones.length === 1 ? 'comisión' : 'comisiones'}`);
    if (actividad.total > 0) partes.push(`${partes.length ? 'suma' : 'Suma'} ${actividad.total.toLocaleString('es-ES')} iniciativas en esta legislatura`);
    return partes.length ? `${lista(partes)}.` : null;
  })();

  const avatarStyle = { width: 70, height: 70, borderRadius: 12, flexShrink: 0, objectFit: 'cover', background: '#ece9e2' };

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref={`${base(p)}/diputados`} fallbackLabel="Diputados" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/comunidades" style={{ color: '#999', textDecoration: 'none' }}>
            Comunidades autónomas
          </Link>
          {' › '}
          <Link href={`${base(p)}/comisiones`} style={{ color: '#999', textDecoration: 'none' }}>
            {cfg.nombre}
          </Link>
          {' › '}
          <Link href={`${base(p)}/diputados`} style={{ color: '#999', textDecoration: 'none' }}>
            Diputados
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{d.nombre}</span>
        </span>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 200, flex: 1 }}>
            {d.foto_url && !photoFailed ? (
              <img src={d.foto_url} alt="" width={70} height={70} style={avatarStyle} onError={() => setPhotoFailed(true)} />
            ) : (
              <div style={{ ...avatarStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 700, color: '#8d8b83' }} aria-hidden="true">
                {iniciales(d.nombre)}
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.25 }}>{d.nombre}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: colorGrupo(grupo), flexShrink: 0 }}></span>
                {grupo ? (
                  <Link href={`${base(p)}/grupos/${grupo.slug}`} style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>
                    {groupName}
                  </Link>
                ) : (
                  <span style={{ fontSize: 12, color: '#555' }}>{groupName}</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>
                {diputadoA} de la {cfg.nombre} · {cfg.legislatura} Legislatura
                {desde ? ` · desde ${desde}` : ''}
              </div>

              {contacto.estado !== 'cargando' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, paddingTop: 11, borderTop: '.5px solid #f0f0eb', flexWrap: 'wrap' }}>
                  <i className="ti ti-mail" style={{ fontSize: 15, color: '#a8a49c' }} aria-hidden="true"></i>

                  {contacto.estado === 'ok' && (
                    <>
                      <a href={`mailto:${contacto.email}`} style={{ fontSize: 12.5, color: '#555', textDecoration: 'none' }}>
                        {contacto.email}
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(contacto.email);
                          toast('Correo copiado ✓');
                        }}
                        aria-label="Copiar el correo"
                        title="Copiar el correo"
                        style={BOTON_ICONO}
                      >
                        <i className="ti ti-copy" style={{ fontSize: 15 }} aria-hidden="true"></i>
                      </button>
                    </>
                  )}

                  {contacto.estado === 'sin-correo' && (
                    <BuscarCorreo
                      persona={{ id: idPro, nombre: d.nombre, cargo: `${diputadoA} de la ${cfg.nombre}` }}
                      encontrado={encontrados[idPro]}
                      probable={probables[idPro]}
                      onResultado={(r) => apuntar(idPro, r)}
                      alinear="left"
                    />
                  )}

                  {contacto.estado === 'sin-plan' && (
                    <>
                      <span style={BARRA_CORREO} aria-hidden="true"></span>
                      <span style={{ fontSize: 12.5, color: '#a8a79c' }}>{cfg.dominio}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setUpsell({
                            title: 'El correo de cada diputado',
                            message: `El correo institucional que publica la ${cfg.nombre}, en la ficha de cada diputado. Disponible con el Directorio.`,
                          })
                        }
                        className="btn-ai"
                        style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <i className="ti ti-bolt"></i> Ver planes
                      </button>
                    </>
                  )}

                  {d.twitter && (
                    <a
                      href={d.twitter.startsWith('http') ? d.twitter : `https://x.com/${d.twitter.replace(/^@/, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Perfil en X"
                      style={{ ...BOTON_ICONO, textDecoration: 'none' }}
                    >
                      <i className="ti ti-brand-x" style={{ fontSize: 15 }} aria-hidden="true"></i>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sin «Seguir» todavía: el motor de avisos solo vigila a los
              diputados del Congreso y prometer avisos que no llegan
              sería mentir. */}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {frase && (
            <div className="card" style={{ padding: 18 }}>
              <div style={LABEL}>Su terreno</div>
              <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.65 }}>{frase}</div>
            </div>
          )}

          {portavocias.length > 0 && (
            <div className="card" style={{ padding: 18 }}>
              <div style={LABEL}>Donde tiene voz</div>
              {portavocias.map((c) => (
                <Link key={c.id} href={`${base(p)}/comisiones/${c.com.slug}`} style={FILA}>
                  <span style={ICONO_VERDE}>
                    <i className="ti ti-microphone" style={{ fontSize: 15 }} aria-hidden="true"></i>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.com.nombre}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                      {[c.cargo, fechaCorta(c.fecha_inicio) ? `desde ${fechaCorta(c.fecha_inicio)}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
                </Link>
              ))}
              {resto.length > 0 && (
                <div style={{ fontSize: 11, color: '#888', paddingTop: 11 }}>
                  Y miembro de {resto.map((c) => limpiarComision(c.com.nombre)).join(', ')}.
                </div>
              )}
            </div>
          )}

          {(organos.length > 0 || enGrupo.length > 0 || fuera.length > 0) && (
            <div className="card" style={{ padding: 18 }}>
              <div style={LABEL}>Otros cargos</div>
              {enGrupo.map((c) => (
                <Link key={c.id} href={`${base(p)}/grupos/${grupo?.slug || ''}`} style={FILA}>
                  <span style={ICONO_VERDE}>
                    <i className="ti ti-flag" style={{ fontSize: 15 }} aria-hidden="true"></i>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.organo}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                      {[c.cargo, fechaCorta(c.fecha_inicio) ? `desde ${fechaCorta(c.fecha_inicio)}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
                </Link>
              ))}
              {organos.map((c) => (
                <Link key={c.id} href={`${base(p)}/organos-gobierno`} style={FILA}>
                  <span style={ICONO_GRIS}>
                    <i className="ti ti-gavel" style={{ fontSize: 15 }} aria-hidden="true"></i>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5 }}>{c.com.nombre}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                      {[c.cargo, fechaCorta(c.fecha_inicio) ? `desde ${fechaCorta(c.fecha_inicio)}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
                </Link>
              ))}
              {fuera.map((c) => (
                <div key={c.id} style={FILA}>
                  <span style={ICONO_GRIS}>
                    <i className={`ti ti-${/^(gobierno|consejer)/i.test(c.com.nombre) ? 'building-bank' : /^senado$/i.test(c.com.nombre) ? 'building-community' : 'users'}`} style={{ fontSize: 15 }} aria-hidden="true"></i>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5 }}>{c.com.nombre}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                      {[c.cargo, fechaCorta(c.fecha_inicio) ? `desde ${fechaCorta(c.fecha_inicio)}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!frase && portavocias.length === 0 && organos.length === 0 && fuera.length === 0 && (
            <Vacio icono="ti-file-off" texto="Aún no tenemos actividad parlamentaria registrada de este diputado." />
          )}
        </div>
      )}

      {tab === 'comisiones' && (
        <div className="card" style={{ padding: 18 }}>
          {comisiones.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-users-off"></i>
              No consta en ninguna comisión.
            </div>
          ) : (
            comisiones.map((c) => {
              const voz = c.cargo_norm === 'portavoz';
              const mesa = ['presidencia', 'vicepresidencia', 'secretaria'].includes(c.cargo_norm);
              return (
                <Link key={c.id} href={`${base(p)}/comisiones/${c.com.slug}`} style={FILA}>
                  <span style={voz ? ICONO_VERDE : ICONO_GRIS}>
                    <i className={`ti ti-${voz ? 'microphone' : mesa ? 'gavel' : 'users'}`} style={{ fontSize: 15 }} aria-hidden="true"></i>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: voz ? 600 : 400 }}>{c.com.nombre}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                      {[c.cargo, fechaCorta(c.fecha_inicio) ? `desde ${fechaCorta(c.fecha_inicio)}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
                </Link>
              );
            })
          )}
        </div>
      )}

      {tab === 'actividad' && (
        <div className="card" style={{ padding: 18 }}>
          {actividad.total > 0 ? (
            <>
              <div style={LABEL}>Actividad en la {cfg.legislatura} Legislatura · {actividad.total.toLocaleString('es-ES')} iniciativas</div>
              {TIPOS_ACTIVIDAD.filter(([k]) => actividad[k] > 0).map(([k, label]) => (
                <div key={k} style={{ ...FILA, padding: '8px 0' }}>
                  <div style={{ flex: 1, fontSize: 12.5, color: '#444' }}>{label}</div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1d6f5c' }}>{actividad[k].toLocaleString('es-ES')}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="empty-state">
              <i className="ti ti-file-off"></i>
              {d.ficha_leida_at ? 'No consta actividad en esta legislatura.' : 'Aún no hemos leído la actividad de este diputado.'}
            </div>
          )}
          {legislaturas.length > 0 && (
            <div style={{ fontSize: 11.5, color: '#888', paddingTop: 14 }}>
              {legislaturas.length === 1 ? 'Primera legislatura en la cámara' : `Legislaturas en la cámara: ${legislaturas.join(', ')}`}.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos de {cfg.fuente}. Última actualización: {fechaCorta(d.ficha_leida_at || d.fuente_fecha) || '—'}.{' '}
        {d.url_ficha && (
          <a href={d.url_ficha.replace('ctyp.asambleamadrid.es/es/web/guest', 'www.asambleamadrid.es')} target="_blank" rel="noreferrer" style={{ color: '#1d6f5c' }}>
            Ver su ficha oficial ↗
          </a>
        )}
      </div>

      {upsell && <UpgradeModal title={upsell.title} message={upsell.message} onClose={() => setUpsell(null)} />}
    </div>
  );
}
