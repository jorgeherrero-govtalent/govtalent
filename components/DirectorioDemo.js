'use client';

/**
 * Demo del directorio institucional para cuentas free.
 *
 * Mismo criterio que ProyectoDemo: se enseña el producto funcionando con
 * datos reales, no una captura ni una lista de características. Quien
 * mira tiene que reconocer a gente que conoce y entender en tres
 * segundos qué compra.
 *
 * Lo único que se tapa es el correo, que es exactamente lo que se paga.
 * El nombre, el cargo, la unidad y el scoring van completos: sin ellos
 * no se ve el valor, y taparlo todo convierte la demo en un muro.
 *
 * Las filas están escritas a mano y no consultadas. Son diez, no hacen
 * falta más, y así la demo no depende de que la vista responda ni de
 * que un usuario sin plan pueda leer directorio_pro.
 *
 * HAY QUE MANTENERLAS A MANO. Son cargos reales y cambian con cada
 * remodelación; si alguna queda obsoleta, la demo enseña un directorio
 * desactualizado, que es justo lo contrario de lo que quiere vender.
 */

import { useTotalDirectorio, formatearTotal } from '@/lib/useTotalDirectorio';

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';

// Una muestra de cada bloque, como la Base de datos de hoy: Gobierno,
// Parlamento Europeo, cuerpo diplomático, medios, sociedades estatales y
// organismos. La última no tiene correo publicado: enseña «Buscar correo».
// Revisado el 09-10-2026.
const FILAS = [
  {
    nombre: 'Xavier Martí Martí',
    cargo: 'Subsecretario de Asuntos Exteriores, Unión Europea y Cooperación',
    unidad: 'Subsecretaría de Asuntos Exteriores, Unión Europea y Cooperación',
    institucion: 'Ministerio de Asuntos Exteriores, Unión Europea y Cooperación',
    nivel: 'Administración General del Estado',
    dominio: 'maec.es',
    scoring: 3,
    otros: 2,
    titular: true,
  },
  {
    nombre: 'Joan Groizard Payeras',
    cargo: 'Secretario de Estado de Energía',
    unidad: 'Secretaría de Estado de Energía',
    institucion: 'Ministerio para la Transición Ecológica y el Reto Demográfico',
    nivel: 'Administración General del Estado',
    dominio: 'miteco.es',
    scoring: 3,
    otros: 2,
    titular: true,
  },
  {
    nombre: 'Miryam Álvarez Páez',
    cargo: 'Secretaria de Estado de Política Territorial',
    unidad: 'Secretaría de Estado de Política Territorial',
    institucion: 'Ministerio de Política Territorial y Memoria Democrática',
    nivel: 'Administración General del Estado',
    dominio: 'correo.gob.es',
    scoring: 3,
    titular: true,
  },
  {
    nombre: 'César LUENA',
    cargo: 'Eurodiputado',
    unidad: 'S&D',
    institucion: 'Parlamento Europeo',
    nivel: 'Parlamento Europeo',
    pais: 'España',
    dominio: 'europarl.europa.eu',
    scoring: 3,
    titular: true,
  },
  {
    nombre: 'Entela Gjika',
    cargo: 'Embajadora Extraordinaria y Plenipotenciaria',
    unidad: 'Embajada de la República de Albania',
    institucion: 'Embajada de Albania',
    nivel: 'Cuerpo diplomático',
    dominio: 'mfa.gov.al',
    scoring: 2,
    titular: true,
  },
  {
    nombre: 'Carlos Franganillo Hernández',
    cargo: 'Director Informativos Telecinco',
    unidad: '',
    institucion: 'Informativos Mediaset España (Telecinco/Cuatro)',
    nivel: 'Radio y televisión',
    dominio: 'mediaset.es',
    scoring: 2,
  },
  {
    nombre: 'Juan José Ganuza Fernández',
    cargo: 'Presidente',
    unidad: 'Comisión Nacional de los Mercados y la Competencia',
    institucion: 'CNMC Comisión Nacional de los Mercados y la Competencia',
    nivel: 'Otros organismos públicos',
    dominio: 'cnmc.es',
    scoring: 2,
    titular: true,
  },
  {
    nombre: 'Pedro Saura García',
    cargo: 'Presidente',
    unidad: 'Sociedad Estatal de Participaciones Industriales (SEPI)',
    institucion: 'Grupo Correos',
    nivel: 'Sociedades estatales',
    dominio: null,
    scoring: 1,
    titular: true,
  },
];

function iniciales(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

function Barras({ nivel }) {
  const alturas = [6, 9, 12];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, marginRight: 9, verticalAlign: -1 }}>
      {alturas.map((h, i) => (
        <span
          key={h}
          style={{ width: 3.5, height: h, borderRadius: 1, background: i < nivel ? MORADO : '#e6e5df' }}
        ></span>
      ))}
    </span>
  );
}

/** Barra superior, decorativa: la misma que la Base de datos (bloques,
 *  búsqueda y filtros), para enseñar qué se puede filtrar sin filtrar. */
function BarraFiltros({ total }) {
  const boton = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    border: `.5px solid ${BORDE}`,
    background: '#fff',
    borderRadius: 9,
    padding: '8px 13px',
    fontSize: 12.5,
    color: '#3a3a36',
    fontWeight: 600,
  };
  const bloques = ['Todo', 'Instituciones', 'Organizaciones', 'Medios y actores sociales'];
  return (
    <>
      <div style={{ display: 'inline-flex', flexWrap: 'wrap', background: '#fff', border: '1px solid #e2dcf8', borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {bloques.map((t, i) => (
          <span
            key={t}
            style={{
              padding: '6px 14px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              background: i === 0 ? '#f0edfe' : 'transparent',
              color: i === 0 ? MORADO : '#8a897f',
            }}
          >
            {t}
            {i === 0 && total ? <span style={{ fontWeight: 500, opacity: 0.8, marginLeft: 6 }}>{total}</span> : null}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: `.5px solid ${BORDE}`,
            background: '#fff',
            borderRadius: 9,
            padding: '8px 12px',
            minWidth: 250,
            flex: 1,
            maxWidth: 340,
            color: '#a8a79c',
            fontSize: 13,
          }}
        >
          <i className="ti ti-search" style={{ fontSize: 15 }}></i>
          Buscar por nombre, cargo o unidad
        </div>

        <span style={boton}>
          <i className="ti ti-building-bank" style={{ fontSize: 15, color: '#a8a79c' }}></i> Institución u organización
          <i className="ti ti-chevron-down" style={{ fontSize: 14, color: '#a8a79c' }}></i>
        </span>
        <span style={boton}>
          <i className="ti ti-category-2" style={{ fontSize: 15, color: '#a8a79c' }}></i> Área
          <i className="ti ti-chevron-down" style={{ fontSize: 14, color: '#a8a79c' }}></i>
        </span>
        <span style={boton}>
          <i className="ti ti-world" style={{ fontSize: 15, color: '#a8a79c' }}></i> País
          <i className="ti ti-chevron-down" style={{ fontSize: 14, color: '#a8a79c' }}></i>
        </span>

        <span style={{ ...boton, marginLeft: 'auto', color: '#a8a79c' }}>
          <i className="ti ti-file-spreadsheet" style={{ fontSize: 15, color: '#a8a79c' }}></i> Exportar
        </span>
      </div>
    </>
  );
}

export default function DirectorioDemo() {
  // El total lo cuenta la base de datos. Mientras no ha llegado, las dos
  // frases que lo usan se escriben sin él en vez de enseñar una cifra
  // provisional que luego cambia delante de quien está mirando.
  const total = formatearTotal(useTotalDirectorio());

  const th = {
    padding: '11px 18px',
    fontWeight: 700,
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '.03em',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };

  return (
    <div>
      <BarraFiltros total={total} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: '#999' }}>{total ? `${total} resultados` : 'Resultados'}</span>
        {/* De donde salen los datos, a la vista y no en letra pequena al
            pie: en un directorio de contactos la procedencia es parte de
            lo que se compra, no una nota legal. */}
        <span style={{ fontSize: 11.5, color: '#8a897f', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-circle-check" style={{ fontSize: 14, color: '#1d6f5c' }}></i>
          Fuentes oficiales · DIR3, BOE, BOCG, congreso.es, portales de la UE y Agenda de la Comunicación · actualizado semanalmente
        </span>
      </div>

      <div
        style={{
          background: '#fff',
          border: `.5px solid ${BORDE}`,
          borderRadius: 12,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          overflow: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1000 }}>
          <thead>
            <tr style={{ background: '#faf9f5' }}>
              <th style={{ ...th, width: 32 }}>
                <input type="checkbox" disabled style={{ margin: 0 }} aria-label="Seleccionar" />
              </th>
              <th style={th}>Persona</th>
              <th style={th}>Cargo</th>
              <th style={th}>Institución</th>
              <th style={th}>Scoring</th>
              <th style={th}>Email</th>
            </tr>
          </thead>
          <tbody>
            {FILAS.map((f, i) => (
              <tr key={i} style={{ borderTop: `.5px solid ${BORDE}` }}>
                <td style={{ padding: '11px 14px' }}>
                  <input type="checkbox" disabled style={{ margin: 0 }} aria-label="Seleccionar fila" />
                </td>
                <td style={{ padding: '11px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: f.titular ? '#eeecfd' : '#f0efe9',
                        color: f.titular ? MORADO : '#a8a79c',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10.5,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {iniciales(f.nombre)}
                    </span>
                    <span style={{ fontWeight: 600, color: '#1a1a18' }}>{f.nombre}</span>
                  </div>
                </td>
                <td style={{ padding: '11px 18px', color: '#555' }}>
                  {f.cargo}
                  <div style={{ fontSize: 11, color: '#a8a79c', marginTop: 2 }}>
                    {f.unidad}
                    {f.otros > 0 && (
                      <span style={{ color: MORADO, marginLeft: 6 }}>
                        · {f.otros} cargo{f.otros === 1 ? '' : 's'} más
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '11px 18px', color: '#555' }}>
                  {f.institucion}
                  <div style={{ fontSize: 11, color: '#a8a79c', marginTop: 2 }}>
                    {f.nivel}
                    {f.pais && <span style={{ color: MORADO }}>{' · '}{f.pais}</span>}
                  </div>
                </td>
                <td style={{ padding: '11px 18px', whiteSpace: 'nowrap' }}>
                  <Barras nivel={f.scoring} />
                  <span style={{ color: f.scoring === 1 ? '#8a897f' : '#3a3a36' }}>
                    {f.scoring === 3 ? 'Alta' : f.scoring === 2 ? 'Media' : 'Baja'}
                  </span>
                </td>
                {/* Lo único tapado. El dominio se deja a la vista: dice
                    que el correo es institucional y real, no inventado.
                    Sin correo publicado, el botón de la Base de datos. */}
                <td style={{ padding: '11px 18px', whiteSpace: 'nowrap' }}>
                  {f.dominio ? (
                    <>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 74,
                          height: 9,
                          borderRadius: 3,
                          background: 'linear-gradient(90deg, #e6e4f6, #efeef9)',
                          verticalAlign: -1,
                          marginRight: 4,
                        }}
                      ></span>
                      <span style={{ color: '#a8a79c' }}>@{f.dominio}</span>
                    </>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        border: '.5px solid #cfc9f8',
                        background: '#fff',
                        borderRadius: 7,
                        padding: '4px 9px',
                        fontSize: 11.5,
                        color: '#5443d6',
                      }}
                    >
                      <i className="ti ti-search" style={{ fontSize: 13 }} aria-hidden="true"></i>
                      Buscar correo
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cierre. El número es el argumento: lo que se ve arriba son diez
          filas, lo que se compra es el directorio entero. La cifra la
          cuenta la base de datos, no está escrita aquí. */}
      <div
        style={{
          background: '#15140f',
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 14.5, color: '#fff', lineHeight: 1.5 }}>
            {total ? `Estás viendo 8 de ${total} personas.` : 'Estás viendo 8 personas del directorio.'}
          </div>
          <div style={{ fontSize: 12.5, color: '#a8a49c', marginTop: 4 }}>
            Instituciones de España y la UE, cuerpo diplomático, medios y organizaciones, con su correo, su
            teléfono y la fuente de cada dato. Filtra, guarda listas que te avisan de los cambios y exporta a
            Excel. Si falta un correo, lo buscamos y lo comprobamos: 25 créditos de contacto al mes incluidos.
          </div>
          <div style={{ fontSize: 12, color: '#8a8680', marginTop: 8 }}>
            Construido con fuentes oficiales: los cargos se contrastan con los nombramientos del BOE y los
            asesores del Congreso salen del BOCG, Serie D. Cada ficha guarda de dónde sale el dato y cuándo se
            capturó.
          </div>
        </div>
        <span style={{ fontSize: 12.5, color: '#8f7ff5', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Ver planes →
        </span>
      </div>
    </div>
  );
}
