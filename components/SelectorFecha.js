'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Selector de fecha.
 *
 * Sustituye a <input type="date">, que cambia de aspecto en cada
 * navegador y no se puede vestir.
 *
 * MES Y AÑO COMO DESPLEGABLES, no solo flechas: sirve igual para una
 * reunión de la semana que viene que para una fecha de nacimiento. Con
 * solo flechas, ir de 2026 a 1992 son cuatrocientos clics.
 *
 * Va en un portal porque cualquier padre con overflow oculto recortaría
 * el panel — el mismo motivo por el que lo hacen los filtros del
 * directorio.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// La semana empieza en lunes, como se lee un calendario aquí.
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function aISO(d) {
  // Se construye a mano y no con toISOString(), que convierte a UTC y en
  // España devuelve el día anterior para fechas de madrugada.
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function deISO(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
}

export function fechaLegible(iso) {
  const d = deISO(iso);
  if (!d) return null;
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function SelectorFecha({
  value,
  onChange,
  placeholder = 'Elegir fecha',
  desdeAno,
  hastaAno,
  atajos = [],
  ancho,
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState(null);
  const boton = useRef(null);
  const panel = useRef(null);

  const hoy = new Date();
  const elegida = deISO(value);
  const [mes, setMes] = useState((elegida || hoy).getMonth());
  const [ano, setAno] = useState((elegida || hoy).getFullYear());

  const anoMin = desdeAno ?? hoy.getFullYear() - 100;
  const anoMax = hastaAno ?? hoy.getFullYear() + 10;

  useEffect(() => {
    if (!abierto) return;
    const d = deISO(value) || new Date();
    setMes(d.getMonth());
    setAno(d.getFullYear());
  }, [abierto, value]);

  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    const alto = 330;
    // Si no cabe debajo, se abre hacia arriba.
    const arriba = r.bottom + alto > window.innerHeight && r.top > alto;
    setPos({
      left: Math.min(r.left, window.innerWidth - 276),
      top: arriba ? r.top - alto - 6 : r.bottom + 6,
    });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e) {
      if (boton.current?.contains(e.target) || panel.current?.contains(e.target)) return;
      setAbierto(false);
    }
    function tecla(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    const t = setTimeout(() => window.addEventListener('click', fuera), 0);
    window.addEventListener('keydown', tecla);
    return () => {
      clearTimeout(t);
      window.removeEventListener('click', fuera);
      window.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  function elegir(dia) {
    onChange(aISO(new Date(ano, mes, dia)));
    setAbierto(false);
  }

  // Cuántas casillas vacías van antes del día 1, con la semana en lunes.
  const primero = new Date(ano, mes, 1).getDay();
  const hueco = (primero + 6) % 7;
  const total = new Date(ano, mes + 1, 0).getDate();
  const esteMes = hoy.getFullYear() === ano && hoy.getMonth() === mes;

  const anos = [];
  for (let a = anoMax; a >= anoMin; a--) anos.push(a);

  const campo = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: ancho || '100%',
    padding: '9px 12px',
    border: `.5px solid ${abierto ? MORADO : BORDE}`,
    borderRadius: 9,
    background: '#fafaf7',
    fontSize: 13,
    fontFamily: 'inherit',
    color: value ? '#1a1a18' : '#a8a49c',
    textAlign: 'left',
  };

  return (
    <>
      <button ref={boton} type="button" onClick={() => setAbierto((v) => !v)} style={campo}>
        <i className="ti ti-calendar" style={{ fontSize: 15, color: '#a8a49c', flexShrink: 0 }}></i>
        <span style={{ flex: 1, minWidth: 0 }}>{fechaLegible(value) || placeholder}</span>
        {value && (
          <span
            role="button"
            aria-label="Quitar la fecha"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            style={{ color: '#c4c0b8', display: 'inline-flex', flexShrink: 0 }}
          >
            <i className="ti ti-x" style={{ fontSize: 14 }}></i>
          </span>
        )}
      </button>

      {abierto &&
        pos &&
        createPortal(
          <div
            ref={panel}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: 268,
              background: '#fff',
              border: `.5px solid ${BORDE}`,
              borderRadius: 10,
              boxShadow: '0 6px 20px rgba(0,0,0,.12)',
              padding: 12,
              zIndex: 300,
            }}
          >
            {atajos.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 11 }}>
                {atajos.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => {
                      onChange(a.iso);
                      setAbierto(false);
                    }}
                    style={{
                      fontSize: 11,
                      border: `.5px solid ${BORDE}`,
                      borderRadius: 20,
                      padding: '3px 10px',
                      background: '#fff',
                      color: '#555',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => (mes === 0 ? (setMes(11), setAno(ano - 1)) : setMes(mes - 1))}
                aria-label="Mes anterior"
                style={{ background: 'none', border: 'none', color: '#a8a49c', padding: 2 }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 15 }}></i>
              </button>

              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                aria-label="Mes"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  background: 'none',
                  fontSize: 12.5,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  outline: 'none',
                  padding: 0,
                }}
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                aria-label="Año"
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: 12.5,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  outline: 'none',
                  padding: 0,
                }}
              >
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => (mes === 11 ? (setMes(0), setAno(ano + 1)) : setMes(mes + 1))}
                aria-label="Mes siguiente"
                style={{ background: 'none', border: 'none', color: '#a8a49c', padding: 2 }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 15 }}></i>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
              {DIAS.map((d, i) => (
                <span key={i} style={{ fontSize: 10, color: '#a8a49c', padding: '3px 0' }}>
                  {d}
                </span>
              ))}

              {Array.from({ length: hueco }).map((_, i) => (
                <span key={`h${i}`}></span>
              ))}

              {Array.from({ length: total }).map((_, i) => {
                const dia = i + 1;
                const iso = aISO(new Date(ano, mes, dia));
                const sel = value === iso;
                const esHoy = esteMes && hoy.getDate() === dia;
                const finde = (hueco + i) % 7 >= 5;
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => elegir(dia)}
                    style={{
                      fontSize: 11.5,
                      padding: '6px 0',
                      border: 'none',
                      borderRadius: 7,
                      background: sel ? MORADO : 'transparent',
                      color: sel ? '#fff' : finde ? '#a8a49c' : '#1a1a18',
                      fontWeight: sel || esHoy ? 600 : 400,
                      // Hoy se marca con un punto, no con color: el color
                      // ya significa "elegido".
                      boxShadow: esHoy && !sel ? `inset 0 -3px 0 -1px ${BORDE}` : 'none',
                    }}
                  >
                    {dia}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
