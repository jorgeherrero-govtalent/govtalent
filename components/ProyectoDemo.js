'use client';

import { useRef, useState } from 'react';
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
// El acta de ejemplo, con los mismos campos y el mismo orden que
// ActaActividad, que es la que se genera de verdad. Se copia su
// estructura a propósito: si la demo enseña un documento distinto del
// que sale al pagar, la demo miente.
//
// Los campos son los del artículo 6.2 del RDL 21/2026: fecha, lugar,
// participantes, temas abordados y documentos intercambiados.
// Mismos valores que ActaActividad, para que el documento se vea igual.
const ETIQUETA_ACTA = { fontSize: 10.5, color: '#999', width: 150, flexShrink: 0 };
const VALOR_ACTA = { fontSize: 12.5, color: '#1a1a18', flex: 1, minWidth: 0 };
const LINEA_ACTA = { display: 'flex', gap: 12, padding: '5px 0' };
const SECCION_ACTA = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.5px',
  color: '#1d6f5c',
  fontWeight: 600,
  margin: '20px 0 7px',
};

// La ficha de la norma, con la forma de una de verdad.
//
// NO LLEVA "PRESENTADA": decía 12 de febrero, que es exactamente lo que
// dice la primera entrada del recorrido. Dos veces el mismo dato en la
// misma ventana, y encima quitándole sitio al ministerio.
//
// Y el autor no es "Gobierno". Formalmente lo es —un proyecto de ley lo
// presenta el Gobierno— pero eso no informa de nada: lo que se quiere
// saber es qué ministerio lo empuja, que es a quién hay que ir a ver.
const FICHA_DEMO = {
  referencia: '121/000112',
  tipo: 'Proyecto de ley',
  estado: 'Enmiendas abiertas',
  ministerio: 'Transformación Digital y Función Pública',
  diasPlazo: 13,
  recorrido: [
    { fase: 'Presentación', cuando: '12 feb', detalle: 'Publicado en el Boletín Oficial de las Cortes' },
    { fase: 'Toma en consideración', cuando: '28 feb', detalle: 'Aprobada por el Pleno · 178 a favor' },
    { fase: 'Enmiendas', cuando: 'hasta el 14 mar', detalle: 'Fase actual · plazo abierto', actual: true },
  ],
  tramitan: [
    { sigla: 'ECON', nombre: 'Comisión de Economía, Comercio y Transformación Digital', papel: 'Competente para el fondo', principal: true },
    { sigla: 'DSyC', nombre: 'Comisión de Derechos Sociales y Consumo', papel: 'Emite opinión' },
  ],
  documentos: [
    { nombre: 'Texto del proyecto de ley', origen: 'BOCG · 12 feb · PDF' },
    { nombre: 'Memoria del análisis de impacto normativo', origen: 'BOCG · 12 feb · PDF' },
  ],
};

const ACTA_DEMO = {
  titulo: 'Acta de reunión',
  fecha: '26 de febrero de 2026',
  grupo: [
    ['Denominación', 'Tu organización, S.L.'],
    ['CIF', 'B00000000'],
    ['Domicilio social', 'Calle de ejemplo 1, Madrid'],
    ['Nº de inscripción', 'Sin indicar'],
  ],
  actividad: [
    ['Fecha', '26 de febrero de 2026'],
    ['Lugar', 'Presencial · Sede del Ministerio'],
    ['Norma sobre la que se influye', 'Ley de gobernanza de la inteligencia artificial'],
  ],
  participantes: [
    ['Por el grupo de interés', 'Dirección de Asuntos Públicos'],
    ['Por la Administración', 'Secretaría de Estado de Digitalización e IA'],
  ],
  temas:
    'Impacto del umbral de 50 empleados en las empresas del sector. Se solicitó elevarlo a 250 o escalonar la entrada en vigor.',
  documentos: 'Informe de costes de cumplimiento.pdf',
  trazabilidad: [
    ['Creada', '26 feb 2026, 17:42'],
    ['Acta completada', '27 feb 2026, 09:15'],
  ],
};

function cuadranteDe(a) {
  const alta = a.influencia > 50;
  if (a.posicion >= 40 && a.posicion <= 60) return alta ? 'convencer' : 'vigilar';
  if (a.posicion > 60) return alta ? 'apoyarse' : 'informar';
  return alta ? 'bloquear' : 'vigilar';
}

// Recibe la lista en vez de leer DEMO: las posiciones ahora viven en
// estado y se mueven, así que contar sobre la constante daría siempre
// las cifras de partida por mucho que el usuario arrastre.
function cuenta(actores, clave) {
  return actores.filter((a) => cuadranteDe(a) === clave).length;
}

export default function ProyectoDemo() {
  // Las posiciones se copian a estado para poder moverlas. DEMO se queda
  // como valor de partida y no se toca: si se mutara, al volver a la
  // página los actores aparecerían donde los dejó la visita anterior.
  const [actores, setActores] = useState(DEMO.actores);
  const [acta, setActa] = useState(null);
  const [ficha, setFicha] = useState(false);
  const [movido, setMovido] = useState(false);
  const lienzoRef = useRef(null);
  const arrastrandoRef = useRef(null);

  // Arrastre con eventos de puntero: uno solo cubre ratón, dedo y lápiz,
  // y setPointerCapture hace que el gesto siga funcionando aunque el
  // cursor se salga del lienzo a media pasada.
  function alBajar(e, id) {
    const lienzo = lienzoRef.current;
    if (!lienzo) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    arrastrandoRef.current = { id, rect: lienzo.getBoundingClientRect() };
    setMovido(true);
  }

  function alMover(e) {
    const arr = arrastrandoRef.current;
    if (!arr) return;
    const { rect, id } = arr;
    // Se limita al lienzo: sin esto una ficha puede quedar a medias
    // fuera y no hay forma de volver a cogerla.
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    setActores((prev) =>
      prev.map((a) => (a.id === id ? { ...a, posicion: Math.round(x), influencia: Math.round(100 - y) } : a))
    );
  }

  function alSoltar(e) {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    arrastrandoRef.current = null;
  }

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
          {/* Abre un ejemplo, no lleva a Regulatorio. La norma de la
              demo es inventada y no tiene ficha propia; mandar al
              usuario a la sección real le sacaría de la demostración
              para enseñarle otra cosa.

              stopPropagation es obligatorio: el contenedor de la demo,
              en projects/page.js, tiene un onClick que abre el modal de
              venta, y sin frenarlo aquí saldrían los dos a la vez. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFicha(true);
            }}
            style={{
              fontSize: 11.5,
              color: MORADO,
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Ver ficha completa →
          </button>
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
              Todos {actores.length}
            </span>
            <span style={{ fontSize: 11, border: `.5px solid ${BORDE}`, color: '#555', borderRadius: 20, padding: '3px 10px' }}>
              Sin contactar {actores.filter((a) => a.relacion === 'sin_contactar').length}
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
            <div
              ref={lienzoRef}
              onPointerMove={alMover}
              onPointerUp={alSoltar}
              onPointerCancel={alSoltar}
              style={{
                position: 'relative',
                height: 310,
                background: '#fdfdfb',
                border: `.5px solid #ece9e2`,
                borderRadius: 8,
                overflow: 'hidden',
                touchAction: 'none',
              }}
            >
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
                BLOQUEAR · {cuenta(actores, 'bloquear')}
              </div>
              <div style={{ position: 'absolute', left: '33%', top: 7, fontSize: 9.5, color: MORADO, letterSpacing: '.4px' }}>
                CONVENCER · {cuenta(actores, 'convencer')}
              </div>
              <div style={{ position: 'absolute', right: 9, top: 7, fontSize: 9.5, color: '#b8b4ac', letterSpacing: '.4px' }}>
                {cuenta(actores, 'apoyarse')} · APOYARSE
              </div>
              <div style={{ position: 'absolute', left: 9, bottom: 7, fontSize: 9.5, color: '#b8b4ac', letterSpacing: '.4px' }}>
                VIGILAR · {cuenta(actores, 'vigilar')}
              </div>
              <div style={{ position: 'absolute', right: 9, bottom: 7, fontSize: 9.5, color: '#b8b4ac', letterSpacing: '.4px' }}>
                {cuenta(actores, 'informar')} · INFORMAR
              </div>

              {actores.map((a) => {
                const iniciada = a.relacion !== 'sin_contactar';
                const org = esOrganizacion(a);
                const prioritario = cuadranteDe(a) === 'convencer';
                return (
                  <div
                    key={a.id}
                    onPointerDown={(e) => alBajar(e, a.id)}
                    onClick={(e) => e.stopPropagation()}
                    title="Arrástrame"
                    style={{
                      cursor: 'grab',
                      touchAction: 'none',
                      userSelect: 'none',
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

            {/* La pista desaparece en cuanto se arrastra por primera vez:
                una vez descubierto el gesto, el aviso es ruido. Sin ella
                nadie prueba, porque un mapa así no parece tocable. */}
            {!movido && (
              <div
                style={{
                  fontSize: 11,
                  color: MORADO,
                  marginTop: 9,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <i className="ti ti-hand-move" style={{ fontSize: 13 }}></i>
                Arrastra a un actor y mira cómo cambian los cuadrantes.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- Objetivo y notas del equipo ---
          Estas dos tarjetas vivían en ResumenDemo, que se pinta encima
          de todo, y empujaban la norma y el mapa por debajo del
          pliegue. Ahora van después de los dos.

          Se cayeron las cifras que las acompañaban —seis actores, dos
          asuntos, tres sin contactar— porque se cuentan solas mirando
          el mapa que está justo encima. En su sitio manda la mención,
          que dice algo que no se ve en ninguna otra parte: que aquí
          dentro hay gente trabajando. */}
      <div
        id="notas"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginBottom: 10, scrollMarginTop: 72 }}
      >
<div style={{ ...CARD, padding: '15px 18px', margin: 0 }}>
          <div style={{ ...ETIQUETA, marginBottom: 7 }}>OBJETIVO</div>
          <div style={{ fontSize: 13, color: '#555', lineHeight: 1.7 }}>
            Que la supervisión no imponga auditoría previa a los sistemas de riesgo limitado.
          </div>
        </div>
<div style={{ ...CARD, padding: '13px 16px', borderColor: '#d8d3f5', background: '#fafaff' }}>
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
            Cada reunión con la Administración se registra sola desde lo que ya tienes en el proyecto:
            eliges la fecha, marcas con quién y el acta sale hecha. Lista para el Registro de Grupos de
            Interés.
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
              <button
                type="button"
                onClick={(e) => {
                  // Sin esto se abren dos modales a la vez: el acta y,
                  // por encima, el de venta del contenedor.
                  e.stopPropagation();
                  setActa(r);
                }}
                style={{
                  fontSize: 11,
                  color: r.cerrada ? MORADO : '#a8a49c',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {r.cerrada ? 'Ver acta' : 'Completar'}
              </button>
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
          target="_blank"
          rel="noreferrer"
          className="btn-ai"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
        >
          <i className="ti ti-bolt"></i> Ver planes
        </Link>
      </div>
      {/* La ficha de la norma.
          Es lo primero que pulsa el usuario en la demo, así que carga
          con el peso de la primera impresión. Cuatro decisiones:

          · El plazo sale junto al título. Es el dato por el que se abre
            una ficha; antes estaba en la tercera línea del recorrido.
          · El recorrido es una línea de tiempo con hilo y puntos, y el
            punto actual lleva halo. Se localiza sin leer.
          · Los metadatos van en franja gris para que no compitan con el
            título, que era lo que pasaba con cuatro etiquetas sueltas.
          · Los documentos son cajas con borde, porque en la ficha real
            se pulsan. */}
      {ficha && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setFicha(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.42)',
            zIndex: 400,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '5vh 16px',
            overflowY: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Ficha de la norma"
            style={{
              background: '#fff',
              borderRadius: 14,
              width: '100%',
              maxWidth: 520,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: '0 24px 60px -18px rgba(14,21,18,.35)',
            }}
          >
            <button
              type="button"
              onClick={() => setFicha(false)}
              aria-label="Cerrar"
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                width: 26,
                height: 26,
                borderRadius: 7,
                border: 'none',
                background: '#f5f4f1',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}
            >
              <i className="ti ti-x" style={{ fontSize: 13, color: '#777' }}></i>
            </button>

            {/* --- Cabecera --- */}
            <div style={{ padding: '20px 22px 16px', borderBottom: `.5px solid ${BORDE}` }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 9, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.4px', padding: '3px 8px', borderRadius: 14, background: '#eeedfe', color: '#3c3489' }}>
                  {FICHA_DEMO.tipo.toUpperCase()}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.4px', padding: '3px 8px', borderRadius: 14, background: '#e1f5ee', color: '#0f6e56' }}>
                  {FICHA_DEMO.estado.toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', paddingRight: 30 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.28, letterSpacing: '-.01em' }}>
                    {DEMO.norma.titulo}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 4 }}>{DEMO.norma.organo}</div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0, background: '#f7f6fe', borderRadius: 10, padding: '9px 13px' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: MORADO, lineHeight: 1 }}>{FICHA_DEMO.diasPlazo}</div>
                  <div style={{ fontSize: 9, color: '#8b8780', marginTop: 1 }}>días</div>
                </div>
              </div>
            </div>

            {/* --- Metadatos --- */}
            <div style={{ display: 'grid', gridTemplateColumns: '.62fr 1fr', background: '#faf9f6', borderBottom: `.5px solid ${BORDE}` }}>
              <div style={{ padding: '11px 22px' }}>
                <div style={{ fontSize: 9, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 2 }}>REFERENCIA</div>
                <div style={{ fontSize: 12 }}>{FICHA_DEMO.referencia}</div>
              </div>
              <div style={{ padding: '11px 16px', borderLeft: `.5px solid ${BORDE}`, minWidth: 0 }}>
                <div style={{ fontSize: 9, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 2 }}>MINISTERIO PROPONENTE</div>
                <div style={{ fontSize: 12, lineHeight: 1.35 }}>{FICHA_DEMO.ministerio}</div>
              </div>
            </div>

            {/* --- Recorrido --- */}
            <div style={{ padding: '18px 22px 4px' }}>
              <div style={{ ...ETIQUETA, marginBottom: 12 }}>RECORRIDO</div>
              <div style={{ position: 'relative', paddingLeft: 19 }}>
                {/* El hilo para en la penúltima fila para no colgar por
                    debajo del último punto. */}
                <span style={{ position: 'absolute', left: 4.5, top: 5, bottom: 16, width: 1.5, background: BORDE }}></span>

                {FICHA_DEMO.recorrido.map((f, i) => (
                  <div
                    key={f.fase}
                    style={{ position: 'relative', paddingBottom: i === FICHA_DEMO.recorrido.length - 1 ? 4 : 13 }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: -19,
                        top: 4,
                        width: 11,
                        height: 11,
                        borderRadius: '50%',
                        background: f.actual ? MORADO : '#fff',
                        border: `2px solid ${f.actual ? MORADO : '#c9c7bd'}`,
                        boxShadow: f.actual ? '0 0 0 3px #eeedfe' : 'none',
                      }}
                    ></span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: f.actual ? '#3c3489' : undefined }}>
                        {f.fase}
                      </span>
                      <span style={{ fontSize: 10.5, color: f.actual ? MORADO : '#a8a49c', flexShrink: 0, fontWeight: f.actual ? 600 : 400 }}>
                        {f.cuando}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: f.actual ? MORADO : '#8b8780', marginTop: 1 }}>{f.detalle}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* --- Quién la tramita --- */}
            <div style={{ padding: '14px 22px 4px' }}>
              <div style={{ ...ETIQUETA, marginBottom: 9 }}>QUIÉN LA TRAMITA</div>
              {FICHA_DEMO.tramitan.map((c, i) => (
                <div
                  key={c.sigla}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 0',
                    borderBottom: i < FICHA_DEMO.tramitan.length - 1 ? '.5px solid #f4f2ee' : 'none',
                  }}
                >
                  {/* La competente en morado y la de opinión en gris: la
                      jerarquía entre las dos se ve sin leer el pie. */}
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: c.principal ? '#eeedfe' : '#f2f0ec',
                      color: c.principal ? '#3c3489' : '#77746e',
                      fontSize: 8.5,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {c.sigla}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}>{c.nombre}</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#8b8780' }}>{c.papel}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* --- Documentos --- */}
            <div style={{ padding: '14px 22px 18px' }}>
              <div style={{ ...ETIQUETA, marginBottom: 9 }}>DOCUMENTOS</div>
              {FICHA_DEMO.documentos.map((d, i) => (
                <div
                  key={d.nombre}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 11px',
                    border: `.5px solid ${BORDE}`,
                    borderRadius: 9,
                    marginBottom: i < FICHA_DEMO.documentos.length - 1 ? 6 : 0,
                  }}
                >
                  <i className="ti ti-file-text" style={{ fontSize: 14, color: '#a8a49c', flexShrink: 0 }}></i>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500 }}>{d.nombre}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: '#a8a49c' }}>{d.origen}</span>
                  </span>
                  <i className="ti ti-download" style={{ fontSize: 13, color: '#c9c7bd', flexShrink: 0 }}></i>
                </div>
              ))}
            </div>

            {/* --- Pie --- */}
            <div
              style={{
                background: '#faf9f6',
                borderTop: `.5px solid ${BORDE}`,
                padding: '14px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 11, color: '#a8a49c', maxWidth: '26ch', lineHeight: 1.45 }}>
                Ejemplo. En Pro se abre la ficha real con su histórico completo.
              </span>
              <Link
                href="/precios"
                target="_blank"
                rel="noreferrer"
                className="btn-ai"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-bolt"></i> Ver planes
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* El acta de ejemplo, calcada de ActaActividad: mismo ancho,
          mismo filete verde bajo el título, mismo bloque morado para el
          grupo de interés y las mismas secciones. Lo único distinto es
          que los botones no hacen nada y que lo dice al pie. */}
      {acta && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setActa(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.35)',
            zIndex: 400,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '5vh 16px',
            overflowY: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Acta de la actividad"
            style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, padding: 22, position: 'relative' }}
          >
            <button
              type="button"
              onClick={() => setActa(null)}
              aria-label="Cerrar"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 26,
                height: 26,
                borderRadius: 7,
                border: 'none',
                background: '#f5f4f1',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="ti ti-x" style={{ fontSize: 13, color: '#777' }}></i>
            </button>

            <div style={{ paddingBottom: 12, borderBottom: '2px solid #1d6f5c' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{ACTA_DEMO.titulo}</div>
              <div style={{ fontSize: 11.5, color: '#77746e', marginTop: 2 }}>{ACTA_DEMO.fecha}</div>
            </div>

            {!acta.cerrada && (
              <div
                style={{
                  background: '#f6f5fe',
                  borderRadius: 8,
                  padding: '10px 13px',
                  fontSize: 11.5,
                  color: '#555',
                  lineHeight: 1.5,
                  marginTop: 14,
                }}
              >
                A esta actividad le falta un campo. Así queda el acta una vez completado.
              </div>
            )}

            <div
              style={{
                background: '#f4f2fe',
                borderLeft: '2px solid #6d5aef',
                padding: '12px 15px',
                margin: '16px 0 4px',
              }}
            >
              <div style={{ ...SECCION_ACTA, color: '#3c3489', margin: '0 0 7px' }}>Grupo de interés</div>
              {ACTA_DEMO.grupo.map(([k, v]) => (
                <div key={k} style={LINEA_ACTA}>
                  <span style={ETIQUETA_ACTA}>{k}</span>
                  <span style={{ ...VALOR_ACTA, color: v === 'Sin indicar' ? '#aaa' : '#1a1a18' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={SECCION_ACTA}>Actividad</div>
            {ACTA_DEMO.actividad.map(([k, v]) => (
              <div key={k} style={LINEA_ACTA}>
                <span style={ETIQUETA_ACTA}>{k}</span>
                <span style={VALOR_ACTA}>{v}</span>
              </div>
            ))}

            <div style={SECCION_ACTA}>Participantes</div>
            {ACTA_DEMO.participantes.map(([k, v]) => (
              <div key={k} style={LINEA_ACTA}>
                <span style={ETIQUETA_ACTA}>{k}</span>
                <span style={VALOR_ACTA}>{v}</span>
              </div>
            ))}

            <div style={SECCION_ACTA}>Temas abordados</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>{ACTA_DEMO.temas}</div>

            <div style={SECCION_ACTA}>Documentos intercambiados</div>
            <div style={{ fontSize: 12.5 }}>{ACTA_DEMO.documentos}</div>

            <div style={SECCION_ACTA}>Trazabilidad</div>
            {ACTA_DEMO.trazabilidad.map(([k, v]) => (
              <div key={k} style={{ ...LINEA_ACTA, padding: '3px 0' }}>
                <span style={ETIQUETA_ACTA}>{k}</span>
                <span style={{ ...VALOR_ACTA, fontSize: 12, color: '#666' }}>{v}</span>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              <Link
                href="/precios"
                target="_blank"
                rel="noreferrer"
                className="btn-ai"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-bolt"></i> Ver planes
              </Link>
              <span style={{ fontSize: 11.5, color: '#999' }}>
                En Pro: imprimir, guardar en PDF o copiar el texto.
              </span>
            </div>

            <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 10, lineHeight: 1.5 }}>
              Ejemplo con datos ficticios. GovTalent genera el documento; la presentación ante el Consejo de
              Transparencia corresponde a la organización.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
