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

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';

const TOTAL = '11.843';

const FILAS = [
  {
    nombre: 'Xavier Martí Martí',
    cargo: 'Subsecretario de Asuntos Exteriores, Unión Europea y Cooperación',
    unidad: 'Subsecretaría de Asuntos Exteriores, Unión Europea y Cooperación',
    institucion: 'Ministerio de Asuntos Exteriores, Unión Europea y Cooperación',
    contexto: 'España · ejecutivo',
    dominio: 'maec.es',
    scoring: 3,
    otros: 1,
  },
  {
    nombre: 'Blanca Breñosa Sáez de Ibarra',
    cargo: 'Subsecretaria de Inclusión, Seguridad Social y Migraciones',
    unidad: 'Subsecretaría de Inclusión, Seguridad Social y Migraciones',
    institucion: 'Ministerio de Inclusión, Seguridad Social y Migraciones',
    contexto: 'España · ejecutivo',
    dominio: 'inclusion.gob.es',
    scoring: 3,
  },
  {
    nombre: 'Joan Groizard Payeras',
    cargo: 'Presidente del Instituto para la Transición Justa, O.A.',
    unidad: 'Instituto para la Transición Justa, O.A.',
    institucion: 'Ministerio para la Transición Ecológica y el Reto Demográfico',
    contexto: 'España · ejecutivo',
    dominio: 'miteco.es',
    scoring: 3,
    otros: 2,
  },
  {
    nombre: 'Miryam Álvarez Páez',
    cargo: 'Secretaria de Estado de Política Territorial',
    unidad: 'Secretaría de Estado de Política Territorial',
    institucion: 'Ministerio de Política Territorial y Memoria Democrática',
    contexto: 'España · ejecutivo',
    dominio: 'correo.gob.es',
    scoring: 3,
  },
  {
    nombre: 'César LUENA',
    cargo: 'Eurodiputado',
    unidad: 'S&D',
    institucion: 'Parlamento Europeo',
    contexto: 'UE · legislativo',
    pais: 'España',
    dominio: 'europarl.europa.eu',
    scoring: 3,
  },
  {
    nombre: 'Adrián VÁZQUEZ LÁZARA',
    cargo: 'Eurodiputado',
    unidad: 'PPE',
    institucion: 'Parlamento Europeo',
    contexto: 'UE · legislativo',
    pais: 'España',
    dominio: 'europarl.europa.eu',
    scoring: 3,
  },
  {
    nombre: 'Subdirección General de Relaciones Internacionales',
    esUnidad: true,
    cargo: 'Subdirector General de Relaciones Internacionales y Unión Europea',
    unidad: 'S.G. de Relaciones Internacionales y Unión Europea',
    institucion: 'Ministerio de Cultura',
    contexto: 'España · ejecutivo',
    dominio: 'cultura.gob.es',
    scoring: 2,
  },
  {
    nombre: 'Head of Unit — Competition Policy',
    esUnidad: true,
    cargo: 'Head of Unit',
    unidad: 'DG COMP',
    institucion: 'Comisión Europea',
    contexto: 'UE · ejecutivo',
    dominio: 'ec.europa.eu',
    scoring: 3,
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

/** Barra superior, decorativa: enseña qué se puede filtrar sin filtrar. */
function BarraFiltros() {
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
  return (
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

      <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #e2dcf8', borderRadius: 10, padding: 3 }}>
        {['Todas', 'España', 'UE'].map((t, i) => (
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
          </span>
        ))}
      </div>

      <span style={boton}>
        <i className="ti ti-building-bank" style={{ fontSize: 15, color: '#a8a79c' }}></i> Institución
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
  );
}

export default function DirectorioDemo() {
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
      <BarraFiltros />

      <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
        {TOTAL} resultados
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
                        background: '#eeecfd',
                        color: MORADO,
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
                    {f.contexto}
                    {f.pais && <span style={{ color: MORADO }}>{' · '}{f.pais}</span>}
                  </div>
                </td>
                <td style={{ padding: '11px 18px', whiteSpace: 'nowrap' }}>
                  <Barras nivel={f.scoring} />
                  <span style={{ color: '#3a3a36' }}>{f.scoring === 3 ? 'Alta' : 'Media'}</span>
                </td>
                {/* Lo único tapado. El dominio se deja a la vista: dice
                    que el correo es institucional y real, no inventado. */}
                <td style={{ padding: '11px 18px', whiteSpace: 'nowrap' }}>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cierre. El número es el argumento: lo que se ve arriba son diez
          filas, lo que se compra son casi doce mil. */}
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
            Estás viendo 8 de {TOTAL} personas.
          </div>
          <div style={{ fontSize: 12.5, color: '#a8a49c', marginTop: 4 }}>
            Ministerios, organismos, Congreso, Comisión Europea y Parlamento Europeo, con su correo,
            su unidad y su dirección postal. Filtrable y exportable a Excel.
          </div>
        </div>
        <span style={{ fontSize: 12.5, color: '#8f7ff5', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Ver planes →
        </span>
      </div>
    </div>
  );
}
