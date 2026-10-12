import Link from 'next/link';
import DirectorioPestanasMovil from '@/components/DirectorioPestanasMovil';

/**
 * Directorio institucional.
 *
 * Mismo lenguaje que el regulatorio: rejilla de dos columnas, todas las
 * piezas del mismo tamaño. (La tarjeta negra de la Base de datos pasó al
 * menú el 05-10-2026.)
 *
 * Dos cambios respecto a la lista anterior.
 *
 * España va antes que Europa. Quien usa esto busca antes un director
 * general que un jefe de unidad de la Comisión, y la lista lo tenía al
 * revés.
 *
 * Y cada tarjeta lleva su cifra, consultada en vivo. El subtítulo decía
 * "más de 3.000" con un margen deliberadamente amplio para no tener que
 * mantenerlo; con las cifras en las tarjetas eso ya no hace falta, y
 * además dicen algo útil: 77 organismos y 720 eurodiputados sitúan el
 * tamaño de cada sección antes de entrar.
 *
 * No llevan las líneas ornamentales del regulatorio. Allí acompañan a
 * algo que se mueve; un directorio es estático y una curva sugeriría una
 * actividad que no existe.
 */

const MORADO = '#6d5aef';

/**
 * CIFRAS FIJAS. HAY QUE MANTENERLAS A MANO.
 *
 * Se fijaron a petición: son las cifras "de oficio", las que diría un
 * profesional del sector, y no siempre coinciden con lo que devuelve la
 * base de datos.
 *
 * QUÉ VA DELANTE Y QUÉ VA DETRÁS. El número grande es la unidad
 * institucional —22 ministerios, 350 diputados, 27 comisarios— y el
 * volumen de personas va en la etiqueta. Antes estaba al revés en
 * Ministerios y en la Comisión, y eso hacía dos cosas malas: ponía el
 * foco en un recuento interno en vez de en la institución, y dejaba las
 * cinco tarjetas sumando 3.500 cargos cuando el login habla de más de
 * 12.000. Quien entra por el login y suma lo que ve, resta credibilidad.
 *
 * Dos discrepancias conocidas a día de hoy:
 *   · deputies devuelve 351 filas y aquí se dice 350, que son los
 *     escaños reales del Congreso. Sobra una fila en la tabla.
 *   · eu_committees_directory devuelve 26 y aquí se dice 22, que son
 *     las comisiones permanentes; las otras cuatro son subcomisiones o
 *     comisiones especiales.
 *
 * Mientras esas dos diferencias existan, consultarlas en vivo haría que
 * la portada y la sección se contradijeran a la vista. Cuando se limpie
 * la tabla de diputados y haya con qué filtrar las comisiones del PE,
 * esto debería volver a ser una consulta: un número escrito a mano
 * envejece solo y nadie se entera.
 *
 * Los separadores de millar de las etiquetas van escritos a mano porque
 * son parte de la cadena; solo el número grande pasa por
 * toLocaleString.
 */
const CIFRAS = {
  ministerios: { n: 22, etiqueta: 'ministerios · 820 altos cargos' },
  // Los 321 asesores son los mismos que cuentan las tarjetas de grupos
  // parlamentarios: activos y sin objeción. Si esa cifra se mueve, hay
  // que tocarla aquí también.
  congreso: { n: 350, etiqueta: 'diputados · 321 asesores' },
  organismos: { n: 77, etiqueta: 'organismos' },
  // Gobierno, Parlamento y TSJ de cada una, de la Agenda de la Comunicación
  // 2026-2027 (sql/69). Ceuta y Melilla van dentro, pero no son comunidades.
  comunidades: { n: 17, etiqueta: 'comunidades · Gobierno, Parlamento y TSJ' },
  parlamentoUe: { n: 720, etiqueta: 'eurodiputados · 22 comisiones' },
  comisionUe: { n: 27, etiqueta: 'comisarios · 2.096 cargos y funcionarios en DG' },
};

const CARD = {
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 1px 2px rgba(0,0,0,.04)',
  padding: '22px 24px',
  minHeight: 150,
  textDecoration: 'none',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
};

const ESTRELLAS = [
  [9, 3], [10.5, 3.4], [11.6, 4.5], [12, 6], [11.6, 7.5], [10.5, 8.6],
  [9, 9], [7.5, 8.6], [6.4, 7.5], [6, 6], [6.4, 4.5], [7.5, 3.4],
];

function Bandera({ pais }) {
  if (pais === 'ue') {
    return (
      <svg viewBox="0 0 18 12" width="15" height="10" role="img" aria-label="Unión Europea" style={{ display: 'block', flexShrink: 0 }}>
        <rect width="18" height="12" rx="2" fill="#003399" />
        <g fill="#FFCC00">
          {ESTRELLAS.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="0.55" />
          ))}
        </g>
      </svg>
    );
  }
  if (pais === 'es') {
    return (
      <svg viewBox="0 0 18 12" width="15" height="10" role="img" aria-label="España" style={{ display: 'block', flexShrink: 0 }}>
        <rect width="18" height="12" rx="2" fill="#C60B1E" />
        <rect y="3" width="18" height="6" fill="#FFC400" />
      </svg>
    );
  }
  // El sector no es una jurisdicción: una patronal no decide, trata de
  // influir en quien decide. Sin bandera, con un icono que lo diga.
  return <i className="ti ti-users" style={{ fontSize: 14, color: '#8b8780' }} aria-hidden="true"></i>;
}

/** Una sección del directorio, con su cifra. */
function Modulo({ href, pais, titulo, descripcion, cifra, etiqueta }) {
  return (
    <Link href={href} className="bento" style={CARD}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <Bandera pais={pais} />
          <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.2px' }}>{titulo}</span>
        </div>
        <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.55 }}>{descripcion}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, paddingTop: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 23, fontWeight: 600, color: MORADO, lineHeight: 1 }}>
          {cifra === null || cifra === undefined ? '—' : cifra.toLocaleString('es-ES')}
        </span>
        <span style={{ fontSize: 12, color: '#8b8780' }}>{etiqueta}</span>
      </div>
    </Link>
  );
}

export default function InstitutionsPage() {
  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <DirectorioPestanasMovil activa="instituciones" />
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>Instituciones</h1>
        <p style={{ fontSize: 13, color: '#8b8780', margin: '4px 0 0' }}>
          Quién decide, dónde se sienta y de quién depende
        </p>
      </div>

      <div className="reg-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {/* La tarjeta negra de la Base de datos salió de aquí el 05-10-2026:
            ahora es una entrada propia del menú (Directorio > Base de datos). */}

        {/* Una sola tarjeta para el Congreso, con sus cuatro vistas
            dentro. Diputados y Grupos tuvieron entrada propia y eso
            enseñaba una jerarquía falsa: parecían módulos hermanos
            cuando son dos de las cuatro pestañas de la misma sección. */}
        <Modulo
          href="/institutions/comisiones"
          pais="es"
          titulo="Congreso de los Diputados"
          descripcion="Comisiones, diputados, órganos de gobierno, grupos parlamentarios y sus asesores."
          cifra={CIFRAS.congreso.n}
          etiqueta={CIFRAS.congreso.etiqueta}
        />
        <Modulo
          href="/institutions/ministries"
          pais="es"
          titulo="Ministerios"
          descripcion="Ministros, secretarios de Estado, direcciones generales y gabinetes."
          cifra={CIFRAS.ministerios.n}
          etiqueta={CIFRAS.ministerios.etiqueta}
        />
        {/* Los organismos van aparte de Ministerios: no son parte de un
            ministerio sino entes con personalidad jurídica propia, y
            varios —CNMC, AEPD— son autoridades independientes. */}
        <Modulo
          href="/institutions/organismos"
          pais="es"
          titulo="Organismos y reguladores"
          descripcion="CNMC, AEPD, agencias estatales y organismos autónomos que regulan tu sector."
          cifra={CIFRAS.organismos.n}
          etiqueta={CIFRAS.organismos.etiqueta}
        />
        {/* Las comunidades, con sus tres instituciones (Gobierno, Parlamento y
            TSJ). También cuadra la rejilla: sin la tarjeta negra quedaban
            cinco. */}
        <Modulo
          href="/institutions/comunidades"
          pais="es"
          titulo="Comunidades autónomas"
          descripcion="Gobierno, Parlamento y Tribunal Superior de Justicia de las 17 comunidades, Ceuta y Melilla."
          cifra={CIFRAS.comunidades.n}
          etiqueta={CIFRAS.comunidades.etiqueta}
        />
        <Modulo
          href="/institutions/eu-parliament"
          pais="ue"
          titulo="Parlamento Europeo"
          descripcion="Eurodiputados, comisiones, grupos políticos y órganos de gobierno."
          cifra={CIFRAS.parlamentoUe.n}
          etiqueta={CIFRAS.parlamentoUe.etiqueta}
        />
        <Modulo
          href="/institutions/eu-commission"
          pais="ue"
          titulo="Comisión Europea"
          descripcion="Comisarios, gabinetes, direcciones generales y jefes de unidad."
          cifra={CIFRAS.comisionUe.n}
          etiqueta={CIFRAS.comisionUe.etiqueta}
        />


      </div>

      {/* Al pie y en una línea, igual que en el regulatorio. Como
          tarjeta pesaba lo mismo que una sección real y prometía más de
          lo que es. */}
      <div style={{ fontSize: 11.5, color: '#a8a49c', paddingTop: 16 }}>
        Próximamente · Senado, y organismos y agencias de la UE
      </div>


    </div>
  );
}
