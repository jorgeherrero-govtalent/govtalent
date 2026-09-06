'use client';

import { useState } from 'react';
import Link from 'next/link';
import UpgradeModal from '@/components/UpgradeModal';

/**
 * Directorio institucional.
 *
 * Mismo lenguaje que el regulatorio: rejilla de dos columnas, todas las
 * piezas del mismo tamaño, la negra primero.
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
 */
const CIFRAS = {
  ministerios: { n: 257, etiqueta: 'altos cargos · 22 ministerios' },
  congreso: { n: 350, etiqueta: 'diputados · 44 comisiones' },
  organismos: { n: 77, etiqueta: 'organismos' },
  parlamentoUe: { n: 720, etiqueta: 'eurodiputados · 22 comisiones' },
  comisionUe: { n: 2096, etiqueta: 'cargos · 45 direcciones generales' },
  organizaciones: { n: 2005, etiqueta: 'organizaciones' },
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

/** Una sección del directorio, con su cifra en vivo. */
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
  const [upsell, setUpsell] = useState(false);

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>Instituciones</h1>
        <p style={{ fontSize: 13, color: '#8b8780', margin: '4px 0 0' }}>
          Quién decide, dónde se sienta y de quién depende
        </p>
      </div>

      <div className="reg-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {/* La tarjeta negra, como en el regulatorio: es lo que la
            plataforma añade por encima de las fuentes, no una sección
            más. Aquí es además la única de pago, y lo dice antes de que
            nadie pulse: un CTA que lleva a un muro sin avisar quema más
            confianza de la que convierte. */}
        <button
          type="button"
          onClick={() => setUpsell(true)}
          className="bento"
          style={{
            background: '#15140f',
            borderRadius: 16,
            padding: '22px 24px',
            minHeight: 150,
            border: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            font: 'inherit',
          }}
        >
          <div>
            <div style={{ fontSize: 11.5, color: '#8f7ff5', letterSpacing: '.3px', marginBottom: 10 }}>
              BASE DE DATOS DE CARGOS
            </div>
            <div style={{ fontSize: 14.5, color: '#fff', lineHeight: 1.5 }}>
              Todos los cargos de la administración en España y la UE en una sola tabla.
            </div>
          </div>
          {/* Mismo tratamiento que la tarjeta negra del regulatorio:
              enlace en morado, sin botón. Que sea de pago se dice en el
              modal, no en la tarjeta. */}
          <div style={{ fontSize: 12.5, color: '#8f7ff5', fontWeight: 600, paddingTop: 18 }}>
            Ver base de datos →
          </div>
        </button>

        <Modulo
          href="/institutions/ministries"
          pais="es"
          titulo="Ministerios"
          descripcion="Ministros, secretarios de Estado, direcciones generales y gabinetes."
          cifra={CIFRAS.ministerios.n}
          etiqueta={CIFRAS.ministerios.etiqueta}
        />
        {/* Una sola tarjeta para el Congreso, con sus cuatro vistas
            dentro. Diputados y Grupos tuvieron entrada propia y eso
            enseñaba una jerarquía falsa: parecían módulos hermanos
            cuando son dos de las cuatro pestañas de la misma sección. */}
        <Modulo
          href="/institutions/comisiones"
          pais="es"
          titulo="Congreso de los Diputados"
          descripcion="Comisiones, diputados, órganos de gobierno y grupos parlamentarios."
          cifra={CIFRAS.congreso.n}
          etiqueta={CIFRAS.congreso.etiqueta}
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
        <Modulo
          href="/organizations"
          pais="sector"
          titulo="Organizaciones"
          descripcion="Patronales, consultoras y empresas que trabajan con la Administración."
          cifra={CIFRAS.organizaciones.n}
          etiqueta={CIFRAS.organizaciones.etiqueta}
        />

      </div>

      {/* Al pie y en una línea, igual que en el regulatorio. Como
          tarjeta pesaba lo mismo que una sección real y prometía más de
          lo que es. */}
      <div style={{ fontSize: 11.5, color: '#a8a49c', paddingTop: 16 }}>
        Próximamente · Senado, y organismos y agencias de la UE
      </div>

      {upsell && (
        <UpgradeModal
          title="La base de datos de cargos es una función Pro"
          message="Todos los cargos de la administración en España y la UE en una sola tabla: filtra por ministerio, organismo o comisión, y expórtala cuando la necesites."
          onClose={() => setUpsell(false)}
        />
      )}
    </div>
  );
}
