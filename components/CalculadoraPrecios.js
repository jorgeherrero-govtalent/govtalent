'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MAX_USUARIOS,
  DIRECTORIO_ANUAL,
  precioMensual,
  precioAnual,
  alarmasIncluidas,
  creditosIncluidos,
  euros,
  miles,
} from '@/lib/precios';

const MORADO = '#6d5aef';
const MORADO_OSCURO = '#4f3fc4';
const MORADO_SUAVE = '#f6f4ff';

/**
 * La calculadora de /precios: un único plan de 1 a 50 usuarios, con pago
 * mensual o anual. El cliente nunca ve los tramos, solo el resultado: el
 * total, el precio por usuario y lo que incluye.
 *
 * Contratar abre el checkout con el plan, los usuarios y la forma de pago
 * (precios vigilancia_mensual, vigilancia_anual y directorio_anual en
 * Stripe). Sin sesión, lleva al alta recordando la elección.
 */
export default function CalculadoraPrecios({ autenticado = false }) {
  const [usuarios, setUsuarios] = useState(1);
  const [anual, setAnual] = useState(true);
  const [cargando, setCargando] = useState(null);
  const [error, setError] = useState(null);

  const mes = precioMensual(usuarios);
  const ano = precioAnual(usuarios);
  const equipo = usuarios > 1;
  const pago = anual ? 'anual' : 'mensual';

  async function contratar(plan) {
    if (cargando) return;
    setCargando(plan);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan === 'directorio' ? { plan } : { plan, usuarios, pago }),
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
  // (/signup no existe: el middleware lo mandaba a «Iniciar sesión».)
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
      periodo: 'al mes',
      detalle: equipo ? `${euros(mes / usuarios)} por usuario` : 'Pago cada mes',
      ahorro: null,
    },
    {
      clave: true,
      titulo: 'Pago anual',
      importe: euros(ano),
      periodo: 'al año',
      detalle: `Equivale a ${euros(ano / 12)} al mes${equipo ? ` · ${euros(ano / 12 / usuarios)} por usuario` : ''}`,
      ahorro: `Ahorras ${euros(mes * 12 - ano)}`,
    },
  ];

  return (
    <>
      <div className="precios-fila">
        {/* --- Calculadora --- */}
        <div className="bento precios-caja" style={{ flex: '3 1 420px' }}>
          <h2 style={{ margin: 0, fontSize: 21, color: '#1a1a18' }}>Vigilancia normativa y trabajo en equipo</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              htmlFor="precios-usuarios"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: 14, color: '#55524b' }}
            >
              <span>¿Cuántas personas lo vais a usar?</span>
              <b style={{ fontSize: 21, color: '#1a1a18', whiteSpace: 'nowrap' }}>
                {usuarios === 1 ? '1 usuario' : `${usuarios} usuarios`}
              </b>
            </label>
            <input
              id="precios-usuarios"
              type="range"
              min={1}
              max={MAX_USUARIOS}
              step={1}
              value={usuarios}
              onChange={(e) => setUsuarios(Number(e.target.value) || 1)}
              style={{ width: '100%', accentColor: MORADO, height: 28 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#a8a49c' }}>
              <span>1</span>
              <span>10</span>
              <span>25</span>
              <span>{MAX_USUARIOS}</span>
            </div>
          </div>

          <div role="radiogroup" aria-label="Forma de pago" className="precios-pagos">
            {opcionesPago.map((o) => {
              const sel = anual === o.clave;
              return (
                <button
                  key={o.titulo}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => setAnual(o.clave)}
                  style={{
                    position: 'relative',
                    textAlign: 'left',
                    padding: sel ? '17px 19px' : '18px 20px',
                    borderRadius: 12,
                    border: sel ? `2px solid ${MORADO}` : '1px solid #e0dfd8',
                    background: sel ? MORADO_SUAVE : '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: sel ? MORADO_OSCURO : '#55524b' }}>{o.titulo}</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
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
                        color: sel ? '#fff' : MORADO,
                        background: sel ? MORADO : MORADO_SUAVE,
                      }}
                    >
                      {o.ahorro}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />
          {autenticado ? (
            <button type="button" style={botonPrincipal} onClick={() => contratar('vigilancia')} disabled={!!cargando}>
              {cargando === 'vigilancia' ? 'Abriendo el pago…' : textoCta}
            </button>
          ) : (
            <Link href={urlAlta('vigilancia')} style={botonPrincipal}>
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
              <b style={{ fontSize: 24, color: '#1a1a18' }}>{miles(alarmasIncluidas(usuarios))}</b>
              <div style={{ fontSize: 12.5, color: '#55524b' }}>alarmas al momento</div>
              {equipo && <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 2 }}>compartidas por el equipo</div>}
            </div>
            <div style={{ background: '#faf9f5', borderRadius: 10, padding: 14 }}>
              <b style={{ fontSize: 24, color: '#1a1a18' }}>{miles(creditosIncluidos(usuarios))}</b>
              <div style={{ fontSize: 12.5, color: '#55524b' }}>créditos al mes</div>
              <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 2 }}>
                {equipo ? '300 por usuario, compartidos' : '300 por usuario'}
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
            {equipo && <Linea>Proyectos y tareas compartidos, con roles</Linea>}
            {equipo && <Linea>Alarmas y créditos compartidos por todo el equipo</Linea>}
          </Grupo>
          <Grupo titulo="Inteligencia artificial">
            <Linea>Asistente para crear y afinar alarmas</Linea>
            <Linea>MCP: conexión con ChatGPT y Claude</Linea>
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
              Más de 18.000 contactos de instituciones, organizaciones, medios y actores sociales: altos cargos,
              asesores y funcionarios, más de 15.000 con correo o teléfono. 1 alarma semanal y 50 créditos al mes.
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
