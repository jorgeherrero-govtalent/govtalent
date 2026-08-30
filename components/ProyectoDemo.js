'use client';

import Link from 'next/link';
import ActorAvatar, { esOrganizacion } from '@/components/ActorAvatar';

/**
 * El proyecto de ejemplo que ve quien todavía no tiene Pro.
 *
 * No es un mapa: es el puesto de trabajo entero. La norma con su
 * tramitación, el mapa de actores, el briefing de uno de ellos, la
 * agenda con sus plazos, los documentos y las notas. Estático — no se
 * arrastra, no se añade y no se abre nada — pero completo, porque lo que
 * se vende es el conjunto.
 *
 * SOBRE LOS DATOS: los actores son genéricos por tipo, no entidades
 * reales posicionadas. Cuando cerremos el ejemplo sobre una ley ya
 * tramitada con posiciones públicas, se sustituye DEMO y nada más.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const CARD = { background: '#fff', border: `.5px solid ${BORDE}`, borderRadius: 10 };
const ETIQUETA = { fontSize: 11, color: '#888', letterSpacing: '.3px' };

const DEMO = {
  norma: {
    titulo: 'Ley de gobernanza de la inteligencia artificial',
    organo: 'Congreso · Comisión de Economía, Comercio y Transformación Digital',
    fases: [
      { nombre: 'Presentación', cuando: '12 feb', estado: 'hecha' },
      { nombre: 'Toma en consideración', cuando: '28 feb', estado: 'hecha' },
      { nombre: 'Enmiendas', cuando: 'Quedan 13 días', estado: 'actual' },
      { nombre: 'Ponencia', cuando: '—', estado: 'futura' },
      { nombre: 'Senado', cuando: '—', estado: 'futura' },
    ],
  },
  actores: [
    { id: 'a1', kind: 'cargo', ref_id: 'sec-estado', nombre: 'Secretaría de Estado', descripcion: 'Digitalización e IA', posicion: 48, influencia: 84, relacion: 'en_curso' },
    { id: 'a2', kind: 'diputado', ref_id: 'ponente', nombre: 'Ponente', descripcion: 'Grupo proponente', posicion: 76, influencia: 76, relacion: 'en_curso' },
    { id: 'a3', kind: 'organizacion', ref_id: 'asoc-cons', nombre: 'Asoc. consumidores', descripcion: 'Contraparte', posicion: 18, influencia: 68, relacion: 'sin_contactar' },
    { id: 'a4', kind: 'comision', ref_id: 'comision-eco', nombre: 'Comisión parlamentaria', descripcion: 'Órgano competente', posicion: 42, influencia: 58, relacion: 'sin_contactar' },
    { id: 'a5', kind: 'organizacion', ref_id: 'patronal-tec', nombre: 'Patronal tecnológica', descripcion: 'Sector afectado', posicion: 84, influencia: 38, relacion: 'en_curso' },
    { id: 'a6', kind: 'cargo', ref_id: 'subdir', nombre: 'Subdirección general', descripcion: 'Ministerio', posicion: 30, influencia: 22, relacion: 'sin_contactar' },
  ],
  agenda: [
    { dia: '26', mes: 'feb', titulo: 'Enviar posición técnica a la Secretaría', pie: 'Con recordatorio · 2 días antes' },
    { dia: '03', mes: 'mar', titulo: 'Reunión con la ponencia', pie: 'Pendiente de confirmar' },
    { dia: '14', mes: 'mar', titulo: 'Cierre de enmiendas', pie: 'Del calendario de la norma', oficial: true },
  ],
  // El registro que exige el RDL 21/2026: una ya cerrada con su acta y
  // otra a medias, que es como se ve en cuanto se empieza a usar.
  registro: [
    {
      titulo: 'Reunión · Secretaría de Estado de Digitalización',
      pie: '26 feb · Ley de gobernanza de la IA',
      cerrada: true,
    },
    {
      titulo: 'Entrega de documentación · Ponencia',
      pie: '03 mar · falta qué se trató',
      cerrada: false,
    },
  ],
  documentos: [
    { nombre: 'posicion-interna-v3.pdf', cuando: 'hace 3 d' },
    { nombre: 'enmiendas-propuestas.docx', cuando: 'ayer' },
  ],
};

// Los cuadrantes con nombre son lo que convierte la matriz en una
// herramienta: no describen dónde está cada uno, dicen qué hacer con él.
function cuadranteDe(a) {
  const alta = a.influencia > 50;
  if (a.posicion >= 40 && a.posicion <= 60) return alta ? 'convencer' : 'vigilar';
  if (a.posicion > 60) return alta ? 'apoyarse' : 'informar';
  return alta ? 'bloquear' : 'vigilar';
}

function cuenta(clave) {
  return DEMO.actores.filter((a) => cuadranteDe(a) === clave).length;
}

export default function ProyectoDemo() {
  return (
    <div>
      {/* --- Cabecera con las acciones a la vista --- */}
      <div style={{ ...CARD, padding: '16px 18px', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35 }}>{DEMO.norma.titulo}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{DEMO.norma.organo}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ fontSize: 11.5, border: `1px solid ${MORADO}`, color: MORADO, borderRadius: 8, padding: '5px 11px' }}>
              <i className="ti ti-plus" style={{ fontSize: 12, verticalAlign: -1, marginRight: 3 }}></i>Actor
            </span>
            {['Documento', 'Recordatorio', 'Nota'].map((t) => (
              <span key={t} style={{ fontSize: 11.5, border: `.5px solid ${BORDE}`, color: '#555', borderRadius: 8, padding: '5px 11px' }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* --- La norma y su tramitación --- */}
      <div id="norma" style={{ ...CARD, padding: '15px 18px', marginBottom: 10, scrollMarginTop: 72 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 13, flexWrap: 'wrap' }}>
          <span style={ETIQUETA}>LA NORMA Y SU TRAMITACIÓN</span>
          <span style={{ fontSize: 11.5, color: MORADO }}>Ver ficha completa →</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {DEMO.norma.fases.map((f) => (
            <div key={f.nombre} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  marginBottom: 7,
                  background: f.estado === 'futura' ? BORDE : MORADO,
                }}
              ></div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: f.estado === 'futura' ? 400 : 600,
                  color: f.estado === 'futura' ? '#a8a49c' : f.estado === 'actual' ? MORADO : '#1a1a18',
                  lineHeight: 1.3,
                }}
              >
                {f.nombre}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  marginTop: 2,
                  color: f.estado === 'futura' ? '#a8a49c' : '#888',
                  fontWeight: f.estado === 'actual' ? 600 : 400,
                }}
              >
                {f.cuando}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- El mapa --- */}
      <div id="mapa" style={{ ...CARD, padding: '15px 18px', marginBottom: 10, scrollMarginTop: 72 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={ETIQUETA}>MAPA DE ACTORES</span>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, background: '#f0eefe', color: MORADO, borderRadius: 20, padding: '3px 10px' }}>
              Todos {DEMO.actores.length}
            </span>
            <span style={{ fontSize: 11, border: `.5px solid ${BORDE}`, color: '#555', borderRadius: 20, padding: '3px 10px' }}>
              Sin contactar {DEMO.actores.filter((a) => a.relacion === 'sin_contactar').length}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: '#a8a49c', letterSpacing: '.4px', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              INFLUENCIA
            </span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ position: 'relative', height: 310, background: '#fdfdfb', border: `.5px solid #ece9e2`, borderRadius: 8, overflow: 'hidden' }}>
              {/* Rejilla de BI: cuartiles suaves y ejes marcados */}
              {['25%', '75%'].map((t) => (
                <div key={t} style={{ position: 'absolute', left: 0, right: 0, top: t, borderTop: '.5px solid #f2f0ec' }}></div>
              ))}
              {['25%', '75%'].map((l) => (
                <div key={l} style={{ position: 'absolute', top: 0, bottom: 0, left: l, borderLeft: '.5px solid #f2f0ec' }}></div>
              ))}
              <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: `.5px solid ${BORDE}` }}></div>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: `.5px solid ${BORDE}` }}></div>
              <div style={{ position: 'absolute', left: '32%', right: '25%', top: 0, bottom: '50%', background: '#f6f5fe' }}></div>

              <div style={{ position: 'absolute', left: 9, top: 7, fontSize: 9.5, color: '#b8b4ac', letterSpacing: '.4px' }}>
                BLOQUEAR · {cuenta('bloquear')}
              </div>
              <div style={{ position: 'absolute', left: '33%', top: 7, fontSize: 9.5, color: MORADO, letterSpacing: '.4px' }}>
                CONVENCER · {cuenta('convencer')}
              </div>
              <div style={{ position: 'absolute', right: 9, top: 7, fontSize: 9.5, color: '#b8b4ac', letterSpacing: '.4px' }}>
                {cuenta('apoyarse')} · APOYARSE
              </div>
              <div style={{ position: 'absolute', left: 9, bottom: 7, fontSize: 9.5, color: '#b8b4ac', letterSpacing: '.4px' }}>
                VIGILAR · {cuenta('vigilar')}
              </div>
              <div style={{ position: 'absolute', right: 9, bottom: 7, fontSize: 9.5, color: '#b8b4ac', letterSpacing: '.4px' }}>
                {cuenta('informar')} · INFORMAR
              </div>

              {DEMO.actores.map((a) => {
                const iniciada = a.relacion !== 'sin_contactar';
                const org = esOrganizacion(a);
                const prioritario = cuadranteDe(a) === 'convencer';
                return (
                  <div
                    key={a.id}
                    style={{
                      position: 'absolute',
                      left: `${a.posicion}%`,
                      top: `${100 - a.influencia}%`,
                      transform: 'translate(-50%, -50%)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      background: '#fff',
                      border: `${iniciada ? '.5px solid' : '.5px dashed'} #b8b4ac`,
                      borderRadius: org ? 9 : 22,
                      padding: '4px 11px 4px 4px',
                      whiteSpace: 'nowrap',
                      maxWidth: '46%',
                      boxShadow: prioritario ? '0 1px 4px rgba(0,0,0,.07)' : 'none',
                      borderColor: prioritario ? MORADO : '#b8b4ac',
                      borderWidth: prioritario ? 1 : undefined,
                    }}
                  >
                    <ActorAvatar actor={a} size={26} atenuado={!iniciada} fondo={prioritario ? '#eeedfe' : '#f0f0eb'} />
                    <span style={{ minWidth: 0, overflow: 'hidden' }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11.5,
                          fontWeight: 600,
                          lineHeight: 1.25,
                          color: iniciada ? '#1a1a18' : '#555',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {a.nombre}
                      </span>
                      <span style={{ display: 'block', fontSize: 10, color: '#888' }}>{a.descripcion}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#a8a49c', letterSpacing: '.4px' }}>
              <span>EN CONTRA</span>
              <span>NEUTRAL</span>
              <span>A FAVOR</span>
            </div>
          </div>
        </div>
      </div>

      {/* --- Briefing y agenda --- */}
      <div id="briefing" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 10, marginBottom: 10, scrollMarginTop: 72 }}>
        <div style={{ ...CARD, padding: '15px 18px' }}>
          <div style={{ ...ETIQUETA, marginBottom: 12 }}>BRIEFING DEL ACTOR</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <ActorAvatar actor={DEMO.actores[0]} size={34} fondo="#eeedfe" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{DEMO.actores[0].nombre}</div>
              <div style={{ fontSize: 11, color: '#888' }}>Decisor · relación iniciada</div>
            </div>
          </div>

          {/* Primero lo que defienden ELLOS, después lo nuestro: es el
              orden con el que se prepara una reunión. */}
          <div style={{ ...ETIQUETA, marginBottom: 5 }}>SU POSICIÓN</div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6, marginBottom: 11 }}>
            Abierta al régimen simplificado, condicionada a datos de impacto en pymes.{' '}
            <span style={{ color: MORADO }}>Comparecencia · 14 feb</span>
          </div>
          <div style={{ ...ETIQUETA, marginBottom: 5 }}>NUESTROS ARGUMENTOS</div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6 }}>
            Coste de cumplimiento para empresas de menos de 50 empleados.
          </div>
          {/* Las notas van pegadas al actor, no sueltas en el proyecto:
              es lo que convierte el briefing en memoria. */}
          <div style={{ borderTop: `.5px solid ${BORDE}`, marginTop: 12, paddingTop: 11 }}>
            <div style={{ ...ETIQUETA, marginBottom: 8 }}>NOTAS SOBRE ESTE ACTOR</div>
            <div style={{ display: 'flex', gap: 9, marginBottom: 10 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#f0f0eb', color: '#7a736b', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                MR
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#555', lineHeight: 1.55 }}>
                  En la comparecencia dejó la puerta abierta al umbral de 50 empleados.
                </div>
                <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>hace 6 días</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `.5px solid ${BORDE}`, borderRadius: 9, padding: '8px 11px', background: '#fafaf7' }}>
              <i className="ti ti-message-plus" style={{ fontSize: 14, color: '#a8a49c' }}></i>
              <span style={{ fontSize: 12, color: '#a8a49c' }}>Añade una nota o menciona con @</span>
            </div>
          </div>
        </div>

        {/* El registro va antes que la agenda y con distintivo: es lo
            único de la demo que responde a una obligación legal, y lo que
            distingue a GovTalent de una herramienta de proyectos. */}
        <div id="registro" style={{ ...CARD, padding: '15px 18px', scrollMarginTop: 72 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={ETIQUETA}>REGISTRO</span>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  letterSpacing: '.3px',
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: '#f0eefe',
                  color: MORADO,
                }}
              >
                NUEVO
              </span>
            </span>
            <span style={{ fontSize: 11.5, color: MORADO }}>+ Registrar</span>
          </div>
          <p style={{ fontSize: 11.5, color: '#888', margin: '0 0 12px', lineHeight: 1.5 }}>
            Cada reunión, entrega o comunicación con la Administración, con su acta. En cumplimiento de la
            nueva regulación de grupos de interés.
          </p>
          {DEMO.registro.map((r, i) => (
            <div
              key={r.titulo}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: i === 0 ? '0 0 10px' : '10px 0',
                borderBottom: i < DEMO.registro.length - 1 ? `.5px solid ${BORDE}` : 'none',
              }}
            >
              <i
                className={`ti ti-${r.cerrada ? 'file-check' : 'file-dots'}`}
                style={{ fontSize: 16, color: r.cerrada ? '#1d6f5c' : '#b8b4ac', flexShrink: 0 }}
              ></i>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {r.titulo}
                </div>
                <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>{r.pie}</div>
              </div>
              <span style={{ fontSize: 11, color: '#a8a49c', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {r.cerrada ? 'Ver acta' : 'Completar'}
              </span>
            </div>
          ))}
        </div>

        <div id="agenda" style={{ ...CARD, padding: '15px 18px', scrollMarginTop: 72 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={ETIQUETA}>AGENDA</span>
            <span style={{ fontSize: 11.5, color: MORADO }}>+ Acción</span>
          </div>
          {DEMO.agenda.map((a, i) => (
            <div
              key={a.titulo}
              style={{
                display: 'flex',
                gap: 11,
                padding: i === 0 ? '0 0 10px' : '10px 0',
                borderBottom: i < DEMO.agenda.length - 1 ? `.5px solid ${BORDE}` : 'none',
              }}
            >
              <div style={{ textAlign: 'center', flexShrink: 0, width: 34 }}>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.1 }}>{a.dia}</div>
                <div style={{ fontSize: 10, color: '#888' }}>{a.mes}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.45, fontWeight: a.oficial ? 600 : 400 }}>{a.titulo}</div>
                <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>{a.pie}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- Documentos y notas --- */}
      <div id="documentos" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 10, marginBottom: 12, scrollMarginTop: 72 }}>
        <div style={{ ...CARD, padding: '15px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={ETIQUETA}>DOCUMENTOS</span>
            <span style={{ fontSize: 11.5, color: MORADO }}>+ Subir</span>
          </div>
          {DEMO.documentos.map((d, i) => (
            <div
              key={d.nombre}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: i === 0 ? '0 0 9px' : '9px 0 0',
                borderBottom: i === 0 ? `.5px solid ${BORDE}` : 'none',
              }}
            >
              <i className="ti ti-file-text" style={{ fontSize: 15, color: '#a8a49c' }}></i>
              <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.nombre}</span>
              <span style={{ fontSize: 10.5, color: '#888', flexShrink: 0 }}>{d.cuando}</span>
            </div>
          ))}
        </div>

        <div style={{ ...CARD, padding: '15px 18px' }}>
          <div style={{ ...ETIQUETA, marginBottom: 12 }}>NOTAS DEL EQUIPO</div>
          <div style={{ display: 'flex', gap: 9, paddingBottom: 10, borderBottom: `.5px solid ${BORDE}` }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#f0f0eb', color: '#7a736b', fontSize: 9.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              MR
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#555', lineHeight: 1.55 }}>
                Piden datos de impacto antes de fijar posición. <span style={{ color: MORADO }}>@Jorge</span> ¿tenemos el estudio?
              </div>
              <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>hace 4 días</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 11, color: '#a8a49c' }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#f0f0eb', flexShrink: 0 }}></span>
            <span style={{ fontSize: 12 }}>Escribe una nota, menciona con @ o enlaza con /</span>
          </div>
        </div>
      </div>

      {/* --- Lo que llega con Teams, siempre visible --- */}
      <div style={{ ...CARD, padding: '13px 18px', marginBottom: 14 }}>
        <div style={{ ...ETIQUETA, marginBottom: 10 }}>Y CUANDO SEÁIS UN EQUIPO · TEAMS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 9, color: '#a8a49c', fontSize: 12 }}>
          {['Responsable por actor', 'Menciones y comentarios', 'Registro de contactos', 'Agenda compartida'].map((t) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <i className="ti ti-lock" style={{ fontSize: 13 }}></i>
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* El cierre de la demo. Era un <span> con pinta de botón: el
          único sitio de toda la página desde el que se puede comprar no
          llevaba a ninguna parte.

          La frase va antes del botón y no debajo: es la que da la razón
          para pulsarlo, y detrás llegaba tarde. */}
      <div
        style={{
          ...CARD,
          padding: '20px 18px',
          marginBottom: 4,
          textAlign: 'center',
          background: '#fbfbf9',
        }}
      >
        <div style={{ fontSize: 13, color: '#555', marginBottom: 3, fontWeight: 500 }}>
          Así se ve un proyecto en Pro.
        </div>
        <div style={{ fontSize: 11.5, color: '#888', marginBottom: 13, lineHeight: 1.5 }}>
          Con seguimiento, alertas, el registro de actividades de influencia y el directorio completo.
        </div>
        <Link
          href="/precios"
          className="btn-ai"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
        >
          <i className="ti ti-bolt"></i> Ver planes
        </Link>
      </div>
    </div>
  );
}


/**
 * El Resumen del proyecto de ejemplo.
 *
 * Se separa de ProyectoDemo porque es otra pestaña, pero comparte los
 * mismos datos: si mañana cambia DEMO, cambian las dos.
 */
export function ResumenDemo() {
  return (
    <div id="resumen" style={{ scrollMarginTop: 72, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...CARD, padding: '15px 18px', marginBottom: 10 }}>
          <div style={{ ...ETIQUETA, marginBottom: 7 }}>OBJETIVO</div>
          <div style={{ fontSize: 13, color: '#555', lineHeight: 1.7 }}>
            Que la supervisión no imponga auditoría previa a los sistemas de riesgo limitado.
          </div>
        </div>

        {/* La mención es lo que trae a alguien de vuelta al proyecto:
            va arriba y con nombre, no escondida en una pestaña. */}
        <div style={{ ...CARD, padding: '13px 16px', marginBottom: 10, borderColor: '#d8d3f5', background: '#fafaff' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#eeedfe', color: MORADO, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 600 }}>
              MR
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                <span style={{ fontWeight: 600 }}>María te ha mencionado</span> en una nota sobre la Secretaría de Estado.
              </div>
              <div style={{ fontSize: 12, color: '#555', lineHeight: 1.55, marginTop: 4 }}>
                «Piden datos de impacto antes de fijar posición. <span style={{ color: MORADO }}>@Jorge</span> ¿tenemos el estudio?»
              </div>
              <div style={{ fontSize: 10.5, color: '#888', marginTop: 4 }}>hace 4 días</div>
            </div>
          </div>
        </div>

        <div style={{ ...CARD, padding: '15px 18px' }}>
          <div style={{ ...ETIQUETA, marginBottom: 10 }}>ASUNTOS QUE SIGUE</div>
          <div style={{ borderLeft: `2px solid ${MORADO}`, paddingLeft: 12, marginBottom: 11 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{DEMO.norma.titulo}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Enmiendas · quedan 13 días</div>
          </div>
          <div style={{ borderLeft: `2px solid ${BORDE}`, paddingLeft: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>Reglamento europeo de IA</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Actos de ejecución · sin plazo abierto</div>
          </div>
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ ...CARD, padding: '15px 16px', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 21, fontWeight: 600, color: MORADO, lineHeight: 1.1 }}>{DEMO.actores.length}</div>
              <div style={{ fontSize: 11, color: '#888' }}>actores</div>
            </div>
            <div>
              <div style={{ fontSize: 21, fontWeight: 600, color: MORADO, lineHeight: 1.1 }}>2</div>
              <div style={{ fontSize: 11, color: '#888' }}>asuntos</div>
            </div>
            <div>
              <div style={{ fontSize: 21, fontWeight: 600, color: '#1a1a18', lineHeight: 1.1 }}>
                {DEMO.actores.filter((a) => a.relacion === 'sin_contactar').length}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>sin contactar</div>
            </div>
          </div>
        </div>

        <div style={{ ...CARD, padding: '15px 18px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={ETIQUETA}>AGENDA</span>
            <span style={{ fontSize: 11.5, color: MORADO }}>+ Acción</span>
          </div>
          {DEMO.agenda.map((a, i) => (
            <div
              key={a.titulo}
              style={{
                display: 'flex',
                gap: 11,
                padding: i === 0 ? '0 0 10px' : '10px 0',
                borderBottom: i < DEMO.agenda.length - 1 ? `.5px solid ${BORDE}` : 'none',
              }}
            >
              <div style={{ textAlign: 'center', flexShrink: 0, width: 32 }}>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.1 }}>{a.dia}</div>
                <div style={{ fontSize: 10, color: '#888' }}>{a.mes}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.45, fontWeight: a.oficial ? 600 : 400 }}>{a.titulo}</div>
                <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>{a.pie}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ ...CARD, padding: '13px 16px', opacity: 0.55 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <i className="ti ti-lock" style={{ fontSize: 14, color: '#8b8780' }}></i>
            <span style={ETIQUETA}>EQUIPO</span>
          </div>
          <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.55 }}>
            Invitar a compañeros y repartir los actores llega con Teams.
          </div>
        </div>
      </div>
    </div>
  );
}
