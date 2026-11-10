'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import UpgradeModal from '@/components/UpgradeModal';
import SelectorFecha from '@/components/SelectorFecha';
import Paginacion, { usePaginacion } from '@/components/Paginacion';
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
 * Maqueta L4 del canvas «GovTalent: navegación con tres productos»: la
 * estructura del buscador de Tendios con lo nuestro. Arriba, un buscador
 * pequeño y el conmutador Licitaciones / Contratos menores (los menores
 * no se licitan, se adjudican directamente); las fechas, con
 * SelectorFecha como en Tareas. Filtros a la izquierda (ninguno bloqueado), pestañas Todas / En plazo /
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

// Arriba del todo, antes que cualquier filtro: los contratos menores no
// se licitan (se adjudican directamente), así que van aparte.
const EXPEDIENTES = [
  { v: 'licitaciones', label: 'Licitaciones' },
  { v: 'menores', label: 'Contratos menores' },
];

// Fechas en local (no toISOString, que pasa a UTC).
function isoDia(desplazamiento = 0) {
  const d = new Date();
  d.setDate(d.getDate() + desplazamiento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ORDENES = [
  { v: 'fin', label: 'Fin de presentación' },
  { v: 'recientes', label: 'Más recientes' },
  { v: 'importe', label: 'Mayor importe' },
];

const FILTROS_VACIOS = {
  publicadas24: false,
  actualizadas24: false,
  ocultarSeguidas: false,
  sectores: [],
  territorios: [],
  organo: '',
  tipos: [],
  procedimientos: [],
  importeMin: '',
  importeMax: '',
  finDesde: '',
  finHasta: '',
};

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

function Grupo({ titulo, n, abierto, onToggle, children }) {
  return (
    <div className="gt-lic-grupo">
      <button type="button" className="gt-lic-grupo-cab" onClick={onToggle} aria-expanded={abierto}>
        <span>
          {titulo}
          {n > 0 && <span className="gt-lic-n"> ({n})</span>}
        </span>
        <i className={`ti ti-chevron-${abierto ? 'up' : 'down'}`} aria-hidden="true" />
      </button>
      {abierto && <div className="gt-lic-grupo-cuerpo">{children}</div>}
    </div>
  );
}

function Casillas({ opciones, elegidos, onChange, buscar }) {
  const [q, setQ] = useState('');
  const lista = q ? opciones.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : opciones;
  const alternar = (v) => onChange(elegidos.includes(v) ? elegidos.filter((x) => x !== v) : [...elegidos, v]);
  return (
    <>
      {buscar && (
        <input
          type="text"
          className="gt-lic-mini"
          placeholder="Filtrar"
          aria-label="Filtrar opciones"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <div className={buscar ? 'gt-lic-scroll' : undefined}>
        {lista.map((o) => (
          <label key={o.v} className="gt-lic-check">
            <input type="checkbox" checked={elegidos.includes(o.v)} onChange={() => alternar(o.v)} />
            {o.label}
          </label>
        ))}
      </div>
    </>
  );
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
.gt-lic-arriba { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.gt-lic-buscar { display: flex; align-items: center; gap: 8px; width: 300px; max-width: 100%; box-sizing: border-box; background: #fff; border: .5px solid #e0dfd8; border-radius: 20px; padding: 8px 14px; }
.gt-lic-buscar i { color: #999; font-size: 15px; }
.gt-lic-buscar input { border: none; outline: none; background: none; font: inherit; flex: 1; min-width: 0; font-size: 12.5px; }
.gt-lic-exp { display: inline-flex; gap: 2px; background: #fff; border: .5px solid #e0dfd8; border-radius: 9px; padding: 2px; }
.gt-lic-exp button { border: none; background: none; font: inherit; font-size: 12.5px; padding: 6px 11px; border-radius: 7px; color: #55524c; cursor: pointer; }
.gt-lic-exp button.on { background: ${NEGRO}; color: #fff; }
.gt-lic-cuerpo { display: flex; gap: 18px; align-items: flex-start; }
.gt-lic-filtros { width: 250px; flex: 0 0 250px; background: #fff; border: 1px solid #e5e4de; border-radius: 12px; overflow: hidden; position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto; }
.gt-lic-filtros-cab { padding: 13px 16px; display: flex; justify-content: space-between; align-items: center; }
.gt-lic-filtros-cab b { font-size: 14.5px; }
.gt-lic-limpiar { border: none; background: none; font: inherit; font-size: 12.5px; color: #55524c; cursor: pointer; padding: 0; }
.gt-lic-limpiar:hover { color: #1a1a18; text-decoration: underline; }
.gt-lic-grupo { border-top: 1px solid #efeee8; }
.gt-lic-grupo-cab { width: 100%; display: flex; align-items: center; justify-content: space-between; border: none; background: none; font: inherit; font-size: 13.5px; font-weight: 600; color: #1a1a18; padding: 12px 16px; cursor: pointer; text-align: left; }
.gt-lic-grupo-cab i { color: #767670; font-size: 15px; }
.gt-lic-n { color: ${GRIS}; font-weight: 400; }
.gt-lic-grupo-cuerpo { padding: 0 16px 13px; }
.gt-lic-check { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; padding: 4px 0; cursor: pointer; line-height: 1.35; }
.gt-lic-check input { margin: 2px 0 0; accent-color: ${MORADO}; flex-shrink: 0; }
.gt-lic-scroll { max-height: 220px; overflow-y: auto; margin-top: 4px; }
.gt-lic-mini { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; border: 1px solid #e0dfd8; border-radius: 8px; padding: 6px 9px; outline: none; }
.gt-lic-mini:focus { border-color: ${MORADO}; }
.gt-lic-dos { display: flex; gap: 8px; }
.gt-lic-dos label { flex: 1; display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: ${GRIS}; min-width: 0; }
.gt-lic-fechas { display: flex; flex-direction: column; gap: 8px; }
.gt-lic-fechas label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${GRIS}; }
.gt-lic-res { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.gt-lic-seg { display: flex; gap: 4px; background: #ecebe5; border-radius: 10px; padding: 4px; }
.gt-lic-seg button { flex: 1; border: none; font: inherit; font-size: 13.5px; padding: 8px 10px; border-radius: 8px; background: transparent; color: #57534e; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.gt-lic-seg button.on { background: #fff; box-shadow: 0 1px 2px rgba(26,26,24,.08); font-weight: 600; color: #1a1a18; }
.gt-lic-seg button:disabled { cursor: default; color: #9a968e; }
.gt-lic-pronto { font-size: 10px; font-weight: 600; color: ${GRIS}; background: #f1f0eb; border-radius: 5px; padding: 1px 6px; }
.gt-lic-activos { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.gt-lic-activo { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 500; color: ${MORADO}; background: #f3f1fe; border: .5px solid #ddd8fc; border-radius: 8px; padding: 4px 4px 4px 10px; max-width: 360px; }
.gt-lic-activo button { border: none; background: none; color: ${MORADO}; cursor: pointer; padding: 2px 4px; border-radius: 5px; display: inline-flex; line-height: 1; }
.gt-lic-activo button:hover { background: #e7e3fd; }
.gt-lic-activo button i { font-size: 13px; }
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
.gt-lic-vacio { background: #fff; border: 1px dashed #dcdbd4; border-radius: 12px; padding: 32px; text-align: center; color: #55524c; font-size: 14px; }
.gt-lic-esqueleto { height: 170px; border-radius: 12px; background: linear-gradient(90deg, #f1f0eb 0%, #f7f6f2 50%, #f1f0eb 100%); background-size: 200% 100%; animation: gt-lic-brillo 1.2s infinite linear; }
@keyframes gt-lic-brillo { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.gt-lic-abrir-filtros { display: none; }
.gt-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 900px) {
  .gt-lic-cuerpo { flex-direction: column; }
  .gt-lic-filtros { width: 100%; flex: none; position: static; max-height: none; display: none; }
  .gt-lic-filtros.abierto { display: block; }
  .gt-lic-abrir-filtros { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13.5px; border: 1px solid #dcdbd4; border-radius: 9px; background: #fff; padding: 7px 12px; cursor: pointer; }
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
  const [expediente, setExpediente] = useState('licitaciones');
  const [busqueda, setBusqueda] = useState('');
  const [pestana, setPestana] = useState('plazo');
  const [orden, setOrden] = useState('fin');
  const [vista, setVista] = useState('tarjetas');
  const [f, setF] = useState(FILTROS_VACIOS);
  const [abiertos, setAbiertos] = useState(new Set(['comunes']));
  const [filtrosMovil, setFiltrosMovil] = useState(false);

  const [filas, setFilas] = useState([]);
  const [adjs, setAdjs] = useState({});
  const [total, setTotal] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [upsell, setUpsell] = useState(false);
  const pedido = useRef(0);
  // La paginación de la plataforma (la de Organismos). Vuelve a la
  // primera página al cambiar la búsqueda, los filtros o la pestaña.
  const pag = usePaginacion(total ?? 0, [pestana, busqueda, f, orden, expediente]);

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
    (desde, tam) => {
      let q = supabase
        .from('contratacion_expedientes')
        .select(COLUMNAS, { count: 'exact' })
        .eq('eliminado', false)
        .eq('es_menor', expediente === 'menores');
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

      const dia = new Date(Date.now() - 864e5).toISOString();
      if (f.publicadas24) q = q.gte('detectado_en', dia);
      if (f.actualizadas24) q = q.gte('actualizado_fuente', dia);
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

      const { seguidas: s, descartadas: d } = ocultasRef.current;
      const ocultas = [...d, ...(f.ocultarSeguidas ? s : [])];
      if (ocultas.length) q = q.not('id', 'in', `(${ocultas.map((i) => `"${i}"`).join(',')})`);

      if (orden === 'fin') q = q.order('fin_ofertas', { ascending: true, nullsFirst: false });
      else if (orden === 'importe') q = q.order('importe_sin_iva', { ascending: false, nullsFirst: false });
      q = q.order('detectado_en', { ascending: false }).order('id');

      return q.range(desde, desde + tam - 1);
    },
    [supabase, pestana, busqueda, f, orden, expediente],
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
      const { data, count, error: e } = await consulta(pag.desde, pag.pageSize);
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
  }, [listoUsuario, userId, consulta, traerAdjudicaciones, pestana, pag.desde, pag.pageSize, f.ocultarSeguidas ? seguidas : null]);

  // Al cambiar de página, arriba del todo.
  const primeraCarga = useRef(true);
  useEffect(() => {
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pag.current]);

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
  const alternarGrupo = (k) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      return s;
    });

  const nComunes = [f.publicadas24, f.actualizadas24, f.ocultarSeguidas].filter(Boolean).length;
  const nImporte = [f.importeMin, f.importeMax].filter((x) => x !== '').length;
  const nFechas = [f.finDesde, f.finHasta].filter(Boolean).length;
  const nFiltros =
    nComunes + f.sectores.length + f.territorios.length + (f.organo ? 1 : 0) + f.tipos.length + f.procedimientos.length + nImporte + nFechas;

  // Lo que está filtrando, en etiquetas que se quitan de una en una.
  const quitarDe = (k, v) => () => cambiar(k, f[k].filter((x) => x !== v));
  const nombre = (lista, v) => lista.find((o) => o.v === v)?.label || v;
  const fechaCorta = (iso) => {
    const [a, m, d] = iso.split('-').map(Number);
    return `${d} ${MESES[m - 1]} ${a}`;
  };
  const activos = [
    f.publicadas24 && { k: 'p24', label: 'Publicadas en las últimas 24 h', quitar: () => cambiar('publicadas24', false) },
    f.actualizadas24 && { k: 'a24', label: 'Actualizadas en las últimas 24 h', quitar: () => cambiar('actualizadas24', false) },
    f.ocultarSeguidas && { k: 'oc', label: 'Sin las que ya sigo', quitar: () => cambiar('ocultarSeguidas', false) },
    ...f.sectores.map((v) => ({ k: `s${v}`, label: nombre(SECTORES, v), quitar: quitarDe('sectores', v) })),
    ...f.territorios.map((v) => ({ k: `t${v}`, label: nombre(TERRITORIOS, v), quitar: quitarDe('territorios', v) })),
    f.organo && { k: 'org', label: `Órgano: ${f.organo}`, quitar: () => cambiar('organo', '') },
    ...f.tipos.map((v) => ({ k: `ti${v}`, label: nombre(TIPOS, v), quitar: quitarDe('tipos', v) })),
    ...f.procedimientos.map((v) => ({ k: `pr${v}`, label: nombre(PROCEDIMIENTOS, v), quitar: quitarDe('procedimientos', v) })),
    nImporte > 0 && {
      k: 'imp',
      label:
        f.importeMin !== '' && f.importeMax !== ''
          ? `Importe: ${Number(f.importeMin).toLocaleString('es-ES')} a ${Number(f.importeMax).toLocaleString('es-ES')} €`
          : f.importeMin !== ''
            ? `Importe desde ${Number(f.importeMin).toLocaleString('es-ES')} €`
            : `Importe hasta ${Number(f.importeMax).toLocaleString('es-ES')} €`,
      quitar: () => setF((prev) => ({ ...prev, importeMin: '', importeMax: '' })),
    },
    nFechas > 0 && {
      k: 'fin',
      label:
        f.finDesde && f.finHasta
          ? `Fin de presentación: ${fechaCorta(f.finDesde)} a ${fechaCorta(f.finHasta)}`
          : f.finDesde
            ? `Fin de presentación desde ${fechaCorta(f.finDesde)}`
            : `Fin de presentación hasta ${fechaCorta(f.finHasta)}`,
      quitar: () => setF((prev) => ({ ...prev, finDesde: '', finHasta: '' })),
    },
  ].filter(Boolean);

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
        <button type="button" className="gt-lic-abrir-filtros" onClick={() => setFiltrosMovil((v) => !v)} aria-expanded={filtrosMovil}>
          <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
          Filtros{nFiltros ? ` (${nFiltros})` : ''}
        </button>
      </div>

      <div className="gt-lic-arriba">
        <label className="gt-lic-buscar">
          <i className="ti ti-search" aria-hidden="true" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar licitación, órgano o expediente"
            aria-label="Buscar licitaciones"
          />
        </label>
        <span className="gt-lic-exp" role="group" aria-label="Licitaciones o contratos menores">
          {EXPEDIENTES.map((o) => (
            <button key={o.v} type="button" className={expediente === o.v ? 'on' : undefined} aria-pressed={expediente === o.v} onClick={() => setExpediente(o.v)}>
              {o.label}
            </button>
          ))}
        </span>
      </div>

      <div className="gt-lic-cuerpo">
        <aside className={`gt-lic-filtros${filtrosMovil ? ' abierto' : ''}`} aria-label="Filtros">
          <div className="gt-lic-filtros-cab">
            <b>Filtros</b>
            {nFiltros > 0 && (
              <button type="button" className="gt-lic-limpiar" onClick={() => setF(FILTROS_VACIOS)}>
                Limpiar
              </button>
            )}
          </div>

          <Grupo titulo="Más comunes" n={nComunes} abierto={abiertos.has('comunes')} onToggle={() => alternarGrupo('comunes')}>
            <label className="gt-lic-check">
              <input type="checkbox" checked={f.publicadas24} onChange={(e) => cambiar('publicadas24', e.target.checked)} />
              Publicadas en las últimas 24 h
            </label>
            <label className="gt-lic-check">
              <input type="checkbox" checked={f.actualizadas24} onChange={(e) => cambiar('actualizadas24', e.target.checked)} />
              Actualizadas en las últimas 24 h
            </label>
            <label className="gt-lic-check">
              <input type="checkbox" checked={f.ocultarSeguidas} onChange={(e) => cambiar('ocultarSeguidas', e.target.checked)} />
              Ocultar las que ya sigo
            </label>
          </Grupo>

          <Grupo titulo="Sector (CPV)" n={f.sectores.length} abierto={abiertos.has('sector')} onToggle={() => alternarGrupo('sector')}>
            <Casillas opciones={SECTORES} elegidos={f.sectores} onChange={(v) => cambiar('sectores', v)} buscar />
          </Grupo>

          <Grupo titulo="Territorio" n={f.territorios.length} abierto={abiertos.has('territorio')} onToggle={() => alternarGrupo('territorio')}>
            <Casillas opciones={TERRITORIOS} elegidos={f.territorios} onChange={(v) => cambiar('territorios', v)} buscar />
          </Grupo>

          <Grupo titulo="Órgano de contratación" n={f.organo ? 1 : 0} abierto={abiertos.has('organo')} onToggle={() => alternarGrupo('organo')}>
            <input
              type="text"
              className="gt-lic-mini"
              placeholder="Ayuntamiento de…, Ministerio de…"
              aria-label="Órgano de contratación"
              value={f.organo}
              onChange={(e) => cambiar('organo', e.target.value)}
            />
          </Grupo>

          <Grupo titulo="Tipo de contrato" n={f.tipos.length} abierto={abiertos.has('tipo')} onToggle={() => alternarGrupo('tipo')}>
            <Casillas opciones={TIPOS} elegidos={f.tipos} onChange={(v) => cambiar('tipos', v)} />
          </Grupo>

          <Grupo titulo="Procedimiento" n={f.procedimientos.length} abierto={abiertos.has('proc')} onToggle={() => alternarGrupo('proc')}>
            <Casillas opciones={PROCEDIMIENTOS} elegidos={f.procedimientos} onChange={(v) => cambiar('procedimientos', v)} />
          </Grupo>

          <Grupo titulo="Importe" n={nImporte} abierto={abiertos.has('importe')} onToggle={() => alternarGrupo('importe')}>
            <div className="gt-lic-dos">
              <label>
                Desde (€)
                <input type="number" min="0" inputMode="numeric" className="gt-lic-mini" value={f.importeMin} onChange={(e) => cambiar('importeMin', e.target.value)} />
              </label>
              <label>
                Hasta (€)
                <input type="number" min="0" inputMode="numeric" className="gt-lic-mini" value={f.importeMax} onChange={(e) => cambiar('importeMax', e.target.value)} />
              </label>
            </div>
            <small style={{ display: 'block', color: GRIS, fontSize: 11.5, marginTop: 6 }}>Presupuesto sin IVA.</small>
          </Grupo>

          <Grupo titulo="Fechas" n={nFechas} abierto={abiertos.has('fechas')} onToggle={() => alternarGrupo('fechas')}>
            <small style={{ display: 'block', color: GRIS, fontSize: 12, marginBottom: 6 }}>Fin de presentación</small>
            <div className="gt-lic-fechas">
              <label>
                Desde
                <SelectorFecha value={f.finDesde} onChange={(v) => cambiar('finDesde', v || '')} atajos={[{ label: 'Hoy', iso: isoDia() }]} />
              </label>
              <label>
                Hasta
                <SelectorFecha
                  value={f.finHasta}
                  onChange={(v) => cambiar('finHasta', v || '')}
                  atajos={[
                    { label: 'En 7 días', iso: isoDia(7) },
                    { label: 'En 15 días', iso: isoDia(15) },
                    { label: 'En 30 días', iso: isoDia(30) },
                  ]}
                />
              </label>
            </div>
          </Grupo>
        </aside>

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
              {activos.length > 0 && (
                <div className="gt-lic-activos" aria-label="Filtros aplicados">
                  {activos.map((a) => (
                    <span key={a.k} className="gt-lic-activo">
                      {a.label}
                      <button type="button" onClick={a.quitar} aria-label={`Quitar ${a.label}`} title="Quitar">
                        <i className="ti ti-x" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {activos.length > 1 && (
                    <button type="button" className="gt-lic-limpiar" onClick={() => setF(FILTROS_VACIOS)}>
                      Quitar todos
                    </button>
                  )}
                </div>
              )}

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

              {filas.length > 0 && total != null && <Paginacion pag={pag} />}
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
