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
/**
 * Trazo ornamental de la tarjeta.
 *
 * OJO: ESTO NO ES UN GRÁFICO. No mide nada, no consulta la base de datos
 * y no cambia nunca. Es un trazo decorativo, fijo por institución, para
 * dar peso visual a la tarjeta.
 *
 * Se probó con datos reales y no funcionaba: tres de las cinco fuentes
 * no tienen actividad continua que enseñar. En el Congreso se medían
 * presentaciones de iniciativas, que fuera de periodo de sesiones son
 * cero; en la Comisión, altas en nuestra propia base, que es el ritmo al
 * que descubre cosas el sync y no el de Bruselas. Las líneas salían
 * planas y parecía la plataforma rota.
 *
 * La información de verdad vive en la cifra de abajo y en la tarjeta
 * negra. Si algún día estas curvas van a llevar datos, hay que quitar
 * este comentario y traerlos de una serie real: dejar el trazo fijo y
 * llamarlo actividad sería mentir con forma de gráfico.
 */
const TRAZOS = {
  ce: '0,38 30,34 60,36 90,24 120,28 150,18 180,22 210,12 240,16 270,8 300,11',
  ministerios: '0,24 30,22 60,26 90,18 120,20 150,24 180,16 210,20 240,14 270,18 300,12',
  pe: '0,20 30,24 60,18 90,26 120,16 150,22 180,14 210,20 240,12 270,18 300,14',
  congreso: '0,30 30,26 60,28 90,20 120,24 150,14 180,18 210,10 240,16 270,8 300,6',
  boe: '0,16 30,22 60,10 90,24 120,12 150,26 180,14 210,22 240,10 270,20 300,15',
};

function Trazo({ nombre, color }) {
  const puntos = TRAZOS[nombre];
  if (!puntos) return null;
  const ultimo = puntos.split(' ').pop().split(',');
  return (
    <svg
      viewBox="0 0 300 40"
      style={{ width: '100%', height: 40, display: 'block', margin: '14px 0 10px' }}
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={puntos} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ultimo[0]} cy={ultimo[1]} r="3" fill={color} />
    </svg>
  );
}

function Institucion({ href, pais, titulo, descripcion, trazo, cifra, etiqueta, afectan, color = MORADO }) {
  return (
    <Link
      href={href}
      className="bento"
      style={{ ...CARD, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <Bandera pais={pais} size={15} />
          <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.2px' }}>{titulo}</span>
        </div>
        <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.55 }}>{descripcion}</div>
      </div>

      <div>
        <Trazo nombre={trazo} color={color} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 24, fontWeight: 600, color, lineHeight: 1 }}>
            {cifra === null || cifra === undefined ? '—' : cifra.toLocaleString('es-ES')}
          </span>
          <span style={{ fontSize: 12, color: '#8b8780' }}>{etiqueta}</span>
          {/* El dato personal no desaparece: se queda como coletilla, y
              solo si hay algo que contar. Un "0 te afectan" no distingue
              entre no haber nada tuyo y no cubrir esa fuente. */}
          {afectan > 0 && (
            <span style={{ fontSize: 12, color: MORADO }}>· {afectan} te {afectan === 1 ? 'afecta' : 'afectan'}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function RegulatorioPage() {
  const supabase = createClient();
  const [sector, setSector] = useState(null);
  const [afectan, setAfectan] = useState({});
  const [cifras, setCifras] = useState({
    ventanas: null,
    tramitacion: null,
    esVivas: null,
    boeSemana: null,
    consultasAbiertas: null,
    consultasUrgentes: null,
  });

  useEffect(() => {
    Promise.all([
      // Recuentos con head: true, así que no se traen filas.
      supabase.from('eu_open_windows').select('id', { count: 'exact', head: true }),
      supabase.from('ep_procedures').select('process_id', { count: 'exact', head: true }).eq('is_closed', false),
      supabase.from('es_initiatives').select('num_expediente', { count: 'exact', head: true }).eq('is_closed', false),
      supabase
        .from('boe_documents')
        .select('id', { count: 'exact', head: true })
        .gte('fecha_publicacion', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
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

    ]).then(([ven, tram, esV, boeS, consA, consU, { data: matches }]) => {
      setCifras({
        ventanas: ven.count ?? null,
        tramitacion: tram.count ?? null,
        esVivas: esV.count ?? null,
        boeSemana: boeS.count ?? null,
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

  const hayAnalisis = (sector?.n || 0) > 0;

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>Regulatorio</h1>
        <p style={{ fontSize: 13, color: '#8b8780', margin: '4px 0 0' }}>
          De lo que aún puedes influir a lo que ya es obligatorio
        </p>
      </div>

      {/* Una sola rejilla de dos columnas, y la tarjeta negra dentro y
          no encima: es la primera casilla, del mismo tamaño que las
          demás. Seis piezas, tres filas limpias.

          No se separa Europa de España. Un plazo de Bruselas que vence
          el jueves es más urgente que una ley española parada dos años,
          y el bloque por país escondía justo eso. El orden lo marca el
          subtítulo: de lo que aún admite aportaciones a lo que ya solo
          toca cumplir. Quien busque una institución concreta la
          reconoce por su bandera. */}
      <div className="reg-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        <Link
          href="/regulatorio/sector"
          className="bento"
          style={{
            background: '#15140f',
            borderRadius: 16,
            padding: '22px 24px',
            textDecoration: 'none',
            color: 'inherit',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 11.5, color: '#8f7ff5', letterSpacing: '.3px', marginBottom: 10 }}>
              QUÉ IMPACTA EN TU SECTOR
            </div>
            {hayAnalisis ? (
              <div style={{ fontSize: 14.5, color: '#fff', lineHeight: 1.5 }}>
                {/* El plazo solo se menciona si lo hay: anunciar que no
                    queda ninguno gasta la frase más visible de la página
                    en una ausencia. */}
                {sector.n} {sector.n === 1 ? 'asunto te afecta' : 'asuntos te afectan'}
                {sector.conPlazo > 0 ? `, ${sector.conPlazo} con plazo abierto.` : '.'}
                {sector.nuevos > 0 &&
                  ` ${sector.nuevos} ${sector.nuevos === 1 ? 'nuevo' : 'nuevos'} desde tu último análisis.`}
              </div>
            ) : (
              <div style={{ fontSize: 14.5, color: '#fff', lineHeight: 1.5 }}>
                Dinos a qué se dedica tu organización y revisamos las cinco fuentes para decirte qué te toca.
              </div>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: '#8f7ff5', fontWeight: 600, paddingTop: 18 }}>
            {hayAnalisis ? 'Ver el análisis →' : 'Analizar mi sector →'}
          </div>
        </Link>

        <Institucion
          href="/initiatives"
          pais="ue"
          titulo="Comisión Europea"
          descripcion="Lo que Bruselas está preparando y todavía admite aportaciones."
          trazo="ce"
          cifra={cifras.ventanas}
          etiqueta="admiten aportaciones"
          afectan={afectan.expediente || 0}
        />
        <Institucion
          href="/regulatorio/consultas"
          pais="es"
          titulo="Ministerios"
          descripcion="Consultas previas y audiencias públicas, con su plazo para opinar."
          trazo="ministerios"
          cifra={cifras.consultasAbiertas}
          etiqueta={
            cifras.consultasUrgentes > 0
              ? `abiertas · ${cifras.consultasUrgentes} cierran esta semana`
              : 'abiertas'
          }
          afectan={afectan.consulta || 0}
        />
        <Institucion
          href="/procedures"
          pais="ue"
          titulo="Parlamento Europeo"
          descripcion="Las normas que se están negociando, con sus ponentes y comisiones."
          trazo="pe"
          cifra={cifras.tramitacion}
          etiqueta="en negociación"
          afectan={afectan.procedimiento || 0}
        />
        <Institucion
          href="/congreso"
          pais="es"
          titulo="Congreso"
          descripcion="Leyes en trámite, comparecencias y preguntas, con sus plazos."
          trazo="congreso"
          cifra={cifras.esVivas}
          etiqueta="leyes vivas"
          afectan={afectan.ley || 0}
        />
        {/* El BOE en verde: aquí ya no se influye, se cumple. Y sin
            coletilla de "te afectan" por lo mismo. */}
        <Institucion
          href="/boe"
          pais="es"
          titulo="BOE"
          descripcion="Lo ya aprobado y los nombramientos de altos cargos."
          trazo="boe"
          cifra={cifras.boeSemana}
          etiqueta="esta semana"
          color={VERDE}
        />
      </div>

      <div style={{ fontSize: 11.5, color: '#a8a49c', paddingTop: 16 }}>Próximamente · Senado</div>
    </div>
  );
}
