'use client';

// =====================================================================
// BACKOFFICE — Estado de los syncs
// app/backoffice/syncs/page.js
//
// Las dieciocho rutas programadas, siempre las dieciocho, ordenadas por
// la hora a la que les toca correr.
//
// POR QUÉ SALEN TODAS Y NO SOLO LAS QUE FALLAN. Una pantalla que
// enseñara únicamente los errores no habría detectado nada de lo que
// pasó este verano: las comparecencias del Congreso no fallaban, es que
// no se ejecutaban. No había error que enseñar. Aquí una ruta que no ha
// corrido sigue ocupando su fila con un "hace 32 días" que se ve desde
// la puerta.
//
// La hora se enseña en local, no en UTC. Vercel programa en UTC y eso
// está bien para el fichero, pero quien abre esta pantalla quiere saber
// a qué hora de las suyas pasa.
// =====================================================================

import { useCallback, useEffect, useState } from 'react';

const CARD = { background: '#fff', borderRadius: 10, border: '.5px solid #e0dfd8' };

// Se reutiliza la paleta del backoffice: verde para lo que está bien,
// morado para lo que es de la plataforma, y el ladrillo apagado que ya
// usa el radar para lo descartado. Sin rojos de sistema.
const VEREDICTOS = {
  al_dia: { label: 'Al día', bg: '#eaf3ee', color: '#1d6f5c', orden: 4 },
  cortado: { label: 'Dejó trabajo', bg: '#f0edfe', color: '#6d5aef', orden: 3 },
  atrasada: { label: 'Atrasada', bg: '#fbeceb', color: '#c2534e', orden: 1 },
  colgada: { label: 'Murió a medias', bg: '#fbeceb', color: '#c2534e', orden: 1 },
  error: { label: 'Error', bg: '#fbeceb', color: '#c2534e', orden: 1 },
  nunca: { label: 'Nunca ha corrido', bg: '#fbeceb', color: '#c2534e', orden: 0 },
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function haceCuanto(iso) {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** La hora programada, de UTC a la del navegador. */
function horaLocal(horaUtc, minutoUtc) {
  const d = new Date();
  d.setUTCHours(horaUtc, minutoUtc, 0, 0);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function duracion(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export default function SyncsBackoffice() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [orden, setOrden] = useState('hora');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch('/api/backoffice/syncs', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'No se ha podido leer el estado.');
        setDatos(null);
      } else {
        setError(null);
        setDatos(json);
      }
    } catch {
      setError('No se ha podido conectar.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const rutas = (() => {
    if (!datos?.rutas) return [];
    const l = [...datos.rutas];
    // Por problema: lo que hay que mirar primero arriba. Por hora: la
    // noche tal y como ocurre.
    if (orden === 'problema') {
      l.sort(
        (a, b) =>
          (VEREDICTOS[a.veredicto]?.orden ?? 9) - (VEREDICTOS[b.veredicto]?.orden ?? 9) ||
          a.hora_utc - b.hora_utc
      );
    }
    return l;
  })();

  const resumen = datos?.resumen;

  return (
    <div style={{ padding: '26px 30px', maxWidth: 1060 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 600, margin: 0, letterSpacing: '-.2px' }}>Estado de los syncs</h1>
          <p style={{ fontSize: 12.5, color: '#8b8780', margin: '6px 0 0', lineHeight: 1.5 }}>
            Las rutas programadas en <code style={{ fontSize: 12 }}>vercel.json</code>, con su última ejecución real.
            Las pruebas en seco no cuentan como ejecución.
          </p>
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          style={{
            fontSize: 12.5,
            padding: '7px 13px',
            borderRadius: 7,
            border: '.5px solid #e0dfd8',
            background: '#fff',
            color: '#57534e',
            cursor: cargando ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div style={{ ...CARD, padding: 18, fontSize: 13, color: '#c2534e', marginBottom: 16 }}>{error}</div>
      )}

      {resumen?.sin_registro && (
        <div style={{ ...CARD, padding: 18, marginBottom: 16, fontSize: 12.5, color: '#8b8780', lineHeight: 1.6 }}>
          No hay ninguna ejecución registrada todavía. Si acabas de desplegar el registro, esto se llenará solo con la
          primera tanda de crones de esta noche.
        </div>
      )}

      {/* El titular: lo que se lee sin sentarse. */}
      {resumen && !resumen.sin_registro && (
        <div style={{ ...CARD, padding: '20px 22px', marginBottom: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-.6px', lineHeight: 1.1 }}>
            {resumen.al_dia} de {resumen.total}{' '}
            <span style={{ fontSize: 15, fontWeight: 400, color: '#8b8780' }}>al día</span>
          </div>
          {resumen.con_problema > 0 && (
            <div style={{ fontSize: 12.5, color: '#c2534e', marginTop: 7 }}>
              {resumen.con_problema} {resumen.con_problema === 1 ? 'ruta necesita' : 'rutas necesitan'} atención
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
        {[
          ['hora', 'Por hora'],
          ['problema', 'Por problema'],
        ].map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setOrden(v)}
            style={{
              padding: '6px 12px',
              borderRadius: 7,
              fontSize: 12.5,
              cursor: 'pointer',
              border: 'none',
              background: orden === v ? '#f0eefe' : 'transparent',
              color: orden === v ? '#6d5aef' : '#8b8780',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ ...CARD, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '64px 1fr 108px 128px 82px 110px',
            gap: 12,
            padding: '11px 16px',
            fontSize: 10.5,
            color: '#a8a49c',
            letterSpacing: '.4px',
            borderBottom: '.5px solid #f2f0ec',
          }}
        >
          <span>HORA</span>
          <span>RUTA</span>
          <span>ÚLTIMA</span>
          <span>ESTADO</span>
          <span>DURACIÓN</span>
          <span>LEÍDOS / ESCRITOS</span>
        </div>

        {rutas.length === 0 && !cargando && (
          <div style={{ padding: 22, fontSize: 12.5, color: '#8b8780', textAlign: 'center' }}>
            No hay rutas programadas en vercel.json.
          </div>
        )}

        {rutas.map((r, i) => {
          const v = VEREDICTOS[r.veredicto] || VEREDICTOS.al_dia;
          const problema = r.veredicto !== 'al_dia';
          const estaAbierta = abierta === r.ruta;
          return (
            <div key={r.ruta} style={{ borderTop: i === 0 ? 'none' : '.5px solid #f2f0ec' }}>
              <div
                onClick={() => setAbierta(estaAbierta ? null : r.ruta)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr 108px 128px 82px 110px',
                  gap: 12,
                  padding: '12px 16px',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: problema ? '#fdf8f7' : '#fff',
                }}
              >
                <span style={{ fontSize: 12, color: '#57534e', fontVariantNumeric: 'tabular-nums' }}>
                  {horaLocal(r.hora_utc, r.minuto_utc)}
                </span>

                <span style={{ fontSize: 12.5, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.ruta.replace('/api/', '')}
                  {r.cadencia === 'semanal' && (
                    <span style={{ fontSize: 10.5, color: '#a8a49c', marginLeft: 7 }}>semanal</span>
                  )}
                  {r.invocaciones_24h > 1 && (
                    <span style={{ fontSize: 10.5, color: '#a8a49c', marginLeft: 7 }}>
                      {r.invocaciones_24h} invocaciones
                    </span>
                  )}
                </span>

                <span style={{ fontSize: 12, color: problema ? '#c2534e' : '#8b8780' }}>
                  {haceCuanto(r.ultima_ejecucion)}
                </span>

                <span>
                  <span
                    style={{
                      fontSize: 10.5,
                      background: v.bg,
                      color: v.color,
                      padding: '3px 9px',
                      borderRadius: 11,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v.label}
                  </span>
                </span>

                <span style={{ fontSize: 12, color: '#8b8780', fontVariantNumeric: 'tabular-nums' }}>
                  {duracion(r.duracion_ms)}
                </span>

                <span style={{ fontSize: 12, color: '#8b8780', fontVariantNumeric: 'tabular-nums' }}>
                  {r.n_leidos == null ? '—' : `${r.n_leidos} / ${r.n_escritos}`}
                </span>
              </div>

              {estaAbierta && (
                <div style={{ padding: '0 16px 14px', background: problema ? '#fdf8f7' : '#fff' }}>
                  <div style={{ fontSize: 11, color: '#a8a49c', marginBottom: 5 }}>
                    {r.programada} UTC · último estado: {r.ultimo_estado || '—'}
                    {r.hubo_prueba && ' · hubo una prueba en seco posterior'}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: '#57534e',
                      lineHeight: 1.55,
                      background: '#faf9f6',
                      border: '.5px solid #f2f0ec',
                      borderRadius: 7,
                      padding: '9px 11px',
                      wordBreak: 'break-word',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {r.detalle || 'Sin detalle registrado.'}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {datos?.generado && (
        <div style={{ fontSize: 11, color: '#b8b4ac', marginTop: 12 }}>
          Consultado {new Date(datos.generado).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
}
