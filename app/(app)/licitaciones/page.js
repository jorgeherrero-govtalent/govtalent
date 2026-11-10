'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import UpgradeModal from '@/components/UpgradeModal';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import SelectorFecha, { fechaLegible } from '@/components/SelectorFecha';
import {
  ADJUDICADAS,
  EN_PLAZO,
  ESTADOS,
  PROCEDIMIENTOS,
  SECTORES,
  TERRITORIOS,
  TIPOS,
  codigos,
  territorio,
} from '@/lib/contratacion/etiquetas';

/**
 * Licitaciones (BETA, 10-11-2026).
 *
 * Maqueta L5 del canvas «GovTalent: navegación con tres productos»
 * (10-11-2026): buscador pequeño y los filtros arriba, en botones estilo
 * Airtable (MultiSelectFilter en morado; las fechas con SelectorFecha,
 * como en Tareas). Ninguno bloqueado: los filtros son lo que nos
 * diferencia. Por defecto solo licitaciones, sin contratos menores.
 * Debajo, las pestañas Todas / En plazo /
 * Adjudicaciones / Vencimientos y una tarjeta por licitación con el
 * presupuesto a la derecha, «Seguir» (va a Seguimiento) y «No me
 * interesa» (no se vuelve a enseñar).
 *
 * Datos: contratacion_expedientes (sql/123, lectura para quien ha
 * iniciado sesión desde sql/124), alimentada por los syncs de PLACSP
 * (perfiles, agregación y menores) y TED. Lo descartado vive en
 * contratacion_descartes; lo seguido, en follows con kind 'licitacion'.
 *
 * Pendiente: «Quién decide» (cruce del órgano por DIR3/NIF con el
 * directorio), alarmas de licitaciones y Vencimientos (hace falta leer
 * la duración de los contratos).
 */

const POR_PAGINA = 20;
const MORADO = '#6d5aef';
const NEGRO = '#1a1a18';
const GRIS = '#6e6a63';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const PESTANAS = [
  { v: 'todas', label: 'Todas' },
  { v: 'plazo', label: 'En plazo' },
  { v: 'adjudicaciones', label: 'Adjudicaciones' },
  { v: 'vencimientos', label: 'Vencimientos', pronto: true },
];

const ORDENES = [
  { v: 'fin', label: 'Fin de presentación' },
  { v: 'recientes', label: 'Más recientes' },
  { v: 'importe', label: 'Mayor importe' },
];

const EXPEDIENTES = [
  { value: 'licitaciones', label: 'Licitaciones' },
  { value: 'menores', label: 'Contratos menores' },
];

const FILTROS_VACIOS = {
  expediente: [],
  sectores: [],
  territorios: [],
  organo: '',
  tipos: [],
  procedimientos: [],
  importeMin: '',
  importeMax: '',
  finDesde: '',
  finHasta: '',
  pubDesde: '',
  pubHasta: '',
};

// Al entrar se ven solo las licitaciones: los contratos menores no se
// licitan (se adjudican directamente) y llenarían Todas y Adjudicaciones.
const FILTROS_INICIALES = { ...FILTROS_VACIOS, expediente: ['licitaciones'] };

const COLUMNAS =
  'id, fuente, expediente, titulo, url, estado, tipo, procedimiento, organo_nombre, organo_ubicacion, nuts, importe_sin_iva, valor_estimado, fin_ofertas, detectado_en, es_menor';

// La hora de Madrid en el formato de fin_ofertas (timestamp sin zona).
function ahoraMadrid() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date())
    .replace(' ', 'T');
}

// Lo que se escribe en el buscador va dentro de un filtro or() de
// PostgREST: fuera las comas, paréntesis y comodines.
function limpiar(t) {
  return String(t || '').replace(/[,.()*%\\:"]/g, ' ').trim();
}

function euros(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n));
}

function cuando(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

// fin_ofertas viene en hora de Madrid, sin zona: se lee tal cual.
function plazo(fin) {
  if (!fin) return null;
  const m = String(fin).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, a, me, d, h, mi] = m;
  const hora = h && !(h === '00' && mi === '00') && !(h === '23' && mi === '59') ? `, ${h}:${mi}` : '';
  const texto = `${Number(d)} ${MESES[Number(me) - 1]} ${a}${hora}`;
  const hoy = ahoraMadrid().slice(0, 10).split('-').map(Number);
  const dias = Math.round((Date.UTC(+a, +me - 1, +d) - Date.UTC(hoy[0], hoy[1] - 1, hoy[2])) / 864e5);
  const cerrado = ahoraMadrid() > String(fin).slice(0, 19);
  let resto;
  if (cerrado) resto = 'plazo cerrado';
  else if (dias <= 0) resto = 'termina hoy';
  else if (dias === 1) resto = 'queda 1 día';
  else resto = `quedan ${dias} días`;
  return { texto, resto, urgente: !cerrado && dias <= 3 };
}

function EnElBody({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

// Fechas en local (no toISOString, que pasa a UTC y en España devuelve
// el día anterior de madrugada).
function isoDia(desplazamiento = 0) {
  const d = new Date();
  d.setDate(d.getDate() + desplazamiento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inicioDia(iso, finDeDia = false) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = finDeDia ? new Date(a, m - 1, d, 23, 59, 59) : new Date(a, m - 1, d);
  return f.toISOString();
}

/**
 * Botón de filtro con desplegable, en la misma familia que
 * MultiSelectFilter (estilo Airtable), para lo que no es una lista de
 * casillas: importe, fechas y órgano. Se edita un borrador y se aplica
 * con «Aplicar», como en los demás filtros.
 */
function FiltroBoton({ label, activo, resumen, valor, vacio, onApply, ancho = 290, children }) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState(valor);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const boton = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    setBorrador(valor);
    const r = boton.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.max(12, Math.min(r.left, window.innerWidth - ancho - 12)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  return (
    <>
      <button ref={boton} type="button" className={`gt-lic-chip${activo ? ' on' : ''}`} onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        {label}
        {activo && resumen ? `: ${resumen}` : ''}
        <i className={`ti ${activo ? 'ti-filter-filled' : 'ti-chevron-down'}`} aria-hidden="true" />
      </button>
      {abierto && (
        <EnElBody>
          <div onClick={() => setAbierto(false)} style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
          <div className="gt-lic-pop" style={{ top: pos.top, left: pos.left, width: ancho }} role="dialog" aria-label={label}>
            <div className="gt-lic-pop-cuerpo">{children(borrador, setBorrador)}</div>
            <div className="gt-lic-pop-pie">
              <button type="button" className="gt-lic-pop-sec" onClick={() => setBorrador(vacio)}>
                Borrar
              </button>
              <button type="button" className="gt-lic-pop-sec" onClick={() => setAbierto(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="gt-lic-pop-ok"
                onClick={() => {
                  setAbierto(false);
                  onApply(borrador);
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </EnElBody>
      )}
    </>
  );
}

function RangoFechas({ valor, onChange, atajosDesde, atajosHasta }) {
  return (
    <div className="gt-lic-rango">
      <label>
        Desde
        <SelectorFecha value={valor.desde} onChange={(v) => onChange({ ...valor, desde: v })} atajos={atajosDesde} capa={320} />
      </label>
      <label>
        Hasta
        <SelectorFecha value={valor.hasta} onChange={(v) => onChange({ ...valor, hasta: v })} atajos={atajosHasta} capa={320} />
      </label>
    </div>
  );
}

function resumenFechas(desde, hasta) {
  if (desde && hasta) return `${fechaLegible(desde)} a ${fechaLegible(hasta)}`;
  if (desde) return `desde ${fechaLegible(desde)}`;
  if (hasta) return `hasta ${fechaLegible(hasta)}`;
  return '';
}

function miles(n) {
  return Number(n).toLocaleString('es-ES');
}

function Adjudicacion({ adj }) {
  if (!adj?.length) return null;
  const a = adj[0];
  const quien = a.persona_fisica ? 'una persona física' : a.adjudicatario;
  if (!quien) return null;
  const importe = euros(a.importe);
  return (
    <div className="gt-lic-adj">
      <i className="ti ti-award" aria-hidden="true" />
      <span>
        Adjudicada a <b>{quien}</b>
        {importe ? ` por ${importe}` : ''}
        {adj.length > 1 ? `, y ${adj.length - 1} ${adj.length - 1 === 1 ? 'lote más' : 'lotes más'}` : ''}
      </span>
    </div>
  );
}

function Tarjeta({ l, adj, siguiendo, onSeguir, onDescartar }) {
  const p = plazo(l.fin_ofertas);
  const terr = territorio(l.nuts);
  const lugar = [l.organo_ubicacion && l.organo_ubicacion !== l.organo_nombre ? l.organo_ubicacion : null, terr]
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .join(', ');
  const importe = euros(l.importe_sin_iva ?? l.valor_estimado);
  const ref = l.expediente || (l.fuente === 'ted' ? `TED ${l.id.replace(/^ted:/, '')}` : null);
  return (
    <article className="gt-lic-card">
      <div className="gt-lic-card-main">
        <div className="gt-lic-card-top">
          {ref && <span className="gt-lic-ref">{ref}</span>}
          {cuando(l.detectado_en) && <span className="gt-lic-tag">{cuando(l.detectado_en)}</span>}
          {l.es_menor && <span className="gt-lic-tag">Contrato menor</span>}
          {l.fuente === 'ted' && <span className="gt-lic-tag">Diario Oficial de la UE</span>}
          {ESTADOS[l.estado] && <span className="gt-lic-estado">{ESTADOS[l.estado]}</span>}
        </div>
        <a href={l.url} target="_blank" rel="noopener noreferrer" className="gt-lic-titulo">
          {l.titulo || 'Sin título'}
        </a>
        <span className="gt-lic-organo">
          <span>{l.organo_nombre || 'Órgano sin identificar'}</span>
          {lugar && <small>{lugar}</small>}
        </span>
        <Adjudicacion adj={adj} />
        {p && (
          <div className="gt-lic-fin" style={{ color: p.urgente ? MORADO : '#55524c' }}>
            Fin de presentación: {p.texto} <span>({p.resto})</span>
          </div>
        )}
      </div>
      <div className="gt-lic-card-lado">
        <span className="gt-lic-importe">
          <small>Presupuesto</small>
          <b>{importe || 'Sin importe'}</b>
        </span>
        <span className="gt-lic-acciones">
          <button type="button" className={`gt-lic-seguir${siguiendo ? ' on' : ''}`} onClick={() => onSeguir(l)} aria-pressed={siguiendo}>
            {siguiendo ? 'Siguiendo' : 'Seguir'}
          </button>
          <button type="button" className="gt-lic-descartar" onClick={() => onDescartar(l)}>
            No me interesa
          </button>
        </span>
      </div>
    </article>
  );
}

function Tabla({ filas, adjs, seguidas, onSeguir, onDescartar }) {
  return (
    <div className="gt-lic-tabla-caja">
      <table className="gt-lic-tabla">
        <thead>
          <tr>
            <th>Objeto</th>
            <th>Órgano</th>
            <th style={{ textAlign: 'right' }}>Presupuesto</th>
            <th>Fin de presentación</th>
            <th>Estado</th>
            <th>
              <span className="gt-sr">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((l) => {
            const p = plazo(l.fin_ofertas);
            const a = adjs[l.id]?.[0];
            return (
              <tr key={l.id}>
                <td style={{ maxWidth: 380 }}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.titulo || 'Sin título'}
                  </a>
                  {a && (a.adjudicatario || a.persona_fisica) && (
                    <small style={{ display: 'block', color: GRIS }}>
                      Adjudicada a {a.persona_fisica ? 'una persona física' : a.adjudicatario}
                    </small>
                  )}
                </td>
                <td style={{ maxWidth: 240 }}>
                  {l.organo_nombre}
                  {territorio(l.nuts) && <small style={{ display: 'block', color: GRIS }}>{territorio(l.nuts)}</small>}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{euros(l.importe_sin_iva ?? l.valor_estimado) || '—'}</td>
                <td style={{ whiteSpace: 'nowrap', color: p?.urgente ? MORADO : undefined }}>
                  {p ? p.texto : '—'}
                  {p && <small style={{ display: 'block', color: p.urgente ? MORADO : GRIS }}>{p.resto}</small>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{ESTADOS[l.estado] || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className={`gt-lic-seguir chico${seguidas.has(l.id) ? ' on' : ''}`} onClick={() => onSeguir(l)}>
                    {seguidas.has(l.id) ? 'Siguiendo' : 'Seguir'}
                  </button>
                  <button type="button" className="gt-lic-x" onClick={() => onDescartar(l)} title="No me interesa" aria-label="No me interesa">
                    <i className="ti ti-eye-off" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const ESTILOS = `
.gt-lic { max-width: 1240px; }
.gt-lic-cab { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.gt-lic-cab h1 { font-size: 21px; font-weight: 600; margin: 0; letter-spacing: -.3px; }
.gt-lic-cuerpo { display: flex; gap: 18px; align-items: flex-start; }
.gt-lic-barra-filtros { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.gt-lic-caja { display: flex; align-items: center; gap: 8px; width: 300px; max-width: 100%; background: #fff; border: .5px solid #e0dfd8; border-radius: 20px; padding: 8px 14px; box-sizing: border-box; }
.gt-lic-caja i { color: #999; font-size: 15px; }
.gt-lic-caja input { border: none; outline: none; flex: 1; min-width: 0; font: inherit; font-size: 12.5px; background: transparent; }
.gt-lic-chip { display: inline-flex; align-items: center; gap: 6px; background: #faf9f5; border: .5px solid #e0dfd8; border-radius: 8px; padding: 8px 12px; font: inherit; font-size: 12.5px; color: #666; cursor: pointer; white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
.gt-lic-chip i { font-size: 12px; }
.gt-lic-chip.on { background: #f3f1fe; border-color: ${MORADO}; color: ${MORADO}; font-weight: 600; }
.gt-lic-pop { position: fixed; z-index: 301; background: #fff; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.15); border: .5px solid #e0dfd8; }
.gt-lic-pop-cuerpo { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.gt-lic-pop-pie { display: flex; gap: 8px; padding: 10px; border-top: .5px solid #e0dfd8; }
.gt-lic-pop-sec { flex: 1; padding: 7px 8px; border-radius: 7px; border: .5px solid #e0dfd8; background: #fff; font: inherit; font-size: 12.5px; color: #666; cursor: pointer; }
.gt-lic-pop-ok { flex: 1; padding: 7px 8px; border-radius: 7px; border: none; background: ${NEGRO}; color: #fff; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.gt-lic-rango { display: flex; flex-direction: column; gap: 10px; }
.gt-lic-rango label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${GRIS}; }
.gt-lic-campo { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; border: .5px solid #e0dfd8; border-radius: 9px; background: #fafaf7; padding: 9px 12px; outline: none; }
.gt-lic-campo:focus { border-color: ${MORADO}; }
.gt-lic-limpiar { border: none; background: none; font: inherit; font-size: 12.5px; color: #55524c; cursor: pointer; padding: 0; }
.gt-lic-limpiar:hover { color: #1a1a18; text-decoration: underline; }
.gt-lic-res { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.gt-lic-seg { display: flex; gap: 4px; background: #ecebe5; border-radius: 10px; padding: 4px; }
.gt-lic-seg button { flex: 1; border: none; font: inherit; font-size: 13.5px; padding: 8px 10px; border-radius: 8px; background: transparent; color: #57534e; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.gt-lic-seg button.on { background: #fff; box-shadow: 0 1px 2px rgba(26,26,24,.08); font-weight: 600; color: #1a1a18; }
.gt-lic-seg button:disabled { cursor: default; color: #9a968e; }
.gt-lic-pronto { font-size: 10px; font-weight: 600; color: ${GRIS}; background: #f1f0eb; border-radius: 5px; padding: 1px 6px; }
.gt-lic-barra { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.gt-lic-barra b { font-size: 14.5px; }
.gt-lic-pill { font-size: 12px; color: ${MORADO}; background: #f3f1fe; border-radius: 6px; padding: 2px 8px; font-weight: 600; }
.gt-lic-barra-der { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.gt-lic-sel { font: inherit; font-size: 13px; border: 1px solid #dcdbd4; border-radius: 9px; background: #fff; padding: 6px 9px; color: #1a1a18; }
.gt-lic-vista { display: inline-flex; border: 1px solid #dcdbd4; border-radius: 9px; overflow: hidden; background: #fff; }
.gt-lic-vista button { border: none; background: none; font: inherit; font-size: 13px; padding: 6px 11px; cursor: pointer; color: #57534e; }
.gt-lic-vista button.on { background: #1a1a18; color: #fff; }
.gt-lic-card { background: #fff; border: 1px solid #e5e4de; border-radius: 12px; display: flex; overflow: hidden; }
.gt-lic-card-main { flex: 1; min-width: 0; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
.gt-lic-card-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gt-lic-ref { font-size: 11.5px; background: #f7f6f2; border: 1px solid #e5e4de; border-radius: 6px; padding: 1px 7px; font-family: ui-monospace, monospace; color: #55524c; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gt-lic-tag { font-size: 11.5px; border: 1px solid #e5e4de; border-radius: 6px; padding: 1px 7px; color: #55524c; }
.gt-lic-estado { margin-left: auto; font-size: 12px; color: #55524c; background: #f1f0eb; border-radius: 6px; padding: 2px 9px; font-weight: 600; }
.gt-lic-titulo { font-size: 16px; line-height: 1.35; font-weight: 600; color: #1a1a18; text-decoration: none; }
.gt-lic-titulo:hover { text-decoration: underline; }
.gt-lic-organo { display: flex; flex-direction: column; gap: 1px; font-size: 13.5px; font-weight: 500; }
.gt-lic-organo small { color: ${GRIS}; font-weight: 400; font-size: 12.5px; }
.gt-lic-adj { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; background: #faf9ff; border: 1px solid #ece9fd; border-radius: 9px; padding: 7px 10px; }
.gt-lic-adj i { color: ${MORADO}; font-size: 16px; margin-top: 1px; }
.gt-lic-fin { border-top: 1px solid #efeee8; padding-top: 9px; font-size: 13px; font-weight: 600; }
.gt-lic-fin span { font-weight: 500; color: ${GRIS}; }
.gt-lic-card-lado { width: 190px; flex: 0 0 190px; background: #fafaf8; border-left: 1px solid #efeee8; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; gap: 12px; }
.gt-lic-importe { display: flex; flex-direction: column; margin-top: 18px; }
.gt-lic-importe small { color: ${GRIS}; }
.gt-lic-importe b { font-size: 17px; }
.gt-lic-acciones { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.gt-lic-seguir { font: inherit; font-size: 13px; color: #fff; background: ${NEGRO}; border: 1px solid ${NEGRO}; border-radius: 9px; padding: 7px 0; cursor: pointer; }
.gt-lic-seguir.on { background: #fff; color: ${NEGRO}; border-color: #dcdbd4; }
.gt-lic-seguir.chico { padding: 5px 11px; }
.gt-lic-descartar { font: inherit; font-size: 13px; color: #55524c; border: 1px solid #dcdbd4; border-radius: 9px; background: #fff; padding: 6px 0; cursor: pointer; }
.gt-lic-descartar:hover, .gt-lic-x:hover { color: #1a1a18; border-color: #bdbcb4; }
.gt-lic-x { font: inherit; border: 1px solid #dcdbd4; border-radius: 9px; background: #fff; padding: 4px 8px; margin-left: 6px; color: #55524c; cursor: pointer; vertical-align: middle; }
.gt-lic-tabla-caja { background: #fff; border: 1px solid #e5e4de; border-radius: 12px; overflow-x: auto; }
.gt-lic-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
.gt-lic-tabla th { text-align: left; font-weight: 600; font-size: 12px; color: ${GRIS}; padding: 10px 12px; border-bottom: 1px solid #efeee8; white-space: nowrap; }
.gt-lic-tabla td { padding: 10px 12px; border-bottom: 1px solid #f3f2ed; vertical-align: top; }
.gt-lic-tabla tr:last-child td { border-bottom: none; }
.gt-lic-tabla a { color: #1a1a18; font-weight: 500; text-decoration: none; }
.gt-lic-tabla a:hover { text-decoration: underline; }
.gt-lic-mas { align-self: center; font: inherit; font-size: 13.5px; border: 1px solid #dcdbd4; border-radius: 9px; background: #fff; padding: 8px 16px; cursor: pointer; }
.gt-lic-vacio { background: #fff; border: 1px dashed #dcdbd4; border-radius: 12px; padding: 32px; text-align: center; color: #55524c; font-size: 14px; }
.gt-lic-esqueleto { height: 170px; border-radius: 12px; background: linear-gradient(90deg, #f1f0eb 0%, #f7f6f2 50%, #f1f0eb 100%); background-size: 200% 100%; animation: gt-lic-brillo 1.2s infinite linear; }
@keyframes gt-lic-brillo { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.gt-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 900px) {
  .gt-lic-cuerpo { flex-direction: column; }
  .gt-lic-card { flex-direction: column; }
  .gt-lic-card-lado { width: auto; flex: none; border-left: none; border-top: 1px solid #efeee8; flex-direction: row; text-align: left; }
  .gt-lic-importe { margin-top: 0; }
  .gt-lic-acciones { width: 150px; }
  .gt-lic-seg button { font-size: 12.5px; padding: 7px 4px; }
}
`;

export default function Licitaciones() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState(undefined);
  const [esPro, setEsPro] = useState(false);
  const [seguidas, setSeguidas] = useState(new Set());
  const [descartadas, setDescartadas] = useState(new Set());
  const [listoUsuario, setListoUsuario] = useState(false);

  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pestana, setPestana] = useState('plazo');
  const [orden, setOrden] = useState('fin');
  const [vista, setVista] = useState('tarjetas');
  const [f, setF] = useState(FILTROS_INICIALES);

  const [filas, setFilas] = useState([]);
  const [adjs, setAdjs] = useState({});
  const [total, setTotal] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [upsell, setUpsell] = useState(false);
  const pedido = useRef(0);

  // El usuario, su plan y lo que ya sigue o ha descartado.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || null;
      if (!vivo) return;
      setUserId(uid);
      if (!uid) {
        setListoUsuario(true);
        return;
      }
      const [perfil, segs, descs] = await Promise.all([
        supabase.from('users').select('plan').eq('id', uid).single(),
        supabase.from('follows').select('ref_id').eq('user_id', uid).eq('kind', 'licitacion'),
        supabase.from('contratacion_descartes').select('expediente_id').eq('user_id', uid),
      ]);
      if (!vivo) return;
      setEsPro(perfil.data?.plan === 'pro');
      setSeguidas(new Set((segs.data || []).map((r) => r.ref_id)));
      setDescartadas(new Set((descs.data || []).map((r) => r.expediente_id)));
      setListoUsuario(true);
    })();
    return () => {
      vivo = false;
    };
  }, [supabase]);

  // El buscador espera a que se deje de escribir.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(limpiar(texto)), 350);
    return () => clearTimeout(t);
  }, [texto]);

  // En plazo se ordena por fin de presentación; lo demás, por lo último.
  useEffect(() => {
    setOrden(pestana === 'plazo' ? 'fin' : 'recientes');
  }, [pestana]);

  // Lo oculto se lee en el momento de pedir (no es dependencia): al
  // descartar se quita la tarjeta a mano y no se vuelve a pedir todo.
  const ocultasRef = useRef({ seguidas, descartadas });
  ocultasRef.current = { seguidas, descartadas };

  const consulta = useCallback(
    (desde) => {
      let q = supabase.from('contratacion_expedientes').select(COLUMNAS, { count: 'exact' }).eq('eliminado', false);
      // Varias condiciones «o» a la vez (plazo, cada palabra, territorio)
      // tienen que cumplirse todas: se juntan en un solo or(and(...)) para
      // no depender de cómo trata PostgREST un parámetro or repetido.
      const oes = [];

      if (pestana === 'plazo') {
        q = q.in('estado', EN_PLAZO);
        oes.push(`fin_ofertas.is.null,fin_ofertas.gte."${ahoraMadrid()}"`);
      } else if (pestana === 'adjudicaciones') {
        q = q.in('estado', ADJUDICADAS);
      }

      for (const palabra of busqueda.split(/\s+/).filter((p) => p.length > 1).slice(0, 6)) {
        oes.push(`titulo.ilike.*${palabra}*,organo_nombre.ilike.*${palabra}*,expediente.ilike.*${palabra}*`);
      }

      if (f.expediente.length === 1) q = q.eq('es_menor', f.expediente[0] === 'menores');
      if (f.pubDesde) q = q.gte('detectado_en', inicioDia(f.pubDesde));
      if (f.pubHasta) q = q.lte('detectado_en', inicioDia(f.pubHasta, true));
      if (f.sectores.length) q = q.overlaps('cpv_div', f.sectores);
      if (f.territorios.length) oes.push(f.territorios.map((t) => `nuts.ilike.${t}*`).join(','));
      const organo = limpiar(f.organo);
      if (organo) q = q.ilike('organo_nombre', `%${organo}%`);
      if (f.tipos.length) q = q.in('tipo', codigos(TIPOS, f.tipos));
      if (f.procedimientos.length) q = q.in('procedimiento', codigos(PROCEDIMIENTOS, f.procedimientos));
      if (f.importeMin !== '' && !Number.isNaN(Number(f.importeMin))) q = q.gte('importe_sin_iva', Number(f.importeMin));
      if (f.importeMax !== '' && !Number.isNaN(Number(f.importeMax))) q = q.lte('importe_sin_iva', Number(f.importeMax));
      if (f.finDesde) q = q.gte('fin_ofertas', `${f.finDesde}T00:00:00`);
      if (f.finHasta) q = q.lte('fin_ofertas', `${f.finHasta}T23:59:59`);

      if (oes.length === 1) q = q.or(oes[0]);
      else if (oes.length > 1) q = q.or(`and(${oes.map((o) => `or(${o})`).join(',')})`);

      const { descartadas: d } = ocultasRef.current;
      const ocultas = [...d];
      if (ocultas.length) q = q.not('id', 'in', `(${ocultas.map((i) => `"${i}"`).join(',')})`);

      if (orden === 'fin') q = q.order('fin_ofertas', { ascending: true, nullsFirst: false });
      else if (orden === 'importe') q = q.order('importe_sin_iva', { ascending: false, nullsFirst: false });
      q = q.order('detectado_en', { ascending: false }).order('id');

      return q.range(desde, desde + POR_PAGINA - 1);
    },
    [supabase, pestana, busqueda, f, orden],
  );

  const traerAdjudicaciones = useCallback(
    async (lista) => {
      const ids = lista.filter((l) => ADJUDICADAS.includes(l.estado)).map((l) => l.id);
      if (!ids.length) return {};
      const { data } = await supabase
        .from('contratacion_adjudicaciones')
        .select('expediente_id, orden, adjudicatario, persona_fisica, importe')
        .in('expediente_id', ids)
        .order('orden');
      const m = {};
      for (const a of data || []) (m[a.expediente_id] ||= []).push(a);
      return m;
    },
    [supabase],
  );

  useEffect(() => {
    if (!listoUsuario || !userId || pestana === 'vencimientos') return;
    const n = ++pedido.current;
    setCargando(true);
    setError(null);
    (async () => {
      const { data, count, error: e } = await consulta(0);
      if (n !== pedido.current) return;
      if (e) {
        setError('No se han podido cargar las licitaciones. Vuelve a intentarlo en un momento.');
        setFilas([]);
        setTotal(null);
        setCargando(false);
        return;
      }
      const m = await traerAdjudicaciones(data || []);
      if (n !== pedido.current) return;
      setFilas(data || []);
      setAdjs(m);
      setTotal(count ?? null);
      setCargando(false);
    })();
    // seguidas solo cuenta si se piden ocultas.
  }, [listoUsuario, userId, consulta, traerAdjudicaciones, pestana]);

  async function cargarMas() {
    const n = pedido.current;
    setCargando(true);
    const { data, error: e } = await consulta(filas.length);
    if (n !== pedido.current) return;
    if (e) {
      toast.error('No se han podido cargar más');
      setCargando(false);
      return;
    }
    const m = await traerAdjudicaciones(data || []);
    setFilas((prev) => {
      const ya = new Set(prev.map((x) => x.id));
      return [...prev, ...(data || []).filter((x) => !ya.has(x.id))];
    });
    setAdjs((prev) => ({ ...prev, ...m }));
    setCargando(false);
  }

  async function seguir(l) {
    if (!userId) return;
    const ya = seguidas.has(l.id);
    if (!ya && !esPro) {
      setUpsell(true);
      return;
    }
    const nuevo = new Set(seguidas);
    if (ya) nuevo.delete(l.id);
    else nuevo.add(l.id);
    setSeguidas(nuevo);
    const { error: e } = ya
      ? await supabase.from('follows').delete().eq('user_id', userId).eq('kind', 'licitacion').eq('ref_id', l.id)
      : await supabase
          .from('follows')
          .upsert({ user_id: userId, kind: 'licitacion', ref_id: l.id, label: (l.titulo || '').slice(0, 300) }, { onConflict: 'user_id,kind,ref_id' });
    if (e) {
      setSeguidas(seguidas);
      toast.error(ya ? 'No se ha podido dejar de seguir' : 'No se ha podido seguir');
      return;
    }
    toast.info(ya ? 'Has dejado de seguirla' : 'La tienes en Seguimiento');
  }

  async function descartar(l) {
    if (!userId) return;
    const indice = filas.findIndex((x) => x.id === l.id);
    setFilas((prev) => prev.filter((x) => x.id !== l.id));
    setTotal((t) => (t == null ? t : Math.max(0, t - 1)));
    setDescartadas((prev) => new Set(prev).add(l.id));
    const { error: e } = await supabase.from('contratacion_descartes').insert({ user_id: userId, expediente_id: l.id });
    if (e && e.code !== '23505') {
      deshacer(l, indice, false);
      toast.error('No se ha podido descartar');
      return;
    }
    toast.info('No te la volveremos a enseñar', {
      action: { label: 'Deshacer', onClick: () => deshacer(l, indice, true) },
    });
  }

  async function deshacer(l, indice, borrar) {
    setFilas((prev) => {
      if (prev.some((x) => x.id === l.id)) return prev;
      const copia = [...prev];
      copia.splice(Math.max(0, Math.min(indice, copia.length)), 0, l);
      return copia;
    });
    setTotal((t) => (t == null ? t : t + 1));
    setDescartadas((prev) => {
      const s = new Set(prev);
      s.delete(l.id);
      return s;
    });
    if (borrar) await supabase.from('contratacion_descartes').delete().eq('user_id', userId).eq('expediente_id', l.id);
  }

  const cambiar = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const conjunto = (k) => (sel) => cambiar(k, [...sel]);
  const hayImporte = f.importeMin !== '' || f.importeMax !== '';
  const resumenImporte =
    f.importeMin !== '' && f.importeMax !== ''
      ? `${miles(f.importeMin)} a ${miles(f.importeMax)} €`
      : f.importeMin !== ''
        ? `desde ${miles(f.importeMin)} €`
        : f.importeMax !== ''
          ? `hasta ${miles(f.importeMax)} €`
          : '';
  const nFiltros =
    f.expediente.length +
    f.sectores.length +
    f.territorios.length +
    (f.organo ? 1 : 0) +
    f.tipos.length +
    f.procedimientos.length +
    (hayImporte ? 1 : 0) +
    (f.finDesde || f.finHasta ? 1 : 0) +
    (f.pubDesde || f.pubHasta ? 1 : 0);
  const sinFiltros = nFiltros === 0;
  const acento = { acento: MORADO, fondoActivo: '#f3f1fe', aplicarColor: NEGRO };

  if (userId === null) {
    return (
      <div className="sec gt-lic">
        <style>{ESTILOS}</style>
        <div className="gt-lic-cab">
          <h1>Licitaciones</h1>
        </div>
        <div className="gt-lic-vacio">
          <Link href="/login?redirect=/licitaciones" style={{ color: NEGRO, fontWeight: 600 }}>
            Inicia sesión
          </Link>{' '}
          para buscar licitaciones de la Plataforma de Contratación del Sector Público y del Diario Oficial de la UE.
        </div>
      </div>
    );
  }

  return (
    <div className="sec gt-lic">
      <style>{ESTILOS}</style>

      <div className="gt-lic-cab">
        <h1>Licitaciones</h1>
      </div>

      <div className="gt-lic-barra-filtros">
        <label className="gt-lic-caja">
          <i className="ti ti-search" aria-hidden="true" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar licitación, órgano o expediente"
            aria-label="Buscar licitaciones"
          />
        </label>
        <MultiSelectFilter label="Licitaciones y menores" values={EXPEDIENTES} selected={new Set(f.expediente)} onApply={conjunto('expediente')} {...acento} />
        <MultiSelectFilter
          label="Sector (CPV)"
          values={SECTORES.map((o) => ({ value: o.v, label: o.label }))}
          selected={new Set(f.sectores)}
          onApply={conjunto('sectores')}
          {...acento}
        />
        <MultiSelectFilter
          label="Territorio"
          values={TERRITORIOS.map((o) => ({ value: o.v, label: o.label }))}
          selected={new Set(f.territorios)}
          onApply={conjunto('territorios')}
          {...acento}
        />
        <FiltroBoton
          label="Órgano de contratación"
          activo={!!f.organo}
          resumen={f.organo}
          valor={f.organo}
          vacio=""
          onApply={(v) => cambiar('organo', v.trim())}
        >
          {(v, set) => (
            <input
              autoFocus
              type="text"
              className="gt-lic-campo"
              placeholder="Ayuntamiento de…, Ministerio de…"
              aria-label="Órgano de contratación"
              value={v}
              onChange={(e) => set(e.target.value)}
            />
          )}
        </FiltroBoton>
        <MultiSelectFilter
          label="Tipo de contrato"
          values={TIPOS.map((o) => ({ value: o.v, label: o.label }))}
          selected={new Set(f.tipos)}
          onApply={conjunto('tipos')}
          {...acento}
        />
        <MultiSelectFilter
          label="Procedimiento"
          values={PROCEDIMIENTOS.map((o) => ({ value: o.v, label: o.label }))}
          selected={new Set(f.procedimientos)}
          onApply={conjunto('procedimientos')}
          {...acento}
        />
        <FiltroBoton
          label="Importe"
          activo={hayImporte}
          resumen={resumenImporte}
          valor={{ min: f.importeMin, max: f.importeMax }}
          vacio={{ min: '', max: '' }}
          onApply={(v) => setF((prev) => ({ ...prev, importeMin: v.min, importeMax: v.max }))}
          ancho={260}
        >
          {(v, set) => (
            <div className="gt-lic-rango">
              <label>
                Desde (€, sin IVA)
                <input type="number" min="0" inputMode="numeric" className="gt-lic-campo" value={v.min} onChange={(e) => set({ ...v, min: e.target.value })} />
              </label>
              <label>
                Hasta (€, sin IVA)
                <input type="number" min="0" inputMode="numeric" className="gt-lic-campo" value={v.max} onChange={(e) => set({ ...v, max: e.target.value })} />
              </label>
            </div>
          )}
        </FiltroBoton>
        <FiltroBoton
          label="Fin de presentación"
          activo={!!(f.finDesde || f.finHasta)}
          resumen={resumenFechas(f.finDesde, f.finHasta)}
          valor={{ desde: f.finDesde, hasta: f.finHasta }}
          vacio={{ desde: '', hasta: '' }}
          onApply={(v) => setF((prev) => ({ ...prev, finDesde: v.desde || '', finHasta: v.hasta || '' }))}
        >
          {(v, set) => (
            <RangoFechas
              valor={v}
              onChange={set}
              atajosDesde={[{ label: 'Hoy', iso: isoDia() }]}
              atajosHasta={[
                { label: 'En 7 días', iso: isoDia(7) },
                { label: 'En 15 días', iso: isoDia(15) },
                { label: 'En 30 días', iso: isoDia(30) },
              ]}
            />
          )}
        </FiltroBoton>
        <FiltroBoton
          label="Publicada"
          activo={!!(f.pubDesde || f.pubHasta)}
          resumen={resumenFechas(f.pubDesde, f.pubHasta)}
          valor={{ desde: f.pubDesde, hasta: f.pubHasta }}
          vacio={{ desde: '', hasta: '' }}
          onApply={(v) => setF((prev) => ({ ...prev, pubDesde: v.desde || '', pubHasta: v.hasta || '' }))}
        >
          {(v, set) => (
            <RangoFechas
              valor={v}
              onChange={set}
              atajosDesde={[
                { label: 'Hoy', iso: isoDia() },
                { label: 'Hace 7 días', iso: isoDia(-7) },
                { label: 'Hace 30 días', iso: isoDia(-30) },
              ]}
              atajosHasta={[{ label: 'Hoy', iso: isoDia() }]}
            />
          )}
        </FiltroBoton>
        {!sinFiltros && (
          <button type="button" className="gt-lic-limpiar" onClick={() => setF(FILTROS_VACIOS)}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="gt-lic-cuerpo">
        <div className="gt-lic-res">
          <div role="tablist" aria-label="Licitaciones" className="gt-lic-seg">
            {PESTANAS.map((p) => (
              <button
                key={p.v}
                type="button"
                role="tab"
                aria-selected={pestana === p.v}
                className={pestana === p.v ? 'on' : undefined}
                onClick={() => setPestana(p.v)}
              >
                {p.label}
                {p.pronto && <span className="gt-lic-pronto">Pronto</span>}
              </button>
            ))}
          </div>

          {pestana === 'vencimientos' ? (
            <div className="gt-lic-vacio">
              Muy pronto: los contratos que vencen en los próximos meses, para preparar la siguiente licitación antes de que se
              publique.
            </div>
          ) : (
            <>
              <div className="gt-lic-barra">
                <b>
                  {total == null ? (cargando ? 'Buscando…' : '') : `${total.toLocaleString('es-ES')} ${total === 1 ? 'licitación' : 'licitaciones'}`}
                </b>
                {pestana !== 'todas' && <span className="gt-lic-pill">{PESTANAS.find((p) => p.v === pestana)?.label}</span>}
                <span className="gt-lic-barra-der">
                  <select className="gt-lic-sel" value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar">
                    {ORDENES.map((o) => (
                      <option key={o.v} value={o.v}>
                        Ordenar: {o.label.toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <span className="gt-lic-vista" role="group" aria-label="Vista">
                    <button type="button" className={vista === 'tarjetas' ? 'on' : undefined} onClick={() => setVista('tarjetas')} aria-pressed={vista === 'tarjetas'}>
                      Tarjetas
                    </button>
                    <button type="button" className={vista === 'tabla' ? 'on' : undefined} onClick={() => setVista('tabla')} aria-pressed={vista === 'tabla'}>
                      Tabla
                    </button>
                  </span>
                </span>
              </div>

              {error && <div className="gt-lic-vacio">{error}</div>}

              {!error && cargando && filas.length === 0 && (
                <>
                  <div className="gt-lic-esqueleto" />
                  <div className="gt-lic-esqueleto" />
                  <div className="gt-lic-esqueleto" />
                </>
              )}

              {!error && !cargando && filas.length === 0 && (
                <div className="gt-lic-vacio">
                  No hay licitaciones con estos criterios.
                  {nFiltros > 0 && (
                    <>
                      {' '}
                      <button type="button" className="gt-lic-limpiar" style={{ fontSize: 14 }} onClick={() => setF(FILTROS_VACIOS)}>
                        Quitar los filtros
                      </button>
                    </>
                  )}
                </div>
              )}

              {filas.length > 0 &&
                (vista === 'tabla' ? (
                  <Tabla filas={filas} adjs={adjs} seguidas={seguidas} onSeguir={seguir} onDescartar={descartar} />
                ) : (
                  filas.map((l) => (
                    <Tarjeta key={l.id} l={l} adj={adjs[l.id]} siguiendo={seguidas.has(l.id)} onSeguir={seguir} onDescartar={descartar} />
                  ))
                ))}

              {filas.length > 0 && total != null && filas.length < total && (
                <button type="button" className="gt-lic-mas" onClick={cargarMas} disabled={cargando}>
                  {cargando ? 'Cargando…' : 'Ver más'}
                </button>
              )}

              <small style={{ color: GRIS, fontSize: 12 }}>
                Fuentes: Plataforma de Contratación del Sector Público (datos abiertos, se actualiza cada día) y Diario Oficial de la
                Unión Europea (TED).
              </small>
            </>
          )}
        </div>
      </div>

      {upsell && (
        <EnElBody>
          <UpgradeModal
            title="Seguir requiere suscripción"
            message="Sigue licitaciones, leyes y expedientes, y tenlo todo en Seguimiento. Con alertas, proyectos y el directorio completo."
            onClose={() => setUpsell(false)}
          />
        </EnElBody>
      )}
    </div>
  );
}
