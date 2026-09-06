'use client';

/**
 * El panel informativo del login.
 *
 * NADA DE ESTO ES FUNCIONAL. Es una réplica de la interfaz dibujada con
 * HTML, no una captura ni un trozo de la aplicación. Se hizo así por dos
 * razones: una captura envejece en cuanto se rediseña una pantalla —y en
 * un solo día hemos rediseñado cuatro—, y además contendría datos de una
 * cuenta real en una página pública.
 *
 * Todo el bloque va con aria-hidden y sin eventos de puntero: nadie debe
 * poder pulsar un botón que no hace nada, ni encontrárselo navegando con
 * el teclado. El mensaje para quien no ve la pantalla ya está en el
 * titular y el subtítulo, que sí son texto real.
 *
 * CONTENIDO DE EJEMPLO. Los cargos van sin nombre propio y el correo va
 * desenfocado a propósito: son personas reales en puestos reales, y una
 * página de aterrizaje no es sitio para sus datos de contacto.
 *
 * Cuando se rediseñe alguna de las pantallas que aquí se imitan, hay que
 * volver a este archivo. Es menos mantenimiento que unas capturas, pero
 * no es cero.
 */

const MORADO = '#6d5aef';
const LILA = '#8f7ff5';

const VENTANA = {
  background: '#f0efe9',
  borderRadius: 11,
  boxShadow: '0 18px 44px rgba(0,0,0,.42)',
  padding: 9,
  position: 'relative',
};

const TARJETA = {
  background: '#fff',
  borderRadius: 9,
  boxShadow: '0 1px 2px rgba(0,0,0,.05)',
  padding: '10px 12px',
};

const ROTULO = { fontSize: 7.5, color: '#8b8780', letterSpacing: '.35px' };

/** La bandera, en el tamaño diminuto que piden estas maquetas. */
function Bandera({ pais }) {
  if (pais === 'ue') {
    return (
      <svg viewBox="0 0 18 12" width="10" height="6.6" style={{ flexShrink: 0 }}>
        <rect width="18" height="12" rx="2" fill="#003399" />
        <circle cx="9" cy="6" r="3" fill="none" stroke="#FFCC00" strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 12" width="10" height="6.6" style={{ flexShrink: 0 }}>
      <rect width="18" height="12" rx="2" fill="#C60B1E" />
      <rect y="3" width="18" height="6" fill="#FFC400" />
    </svg>
  );
}

/** La etiqueta morada que nombra cada módulo. */
function Etiqueta({ children }) {
  return (
    <div
      style={{
        display: 'inline-block',
        fontSize: 10.5,
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
    </div>
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
  ['Senado', '—', 'futura'],
];

const CLAVES = ['inteligencia artificial', 'algoritmos', 'protección de datos', 'servicios digitales'];

export default function LoginPanel() {
  return (
    <div className="lp" aria-hidden="true">
      <div className="lp-col">
        <Etiqueta>Monitoriza lo que te afecta</Etiqueta>

        <div style={VENTANA}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '2px 2px 8px' }}>
            {FUENTES.map(([pais, nombre]) => (
              <span
                key={nombre}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 8,
                  color: '#57534e',
                  background: '#fff',
                  borderRadius: 12,
                  padding: '3px 8px',
                }}
              >
                <Bandera pais={pais} />
                {nombre}
              </span>
            ))}
          </div>

          <div style={{ ...TARJETA, marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#1a1a18', lineHeight: 1.3 }}>
                Ley de gobernanza de la inteligencia artificial
              </div>
              <div style={{ fontSize: 8.5, color: '#8b8780', marginTop: 3 }}>
                Congreso · Comisión de Economía, Comercio y Transformación Digital
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 8,
                  background: '#f0eefe',
                  color: '#3c3489',
                  borderRadius: 12,
                  padding: '3px 8px',
                }}
              >
                <i className="ti ti-bell" style={{ fontSize: 10 }}></i> Siguiendo
              </span>
              <i className="ti ti-folder-plus" style={{ fontSize: 13, color: '#a8a49c' }}></i>
            </div>
          </div>

          <div style={{ ...TARJETA, marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
              <span style={ROTULO}>LA NORMA Y SU TRAMITACIÓN</span>
              <span style={{ fontSize: 8, color: MORADO }}>Ver ficha completa →</span>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {FASES.map(([nombre, cuando, estado]) => (
                <div key={nombre} style={{ flex: 1 }}>
                  <div
                    style={{
                      height: 2.5,
                      borderRadius: 2,
                      marginBottom: 5,
                      background: estado === 'futura' ? '#e0dfd8' : MORADO,
                    }}
                  ></div>
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: estado === 'futura' ? 400 : 600,
                      color: estado === 'futura' ? '#a8a49c' : estado === 'actual' ? MORADO : '#1a1a18',
                      lineHeight: 1.25,
                    }}
                  >
                    {nombre}
                  </div>
                  <div
                    style={{
                      fontSize: 7.5,
                      marginTop: 1,
                      color: estado === 'actual' ? MORADO : '#8b8780',
                      fontWeight: estado === 'actual' ? 600 : 400,
                    }}
                  >
                    {cuando}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={TARJETA}>
            <div style={{ ...ROTULO, marginBottom: 8 }}>QUIÉN RESPONDE POLÍTICAMENTE</div>
            <Actor
              avatar="#e8eefb"
              titulo="Secretaría de Estado de Digitalización e IA"
              sub="Ministerio para la Transformación Digital"
              seguir
              linea
            />
            <div style={{ ...ROTULO, margin: '9px 0 8px' }}>QUIÉN LO TRAMITA</div>
            <Actor
              siglas="CP"
              titulo="Comisión de Economía y Transformación Digital"
              sub="Órgano competente · 37 diputados"
              linea
            />
            <div style={{ ...ROTULO, margin: '9px 0 8px' }}>PONENTE</div>
            <Actor avatar="#e8f4f0" titulo="Ponente del grupo proponente" sub="Grupo parlamentario" seguir />
          </div>
        </div>
      </div>

      <div className="lp-col lp-col-2">
        {/* El análisis de sector: es donde se ve que hay IA trabajando
            sobre datos, y con qué criterios. La barra se queda quieta en
            su segunda fase; solo gira el icono. Un panel que se anima al
            lado de alguien tecleando la contraseña distrae. */}
        <div style={{ ...VENTANA, marginBottom: 14 }}>
          <div style={{ background: '#15140f', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
              <i className="ti ti-sparkles" style={{ fontSize: 10, color: LILA }}></i>
              <span style={{ fontSize: 7.5, color: LILA, letterSpacing: '.35px' }}>
                ANALIZAMOS QUÉ IMPACTA EN TU SECTOR
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 11 }}>
              <span style={{ flex: 1, height: 3, borderRadius: 2, background: MORADO }}></span>
              <span style={{ flex: 1, height: 3, borderRadius: 2, background: '#b3a8f7' }}></span>
              <span style={{ flex: 1, height: 3, borderRadius: 2, background: '#2c2b26' }}></span>
              <span style={{ flex: 1, height: 3, borderRadius: 2, background: '#2c2b26' }}></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <i className="ti ti-loader-2 lp-gira" style={{ fontSize: 11, color: LILA }}></i>
              <span style={{ fontSize: 9.5, color: '#fff', lineHeight: 1.4 }}>
                Buscando “inteligencia artificial” (3 de 9)
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {CLAVES.map((k) => (
                <span
                  key={k}
                  style={{ fontSize: 8, background: '#2c2b26', color: '#c4c0b8', borderRadius: 12, padding: '3px 8px' }}
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>

        <Etiqueta>Directorio institucional y bases de datos</Etiqueta>
        <div style={{ ...VENTANA, marginBottom: 14 }}>
          <div style={TARJETA}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 9 }}>
              <Bandera pais="es" />
              <Bandera pais="ue" />
              <span style={{ fontSize: 9.5, fontWeight: 600, color: '#1a1a18', marginLeft: 3 }}>
                Directorio institucional
              </span>
            </div>
            <Actor
              avatar="#e8eefb"
              titulo="Directora General de Telecomunicaciones"
              sub="En el cargo desde marzo de 2025"
              campana
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 8.5,
                color: '#57534e',
                padding: '8px 0 9px',
                borderBottom: '.5px solid #f2f0ec',
              }}
            >
              <i className="ti ti-corner-down-right" style={{ fontSize: 10, color: '#a8a49c' }}></i>
              Depende de la Secretaría de Estado de Digitalización
            </div>
            <div style={{ marginTop: 9 }}>
              <Actor
                siglas="CNECT"
                titulo="Jefe de Unidad · Redes y Tecnología"
                sub="Comisión Europea · DG CNECT"
                campana
              />
            </div>
            {/* El correo va desenfocado: enseña que el dato existe sin
                publicarlo. Es además el argumento de la etiqueta Pro. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 8.5,
                paddingTop: 9,
                marginTop: 8,
                borderTop: '.5px solid #f2f0ec',
              }}
            >
              <i className="ti ti-mail" style={{ fontSize: 10, color: '#a8a49c' }}></i>
              <span style={{ color: '#1d6f5c', filter: 'blur(3.2px)', userSelect: 'none' }}>
                nombre.apellido@ec.europa.eu
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 7.5,
                  background: '#f0eefe',
                  color: '#3c3489',
                  borderRadius: 10,
                  padding: '2px 7px',
                }}
              >
                Pro
              </span>
            </div>
          </div>
        </div>

        <Etiqueta>Gestiona tus proyectos</Etiqueta>
        <div style={{ ...VENTANA, marginBottom: 14 }}>
          <div style={TARJETA}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: '#f0eefe',
                  color: MORADO,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <i className="ti ti-folder-plus" style={{ fontSize: 11 }}></i>
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: '#1a1a18' }}>Añadir a un proyecto</span>
            </div>
            {[
              [MORADO, 'Reglamento de redes digitales', '9 actores'],
              ['#1d6f5c', 'Gobernanza de la IA', '8 actores'],
            ].map(([color, nombre, n]) => (
              <div
                key={nombre}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 0',
                  borderTop: '.5px solid #f2f0ec',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }}></span>
                <span style={{ fontSize: 9, color: '#1a1a18', flex: 1 }}>{nombre}</span>
                <span style={{ fontSize: 8, color: '#8b8780' }}>{n}</span>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingTop: 8,
                borderTop: '.5px solid #f2f0ec',
                fontSize: 8.5,
                color: MORADO,
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: 10 }}></i> Nuevo proyecto
            </div>
          </div>
        </div>

        <Etiqueta>Oportunidades y empleo</Etiqueta>
        <div style={VENTANA}>
          <div style={TARJETA}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#1a1a18', lineHeight: 1.35 }}>
              Técnico/a de Asuntos Públicos y Relaciones Institucionales
            </div>
            <div style={{ display: 'flex', gap: 11, margin: '7px 0 10px', fontSize: 8, color: '#8b8780' }}>
              <span>Madrid</span>
              <span>Híbrido</span>
              <span>Jornada completa</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span
                style={{
                  fontSize: 9,
                  background: '#1d6f5c',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontWeight: 600,
                }}
              >
                Solicitar
              </span>
              <span style={{ fontSize: 8, color: '#8b8780' }}>4 candidaturas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Una fila de persona u órgano, que se repite en varias tarjetas. */
function Actor({ avatar, siglas, titulo, sub, seguir, campana, linea }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingBottom: linea ? 9 : 0,
        borderBottom: linea ? '.5px solid #f2f0ec' : 'none',
      }}
    >
      {siglas ? (
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: '#f0eefe',
            color: MORADO,
            fontSize: siglas.length > 2 ? 6.5 : 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {siglas}
        </span>
      ) : (
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: avatar, flexShrink: 0 }}></span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 600, color: '#1a1a18', lineHeight: 1.3 }}>{titulo}</div>
        <div style={{ fontSize: 8, color: '#8b8780', marginTop: 1 }}>{sub}</div>
      </div>
      {seguir && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 8,
            background: '#f0eefe',
            color: '#3c3489',
            borderRadius: 12,
            padding: '3px 8px',
            flexShrink: 0,
          }}
        >
          <i className="ti ti-bell" style={{ fontSize: 10 }}></i> Seguir
        </span>
      )}
      {campana && <i className="ti ti-bell" style={{ fontSize: 11, color: '#a8a49c', flexShrink: 0 }}></i>}
    </div>
  );
}
