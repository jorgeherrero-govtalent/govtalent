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

  const textoCta = anual
    ? `Contratar con pago anual · ${euros(ano)}`
    : `Contratar con pago mensual · ${euros(mes)}/mes`;

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

  const opcionesPago = [
    {
      clave: false,
      titulo: 'Pago mensual',
      importe: euros(mes),
      tachado: fundador ? euros(mesOficial) : null,
      periodo: 'al mes',
      detalle: equipo ? `${euros(mes / h.usuarios)} por usuario con el equipo completo` : 'Pago cada mes',
      ahorro: null,
    },
    {
      clave: true,
      titulo: 'Pago anual',
      importe: euros(ano),
      tachado: fundador ? euros(anoOficial) : null,
      periodo: 'al año',
      detalle: `Equivale a ${euros(ano / 12)} al mes`,
      ahorro: `Ahorras ${euros(mes * 12 - ano)}`,
    },
  ];

  const opcionesHorquilla = [
    ...HORQUILLAS.map((x) => ({ id: x.id, texto: x.usuarios === 1 ? '1 usuario' : `Hasta ${x.usuarios}` })),
    { id: A_MEDIDA, texto: `Más de ${MAX_USUARIOS}` },
  ];

  return (
    <>
      <div className="precios-fila">
        {/* --- Horquilla y pago --- */}
        <div className="bento precios-caja" style={{ flex: '3 1 420px' }}>
          <h2 style={{ margin: 0, fontSize: 21, color: '#1a1a18' }}>Vigilancia normativa y trabajo en equipo</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span id="precios-horquilla" style={{ fontSize: 14, color: '#55524b' }}>
              ¿Cuántas personas lo vais a usar?
            </span>
            <div role="radiogroup" aria-labelledby="precios-horquilla" className="precios-horquillas">
              {opcionesHorquilla.map((o) => {
                const activa = sel === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={activa}
                    onClick={() => setSel(o.id)}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 10,
                      border: activa ? `2px solid ${MORADO}` : '1px solid #e0dfd8',
                      margin: activa ? 0 : 1,
                      background: activa ? MORADO_SUAVE : '#fff',
                      color: activa ? MORADO_OSCURO : '#3a3a36',
                      fontSize: 14,
                      fontWeight: activa ? 700 : 500,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                    }}
                  >
                    {o.texto}
                  </button>
                );
              })}
            </div>
          </div>

          {aMedida ? (
            <div style={{ background: '#faf9f5', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <b style={{ fontSize: 18, color: '#1a1a18' }}>Precio a medida</b>
              <span style={{ fontSize: 13.5, color: '#55524b', lineHeight: 1.5 }}>
                Para equipos de más de {MAX_USUARIOS} personas preparamos una propuesta con los usuarios, los créditos y
                la forma de pago que necesitéis.
              </span>
            </div>
          ) : (
            <>
              {fundador && (
                <div style={{ background: MORADO_SUAVE, borderRadius: 10, padding: '11px 14px', fontSize: 13, color: MORADO_OSCURO, lineHeight: 1.45 }}>
                  <b>Precio fundador para los {PLAZAS_FUNDADOR} primeros clientes</b>
                  {` · ${plazasFundador === 1 ? 'queda 1 plaza' : `quedan ${plazasFundador} plazas`}. `}
                  Lo mantienes mientras sigas suscrito.
                </div>
              )}
              <div role="radiogroup" aria-label="Forma de pago" className="precios-pagos">
                {opcionesPago.map((o) => {
                  const marcado = anual === o.clave;
                  return (
                    <button
                      key={o.titulo}
                      type="button"
                      role="radio"
                      aria-checked={marcado}
                      onClick={() => setAnual(o.clave)}
                      style={{
                        position: 'relative',
                        textAlign: 'left',
                        padding: marcado ? '17px 19px' : '18px 20px',
                        borderRadius: 12,
                        border: marcado ? `2px solid ${MORADO}` : '1px solid #e0dfd8',
                        background: marcado ? MORADO_SUAVE : '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: marcado ? MORADO_OSCURO : '#55524b' }}>{o.titulo}</span>
                      {o.tachado && (
                        <span style={{ fontSize: 13, color: '#8b8780', textDecoration: 'line-through' }}>{o.tachado}</span>
                      )}
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 30, color: '#1a1a18', letterSpacing: '-.5px' }}>{o.importe}</b>
                        <span style={{ fontSize: 14, color: '#55524b' }}>{o.periodo}</span>
                      </span>
                      <span style={{ fontSize: 12.5, color: '#55524b', lineHeight: 1.4 }}>{o.detalle}</span>
                      {o.ahorro && (
                        <span
                          style={{
                            position: 'absolute',
                            top: 14,
                            right: 14,
                            fontSize: 11.5,
                            fontWeight: 700,
                            borderRadius: 20,
                            padding: '3px 9px',
                            color: marcado ? '#fff' : MORADO,
                            background: marcado ? MORADO : MORADO_SUAVE,
                          }}
                        >
                          {o.ahorro}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ flex: 1 }} />
          {aMedida ? (
            <a href="mailto:hola@govtalent.app?subject=GovTalent%20para%20m%C3%A1s%20de%2015%20usuarios" style={botonPrincipal}>
              Pedir una propuesta
            </a>
          ) : autenticado ? (
            <button type="button" style={botonPrincipal} onClick={() => contratar('vigilancia')} disabled={!!cargando}>
              {cargando === 'vigilancia' ? 'Abriendo el pago…' : textoCta}
            </button>
          ) : (
            <Link href={urlAlta()} style={botonPrincipal}>
              {textoCta}
            </Link>
          )}
          {error && <p style={{ margin: 0, fontSize: 12.5, color: '#77746e', textAlign: 'center' }}>{error}</p>}
        </div>

        {/* --- Lo que incluye --- */}
        <div className="bento precios-caja" style={{ flex: '2 1 300px' }}>
          <h3 style={{ margin: '0 0 2px', fontSize: 16, color: '#1a1a18' }}>Incluye</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <div style={{ background: '#faf9f5', borderRadius: 10, padding: 14 }}>
              <b style={{ fontSize: 24, color: '#1a1a18' }}>{aMedida ? 'A medida' : miles(h.creditos)}</b>
              <div style={{ fontSize: 12.5, color: '#55524b' }}>créditos al mes</div>
              <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 2 }}>
                {aMedida ? 'según el equipo' : equipo ? 'para todo el equipo' : `hasta ${alarmasEquivalentes(h.creditos)} alarmas`}
              </div>
            </div>
            <div style={{ background: '#faf9f5', borderRadius: 10, padding: 14 }}>
              <b style={{ fontSize: 24, color: '#1a1a18' }}>{aMedida ? `+${MAX_USUARIOS}` : h.usuarios}</b>
              <div style={{ fontSize: 12.5, color: '#55524b' }}>{!aMedida && h.usuarios === 1 ? 'usuario' : 'usuarios'}</div>
              <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 2 }}>
                {aMedida ? 'con su propio acceso' : equipo ? `hasta ${alarmasEquivalentes(h.creditos)} alarmas` : 'con su propio acceso'}
              </div>
            </div>
          </div>
          <Grupo titulo="Vigilancia normativa">
            <Linea>
              Alarmas sobre el BOE, el Consejo de Ministros, la Agenda del Gobierno, el Congreso, las consultas
              públicas, los parlamentos autonómicos, el Parlamento Europeo y la Comisión Europea
            </Linea>
            <Linea>Avisos al momento, cada mañana o los lunes, según elijas</Linea>
            <Linea>Avisos de plazo a 30, 14, 7, 3 y 1 días</Linea>
            <Linea>Seguimiento de normas, instituciones y personas, con aviso de sus cambios</Linea>
          </Grupo>
          <Grupo titulo="Trabajo">
            <Linea>Proyectos y Tareas</Linea>
            {(equipo || aMedida) && <Linea>Proyectos y tareas compartidos, con roles</Linea>}
          </Grupo>
          <Grupo titulo="Inteligencia artificial">
            <Linea>Asistente para crear y afinar alarmas</Linea>
            <Linea>MCP: conexión con ChatGPT y Claude</Linea>
          </Grupo>
          <Grupo titulo="Créditos">
            <Linea>Cada alarma activa usa {CREDITOS_POR_ALARMA} créditos al mes; el resto, el Asistente y la IA</Linea>
            <Linea>
              ¿Necesitas más? Paquetes de{' '}
              {PACKS_CREDITOS_IA.map((p, i) => `${i ? (i === PACKS_CREDITOS_IA.length - 1 ? ' y ' : ', ') : ''}${miles(p.creditos)} créditos (${euros(p.precio)})`).join('')}, válidos {MESES_CADUCIDAD_PACKS} meses
            </Linea>
          </Grupo>
        </div>
      </div>

      <div className="precios-fila" style={{ marginTop: 20, alignItems: 'center' }}>
        {/* --- Directorio --- */}
        <div className="bento precios-caja precios-directorio" style={{ flex: '3 1 420px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 260px', minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#1a1a18' }}>
              Directorio{' '}
              <span
                style={{ fontSize: 12, fontWeight: 600, color: MORADO, background: MORADO_SUAVE, borderRadius: 20, padding: '2px 8px', marginLeft: 6 }}
              >
                Se contrata aparte
              </span>
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#6f6c64', lineHeight: 1.45 }}>
              Cerca de 25.000 contactos de instituciones, organizaciones, medios y actores sociales: altos cargos,
              asesores y funcionarios, más de 22.000 con correo o teléfono, y la opción de buscar cualquier otro contacto. Incluye 1 usuario, 1 alarma semanal y 25 créditos de contacto al mes. Cada usuario adicional, {euros(DIRECTORIO_USUARIO_EXTRA)} al año.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
            <b style={{ fontSize: 26, color: '#1a1a18' }}>{euros(DIRECTORIO_ANUAL)}</b>
            <span style={{ fontSize: 13, color: '#6f6c64' }}>al año</span>
          </div>
          {autenticado ? (
            <button type="button" style={botonSecundario} onClick={() => contratar('directorio')} disabled={!!cargando}>
              {cargando === 'directorio' ? 'Abriendo el pago…' : 'Contratar'}
            </button>
          ) : (
            <Link href={urlAlta('directorio')} style={botonSecundario}>
              Contratar
            </Link>
          )}
        </div>

        {/* --- Cuenta gratuita --- */}
        <div style={{ flex: '2 1 300px', display: 'flex', flexDirection: 'column', gap: 6, padding: '0 8px', fontSize: 13.5, color: '#55524b', lineHeight: 1.5 }}>
          <span>
            ¿Quieres probar primero?{' '}
            <Link href="/login?view=signup" style={{ fontWeight: 600, color: MORADO, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Crear una cuenta →
            </Link>
          </span>
          <span>Cuenta gratuita con el directorio sin contactos y una alarma semanal.</span>
        </div>
      </div>
    </>
  );
}

function Grupo({ titulo, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13.5, color: '#3a3a36', lineHeight: 1.4 }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px', color: '#a8a49c', fontWeight: 600 }}>
        {titulo}
      </span>
      {children}
    </div>
  );
}

function Linea({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <i className="ti ti-check" style={{ color: MORADO, fontSize: 15, marginTop: 1, flexShrink: 0 }}></i>
      <span>{children}</span>
    </div>
  );
}
