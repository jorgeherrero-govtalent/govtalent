'use client';

import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { BANDAS } from '@/lib/contactosFiltros';

/**
 * Piezas comunes de Buscar y enriquecer (Contactos y Listas, sql/75-76):
 * estilos, tarjeta y compra de créditos, celda de contacto con
 * «Enriquecer», el hook que lanza los enriquecimientos, el modal de
 * guardar en lista y la exportación a Excel.
 */

export const MORADO = '#6d5aef';
export const VERDE = '#1d6f5c';
export const BORDE = '#e5e4de';
export const GRIS = '#6b6b70';

export const TIPO_CONTACTO = {
  personal: 'Personal',
  cargo: 'Despacho del cargo',
  unidad: 'Unidad',
  generico: 'Institución',
};

export function limpiarEmail(v) {
  if (!v) return null;
  return String(v).split(',')[0].replace(/mailto:/gi, '').trim() || null;
}

export function fecha(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES');
}

export function miles(n) {
  return Number(n || 0).toLocaleString('es-ES');
}

export function dominio(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'fuente';
  }
}

export const ESTILOS_CONTACTOS = `
  .gt-ct { padding: 24px 28px 48px; max-width: 1320px; margin: 0 auto; }
  .gt-ct-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
  .gt-ct-cab h1 { font-size: 19px; font-weight: 700; margin: 0; }
  .gt-ct-cab p { font-size: 12.5px; color: #888; margin: 4px 0 0; }
  .gt-ct-portada { max-width: 760px; margin: 48px auto 0; display: flex; flex-direction: column; gap: 18px; align-items: stretch; }
  .gt-ct-portada h2 { margin: 0; text-align: center; font-size: 26px; font-weight: 600; letter-spacing: -.4px; color: #1a1a18; }
  .gt-ct-portada > p { margin: 0; text-align: center; font-size: 14px; color: ${GRIS}; }
  .gt-ct-caja { background: #fff; border: 1px solid ${BORDE}; border-radius: 20px; box-shadow: 0 1px 2px rgba(26,26,24,.04), 0 10px 30px rgba(26,26,24,.06); padding: 18px 18px 14px; display: flex; flex-direction: column; gap: 12px; }
  .gt-ct-caja:focus-within { border-color: #d8d3f5; }
  .gt-ct-entrada { display: flex; gap: 12px; align-items: flex-start; }
  .gt-ct-entrada > i { font-size: 20px; color: ${MORADO}; margin-top: 1px; flex-shrink: 0; }
  .gt-ct-entrada textarea { flex: 1; min-width: 0; min-height: 56px; border: none; outline: none; background: transparent; font-family: inherit; font-size: 15px; line-height: 1.55; color: #1a1a18; padding: 0; }
  .gt-ct-entrada textarea::placeholder { color: #a8a49c; }
  .gt-ct-pie { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .gt-ct-pie small { font-size: 12px; color: #a8a49c; }
  .gt-ct-enviar { width: 38px; height: 38px; border-radius: 50%; border: 1px solid ${BORDE}; background: #f7f6f2; color: #a8a49c; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
  .gt-ct-enviar.listo { background: ${MORADO}; border-color: ${MORADO}; color: #fff; }
  .gt-ct-enviar i { font-size: 18px; }
  .gt-ct-ideas { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .gt-ct-idea { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #e0dfd8; background: #fff; border-radius: 9px; padding: 8px 12px; font-family: inherit; font-size: 13px; color: #1a1a18; cursor: pointer; }
  .gt-ct-idea i { color: ${MORADO}; font-size: 15px; }
  .gt-ct-idea:hover { border-color: #d8d3f5; }
  .gt-ct-fuentes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 28px; }
  .gt-ct-fuente { border: 1px solid #ececef; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 6px; background: #fff; }
  .gt-ct-fuente b { font-size: 13.5px; font-weight: 600; }
  .gt-ct-fuente span { font-size: 12.5px; color: ${GRIS}; line-height: 1.45; }
  .gt-ct-fuente.ia { border-style: dashed; border-color: #cfc9f8; background: #faf9ff; }
  .gt-ct-fuente.ia b { color: #5443d6; }
  .gt-ct-res { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
  .gt-ct-aside { flex: 1 1 240px; max-width: 280px; display: flex; flex-direction: column; gap: 10px; }
  .gt-ct-main { flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .gt-ct-panel { flex: 1 1 300px; max-width: 380px; display: flex; flex-direction: column; border: 1px solid #e6e2fd; border-radius: 12px; background: #fff; }
  .gt-ct-flt { display: flex; flex-direction: column; gap: 7px; border: 1px solid #ececef; border-radius: 10px; padding: 10px 12px; background: #fff; }
  .gt-ct-flt-t { font-size: 11.5px; color: ${GRIS}; cursor: default; }
  details.gt-ct-flt summary { cursor: pointer; }
  .gt-ct-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; background: #f1effe; color: #3d2fb3; border-radius: 999px; padding: 3px 4px 3px 9px; }
  .gt-ct-chip button { border: none; background: transparent; color: #5443d6; cursor: pointer; padding: 0 2px; display: flex; }
  .gt-ct-chip button i { font-size: 12px; }
  .gt-ct-in { font-family: inherit; font-size: 12.5px; border: 1px solid #ececef; border-radius: 7px; padding: 6px 8px; width: 100%; box-sizing: border-box; background: #fff; }
  .gt-ct-chk { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #1a1a18; padding: 2px 0; }
  .gt-ct-consulta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  .gt-ct-consulta form { flex: 1 1 420px; display: flex; align-items: center; gap: 10px; border: 1px solid #dcd8fb; border-radius: 12px; padding: 6px 6px 6px 12px; background: #fff; }
  .gt-ct-consulta input { flex: 1; min-width: 0; border: none; outline: none; font-family: inherit; font-size: 14.5px; background: transparent; }
  .gt-ct-tabla { overflow-x: auto; border: 1px solid #ececef; border-radius: 12px; background: #fff; }
  .gt-ct-tabla table { width: 100%; border-collapse: collapse; min-width: 860px; }
  .gt-ct-tabla th { font-size: 12px; font-weight: 500; color: ${GRIS}; text-align: left; padding: 10px 12px; border-bottom: 1px solid #ececef; white-space: nowrap; }
  .gt-ct-tabla td { font-size: 13px; padding: 11px 12px; border-bottom: 1px solid #f3f3f4; vertical-align: top; }
  .gt-ct-tabla tr:last-child td { border-bottom: none; }
  .gt-ct-cto { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12.5px; }
  .gt-ct-cto a { color: #1a1a18; text-decoration: none; }
  .gt-ct-cto a:hover { text-decoration: underline; }
  .gt-ct-tipo { font-size: 10.5px; font-weight: 600; color: #3a3a3d; background: #f1f1f3; border-radius: 999px; padding: 1px 7px; }
  .gt-ct-tit { font-size: 10.5px; font-weight: 600; color: #5443d6; background: #efedfd; border-radius: 999px; padding: 1px 7px; margin-left: 6px; }
  .gt-ct-enr { font-family: inherit; font-size: 12px; font-weight: 600; color: #5443d6; background: #fff; border: 1px solid #cfc9f8; border-radius: 999px; padding: 3px 10px; cursor: pointer; align-self: flex-start; }
  .gt-ct-enr:hover { background: #faf9ff; }
  .gt-ct-enr:disabled { opacity: .6; cursor: not-allowed; }
  .gt-ct-fte { font-size: 11.5px; color: ${GRIS}; }
  .gt-ct-fte a { color: #5443d6; text-decoration: none; }
  .gt-ct-sel { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: #faf9ff; border: 1px solid #e6e2fd; border-radius: 10px; padding: 8px 10px; }
  .gt-ct-aviso { font-size: 12.5px; color: #3a3a3d; background: #f7f6f2; border-radius: 8px; padding: 8px 12px; }
  .gt-ct-cambio { padding: 13px 16px; border-bottom: 1px solid #f1f1f3; display: flex; flex-direction: column; gap: 6px; }
  .gt-ct-cambio:last-child { border-bottom: none; }
  .gt-ct-cambio-t { font-size: 10.5px; font-weight: 600; color: #5443d6; text-transform: uppercase; letter-spacing: .05em; }
  .gt-ct-cambio-t.gris { color: ${GRIS}; }
  .gt-ct-mini { font-family: inherit; font-size: 12px; border-radius: 7px; padding: 5px 10px; cursor: pointer; }
  .gt-ct-mini.p { background: ${MORADO}; border: 1px solid ${MORADO}; color: #fff; }
  .gt-ct-mini.s { background: #fff; border: 1px solid ${BORDE}; color: #3a3a3d; }
  .gt-ct-pill { display: inline-flex; font-size: 12px; background: #f4f4f5; border: 1px solid #ececef; border-radius: 8px; padding: 2px 8px; }
  .gt-ct-tabs { display: flex; gap: 22px; font-size: 14px; border-bottom: 1px solid #ececef; margin-bottom: 18px; }
  .gt-ct-tabs a { color: ${GRIS}; text-decoration: none; padding-bottom: 10px; }
  .gt-ct-tabs a.on { color: #1a1a18; font-weight: 600; border-bottom: 2px solid ${MORADO}; }
  @media (max-width: 900px) { .gt-ct-fuentes { grid-template-columns: repeat(2, minmax(0, 1fr)); } .gt-ct-aside, .gt-ct-panel { max-width: none; } }
  @media (max-width: 720px) { .gt-ct { padding: 18px 16px 96px; } .gt-ct-portada { margin-top: 20px; } .gt-ct-portada h2 { font-size: 21px; } }
`;

// ---------------------------------------------------------------------------
// Créditos

export function TarjetaCreditos({ saldo, onComprar }) {
  if (!saldo) return null;
  const pct = saldo.mensuales > 0 ? Math.round((saldo.mensuales_disponibles / saldo.mensuales) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${BORDE}`, borderRadius: 12, padding: '9px 12px', background: '#fff', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 170 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
          <span style={{ fontWeight: 600 }}>Créditos del mes</span>
          <span style={{ color: GRIS }}>
            {miles(saldo.mensuales_disponibles)} / {miles(saldo.mensuales)}
          </span>
        </div>
        <div style={{ height: 5, background: '#efedfd', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: 5, background: MORADO }}></div>
        </div>
        <span style={{ fontSize: 11.5, color: GRIS }}>
          {saldo.comprados > 0 ? `+ ${miles(saldo.comprados)} comprados · ` : ''}
          {saldo.compartida ? 'compartidos con tu equipo' : 'se renuevan el día 1'}
        </span>
      </div>
      <button type="button" className="btn-ai-o" onClick={onComprar} style={{ padding: '6px 12px', fontSize: 12.5 }}>
        Comprar créditos
      </button>
    </div>
  );
}

export function ModalComprar({ packs, onClose }) {
  const [enCurso, setEnCurso] = useState(null);
  const [error, setError] = useState('');

  async function comprar(creditos) {
    setEnCurso(creditos);
    setError('');
    try {
      const res = await fetch('/api/creditos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditos }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || 'No se pudo iniciar el pago');
      window.location.href = json.url;
    } catch (e) {
      setError(e.message);
      setEnCurso(null);
    }
  }

  return (
    <Modal titulo="Comprar créditos" onClose={onClose} ancho={520}>
      <p style={{ fontSize: 13, color: '#666', margin: '4px 0 16px', lineHeight: 1.6 }}>
        Un crédito enriquece una persona y solo se descuenta si encontramos un contacto publicado en fuentes oficiales. Los
        créditos comprados no caducan y se usan después de los del mes.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {(packs || []).map((p) => (
          <div key={p.creditos} style={{ border: `1px solid ${BORDE}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 600 }}>{miles(p.creditos)}</span>
            <span style={{ fontSize: 12, color: GRIS }}>créditos</span>
            <span style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{p.precio} €</span>
            <span style={{ fontSize: 11.5, color: GRIS }}>+ IVA</span>
            <button type="button" className="btn-ai" disabled={enCurso !== null} onClick={() => comprar(p.creditos)} style={{ marginTop: 8, padding: '7px 10px', fontSize: 12.5 }}>
              {enCurso === p.creditos ? 'Abriendo…' : 'Comprar'}
            </button>
          </div>
        ))}
      </div>
      {error && <p style={{ fontSize: 12.5, color: '#444', marginTop: 12 }}>{error}</p>}
    </Modal>
  );
}

export function Modal({ titulo, onClose, children, ancho = 440, bloqueado = false }) {
  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && !bloqueado && onClose()}>
      <div className="modal-box" style={{ maxWidth: ancho }} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-head">
          <h2>{titulo}</h2>
          <button type="button" className="modal-x" onClick={() => !bloqueado && onClose()} aria-label="Cerrar" style={{ border: 'none', background: 'transparent' }}>
            <i className="ti ti-x"></i>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enriquecer

/**
 * Estado de los enriquecimientos en curso y lanzador con concurrencia.
 * estado: Map id → { fase: 'buscando' | 'hecho' | 'error', resultado?, error? }
 */
export function useEnriquecer({ onSaldo }) {
  const [estado, setEstado] = useState(() => new Map());
  const [enMarcha, setEnMarcha] = useState(0);
  const parar = useRef(false);

  function poner(id, v) {
    setEstado((prev) => {
      const n = new Map(prev);
      n.set(id, v);
      return n;
    });
  }

  async function uno(id) {
    poner(id, { fase: 'buscando' });
    try {
      const res = await fetch('/api/contactos/enriquecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.saldo && onSaldo) onSaldo(json.saldo);
      if (!res.ok) {
        poner(id, { fase: 'error', error: json.error || 'No se pudo completar' });
        if (json.sinCreditos) parar.current = true;
        return;
      }
      poner(id, { fase: 'hecho', resultado: json.resultado, cobrado: json.cobrado });
    } catch {
      poner(id, { fase: 'error', error: 'No se pudo completar' });
    }
  }

  async function varios(ids, concurrencia = 3) {
    parar.current = false;
    const cola = [...ids];
    setEnMarcha((n) => n + cola.length);
    async function trabajador() {
      while (cola.length && !parar.current) {
        const id = cola.shift();
        await uno(id);
        setEnMarcha((n) => Math.max(0, n - 1));
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrencia, cola.length) }, trabajador));
    setEnMarcha(0);
  }

  return { estado, enMarcha, enriquecer: (id) => varios([id], 1), enriquecerVarios: varios };
}

/** El enriquecimiento visible de una fila: el recién hecho o el de la caché. */
export function enriquecimientoDe(f, estado) {
  const e = estado?.get(f.id);
  if (e?.fase === 'hecho') return e.resultado;
  return f.enriquecido || null;
}

/** ¿Tiene sentido ofrecer «Enriquecer» en esta fila? */
export function enriquecible(f, estado) {
  if (limpiarEmail(f.email)) return false;
  const e = enriquecimientoDe(f, estado);
  return !e;
}

export function CeldaContacto({ f, estado, onEnriquecer, puedeEnriquecer = true }) {
  const email = limpiarEmail(f.email);
  const emailUnidad = limpiarEmail(f.email_unidad);
  const enCurso = estado?.get(f.id);
  const enr = enriquecimientoDe(f, estado);
  const enrEmail = enr?.estado === 'encontrado' ? limpiarEmail(enr.email) : null;
  const nada = !email && !emailUnidad && !f.telefono;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {email && (
        <span className="gt-ct-cto">
          <a href={`mailto:${email}`}>{email}</a>
          <span className="gt-ct-tipo">Directo</span>
        </span>
      )}
      {enr?.estado === 'encontrado' && (enrEmail || enr.telefono) && enrEmail !== email && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="gt-ct-cto">
            {enrEmail ? <a href={`mailto:${enrEmail}`}>{enrEmail}</a> : <span>{enr.telefono}</span>}
            <span className="gt-ct-tipo" style={{ background: '#efedfd', color: '#3d2fb3' }}>
              {TIPO_CONTACTO[enr.tipo] || 'Contacto'}
            </span>
          </span>
          {enrEmail && enr.telefono && <span style={{ fontSize: 12, color: '#444' }}>{enr.telefono}</span>}
          {enr.fuente_url && (
            <span className="gt-ct-fte">
              Según{' '}
              <a href={enr.fuente_url} target="_blank" rel="noopener noreferrer">
                {dominio(enr.fuente_url)} ↗
              </a>
              {enr.verificado === false && ' · sin verificar'}
            </span>
          )}
        </span>
      )}
      {emailUnidad && emailUnidad !== email && emailUnidad !== enrEmail && (
        <span className="gt-ct-cto">
          <a href={`mailto:${emailUnidad}`}>{emailUnidad}</a>
          <span className="gt-ct-tipo">Unidad</span>
        </span>
      )}
      {f.telefono && <span style={{ fontSize: 12, color: '#444' }}>{f.telefono}</span>}
      {nada && !enr && !enCurso && <span style={{ fontSize: 12, color: GRIS }}>Sin contacto publicado</span>}

      {enCurso?.fase === 'buscando' && <span style={{ fontSize: 12, fontWeight: 600, color: '#5443d6' }}>Buscando en fuentes oficiales…</span>}
      {enCurso?.fase === 'error' && <span style={{ fontSize: 12, color: GRIS }}>{enCurso.error}</span>}
      {enr?.estado === 'no_encontrado' && <span style={{ fontSize: 12, color: GRIS }}>Sin contacto directo publicado · sin coste</span>}
      {puedeEnriquecer && onEnriquecer && enriquecible(f, estado) && enCurso?.fase !== 'buscando' && (
        <button type="button" className="gt-ct-enr" onClick={() => onEnriquecer(f.id)}>
          Enriquecer · 1 crédito
        </button>
      )}
    </div>
  );
}

export function ModalEnriquecerVarios({ cuantos, saldo, onConfirmar, onClose }) {
  const disponibles = saldo?.disponibles ?? 0;
  const llega = disponibles >= cuantos;
  return (
    <Modal titulo={`Enriquecer ${miles(cuantos)} ${cuantos === 1 ? 'contacto' : 'contactos'}`} onClose={onClose}>
      <p style={{ fontSize: 13, color: '#555', margin: '4px 0 12px', lineHeight: 1.6 }}>
        Buscamos su contacto en fuentes oficiales. Como máximo {miles(cuantos)} {cuantos === 1 ? 'crédito' : 'créditos'}: solo se
        cobran los que encontremos, y los que ya estén enriquecidos por otro usuario salen gratis. Tarda unos segundos por persona.
      </p>
      <p style={{ fontSize: 13, margin: '0 0 16px' }}>
        Te quedan <b>{miles(disponibles)}</b> créditos.
        {!llega && ' Se enriquecerá hasta donde lleguen.'}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn-g" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn-ai" onClick={onConfirmar} disabled={disponibles < 1}>
          Enriquecer
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Guardar en lista

/**
 * modo: 'busqueda' (toda la búsqueda, se recuerda para avisar de
 * incorporaciones) o 'seleccion' (las personas marcadas).
 */
export function ModalGuardarLista({ modo, cuantos, filtros, consulta, ids, onClose, onHecho }) {
  const [listas, setListas] = useState(null);
  const [destino, setDestino] = useState('nueva');
  const [nombre, setNombre] = useState(consulta ? consulta.slice(0, 80) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (modo !== 'seleccion') return;
    let vivo = true;
    fetch('/api/contactos/listas')
      .then((r) => r.json())
      .then((j) => vivo && setListas(j.listas || []))
      .catch(() => vivo && setListas([]));
    return () => {
      vivo = false;
    };
  }, [modo]);

  async function guardar() {
    setBusy(true);
    setError('');
    try {
      let res;
      if (destino === 'nueva') {
        res = await fetch('/api/contactos/listas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            modo === 'busqueda' ? { nombre, todos: true, filtros, consulta } : { nombre, ids, consulta }
          ),
        });
      } else {
        res = await fetch(`/api/contactos/listas/${destino}/miembros`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar');
      onHecho(destino === 'nueva' ? json.id : destino);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal titulo={modo === 'busqueda' ? 'Guardar como lista' : 'Añadir a una lista'} onClose={onClose} bloqueado={busy}>
      <p style={{ fontSize: 13, color: '#555', margin: '4px 0 14px', lineHeight: 1.6 }}>
        {modo === 'busqueda'
          ? `Se guardan las ${miles(Math.min(cuantos, 2000))} personas de esta búsqueda. La lista recuerda los filtros: si alguien nuevo los cumple, o alguien cambia de cargo o deja de figurar, te lo avisa.`
          : `${miles(cuantos)} ${cuantos === 1 ? 'persona' : 'personas'}. La lista te avisará si alguien cambia de cargo o deja de figurar en la fuente.`}
      </p>
      {modo === 'seleccion' && (
        <div className="gt-ct-flt" style={{ marginBottom: 12 }}>
          <label className="gt-ct-chk">
            <input type="radio" name="destino" checked={destino === 'nueva'} onChange={() => setDestino('nueva')} />
            Nueva lista
          </label>
          {listas === null && <span style={{ fontSize: 12, color: GRIS }}>Cargando tus listas…</span>}
          {(listas || []).map((l) => (
            <label key={l.id} className="gt-ct-chk">
              <input type="radio" name="destino" checked={destino === l.id} onChange={() => setDestino(l.id)} />
              {l.nombre} <span style={{ color: GRIS }}>· {miles(l.n_miembros)}</span>
            </label>
          ))}
        </div>
      )}
      {destino === 'nueva' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: GRIS, marginBottom: 14 }}>
          Nombre de la lista
          <input className="gt-ct-in" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoFocus style={{ fontSize: 13.5, padding: '8px 10px' }} />
        </label>
      )}
      {error && <p style={{ fontSize: 12.5, color: '#444', margin: '0 0 12px' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn-g" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="btn-p" onClick={guardar} disabled={busy || (destino === 'nueva' && !nombre.trim())}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Excel

export function exportarExcel(filas, nombreArchivo = 'contactos', estado = null) {
  const ws = XLSX.utils.json_to_sheet(
    filas.map((f) => {
      const enr = enriquecimientoDe(f, estado);
      const ok = enr?.estado === 'encontrado';
      return {
        Nombre: f.nombre || '',
        Cargo: f.cargo || '',
        Unidad: f.unidad || '',
        Institución: f.institucion || '',
        Ámbito: f.jurisdiccion || '',
        Nivel: BANDAS[f.banda] || '',
        Titular: f.es_titular ? 'Sí' : 'No',
        Email: limpiarEmail(f.email) || '',
        'Email de la unidad': limpiarEmail(f.email_unidad) || '',
        Teléfono: f.telefono || '',
        'Email enriquecido': ok ? limpiarEmail(enr.email) || '' : '',
        'Teléfono enriquecido': ok ? enr.telefono || '' : '',
        'Tipo de contacto enriquecido': ok ? TIPO_CONTACTO[enr.tipo] || '' : '',
        'Fuente del enriquecido': ok ? enr.fuente_url || '' : '',
        'Dirección postal': f.direccion_postal || '',
        Fuente: f.fuente || '',
        'Fecha de la fuente': fecha(f.fuente_fecha) || '',
      };
    })
  );
  ws['!cols'] = [30, 40, 38, 34, 9, 16, 8, 34, 34, 16, 34, 18, 20, 40, 40, 30, 12].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contactos');
  XLSX.writeFile(wb, `${nombreArchivo}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Guardián de cuota de exportación (el mismo que la Base de datos). */
export async function registrarExportacion(rowCount, filters) {
  const g = await fetch('/api/instituciones/directorio/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rowCount, filters }),
  });
  const gj = await g.json().catch(() => ({}));
  if (!g.ok) {
    const e = new Error(gj.error || 'No se pudo exportar.');
    e.cuota = gj.usedThisMonth != null ? { usedThisMonth: gj.usedThisMonth, limit: gj.limit } : null;
    throw e;
  }
  return gj;
}
