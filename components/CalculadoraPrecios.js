'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  HORQUILLAS,
  MAX_USUARIOS,
  PLAZAS_FUNDADOR,
  CREDITOS_POR_ALARMA,
  PACKS_CREDITOS_IA,
  MESES_CADUCIDAD_PACKS,
  DIRECTORIO_ANUAL,
  DIRECTORIO_USUARIO_EXTRA,
  alarmasEquivalentes,
  precioDe,
  euros,
  miles,
} from '@/lib/precios';

const MORADO = '#6d5aef';
const MORADO_OSCURO = '#4f3fc4';
const MORADO_SUAVE = '#f6f4ff';
const A_MEDIDA = 'a-medida';

/**
 * /precios: el plan de Vigilancia por horquillas de usuarios (1, hasta 3,
 * 6, 10 y 15; más de 15, a medida), con pago mensual o anual y una bolsa
 * de créditos mensuales para todo el equipo.
 *
 * Precio fundador: mientras queden plazas (`plazasFundador`, contadas en
 * el servidor), las horquillas de equipo muestran el precio fundador junto
 * al oficial tachado. Quién paga qué lo decide el checkout, no la página.
 *
 * Contratar abre el checkout con la horquilla y la forma de pago. Sin
 * sesión, lleva al alta y vuelve aquí.
 */
export default function CalculadoraPrecios({ autenticado = false, plazasFundador = 0 }) {
  const [sel, setSel] = useState('individual');
  const [anual, setAnual] = useState(true);
  const [cargando, setCargando] = useState(null);
  const [error, setError] = useState(null);
  const [verPacks, setVerPacks] = useState(false);

  const aMedida = sel === A_MEDIDA;
  const h = HORQUILLAS.find((x) => x.id === sel) || HORQUILLAS[0];
  const fundador = plazasFundador > 0 && !!h.fundador;
  const mes = precioDe(h, { fundador });
  const ano = precioDe(h, { anual: true, fundador });
  const mesOficial = h.mensual;
  const anoOficial = h.anual;
  const pago = anual ? 'anual' : 'mensual';
  const equipo = h.usuarios > 1;

  async function contratar(plan) {
    if (cargando) return;
    setCargando(plan);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan === 'directorio' ? { plan } : { plan, horquilla: h.id, pago }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setError(data?.error || 'No hemos podido iniciar el pago. Inténtalo de nuevo.');
    } catch {
      setError('No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.');
    }
    setCargando(null);
  }

  // Sin sesión: crear la cuenta y volver a /precios para pagar con ella.
  const urlAlta = () => '/login?view=signup&redirect=%2Fprecios';

  const textoCta = `Contratar · ${euros(anual ? ano : mes)} ${anual ? 'al año' : 'al mes'}`;

  const botonPrincipal = {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'center',
    padding: '14px',
    borderRadius: 10,
    background: MORADO,
    color: '#fff',
    border: 'none',
    textDecoration: 'none',
    fontSize: 15,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: cargando ? 'default' : 'pointer',
    opacity: cargando === 'vigilancia' ? 0.6 : 1,
  };

  const botonSecundario = {
    display: 'inline-block',
    padding: '11px 18px',
    borderRadius: 9,
    border: `1.5px solid ${MORADO}`,
    background: '#fff',
    color: MORADO,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    cursor: cargando ? 'default' : 'pointer',
    opacity: cargando === 'directorio' ? 0.6 : 1,
  };

  const segmento = (on) => ({
    border: 'none',
    borderRadius: 9,
    padding: '10px 4px',
    fontSize: 13.5,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    background: on ? '#fff' : 'transparent',
    color: on ? MORADO_OSCURO : '#3a3a36',
    fontWeight: on ? 700 : 500,
    boxShadow: on ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
  });
  const pastilla = (on) => ({
    border: 'none',
    borderRadius: 999,
    padding: '8px 14px',
    fontSize: 13.5,
    fontFamily: 'inherit',
    cursor: 'pointer',
    background: on ? '#fff' : 'transparent',
    color: on ? '#1a1a18' : '#55524b',
    fontWeight: on ? 700 : 500,
    boxShadow: on ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
  });

  const opcionesHorquilla = [
    ...HORQUILLAS.map((x) => ({ id: x.id, texto: x.usuarios === 1 ? '1 usuario' : `Hasta ${x.usuarios}` })),
    { id: A_MEDIDA, texto: `Más de ${MAX_USUARIOS}` },
  ];

  const precio = anual ? ano : mes;
  const detalle = anual
    ? `Equivale a ${euros(ano / 12)} al mes · ahorras ${euros(mes * 12 - ano)}`
    : equipo
      ? `${euros(mes / h.usuarios)} por persona con el equipo completo`
      : 'Pago cada mes';
  const alarmas = alarmasEquivalentes(h.creditos);
  const maxCreditos = HORQUILLAS[HORQUILLAS.length - 1].creditos;

  return (
    <>
      <div className="precios-fila">
        {/* --- Horquilla, forma de pago y precio --- */}
        <div className="bento precios-caja" style={{ flex: '3 1 440px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span id="precios-horquilla" style={{ fontSize: 14, color: '#55524b' }}>
              ¿Cuántas personas lo vais a usar?
            </span>
            <div role="radiogroup" aria-labelledby="precios-horquilla" className="precios-seg">
              {opcionesHorquilla.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={sel === o.id}
                  onClick={() => setSel(o.id)}
                  style={segmento(sel === o.id)}
                >
                  {o.texto}
                </button>
              ))}
            </div>
          </div>

          {aMedida ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <b style={{ fontSize: 34, color: '#1a1a18', letterSpacing: '-.5px' }}>A medida</b>
                <span style={{ fontSize: 14, color: '#55524b', lineHeight: 1.5 }}>
                  Para más de {MAX_USUARIOS} personas preparamos una propuesta con los usuarios y los créditos que
                  necesitéis.
                </span>
              </div>
              <a
                href="mailto:hola@govtalent.app?subject=GovTalent%20para%20m%C3%A1s%20de%2015%20usuarios"
                style={botonPrincipal}
              >
                Pedir una propuesta
              </a>
            </>
          ) : (
            <>
              <div className="precios-precio">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {fundador && (
                    <span style={{ fontSize: 14, color: '#8b8780', textDecoration: 'line-through' }}>
                      {euros(anual ? anoOficial : mesOficial)}
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <b style={{ fontSize: 44, color: '#1a1a18', letterSpacing: '-1px', lineHeight: 1.05 }}>{euros(precio)}</b>
                    <span style={{ fontSize: 15, color: '#55524b' }}>{anual ? 'al año' : 'al mes'}</span>
                  </span>
                  <span style={{ fontSize: 13, color: '#6f6c64' }}>{detalle}</span>
                </div>
                <div
                  role="radiogroup"
                  aria-label="Forma de pago"
                  style={{ display: 'flex', gap: 4, background: '#f4f3ee', borderRadius: 999, padding: 4 }}
                >
                  <button type="button" role="radio" aria-checked={!anual} onClick={() => setAnual(false)} style={pastilla(!anual)}>
                    Mensual
                  </button>
                  <button type="button" role="radio" aria-checked={anual} onClick={() => setAnual(true)} style={pastilla(anual)}>
                    Anual −15 %
                  </button>
                </div>
              </div>
              {autenticado ? (
                <button type="button" style={botonPrincipal} onClick={() => contratar('vigilancia')} disabled={!!cargando}>
                  {cargando === 'vigilancia' ? 'Abriendo el pago…' : textoCta}
                </button>
              ) : (
                <Link href={urlAlta()} style={botonPrincipal}>
                  {textoCta}
                </Link>
              )}
              {error && <p style={{ margin: 0, fontSize: 12.5, color: '#77746e', textAlign: 'center' }}>{error}</p>}
            </>
          )}
        </div>

        {/* --- Tu plan --- */}
        <div className="bento precios-caja" style={{ flex: '2 1 300px', gap: 18 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#8b8780', textTransform: 'uppercase', letterSpacing: '.4px' }}>
            Tu plan
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <b style={{ fontSize: 40, color: '#1a1a18', letterSpacing: '-1px', lineHeight: 1.05 }}>
              {aMedida ? 'A medida' : miles(h.creditos)}
            </b>
            <span style={{ fontSize: 14, color: '#55524b' }}>
              créditos al mes{!aMedida && equipo ? ', para todo el equipo' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 8, borderRadius: 8, background: MORADO_SUAVE, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 8,
                  background: MORADO,
                  width: `${aMedida ? 100 : Math.round((h.creditos / maxCreditos) * 100)}%`,
                }}
              />
            </div>
            <span style={{ fontSize: 13, color: '#6f6c64' }}>
              {aMedida
                ? `Cada alarma usa aproximadamente ${CREDITOS_POR_ALARMA} créditos al mes`
                : `Unas ${alarmas} alarmas · aproximadamente ${CREDITOS_POR_ALARMA} créditos cada una`}
            </span>
          </div>
          {fundador && !aMedida && (
            <div
              style={{
                marginTop: 'auto',
                background: MORADO_SUAVE,
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <b style={{ fontSize: 13.5, color: MORADO_OSCURO }}>
                Precio fundador · {plazasFundador === 1 ? 'queda 1 plaza' : `quedan ${plazasFundador} plazas`}
              </b>
              <span style={{ fontSize: 12.5, color: MORADO_OSCURO, lineHeight: 1.45 }}>
                Para los {PLAZAS_FUNDADOR} primeros clientes. Se mantiene mientras sigas suscrito.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* --- Incluye --- */}
      <div className="bento precios-caja" style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0, fontSize: 17, color: '#1a1a18' }}>Incluye</h2>
        <div className="precios-incluye">
          <Punto titulo="Alarmas">
            Boletines oficiales, consultas públicas, parlamentos autonómicos, Congreso, Senado, Unión Europea y Consejo
            de Ministros.
          </Punto>
          <Punto titulo="Actividad normativa">
            Resumen del expediente, recorrido, plazos y actores que influyen o se han posicionado.
          </Punto>
          <Punto titulo="Avisos y plazos">
            Personaliza tu alarma, con alertas al momento, cada mañana o semanalmente.
          </Punto>
          <Punto titulo="Seguimiento">
            Actividad normativa e institucional de cargos públicos, con aviso de sus agendas y comunicados.
          </Punto>
          <Punto titulo="Proyectos y Tareas">
            Para la creación de proyectos, seguimiento de tareas y trabajo colaborativo en equipo.
          </Punto>
          <Punto titulo="Asistente y MCP">Crea alarmas hablando y conéctalo con ChatGPT y Claude.</Punto>
        </div>
      </div>

      <div className="precios-fila" style={{ marginTop: 18 }}>
        {/* --- Base de datos --- */}
        <div className="bento precios-caja precios-directorio" style={{ flex: '3 1 440px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px', minWidth: 0 }}>
            <b style={{ fontSize: 15, color: '#1a1a18' }}>
              Base de datos{' '}
              <span
                style={{ fontSize: 11.5, fontWeight: 600, color: MORADO, background: MORADO_SUAVE, borderRadius: 20, padding: '2px 8px', marginLeft: 4 }}
              >
                Se contrata aparte
              </span>
            </b>
            <span style={{ fontSize: 13, color: '#6f6c64', lineHeight: 1.45 }}>
              Cerca de 25.000 contactos de cargos, asesores y funcionarios. {euros(DIRECTORIO_USUARIO_EXTRA)} al año por
              usuario adicional.
            </span>
          </div>
          <span style={{ whiteSpace: 'nowrap' }}>
            <b style={{ fontSize: 24, color: '#1a1a18' }}>{euros(DIRECTORIO_ANUAL)}</b>{' '}
            <span style={{ fontSize: 13, color: '#6f6c64' }}>al año</span>
          </span>
          {autenticado ? (
            <button type="button" style={botonSecundario} onClick={() => contratar('directorio')} disabled={!!cargando}>
              {cargando === 'directorio' ? 'Abriendo el pago…' : 'Contratar'}
            </button>
          ) : (
            <Link href={urlAlta()} style={botonSecundario}>
              Contratar
            </Link>
          )}
        </div>

        {/* --- Paquetes de créditos --- */}
        <div className="bento precios-caja" style={{ flex: '2 1 300px', gap: 8, justifyContent: 'center', padding: '22px 26px' }}>
          <b style={{ fontSize: 15, color: '#1a1a18' }}>¿Necesitas más créditos?</b>
          {verPacks ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PACKS_CREDITOS_IA.map((p) => (
                <div key={p.creditos} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: '#3a3a36' }}>
                  <span>{miles(p.creditos)} créditos</span>
                  <b>{euros(p.precio)}</b>
                </div>
              ))}
              <span style={{ fontSize: 12, color: '#8b8780' }}>Pago único. Válidos {MESES_CADUCIDAD_PACKS} meses.</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setVerPacks(true)}
              style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: MORADO, cursor: 'pointer' }}
            >
              Ver precios →
            </button>
          )}
        </div>
      </div>

      <p style={{ margin: '28px 0 0', textAlign: 'center', fontSize: 13.5, color: '#55524b' }}>
        ¿Quieres probar primero?{' '}
        <Link href="/login?view=signup" style={{ fontWeight: 600, color: MORADO, textDecoration: 'none' }}>
          Crear una cuenta gratuita →
        </Link>
      </p>
    </>
  );
}

function Punto({ titulo, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <b style={{ fontSize: 14, color: '#1a1a18' }}>{titulo}</b>
      <span style={{ fontSize: 13, color: '#6f6c64', lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}
