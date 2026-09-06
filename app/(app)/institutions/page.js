'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
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
  const supabase = createClient();
  const [upsell, setUpsell] = useState(false);
  const [n, setN] = useState({
    cargos: null,
    diputados: null,
    comisionesEs: null,
    organismos: null,
    meps: null,
    comisionesUe: null,
    personasCe: null,
    organizaciones: null,
  });

  useEffect(() => {
    // Solo recuentos, con head: true, así que no se traen filas.
    //
    // Los filtros son los mismos que usa cada sección al entrar. Si la
    // portada contara de otra forma, el usuario vería 312 aquí y 77
    // dentro, y con razón dejaría de fiarse de los dos números.
    Promise.all([
      supabase.from('government_officials').select('slug', { count: 'exact', head: true }).eq('active', true),
      supabase.from('deputies').select('id', { count: 'exact', head: true }),
      supabase.from('es_committees').select('id', { count: 'exact', head: true }),
      // relevante = true, igual que en la sección: filtrar por categoría
      // de DIR3 mezclaba el Museo del Prado con la CNMV.
      supabase.from('age_units').select('dir3_code', { count: 'exact', head: true }).eq('activo', true).eq('relevante', true),
      supabase.from('eu_meps_directory').select('*', { count: 'exact', head: true }),
      supabase.from('eu_committees_directory').select('*', { count: 'exact', head: true }),
      supabase.from('ec_people_directory').select('*', { count: 'exact', head: true }),
      supabase.from('organizations').select('id', { count: 'exact', head: true }),
    ]).then(([cargos, dip, comEs, org, meps, comUe, ce, orgs]) => {
      setN({
        cargos: cargos.count ?? null,
        diputados: dip.count ?? null,
        comisionesEs: comEs.count ?? null,
        organismos: org.count ?? null,
        meps: meps.count ?? null,
        comisionesUe: comUe.count ?? null,
        personasCe: ce.count ?? null,
        organizaciones: orgs.count ?? null,
      });
    });
  }, []);

  const conComisiones = (n1, n2, uno, dos) =>
    n2 === null || n2 === undefined ? uno : `${uno} · ${n2} ${dos}`;

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 18 }}>
            <span
              style={{
                fontSize: 12.5,
                background: MORADO,
                color: '#fff',
                borderRadius: 8,
                padding: '9px 18px',
                fontWeight: 600,
              }}
            >
              Ver
            </span>
            <span style={{ fontSize: 11.5, color: '#8b8780' }}>Función Pro</span>
          </div>
        </button>

        <Modulo
          href="/institutions/ministries"
          pais="es"
          titulo="Ministerios"
          descripcion="Ministros, secretarios de Estado, direcciones generales y gabinetes."
          cifra={n.cargos}
          etiqueta="altos cargos"
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
          cifra={n.diputados}
          etiqueta={conComisiones(n.diputados, n.comisionesEs, 'diputados', 'comisiones')}
        />
        {/* Los organismos van aparte de Ministerios: no son parte de un
            ministerio sino entes con personalidad jurídica propia, y
            varios —CNMC, AEPD— son autoridades independientes. */}
        <Modulo
          href="/institutions/organismos"
          pais="es"
          titulo="Organismos y reguladores"
          descripcion="CNMC, AEPD, agencias estatales y organismos autónomos que regulan tu sector."
          cifra={n.organismos}
          etiqueta="organismos"
        />
        <Modulo
          href="/institutions/eu-parliament"
          pais="ue"
          titulo="Parlamento Europeo"
          descripcion="Eurodiputados, comisiones, grupos políticos y órganos de gobierno."
          cifra={n.meps}
          etiqueta={conComisiones(n.meps, n.comisionesUe, 'eurodiputados', 'comisiones')}
        />
        <Modulo
          href="/institutions/eu-commission"
          pais="ue"
          titulo="Comisión Europea"
          descripcion="Comisarios, gabinetes, direcciones generales y jefes de unidad."
          cifra={n.personasCe}
          etiqueta="personas"
        />
        <Modulo
          href="/organizations"
          pais="sector"
          titulo="Organizaciones"
          descripcion="Patronales, consultoras y empresas que trabajan con la Administración."
          cifra={n.organizaciones}
          etiqueta="organizaciones"
        />

        {/* La octava casilla evita que la rejilla quede coja, y de paso
            dice hacia dónde va el directorio. */}
        <div
          style={{
            border: '1px dashed #d5d3c9',
            borderRadius: 16,
            padding: '22px 24px',
            minHeight: 150,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 12, color: '#a8a49c', letterSpacing: '.3px', marginBottom: 6 }}>PRÓXIMAMENTE</div>
          <div style={{ fontSize: 14, color: '#8b8780', lineHeight: 1.5 }}>Consejo de la UE y Senado</div>
        </div>
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
