'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { APERTURA_COLEGIOS } from '@/lib/calendarioElectoral';

/**
 * Portadas de Regulatorio: España y Unión Europea (05-10-2026).
 *
 * Hasta ahora había una sola portada que mezclaba las dos a propósito,
 * ordenada de lo que aún se influye a lo que ya es obligatorio. El menú
 * pasa a separar Unión Europea y España, y cada una tiene su portada con
 * las mismas tarjetas de siempre (trazo, cifra, «te afectan»), sin
 * banderas dentro: la bandera queda solo en el título de la página.
 *
 * España: Congreso, Consultas Públicas, Parlamentos Autonómicos y BOE, en
 * ese orden y de dos en dos. Senado y Ayuntamientos, próximamente.
 * Unión Europea: Comisión Europea y Parlamento Europeo.
 *
 * Cada portada pide solo los recuentos de sus fuentes.
 */

const VERDE = '#1d6f5c';
const MORADO = '#6d5aef';

/**
 * El lunes de la semana en curso, en formato YYYY-MM-DD.
 *
 * La tarjeta del BOE dice "esta semana" y contaba los siete días
 * anteriores a hoy, que es otra cosa: un jueves incluía el viernes y el
 * sábado de la semana pasada. Semana natural de lunes a hoy, que es lo
 * que el rótulo promete.
 *
 * getDay() devuelve 0 para el domingo, así que el domingo hay que
 * retroceder seis días y no cero: sin ese caso, el domingo la tarjeta se
 * quedaría contando solo ese día.
 */
function lunesDeEstaSemana() {
  const d = new Date();
  const dia = d.getDay();
  d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
  // Fecha local, no toISOString(): en horario peninsular la conversión a
  // UTC resta dos horas y antes de las 02:00 devolvería el domingo.
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

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
  parlamentos: '0,28 30,30 60,22 90,26 120,18 150,22 180,20 210,14 240,18 270,12 300,10',
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

function Institucion({ href, titulo, descripcion, trazo, cifra, etiqueta, afectan, color = MORADO }) {
  return (
    <Link
      href={href}
      className="bento"
      style={{ ...CARD, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.2px', marginBottom: 5 }}>{titulo}</div>
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

const AMBITOS = {
  espana: {
    pais: 'es',
    titulo: 'España',
    subtitulo: 'Congreso, consultas públicas, parlamentos autonómicos y BOE.',
    proximamente: 'Senado y Ayuntamientos',
  },
  ue: {
    pais: 'ue',
    titulo: 'Unión Europea',
    subtitulo: 'Comisión Europea y Parlamento Europeo.',
    proximamente: null,
  },
};

// Cortes disueltas (Real Decreto en el BOE del 06-10-2026) y elecciones
// generales el 29-11-2026. Hasta la apertura de los colegios (9:00, hora
// peninsular) la tarjeta del Congreso es una cuenta atrás; después vuelve
// a contar leyes en tramitación.
// Misma cifra que el calendario electoral de Novedades (lib/calendarioElectoral.js).
const ELECCIONES = APERTURA_COLEGIOS;

function partes(ms) {
  const min = Math.floor(ms / 60000);
  return { dias: Math.floor(min / 1440), horas: Math.floor((min % 1440) / 60), minutos: min % 60 };
}

/** Milisegundos hasta las elecciones (null si ya han pasado). Solo en el
 *  navegador, para que no haya desajuste con el render del servidor. */
function useCuentaAtras() {
  const [quedan, setQuedan] = useState(undefined);
  useEffect(() => {
    const tic = () => {
      const ms = ELECCIONES - Date.now();
      setQuedan(ms > 0 ? ms : null);
    };
    tic();
    const t = setInterval(tic, 15000);
    return () => clearInterval(t);
  }, []);
  return quedan;
}

function CuentaAtras({ ms }) {
  const p = ms ? partes(ms) : null;
  const casilla = (n, etiqueta) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, flex: 1, background: '#f7f6fe', borderRadius: 10, padding: '10px 6px' }}>
      <span style={{ fontSize: 24, fontWeight: 600, color: MORADO, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {p ? String(n).padStart(2, '0') : '—'}
      </span>
      <span style={{ fontSize: 11.5, color: '#8b8780' }}>{etiqueta}</span>
    </div>
  );
  return (
    <Link
      href="/congreso"
      className="bento"
      style={{ ...CARD, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14 }}
      aria-label={p ? `Congreso: faltan ${p.dias} días, ${p.horas} horas y ${p.minutos} minutos para las elecciones generales del 29 de noviembre` : 'Congreso: elecciones generales del 29 de noviembre'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.2px' }}>Congreso</div>
        <span style={{ fontSize: 12, color: '#8b8780' }}>Elecciones generales</span>
      </div>
      <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-1.5px', color: '#1a1a18', lineHeight: 1 }}>29N</div>
      <div style={{ display: 'flex', gap: 8 }} aria-hidden="true">
        {casilla(p?.dias, p?.dias === 1 ? 'día' : 'días')}
        {casilla(p?.horas, p?.horas === 1 ? 'hora' : 'horas')}
        {casilla(p?.minutos, p?.minutos === 1 ? 'minuto' : 'minutos')}
      </div>
    </Link>
  );
}

function cuentas(supabase, ambito) {
  if (ambito === 'ue') {
    return {
      // Recuentos con head: true, así que no se traen filas.
      ventanas: supabase.from('eu_open_windows').select('id', { count: 'exact', head: true }),
      tramitacion: supabase.from('ep_procedures').select('process_id', { count: 'exact', head: true }).eq('is_closed', false),
    };
  }
  return {
    // Sin las proposiciones de ley de los parlamentos autonómicos: no
    // caducan con la disolución y, con las Cortes disueltas, eran las
    // únicas «vivas» (y ya salen en Parlamentos Autonómicos).
    esVivas: supabase
      .from('es_initiatives')
      .select('num_expediente', { count: 'exact', head: true })
      .eq('is_closed', false)
      .neq('tipo', 'Proposición de ley de Comunidades y Ciudades Autónomas'),
    // Sobre la vista y no sobre la tabla: el estado se calcula allí a
    // partir de fecha_fin.
    consultasAbiertas: supabase.from('consultas_estado').select('id', { count: 'exact', head: true }).in('estado', ['abierta', 'urgente']),
    consultasUrgentes: supabase.from('consultas_estado').select('id', { count: 'exact', head: true }).eq('estado', 'urgente'),
    // La misma vista que alimenta /parlamentos-autonomicos, que cuenta
    // como «en tramitación» lo que no está cerrado.
    ccaaVivas: supabase.from('ccaa_resumen').select('*', { count: 'exact', head: true }).eq('is_closed', false),
    // Sobre boe_directory y no sobre boe_documents: la tabla está detrás
    // de RLS y desde el cliente devolvía 0. Semana natural.
    boeSemana: supabase
      .from('boe_directory')
      .select('id', { count: 'exact', head: true })
      .gte('fecha_publicacion', lunesDeEstaSemana()),
  };
}

export default function RegulatorioPortada({ ambito }) {
  const supabase = createClient();
  const a = AMBITOS[ambito];
  const [cifras, setCifras] = useState({});
  const [afectan, setAfectan] = useState({});
  const quedan = useCuentaAtras();

  useEffect(() => {
    const q = cuentas(supabase, ambito);
    const claves = Object.keys(q);
    Promise.all([...claves.map((k) => q[k]), supabase.from('alarma_encaja').select('kind')]).then((res) => {
      const c = {};
      claves.forEach((k, i) => {
        c[k] = res[i].count ?? null;
      });
      setCifras(c);
      const porKind = {};
      for (const x of res[claves.length].data || []) porKind[x.kind] = (porKind[x.kind] || 0) + 1;
      setAfectan(porKind);
    });
  }, [ambito]);

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bandera pais={a.pais} size={18} />
          <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>{a.titulo}</h1>
        </div>
        <p style={{ fontSize: 13, color: '#8b8780', margin: '4px 0 0' }}>{a.subtitulo}</p>
      </div>

      <div className="reg-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {ambito === 'ue' ? (
          <>
            <Institucion
              href="/initiatives"
              titulo="Comisión Europea"
              descripcion="Lo que Bruselas está preparando y todavía admite aportaciones."
              trazo="ce"
              cifra={cifras.ventanas}
              etiqueta="admiten aportaciones"
              afectan={afectan.expediente || 0}
            />
            <Institucion
              href="/procedures"
              titulo="Parlamento Europeo"
              descripcion="Las normas que se están negociando, con sus ponentes y comisiones."
              trazo="pe"
              cifra={cifras.tramitacion}
              etiqueta="en negociación"
              afectan={afectan.procedimiento || 0}
            />
          </>
        ) : (
          <>
            {quedan !== null ? (
              <CuentaAtras ms={quedan} />
            ) : (
              <Institucion
                href="/congreso"
                titulo="Congreso"
                descripcion="Leyes, comparecencias y preguntas, con sus plazos."
                trazo="congreso"
                cifra={cifras.esVivas}
                etiqueta="leyes en tramitación"
                afectan={afectan.ley || 0}
              />
            )}
            <Institucion
              href="/regulatorio/consultas"
              titulo="Consultas Públicas"
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
              href="/parlamentos-autonomicos"
              titulo="Parlamentos Autonómicos"
              descripcion="Leyes en tramitación en los parlamentos de las comunidades autónomas."
              trazo="parlamentos"
              cifra={cifras.ccaaVivas}
              etiqueta="leyes en tramitación"
            />
            {/* El BOE en verde: aquí ya no se influye, se cumple. */}
            <Institucion
              href="/boe"
              titulo="BOE"
              descripcion="Lo ya aprobado y los nombramientos de altos cargos."
              trazo="boe"
              cifra={cifras.boeSemana}
              etiqueta="esta semana"
              color={VERDE}
            />
          </>
        )}
      </div>

      {a.proximamente && (
        <p style={{ fontSize: 11.5, color: '#a8a49c', margin: '16px 2px 0' }}>Próximamente · {a.proximamente}</p>
      )}
    </div>
  );
}
