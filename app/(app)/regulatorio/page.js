'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Portada de Regulatorio.
 *
 * Agrupa lo que antes eran dos entradas sueltas en la barra de navegación
 * —Expedientes y Procedimientos— y deja sitio para los dos módulos
 * españoles cuando estén.
 *
 * Los recuentos se piden a la base de datos en lugar de escribirlos a
 * mano: si mañana el sync carga más procedimientos, la portada lo refleja
 * sola. Un número desactualizado en la primera pantalla resta más
 * credibilidad de lo que suma tenerlo.
 */

function FlagEU() {
  return (
    <span
      role="img"
      aria-label="Unión Europea"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 14,
        borderRadius: 3,
        background: '#003399',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #FFCC00' }} />
    </span>
  );
}

function FlagES() {
  return (
    <span
      role="img"
      aria-label="España"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 20,
        height: 14,
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ height: '25%', background: '#C60B1E' }} />
      <span style={{ height: '50%', background: '#FFC400' }} />
      <span style={{ height: '25%', background: '#C60B1E' }} />
    </span>
  );
}

function Cifra({ n, label, destacada }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: destacada ? '#3C3489' : '#1a1a1a' }}>
        {n === null ? '—' : n.toLocaleString('es-ES')}
      </div>
      <div style={{ fontSize: 9.5, color: '#999' }}>{label}</div>
    </div>
  );
}

// Misma estructura que ModuleCard de Instituciones: el icono va suelto
// arriba en morado —no dentro de un cuadrado con fondo— el título debajo,
// y el "Ver..." cierra la tarjeta. Sin eso las dos secciones no se
// sentían como el mismo producto.
function ModuloCard({ href, icon, titulo, fuente, descripcion, cta, cifras }) {
  return (
    <Link href={href} className="card" style={{ padding: 18, textDecoration: 'none', color: 'inherit' }}>
      <i className={`ti ti-${icon}`} style={{ color: '#6d5aef', fontSize: 19 }}></i>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{titulo}</div>
      {fuente && <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 2 }}>{fuente}</div>}
      <div style={{ fontSize: 11.5, color: '#888', marginTop: 5, marginBottom: 10 }}>{descripcion}</div>
      {cifras?.length > 0 && (
        <div style={{ display: 'flex', gap: 18, paddingTop: 11, marginBottom: 11, borderTop: '.5px solid #f0f0eb' }}>
          {cifras.map((c) => (
            <Cifra key={c.label} {...c} />
          ))}
        </div>
      )}
      <span style={{ fontSize: 12, color: '#6d5aef', fontWeight: 600 }}>{cta} →</span>
    </Link>
  );
}

/**
 * Los módulos pendientes en una línea, no como tarjetas.
 *
 * Con tres tarjetas en gris frente a tres activas, la mitad de la
 * pantalla comunicaba que el producto no funciona — cuando hay más de
 * doce mil asuntos cargados. Conviene que la interfaz magnifique lo que
 * ya existe, no lo que falta.
 */
function Proximamente({ items }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10.5, color: '#aaa' }}>Próximamente</span>
      {items.map((t, i) => (
        <span key={t} style={{ fontSize: 11, color: '#999' }}>
          {i > 0 && <span style={{ color: '#ddd', marginRight: 8 }}>·</span>}
          {t}
        </span>
      ))}
    </div>
  );
}

export default function RegulatorioPage() {
  const supabase = createClient();
  const [sector, setSector] = useState(null);
  const [cifras, setCifras] = useState({
    expedientes: null,
    ventanas: null,
    procedimientos: null,
    tramitacion: null,
    esTotal: null,
    esVivas: null,
    actividadTotal: null,
    boeSemana: null,
    boeMes: null,
    consultasAbiertas: null,
    consultasUrgentes: null,
  });

  useEffect(() => {
    // Solo recuentos, con head: true, así que no se traen filas.
    Promise.all([
      supabase.from('eu_initiatives').select('id', { count: 'exact', head: true }),
      supabase.from('eu_open_windows').select('id', { count: 'exact', head: true }),
      supabase.from('ep_procedures').select('process_id', { count: 'exact', head: true }),
      supabase
        .from('ep_procedures')
        .select('process_id', { count: 'exact', head: true })
        .eq('is_closed', false),
      supabase.from('es_initiatives').select('num_expediente', { count: 'exact', head: true }),
      supabase
        .from('es_initiatives')
        .select('num_expediente', { count: 'exact', head: true })
        .eq('is_closed', false),
      // Las PNL, comparecencias y decretos viven en es_activity: la
      // fuente da menos campos para ellas y no comparten estructura con
      // las leyes.
      //
      // SE CUENTA LA TABLA ENTERA, SIN FILTRAR POR TIPO. Antes el total
      // sumaba solo 'pnl' y 'comparecencia' mientras que el de en
      // trámite contaba todos los tipos no cerrados, así que los 50
      // decretos desaparecían del total —7969 en vez de 8019— y
      // cualquier tipo nuevo se perdería igual sin que nadie lo notara.
      supabase.from('es_activity').select('num_expediente', { count: 'exact', head: true }),
      supabase
        .from('boe_documents')
        .select('id', { count: 'exact', head: true })
        .gte('fecha_publicacion', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
      supabase
        .from('boe_documents')
        .select('id', { count: 'exact', head: true })
        .gte('fecha_publicacion', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
      // Se cuenta sobre consultas_estado y no sobre la tabla: la vista ya
      // calcula el estado y los dias restantes a partir de fecha_fin, y
      // repetir aqui esa logica es garantizar que un dia dejen de
      // coincidir.
      supabase
        .from('consultas_estado')
        .select('id', { count: 'exact', head: true })
        .in('estado', ['abierta', 'urgente']),
      supabase
        .from('consultas_estado')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'urgente'),
    ]).then(([exp, ven, proc, tram, esT, esV, actTotal, boeH, boeM, consA, consU]) => {
      setCifras({
        expedientes: exp.count ?? null,
        ventanas: ven.count ?? null,
        procedimientos: proc.count ?? null,
        tramitacion: tram.count ?? null,
        esTotal: esT.count ?? null,
        esVivas: esV.count ?? null,
        actividadTotal: actTotal.count ?? null,
        boeSemana: boeH.count ?? null,
        boeMes: boeM.count ?? null,
        consultasAbiertas: consA.count ?? null,
        consultasUrgentes: consU.count ?? null,
      });
    });
  }, []);

  const suma = (...xs) => (xs.every((x) => x !== null) ? xs.reduce((a, b) => a + b, 0) : null);
  // Se retiraron los totales de cabecera y de bloque: "300 en trámite"
  // contaba solo las leyes mientras la tarjeta de debajo decía 4.530, y
  // se contradecían a la vista. Cada tarjeta lleva ahora sus propias
  // cifras, que son las que se pueden explicar.

  // España: lo vivo son las leyes en trámite más la actividad abierta.
  // La cabecera decía 300 —solo leyes— cuando en realidad son 4.530.
  // Solo las leyes vivas, no toda es_activity sin cerrar.
  //
  // POR QUÉ. En el Congreso `is_closed = false` no quiere decir que algo
  // se esté tramitando, sino que no consta resultado: una PNL de 2023
  // que nunca llegó al orden del día sigue abierta para siempre. Sumarlas
  // daba 4542 y hacía parecer que el Congreso mueve veinte veces más que
  // el Parlamento Europeo, cuando es al revés.
  //
  // Las otras tres tarjetas destacan lo accionable —ventanas de consulta
  // con plazo, procedimientos en marcha— y esta hace ahora lo mismo. Las
  // PNL y las comparecencias siguen contando en el total.
  const esEnTramite = cifras.esVivas;
  const esRegistradas = suma(cifras.esTotal, cifras.actividadTotal);

  const Bloque = ({ children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
      {children}
    </div>
  );

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Regulatorio</h1>
        <p style={{ fontSize: 12.5, color: '#888', margin: '4px 0 0' }}>
          Qué se mueve en España y en la Unión Europea, con sus plazos y actores.
        </p>
      </div>

      {/* Una franja y no una tarjeta más: el análisis cruza las cuatro
          fuentes, así que está por encima de ellas. */}
      <Link
        href="/regulatorio/sector"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: '#fff',
          borderRadius: 10,
          padding: '18px 20px',
          marginBottom: 24,
          boxShadow: '0 1px 2px rgba(0,0,0,.04)',
          textDecoration: 'none',
          color: 'inherit',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: '#f0eefe',
            color: '#6d5aef',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <i className="ti ti-sparkles" style={{ fontSize: 16 }}></i>
        </span>
        <div style={{ flex: 1, minWidth: 180 }}>
          {sector?.n > 0 ? (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.1px' }}>
                {sector.n} {sector.n === 1 ? 'asunto te afecta' : 'asuntos te afectan'}
                {sector.conPlazo > 0 && ` · ${sector.conPlazo} con plazo abierto`}
              </div>
              <div style={{ fontSize: 12, color: '#8b8780', marginTop: 3 }}>
                {sector.nuevos > 0
                  ? `${sector.nuevos} ${sector.nuevos === 1 ? 'nuevo' : 'nuevos'} desde tu último análisis.`
                  : 'Basado en lo que nos contaste de tu organización.'}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.1px' }}>¿Qué te afecta a ti?</div>
              <div style={{ fontSize: 12, color: '#8b8780', marginTop: 3, lineHeight: 1.5 }}>
                Dinos a qué se dedica tu organización y revisamos qué se está moviendo.
              </div>
            </>
          )}
        </div>
        <span
          style={{
            background: sector?.n > 0 ? 'transparent' : '#6d5aef',
            color: sector?.n > 0 ? '#6d5aef' : '#fff',
            borderRadius: 8,
            padding: sector?.n > 0 ? '9px 0' : '9px 16px',
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {sector?.n > 0 ? 'Ver el análisis →' : 'Analizar mi sector'}
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
        <FlagEU />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Unión Europea</span>
        <div style={{ flex: 1, height: '.5px', background: '#e0dfd8' }}></div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Bloque>
          <ModuloCard
            href="/initiatives"
            icon="file-text"
            titulo="Expedientes"
            fuente="Comisión Europea"
            descripcion="Plazos, resumen y actores responsables de la tramitación."
            cta="Explorar expedientes"
            cifras={[
              { n: cifras.ventanas, label: 'abiertas', destacada: true },
              { n: cifras.expedientes, label: 'total' },
            ]}
          />
          <ModuloCard
            href="/procedures"
            icon="gavel"
            titulo="Procedimientos"
            fuente="Parlamento Europeo"
            descripcion="Ponentes, fase normativa, comisiones y actores clave."
            cta="Explorar procedimientos"
            cifras={[
              { n: cifras.tramitacion, label: 'en marcha', destacada: true },
              { n: cifras.procedimientos, label: 'total' },
            ]}
          />
        </Bloque>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
        <FlagES />
        <span style={{ fontSize: 13, fontWeight: 600 }}>España</span>
        <div style={{ flex: 1, height: '.5px', background: '#e0dfd8' }}></div>
      </div>

      {/* Lo que funciona va primero: una tarjeta en gris antes que una
          activa haría parecer el módulo más vacío de lo que está. */}
      <Bloque>
        {/* Dos cifras, no tres. Antes ponía leyes, PNL y comparecencias
            —stock histórico— junto a un "en trámite" en la cabecera, y no
            se sabía qué número mirar. Ahora se distingue lo que está vivo
            de lo que hay registrado, y el desglose por tipo vive dentro
            del módulo, que es donde se puede filtrar. */}
        <ModuloCard
          href="/congreso"
          icon="building-bank"
          titulo="Actividad parlamentaria"
          fuente="Congreso de los Diputados"
          descripcion="Leyes, proposiciones no de ley y comparecencias, con sus actores y plazos."
          cta="Explorar actividad"
          cifras={[
            { n: esEnTramite, label: 'leyes en tramitación', destacada: true },
            { n: esRegistradas, label: 'registradas' },
          ]}
        />
        <ModuloCard
          href="/boe"
          icon="news"
          titulo="Boletín Oficial del Estado"
          fuente="Normativa publicada y altos cargos"
          descripcion="Disposiciones generales y nombramientos, clasificados por sector."
          cta="Explorar el BOE"
          cifras={[
            // Semanal y no diario: en fin de semana o festivo el BOE no
            // publica, y la tarjeta saldría con un cero.
            // "Últimos 7 días" y no "esta semana": la consulta cuenta
            // hacia atrás desde hoy, no desde el lunes. Un lunes por la
            // mañana la diferencia es enorme —75 frente a 10— y la
            // etiqueta anterior prometía lo segundo.
            { n: cifras.boeSemana, label: 'últimos 7 días', destacada: true },
            { n: cifras.boeMes, label: 'últimos 30 días' },
          ]}
        />
        {/* La cifra destacada es la que vence pronto, no el total.
            Es el unico modulo del hub que expresa urgencia: los otros
            tres dan volumen, y aqui lo que importa es que quedan dias
            para poder decir algo. */}
        <ModuloCard
          href="/regulatorio/consultas"
          icon="message-2"
          titulo="Consultas públicas"
          fuente="Ministerios"
          descripcion="Consulta previa y audiencia pública, con plazos y buzón de aportaciones."
          cta="Explorar consultas"
          cifras={[
            { n: cifras.consultasUrgentes, label: 'vencen en 7 días', destacada: true },
            { n: cifras.consultasAbiertas, label: 'abiertas' },
          ]}
        />
      </Bloque>
      <Proximamente items={['Senado']} />
    </div>
  );
}
