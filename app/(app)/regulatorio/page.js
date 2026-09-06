'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Portada de Regulatorio.
 *
 * Dos cambios de fondo respecto a la versión anterior.
 *
 * El primero es de vocabulario. "Expediente" y "procedimiento" son los
 * nombres internos de las bases de datos de Bruselas, y para colmo
 * significan casi lo mismo para quien no vive dentro. Ahora el titular de
 * cada tarjeta es la institución, que sí se reconoce de un vistazo, y
 * debajo va una línea en castellano llano diciendo qué hay dentro.
 *
 * El segundo es qué se mide. Antes cada tarjeta enseñaba un total del
 * mundo: 44 abiertas, 3.802 en total. Eso no dice nada a nadie. Ahora
 * enseña cuántas de esas te afectan a ti, que es la promesa entera de la
 * plataforma dicha en una barra.
 *
 * Las tarjetas se ordenan de lo que aún puedes influir a lo que ya es
 * obligatorio: primero donde se admiten aportaciones, luego lo que se
 * negocia, y al final el BOE, que es cumplir.
 */

const VERDE = '#1d6f5c';
const MORADO = '#6d5aef';

const CARD = {
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 1px 2px rgba(0,0,0,.04)',
  padding: '22px 24px',
  textDecoration: 'none',
  color: 'inherit',
  display: 'block',
};

const ESTRELLAS = [
  [9, 3], [10.5, 3.4], [11.6, 4.5], [12, 6], [11.6, 7.5], [10.5, 8.6],
  [9, 9], [7.5, 8.6], [6.4, 7.5], [6, 6], [6.4, 4.5], [7.5, 3.4],
];

function Bandera({ pais, size = 17 }) {
  const alto = (size * 12) / 18;
  if (pais === 'ue') {
    return (
      <svg viewBox="0 0 18 12" width={size} height={alto} role="img" aria-label="Unión Europea" style={{ display: 'block', flexShrink: 0 }}>
        <rect width="18" height="12" rx="2" fill="#003399" />
        <g fill="#FFCC00">
          {ESTRELLAS.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="0.55" />
          ))}
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 12" width={size} height={alto} role="img" aria-label="España" style={{ display: 'block', flexShrink: 0 }}>
      <rect width="18" height="12" rx="2" fill="#C60B1E" />
      <rect y="3" width="18" height="6" fill="#FFC400" />
    </svg>
  );
}

/**
 * Tarjeta de una institución.
 *
 * La barra solo aparece si hay análisis de sector. Sin él, un 0 de 44
 * diría "no te afecta nada", que es mentira: lo cierto es que todavía no
 * lo sabemos. En ese caso se enseñan los totales, que sí son verdad.
 */
function Institucion({ href, titulo, descripcion, afectan, universo, etiquetaUniverso, pie, color = MORADO, mostrarBarra }) {
  // La barra solo tiene sentido si hay algo que enseñar. "0 te afectan"
  // ocupa el mismo espacio que un dato y no lo es: o no hay coincidencias
  // o el análisis no cubre esa fuente, y en ninguno de los dos casos el
  // cero informa. Sin barra se enseñan los totales, que sí son ciertos.
  const conBarra = mostrarBarra && universo > 0 && afectan > 0;
  const pct = conBarra ? Math.max(3, Math.min(100, Math.round((afectan / universo) * 100))) : 0;

  return (
    <Link
      href={href}
      className="bento"
      style={{ ...CARD, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.2px' }}>{titulo}</div>
        <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.55, paddingTop: 6 }}>{descripcion}</div>
      </div>

      {conBarra ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ height: 8, borderRadius: 5, background: '#f2f0ec', overflow: 'hidden', display: 'flex' }}>
            <span style={{ width: `${pct}%`, background: color, display: 'block' }}></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingTop: 8 }}>
            <span style={{ fontSize: 11.5, color }}>
              {afectan} {afectan === 1 ? 'te afecta' : 'te afectan'}
            </span>
            <span style={{ fontSize: 11.5, color: '#8b8780' }}>
              {universo === null ? '—' : universo.toLocaleString('es-ES')} {etiquetaUniverso}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '.5px solid #f2f0ec', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1 }}>
              {universo === null ? '—' : universo.toLocaleString('es-ES')}
            </div>
            <div style={{ fontSize: 11, color: '#8b8780', paddingTop: 3 }}>{etiquetaUniverso}</div>
          </div>
          {pie && (
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1 }}>
                {pie.n === null ? '—' : pie.n.toLocaleString('es-ES')}
              </div>
              <div style={{ fontSize: 11, color: '#8b8780', paddingTop: 3 }}>{pie.label}</div>
            </div>
          )}
        </div>
      )}
    </Link>
  );
}

function Seccion({ pais, titulo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '24px 0 12px' }}>
      <Bandera pais={pais} />
      <span style={{ fontSize: 12.5, color: '#8b8780' }}>{titulo}</span>
      <div style={{ flex: 1, height: '.5px', background: '#e0dfd8' }}></div>
    </div>
  );
}

export default function RegulatorioPage() {
  const supabase = createClient();
  const [sector, setSector] = useState(null);
  const [afectan, setAfectan] = useState({});
  const [cifras, setCifras] = useState({
    ventanas: null,
    expedientes: null,
    tramitacion: null,
    procedimientos: null,
    esVivas: null,
    esTotal: null,
    actividadTotal: null,
    boeSemana: null,
    boeMes: null,
    consultasAbiertas: null,
    consultasUrgentes: null,
  });

  useEffect(() => {
    Promise.all([
      // Recuentos con head: true, así que no se traen filas.
      supabase.from('eu_open_windows').select('id', { count: 'exact', head: true }),
      supabase.from('eu_initiatives').select('id', { count: 'exact', head: true }),
      supabase.from('ep_procedures').select('process_id', { count: 'exact', head: true }).eq('is_closed', false),
      supabase.from('ep_procedures').select('process_id', { count: 'exact', head: true }),
      supabase.from('es_initiatives').select('num_expediente', { count: 'exact', head: true }).eq('is_closed', false),
      supabase.from('es_initiatives').select('num_expediente', { count: 'exact', head: true }),
      // Se cuenta es_activity entera, sin filtrar por tipo: si mañana
      // aparece un tipo nuevo, se perdería sin que nadie lo notase.
      supabase.from('es_activity').select('num_expediente', { count: 'exact', head: true }),
      supabase
        .from('boe_documents')
        .select('id', { count: 'exact', head: true })
        .gte('fecha_publicacion', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
      supabase
        .from('boe_documents')
        .select('id', { count: 'exact', head: true })
        .gte('fecha_publicacion', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
      // Sobre la vista y no sobre la tabla: el estado se calcula allí a
      // partir de fecha_fin, y repetir ese cálculo aquí es garantizar que
      // algún día dejen de coincidir.
      supabase.from('consultas_estado').select('id', { count: 'exact', head: true }).in('estado', ['abierta', 'urgente']),
      supabase.from('consultas_estado').select('id', { count: 'exact', head: true }).eq('estado', 'urgente'),
      // El análisis del usuario. Antes esta página declaraba el estado
      // `sector` y no lo rellenaba nunca, así que la franja de arriba
      // enseñaba "¿Qué te afecta a ti?" incluso a quien ya tenía veinte
      // asuntos analizados.
      supabase.from('sector_matches').select('kind, plazo, visto'),
    ]).then(([ven, exp, tram, proc, esV, esT, act, boeS, boeM, consA, consU, { data: matches }]) => {
      setCifras({
        ventanas: ven.count ?? null,
        expedientes: exp.count ?? null,
        tramitacion: tram.count ?? null,
        procedimientos: proc.count ?? null,
        esVivas: esV.count ?? null,
        esTotal: esT.count ?? null,
        actividadTotal: act.count ?? null,
        boeSemana: boeS.count ?? null,
        boeMes: boeM.count ?? null,
        consultasAbiertas: consA.count ?? null,
        consultasUrgentes: consU.count ?? null,
      });

      const m = matches || [];
      const porKind = {};
      for (const x of m) porKind[x.kind] = (porKind[x.kind] || 0) + 1;
      setAfectan(porKind);

      const ahora = Date.now();
      setSector({
        n: m.length,
        conPlazo: m.filter((x) => x.plazo && new Date(x.plazo).getTime() >= ahora).length,
        nuevos: m.filter((x) => x.visto === false).length,
      });
    });
  }, []);

  const suma = (...xs) => (xs.every((x) => x !== null) ? xs.reduce((a, b) => a + b, 0) : null);
  const hayAnalisis = (sector?.n || 0) > 0;

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>Regulatorio</h1>
        <p style={{ fontSize: 13, color: '#8b8780', margin: '4px 0 0' }}>
          De lo que aún puedes influir a lo que ya es obligatorio
        </p>
      </div>

      {/* La misma tarjeta negra que la home: es donde vive lo que la
          plataforma ha deducido, y el análisis cruza las cinco fuentes,
          así que está por encima de ellas y no es una tarjeta más. */}
      <Link
        href="/regulatorio/sector"
        className="bento"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          background: '#15140f',
          borderRadius: 16,
          padding: '22px 24px',
          textDecoration: 'none',
          color: 'inherit',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11.5, color: '#8f7ff5', letterSpacing: '.3px', marginBottom: 10 }}>
            QUÉ IMPACTA EN TU SECTOR
          </div>
          {hayAnalisis ? (
            <div style={{ fontSize: 14.5, color: '#fff', lineHeight: 1.5 }}>
              {sector.n} {sector.n === 1 ? 'asunto te afecta' : 'asuntos te afectan'}
              {sector.conPlazo > 0
                ? `, ${sector.conPlazo} con plazo abierto.`
                : '. Ninguno con plazo abierto ahora mismo.'}
              {sector.nuevos > 0 &&
                ` ${sector.nuevos} ${sector.nuevos === 1 ? 'nuevo' : 'nuevos'} desde tu último análisis.`}
            </div>
          ) : (
            <div style={{ fontSize: 14.5, color: '#fff', lineHeight: 1.5 }}>
              Dinos a qué se dedica tu organización y revisamos las cinco fuentes para decirte qué te toca.
            </div>
          )}
        </div>
        <span
          style={{
            background: hayAnalisis ? 'transparent' : MORADO,
            color: hayAnalisis ? '#8f7ff5' : '#fff',
            borderRadius: 8,
            padding: hayAnalisis ? 0 : '10px 18px',
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {hayAnalisis ? 'Ver el análisis →' : 'Analizar mi sector'}
        </span>
      </Link>

      <Seccion pais="ue" titulo="Unión Europea" />
      {/* Rejilla fija de tres y no auto-fit: con auto-fit las dos
          tarjetas europeas se estiraban a media pantalla y las tres
          españolas quedaban a un tercio, así que parecían de familias
          distintas. Ahora todas miden lo mismo aunque en Europa sobre
          un hueco. */}
      <div className="reg-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <Institucion
          href="/initiatives"
          titulo="Comisión Europea"
          descripcion="Lo que Bruselas está preparando y todavía admite aportaciones."
          afectan={afectan.expediente || 0}
          universo={cifras.ventanas}
          etiquetaUniverso="admiten aportaciones"
          pie={{ n: cifras.expedientes, label: 'en total' }}
          mostrarBarra={hayAnalisis}
        />
        <Institucion
          href="/procedures"
          titulo="Parlamento Europeo"
          descripcion="Las normas que se están negociando, con sus ponentes y comisiones."
          afectan={afectan.procedimiento || 0}
          universo={cifras.tramitacion}
          etiquetaUniverso="en negociación"
          pie={{ n: cifras.procedimientos, label: 'en total' }}
          mostrarBarra={hayAnalisis}
        />
      </div>

      <Seccion pais="es" titulo="España" />
      <div className="reg-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <Institucion
          href="/regulatorio/consultas"
          titulo="Ministerios"
          descripcion="Consultas previas y audiencias públicas, con su plazo para opinar."
          afectan={afectan.consulta || 0}
          universo={cifras.consultasAbiertas}
          etiquetaUniverso="abiertas"
          pie={{ n: cifras.consultasUrgentes, label: 'cierran esta semana' }}
          mostrarBarra={hayAnalisis}
        />
        <Institucion
          href="/congreso"
          titulo="Congreso"
          descripcion="Leyes en trámite, comparecencias y preguntas, con sus plazos."
          afectan={afectan.ley || 0}
          universo={cifras.esVivas}
          etiquetaUniverso="leyes vivas"
          pie={{ n: suma(cifras.esTotal, cifras.actividadTotal), label: 'registradas' }}
          mostrarBarra={hayAnalisis}
        />
        {/* El BOE no lleva barra ni en verde ni en morado: aquí ya no se
            influye, se cumple. Enseñar "cuántas te afectan" invitaría a
            una acción que ya no existe. */}
        <Institucion
          href="/boe"
          titulo="BOE"
          descripcion="Lo ya aprobado y los nombramientos de altos cargos."
          afectan={null}
          universo={cifras.boeSemana}
          etiquetaUniverso="últimos 7 días"
          pie={{ n: cifras.boeMes, label: 'últimos 30 días' }}
          color={VERDE}
          mostrarBarra={false}
        />
      </div>

      <div style={{ fontSize: 11.5, color: '#a8a49c', paddingTop: 16 }}>Próximamente · Senado</div>
    </div>
  );
}
