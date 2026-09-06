'use client';

/**
 * El panel informativo del login.
 *
 * NADA DE ESTO ES FUNCIONAL. Es una réplica de la interfaz dibujada con
 * HTML, no una captura ni un trozo de la aplicación. Se hizo así por dos
 * razones: una captura envejece en cuanto se rediseña una pantalla, y
 * además contendría datos de una cuenta real en una página pública.
 *
 * Todo el bloque va con aria-hidden y sin eventos de puntero salvo el
 * hover de las tarjetas: nadie debe poder pulsar un botón que no hace
 * nada, ni encontrárselo navegando con el teclado. El mensaje para quien
 * no ve la pantalla está en el titular y el subtítulo, que sí son texto.
 *
 * TAMAÑOS. Todo va deliberadamente más grande de lo que pediría una
 * miniatura: en un portátil de trece pulgadas, por debajo de 10 px no se
 * lee nada y el panel se convierte en textura.
 *
 * CONTENIDO DE EJEMPLO. Los cargos van sin nombre propio y el correo va
 * desenfocado a propósito: son personas reales en puestos reales, y una
 * página de aterrizaje no es sitio para sus datos de contacto.
 */

const MORADO = '#6d5aef';
const LILA = '#8f7ff5';

const VENTANA = {
  background: '#f0efe9',
  // Sin esto, todo lo que no lleve color explícito hereda el blanco de
  // .sl-left y desaparece sobre la tarjeta clara. Es lo que hacía que
  // faltaran el nombre de la ley, los cargos y los títulos de oferta.
  color: '#1a1a18',
  borderRadius: 11,
  boxShadow: '0 14px 34px rgba(0,0,0,.4)',
  padding: 9,
};

const TARJETA = {
  background: '#fff',
  color: '#1a1a18',
  borderRadius: 9,
  boxShadow: '0 1px 2px rgba(0,0,0,.05)',
  padding: '11px 13px',
};

const ROTULO = { fontSize: 9, color: '#8b8780', letterSpacing: '.4px' };

function Bandera({ pais }) {
  if (pais === 'ue') {
    return (
      <svg viewBox="0 0 18 12" width="12" height="8" style={{ flexShrink: 0 }}>
        <rect width="18" height="12" rx="2" fill="#003399" />
        <circle cx="9" cy="6" r="3" fill="none" stroke="#FFCC00" strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 12" width="12" height="8" style={{ flexShrink: 0 }}>
      <rect width="18" height="12" rx="2" fill="#C60B1E" />
      <rect y="3" width="18" height="6" fill="#FFC400" />
    </svg>
  );
}

function Etiqueta({ children }) {
  return (
    <span
      style={{
        display: 'inline-block',
        alignSelf: 'flex-start',
        fontSize: 11,
        fontWeight: 600,
        background: MORADO,
        color: '#fff',
        borderRadius: 16,
        padding: '4px 11px',
        marginBottom: 8,
        boxShadow: '0 6px 16px rgba(0,0,0,.3)',
      }}
    >
      {children}
    </span>
  );
}

const FUENTES = [
  ['es', 'Congreso'],
  ['es', 'BOE'],
  ['es', 'Consultas públicas'],
  ['ue', 'Comisión Europea'],
  ['ue', 'Parlamento Europeo'],
];

const FASES = [
  ['Presentación', '12 feb', 'hecha'],
  ['Toma en consideración', '28 feb', 'hecha'],
  ['Enmiendas', 'Quedan 13 días', 'actual'],
  ['Ponencia', '—', 'futura'],
];

const CLAVES = ['inteligencia artificial', 'algoritmos', 'protección de datos', 'servicios digitales'];

export default function LoginPanel() {
  return (
    <div className="lp-wrap" aria-hidden="true">
      <div className="lp">
        <div className="lp-col">
          <Etiqueta>Anticipa lo que te afecta</Etiqueta>

          <div className="bento" style={VENTANA}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '2px 2px 7px' }}>
              {FUENTES.map(([pais, nombre]) => (
                <span
                  key={nombre}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 9.5,
                    color: '#57534e',
                    background: '#fff',
                    borderRadius: 12,
                    padding: '3px 9px',
                  }}
                >
                  <Bandera pais={pais} />
                  {nombre}
                </span>
              ))}
            </div>

            <div style={{ ...TARJETA, marginBottom: 5, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>
                  Ley de gobernanza de la inteligencia artificial
                </div>
                <div style={{ fontSize: 10.5, color: '#8b8780', marginTop: 3, lineHeight: 1.45 }}>
                  Congreso · Comisión de Economía, Comercio y Transformación Digital
                </div>
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 10,
                  background: '#f0eefe',
                  color: '#3c3489',
                  borderRadius: 12,
                  padding: '4px 10px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <i className="ti ti-bell" style={{ fontSize: 12 }}></i> Siguiendo
              </span>
              <i className="ti ti-folder-plus" style={{ fontSize: 15, color: '#a8a49c', flexShrink: 0 }}></i>
            </div>

            <div style={TARJETA}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                <span style={ROTULO}>PLAZOS</span>
                <span style={{ fontSize: 10, color: MORADO }}>Ver ficha completa →</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {FASES.map(([nombre, cuando, estado]) => (
                  <div key={nombre} style={{ flex: 1 }}>
                    <div
                      style={{
                        height: 3,
                        borderRadius: 2,
                        marginBottom: 6,
                        background: estado === 'futura' ? '#e0dfd8' : MORADO,
                      }}
                    ></div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: estado === 'futura' ? 400 : 600,
                        color: estado === 'futura' ? '#a8a49c' : estado === 'actual' ? MORADO : '#1a1a18',
                        lineHeight: 1.3,
                      }}
                    >
                      {nombre}
                    </div>
                    <div
                      style={{
                        fontSize: 9.5,
                        marginTop: 2,
                        color: estado === 'actual' ? MORADO : estado === 'futura' ? '#a8a49c' : '#8b8780',
                        fontWeight: estado === 'actual' ? 600 : 400,
                      }}
                    >
                      {cuando}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 13 }} />
          <Etiqueta>Crece profesionalmente</Etiqueta>

          {/* El encaje, no una oferta suelta.
              Una tarjeta de empleo dice "hay trabajo"; el anillo dice
              "esto va de ti y de tu carrera", que es lo que se quería
              transmitir. El porcentaje sale de la radiografía profesional
              que ya existe en el perfil. */}
          <div className="bento" style={VENTANA}>
            <div style={TARJETA}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11 }}>
                <svg viewBox="0 0 42 42" width="50" height="50" style={{ flexShrink: 0 }}>
                  <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f2f0ec" strokeWidth="5" />
                  <circle
                    cx="21"
                    cy="21"
                    r="15.915"
                    fill="none"
                    stroke={MORADO}
                    strokeWidth="5"
                    strokeDasharray="78 22"
                    strokeDashoffset="25"
                    strokeLinecap="round"
                  />
                  <text x="21" y="24" textAnchor="middle" fontSize="10" fontWeight="600" fill="#1a1a18">
                    78%
                  </text>
                </svg>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35 }}>Tu encaje con el sector</div>
                  <div style={{ fontSize: 10.5, color: '#8b8780', marginTop: 2, lineHeight: 1.45 }}>
                    12 ofertas encajan con tu perfil ahora mismo
                  </div>
                </div>
              </div>

              <Oferta titulo="Consultor/a de asuntos públicos" meta="Madrid · Híbrido · Jornada completa" encaje="92%" />

              <div style={{ marginTop: 11 }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 11,
                    background: '#1d6f5c',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '7px 16px',
                    fontWeight: 600,
                  }}
                >
                  Solicitar oferta
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-col lp-col-2">
          {/* Sin el marco claro de VENTANA: una tarjeta oscura dentro de un
              marco claro dentro de un panel oscuro son tres capas para
              nada. Va directa sobre el fondo. */}
          <div
            className="bento"
            style={{
              background: '#1f1e19',
              border: '1px solid #2c2b26',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 13,
              boxShadow: '0 18px 44px rgba(0,0,0,.42)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
              <i className="ti ti-sparkles" style={{ fontSize: 12, color: LILA }}></i>
              <span style={{ fontSize: 10, color: LILA, letterSpacing: '.4px' }}>
                ANALIZAMOS QUÉ IMPACTA EN TU SECTOR
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              <span style={{ flex: 1, height: 3.5, borderRadius: 2, background: MORADO }}></span>
              <span style={{ flex: 1, height: 3.5, borderRadius: 2, background: '#b3a8f7' }}></span>
              <span style={{ flex: 1, height: 3.5, borderRadius: 2, background: '#35342e' }}></span>
              <span style={{ flex: 1, height: 3.5, borderRadius: 2, background: '#35342e' }}></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <i className="ti ti-loader-2 lp-gira" style={{ fontSize: 13, color: LILA }}></i>
              <span style={{ fontSize: 12, color: '#fff' }}>Buscando “inteligencia artificial”</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CLAVES.map((k) => (
                <span
                  key={k}
                  style={{
                    fontSize: 10,
                    background: '#2c2b26',
                    color: '#c4c0b8',
                    borderRadius: 12,
                    padding: '3px 10px',
                  }}
                >
                  {k}
                </span>
              ))}
            </div>
          </div>

          <Etiqueta>Directorio de cargos</Etiqueta>
          <div className="bento" style={VENTANA}>
            <div style={TARJETA}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Bandera pais="es" />
                <Bandera pais="ue" />
                <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 3 }}>Directorio institucional</span>
              </div>
              <Cargo
                avatar="#e8eefb"
                titulo="Directora General de Telecomunicaciones"
                sub="En el cargo desde marzo de 2025"
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 10,
                  color: '#57534e',
                  marginTop: 8,
                }}
              >
                <i className="ti ti-corner-down-right" style={{ fontSize: 12, color: '#a8a49c' }}></i>
                Depende de la Secretaría de Estado de Digitalización
              </div>
              {/* El correo desenfocado: enseña que el dato existe sin
                  publicarlo, y es el argumento de la etiqueta Pro. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 10.5,
                  paddingTop: 10,
                  marginTop: 10,
                  borderTop: '.5px solid #f2f0ec',
                }}
              >
                <i className="ti ti-mail" style={{ fontSize: 13, color: '#a8a49c' }}></i>
                <span style={{ color: '#1d6f5c', filter: 'blur(3.6px)', userSelect: 'none' }}>
                  nombre.apellido@ec.europa.eu
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    background: '#f0eefe',
                    color: '#3c3489',
                    borderRadius: 10,
                    padding: '3px 9px',
                  }}
                >
                  Pro
                </span>
              </div>
            </div>
          </div>

          {/* Recruiter y Teams: al pie de esta columna, a la altura de la
              tarjeta de empleo de la izquierda. En morado y sin caja, que
              es como se marcan los enlaces de la plataforma. */}
          <div className="lp-org">Descubre Recruiter y Teams para organizaciones →</div>
        </div>
      </div>

    </div>
  );
}

/**
 * Una oferta dentro de la tarjeta de encaje.
 *
 * Sin logo de organización: en el login no interesa qué empresa publica
 * sino que el puesto encaja contigo, y unas siglas sueltas dan más ruido
 * que información.
 */
function Oferta({ titulo, meta, encaje }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingTop: 12,
        marginTop: 12,
        borderTop: '.5px solid #f2f0ec',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.3 }}>{titulo}</span>
          <span style={{ fontSize: 10.5, color: MORADO, fontWeight: 600 }}>{encaje}</span>
        </div>
        <div style={{ fontSize: 10, color: '#8b8780', marginTop: 3 }}>{meta}</div>
      </div>
    </div>
  );
}

function Cargo({ avatar, siglas, titulo, sub }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      {siglas ? (
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: '#f0eefe',
            color: MORADO,
            fontSize: 8.5,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {siglas}
        </span>
      ) : (
        <span style={{ width: 30, height: 30, borderRadius: '50%', background: avatar, flexShrink: 0 }}></span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.3 }}>{titulo}</div>
        <div style={{ fontSize: 10, color: '#8b8780', marginTop: 2 }}>{sub}</div>
      </div>
      <i className="ti ti-bell" style={{ fontSize: 14, color: '#a8a49c', flexShrink: 0 }}></i>
    </div>
  );
}
