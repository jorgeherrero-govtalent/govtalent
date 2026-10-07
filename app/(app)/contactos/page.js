'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import TextoCreciente, { enviarConIntro } from '@/components/TextoCreciente';
import Paginacion, { usePaginacion } from '@/components/Paginacion';
import { BANDAS, TIPOS_INSTITUCION, FILTROS_VACIOS } from '@/lib/contactosFiltros';

/**
 * Contactos (07-10-2026): el buscador del Directorio.
 *
 * Una caja en lenguaje natural, como el Asistente. La IA convierte la
 * frase en filtros (sin ver datos de personas) y la tabla sale de
 * directorio_pro (sql/75). Los filtros se pueden editar a mano y la
 * búsqueda se repite al momento. Buscar es gratis; los créditos son para
 * enriquecer contactos (fase 3) y se compran aquí mismo.
 *
 * Maquetas aprobadas: canvas «Buscador de contactos — maquetas».
 */

const MORADO = '#6d5aef';
const VERDE = '#1d6f5c';
const BORDE = '#e5e4de';
const GRIS = '#6b6b70';

const IDEAS = [
  'Jefes de gabinete de comisarios con cartera de energía',
  'Subsecretarios de los ministerios económicos',
  'Asesores de los grupos parlamentarios del Congreso',
  'Directores de comunicación de los principales periódicos',
];

const TIPO_LABEL = {
  ejecutivo: 'Gobierno y administración',
  legislativo: 'Parlamentos',
  autonómico: 'Comunidades autónomas',
  local: 'Administración local',
  institucional: 'Altas instituciones',
  'sector público': 'Sector público',
  medios: 'Medios',
  partidos: 'Partidos',
  'agentes sociales': 'Sindicatos y patronales',
  'tercer sector': 'Tercer sector',
  internacional: 'Organismos internacionales',
};

function limpiarEmail(v) {
  if (!v) return null;
  return String(v).split(',')[0].replace(/mailto:/gi, '').trim() || null;
}

function fecha(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES');
}

function miles(n) {
  return Number(n || 0).toLocaleString('es-ES');
}

// ---------------------------------------------------------------------------

function TarjetaCreditos({ saldo, onComprar }) {
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

function ModalComprar({ packs, onClose }) {
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
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-labelledby="gt-comprar-tit">
        <div className="modal-head">
          <h2 id="gt-comprar-tit">Comprar créditos</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Cerrar" style={{ border: 'none', background: 'transparent' }}>
            <i className="ti ti-x"></i>
          </button>
        </div>
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
              <button
                type="button"
                className="btn-ai"
                disabled={enCurso !== null}
                onClick={() => comprar(p.creditos)}
                style={{ marginTop: 8, padding: '7px 10px', fontSize: 12.5 }}
              >
                {enCurso === p.creditos ? 'Abriendo…' : 'Comprar'}
              </button>
            </div>
          ))}
        </div>
        {error && <p style={{ fontSize: 12.5, color: '#444', marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filtros editables

function Chips({ titulo, valores, onQuitar, onAnadir, placeholder }) {
  const [nuevo, setNuevo] = useState('');
  return (
    <div className="gt-ct-flt">
      <span className="gt-ct-flt-t">{titulo}</span>
      {valores.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {valores.map((v) => (
            <span key={v} className="gt-ct-chip">
              {v}
              <button type="button" aria-label={`Quitar ${v}`} onClick={() => onQuitar(v)}>
                <i className="ti ti-x" aria-hidden="true"></i>
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = nuevo.trim();
          if (t) onAnadir(t);
          setNuevo('');
        }}
      >
        <input
          className="gt-ct-in"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder={placeholder}
          aria-label={`Añadir ${titulo.toLowerCase()}`}
        />
      </form>
    </div>
  );
}

function PanelFiltros({ filtros, setFiltros, resumen }) {
  const lista = (clave) => ({
    valores: filtros[clave],
    onQuitar: (v) => setFiltros({ ...filtros, [clave]: filtros[clave].filter((x) => x !== v) }),
    onAnadir: (v) => !filtros[clave].includes(v) && setFiltros({ ...filtros, [clave]: [...filtros[clave], v] }),
  });
  const alternar = (clave, v) =>
    setFiltros({ ...filtros, [clave]: filtros[clave].includes(v) ? filtros[clave].filter((x) => x !== v) : [...filtros[clave], v] });

  return (
    <aside className="gt-ct-aside" aria-label="Filtros">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: MORADO }}>
        <i className="ti ti-sparkles" aria-hidden="true"></i>
        Filtros generados por IA
      </div>
      {resumen && <p style={{ margin: 0, fontSize: 12.5, color: GRIS, lineHeight: 1.5 }}>{resumen}</p>}

      <Chips titulo="Cargo" placeholder="Añadir cargo y pulsar Intro" {...lista('cargos')} />
      <Chips titulo="Institución" placeholder="Añadir institución" {...lista('instituciones')} />
      <Chips titulo="Unidad" placeholder="Añadir unidad" {...lista('unidades')} />
      <Chips titulo="Palabras clave" placeholder="Tienen que aparecer todas" {...lista('terminos')} />

      <div className="gt-ct-flt">
        <span className="gt-ct-flt-t">Ámbito</span>
        <select
          className="gt-ct-in"
          value={filtros.jurisdiccion || ''}
          onChange={(e) => setFiltros({ ...filtros, jurisdiccion: e.target.value || null })}
          aria-label="Ámbito"
        >
          <option value="">España y UE</option>
          <option value="España">España</option>
          <option value="UE">Unión Europea</option>
        </select>
      </div>

      <details className="gt-ct-flt" open={filtros.tipos.length > 0}>
        <summary className="gt-ct-flt-t">Tipo de institución{filtros.tipos.length ? ` · ${filtros.tipos.length}` : ''}</summary>
        {TIPOS_INSTITUCION.map((t) => (
          <label key={t} className="gt-ct-chk">
            <input type="checkbox" checked={filtros.tipos.includes(t)} onChange={() => alternar('tipos', t)} />
            {TIPO_LABEL[t] || t}
          </label>
        ))}
      </details>

      <details className="gt-ct-flt" open={filtros.bandas.length > 0}>
        <summary className="gt-ct-flt-t">Nivel del cargo{filtros.bandas.length ? ` · ${filtros.bandas.length}` : ''}</summary>
        {Object.entries(BANDAS).map(([k, v]) => (
          <label key={k} className="gt-ct-chk">
            <input type="checkbox" checked={filtros.bandas.includes(k)} onChange={() => alternar('bandas', k)} />
            {v}
          </label>
        ))}
      </details>

      <div className="gt-ct-flt">
        <label className="gt-ct-chk">
          <input
            type="checkbox"
            checked={filtros.solo_titulares}
            onChange={(e) => setFiltros({ ...filtros, solo_titulares: e.target.checked })}
          />
          Solo titulares
        </label>
        <label className="gt-ct-chk">
          <input
            type="checkbox"
            checked={filtros.con_contacto}
            onChange={(e) => setFiltros({ ...filtros, con_contacto: e.target.checked })}
          />
          Con correo o teléfono
        </label>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function CeldaContacto({ f }) {
  const email = limpiarEmail(f.email);
  const emailUnidad = limpiarEmail(f.email_unidad);
  if (!email && !emailUnidad && !f.telefono) {
    return <span style={{ fontSize: 12, color: GRIS }}>Sin contacto publicado</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {email && (
        <span className="gt-ct-cto">
          <a href={`mailto:${email}`}>{email}</a>
          <span className="gt-ct-tipo">Directo</span>
        </span>
      )}
      {emailUnidad && emailUnidad !== email && (
        <span className="gt-ct-cto">
          <a href={`mailto:${emailUnidad}`}>{emailUnidad}</a>
          <span className="gt-ct-tipo">Unidad</span>
        </span>
      )}
      {f.telefono && <span style={{ fontSize: 12, color: '#444' }}>{f.telefono}</span>}
    </div>
  );
}

function ContactosPagina() {
  const params = useSearchParams();
  const cajaRef = useRef(null);
  const [acceso, setAcceso] = useState(null); // null cargando · true · false
  const [saldo, setSaldo] = useState(null);
  const [packs, setPacks] = useState([]);
  const [modalComprar, setModalComprar] = useState(false);
  const [avisoCompra, setAvisoCompra] = useState(params.get('compra') === 'ok');

  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState(''); // la última enviada
  const [filtros, setFiltros] = useState(null); // null = portada
  const [resumen, setResumen] = useState('');
  const [aviso, setAviso] = useState('');
  const [interpretando, setInterpretando] = useState(false);

  const [total, setTotal] = useState(0);
  const [filas, setFilas] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState(() => new Map());

  const [exportando, setExportando] = useState(null); // { filas } | null
  const [cuota, setCuota] = useState(null);
  const [exportError, setExportError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const claveFiltros = useMemo(() => JSON.stringify(filtros), [filtros]);
  const pag = usePaginacion(total, [claveFiltros]);

  async function cargarSaldo() {
    try {
      const res = await fetch('/api/creditos', { cache: 'no-store' });
      if (!res.ok) {
        setAcceso(false);
        return;
      }
      const json = await res.json();
      setAcceso(json.directorio === true);
      setSaldo(json.saldo || null);
      setPacks(json.packs || []);
    } catch {
      setAcceso(false);
    }
  }

  useEffect(() => {
    cargarSaldo();
    // Tras volver de Stripe el webhook puede tardar unos segundos.
    if (params.get('compra') === 'ok') {
      const t1 = setTimeout(cargarSaldo, 3000);
      const t2 = setTimeout(cargarSaldo, 8000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada cambio de filtros o de página repite la búsqueda en el servidor.
  useEffect(() => {
    if (!filtros) return;
    let vivo = true;
    setBuscando(true);
    setError('');
    (async () => {
      try {
        const res = await fetch('/api/contactos/buscar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filtros, desde: pag.desde, cuantos: pag.pageSize }),
        });
        const json = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) throw new Error(json.error || 'No se pudo hacer la búsqueda');
        setTotal(json.total || 0);
        setFilas(json.filas || []);
      } catch (e) {
        if (vivo) setError(e.message);
      } finally {
        if (vivo) setBuscando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [claveFiltros, pag.desde, pag.pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(t = texto) {
    const q = String(t || '').trim();
    if (!q) {
      cajaRef.current?.focus();
      return;
    }
    setInterpretando(true);
    setAviso('');
    setError('');
    setConsulta(q);
    setTexto(q);
    setSeleccion(new Map());
    try {
      const res = await fetch('/api/contactos/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No se pudo interpretar la búsqueda');
      setFiltros({ ...FILTROS_VACIOS, ...json.filtros });
      setResumen(json.resumen || '');
      if (json.aviso) setAviso(json.aviso);
    } catch (e) {
      setError(e.message);
    }
    setInterpretando(false);
  }

  function volverAPortada() {
    setFiltros(null);
    setFilas([]);
    setTotal(0);
    setResumen('');
    setAviso('');
    setSeleccion(new Map());
  }

  const todasMarcadas = filas.length > 0 && filas.every((f) => seleccion.has(f.id));
  function marcar(f) {
    setSeleccion((prev) => {
      const n = new Map(prev);
      if (n.has(f.id)) n.delete(f.id);
      else n.set(f.id, f);
      return n;
    });
  }
  function marcarPagina() {
    setSeleccion((prev) => {
      const n = new Map(prev);
      if (todasMarcadas) filas.forEach((f) => n.delete(f.id));
      else filas.forEach((f) => n.set(f.id, f));
      return n;
    });
  }

  // --- Exportar: el mismo guardián de cuota que la Base de datos ---------
  async function abrirExportacion(soloSeleccion) {
    setExportError('');
    setCuota(null);
    setExportando({ soloSeleccion });
    try {
      const res = await fetch('/api/instituciones/directorio/export');
      if (res.ok) setCuota(await res.json());
    } catch {}
  }

  async function confirmarExportacion() {
    setExportBusy(true);
    setExportError('');
    try {
      let filasExport = [...seleccion.values()];
      if (!exportando.soloSeleccion) {
        const res = await fetch('/api/contactos/buscar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filtros, desde: 0, cuantos: 2000 }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'No se pudo preparar la exportación');
        filasExport = json.filas || [];
      }
      const g = await fetch('/api/instituciones/directorio/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowCount: filasExport.length, filters: { contactos: consulta, ...filtros } }),
      });
      const gj = await g.json().catch(() => ({}));
      if (!g.ok) {
        setExportError(gj.error || 'No se pudo exportar.');
        if (gj.usedThisMonth != null) setCuota({ usedThisMonth: gj.usedThisMonth, limit: gj.limit });
        setExportBusy(false);
        return;
      }
      const ws = XLSX.utils.json_to_sheet(
        filasExport.map((f) => ({
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
          'Dirección postal': f.direccion_postal || '',
          Fuente: f.fuente || '',
          'Fecha de la fuente': fecha(f.fuente_fecha) || '',
        }))
      );
      ws['!cols'] = [{ wch: 30 }, { wch: 40 }, { wch: 38 }, { wch: 34 }, { wch: 9 }, { wch: 16 }, { wch: 8 }, { wch: 34 }, { wch: 34 }, { wch: 16 }, { wch: 40 }, { wch: 30 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Contactos');
      XLSX.writeFile(wb, `contactos-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setExportando(null);
    } catch (e) {
      setExportError(e.message || 'No se pudo exportar.');
    }
    setExportBusy(false);
  }

  // -------------------------------------------------------------------------

  const estilos = (
    <style>{`
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
      .gt-ct-sel { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: #faf9ff; border: 1px solid #e6e2fd; border-radius: 10px; padding: 8px 10px; }
      .gt-ct-aviso { font-size: 12.5px; color: #3a3a3d; background: #f7f6f2; border-radius: 8px; padding: 8px 12px; }
      @media (max-width: 900px) { .gt-ct-fuentes { grid-template-columns: repeat(2, minmax(0, 1fr)); } .gt-ct-aside { max-width: none; } }
      @media (max-width: 720px) { .gt-ct { padding: 18px 16px 96px; } .gt-ct-portada { margin-top: 20px; } .gt-ct-portada h2 { font-size: 21px; } }
    `}</style>
  );

  if (acceso === null) return <div className="spinner"></div>;

  if (acceso === false) {
    return (
      <div className="gt-ct">
        {estilos}
        <div className="gt-ct-cab">
          <div>
            <h1>Contactos</h1>
            <p>Encuentra a quién contactar en las instituciones de España y la UE, los medios y las organizaciones.</p>
          </div>
        </div>
        <div style={{ maxWidth: 560, margin: '48px auto 0', border: `1px solid ${BORDE}`, borderRadius: 16, padding: 24, background: '#fff', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            <i className="ti ti-lock" style={{ color: MORADO, marginRight: 6 }} aria-hidden="true"></i>
            Disponible con el Directorio
          </span>
          <p style={{ margin: 0, fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>
            Describe a quién buscas y GovTalent lo encuentra entre más de dieciocho mil cargos y contactos, con su correo, su
            teléfono y la fuente de cada dato. Incluye 50 créditos al mes para enriquecer contactos.
          </p>
          <Link href="/precios" className="btn-ai" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
            Ver planes
          </Link>
        </div>
      </div>
    );
  }

  const cabecera = (
    <div className="gt-ct-cab">
      <div>
        <h1>Contactos</h1>
        <p>Busca en el directorio de GovTalent y en las fuentes oficiales cargadas. Buscar no consume créditos.</p>
      </div>
      <TarjetaCreditos saldo={saldo} onComprar={() => setModalComprar(true)} />
    </div>
  );

  const avisos = (
    <>
      {avisoCompra && (
        <div className="gt-ct-aviso" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>Hemos recibido tu compra. Los créditos se suman en unos segundos.</span>
          <button type="button" onClick={() => setAvisoCompra(false)} aria-label="Cerrar aviso" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: GRIS }}>
            <i className="ti ti-x"></i>
          </button>
        </div>
      )}
      {modalComprar && <ModalComprar packs={packs} onClose={() => setModalComprar(false)} />}
    </>
  );

  // --- Portada --------------------------------------------------------------
  if (!filtros) {
    const listo = texto.trim().length > 0;
    return (
      <div className="gt-ct">
        {estilos}
        {cabecera}
        {avisos}
        <section className="gt-ct-portada">
          <h2>¿A quién necesitas contactar?</h2>
          <p>Describe a quién buscas. La IA lo convierte en filtros que puedes ajustar.</p>
          <form
            className="gt-ct-caja"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <label className="gt-ct-entrada">
              <i className="ti ti-sparkles" aria-hidden="true"></i>
              <TextoCreciente
                id="gt-ct-caja"
                ref={cajaRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={enviarConIntro(() => enviar())}
                placeholder="Subdirectores generales del Ministerio de Industria con correo"
                aria-label="Describe a quién buscas"
                rows={2}
                maxAltura={200}
              />
            </label>
            <div className="gt-ct-pie">
              <small>{interpretando ? 'Preparando los filtros…' : error || ' '}</small>
              <button type="submit" className={`gt-ct-enviar${listo ? ' listo' : ''}`} aria-label="Buscar" title="Buscar" disabled={interpretando}>
                <i className={`ti ${interpretando ? 'ti-loader-2' : 'ti-arrow-up'}`} aria-hidden="true"></i>
              </button>
            </div>
          </form>
          <div className="gt-ct-ideas">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                className="gt-ct-idea"
                onClick={() => {
                  setTexto(idea);
                  enviar(idea);
                }}
              >
                <i className="ti ti-sparkles" aria-hidden="true"></i>
                {idea}
              </button>
            ))}
          </div>
        </section>

        <section style={{ maxWidth: 1040, margin: '8px auto 0' }}>
          <div className="gt-ct-fuentes">
            <div className="gt-ct-fuente">
              <b>Instituciones de España</b>
              <span>Gobierno, AGE y organismos, Congreso, comunidades autónomas y ayuntamientos</span>
            </div>
            <div className="gt-ct-fuente">
              <b>Unión Europea</b>
              <span>Comisión Europea y Parlamento Europeo</span>
            </div>
            <div className="gt-ct-fuente">
              <b>Organizaciones y medios</b>
              <span>Agenda de la Comunicación: medios, partidos, sindicatos, patronales y más</span>
            </div>
            <div className="gt-ct-fuente ia">
              <b>Enriquecer con IA</b>
              <span>Próximamente: si falta el contacto, se busca en fuentes oficiales. 1 crédito por persona, solo si se encuentra.</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // --- Resultados -----------------------------------------------------------
  return (
    <div className="gt-ct">
      {estilos}
      {cabecera}
      {avisos}

      <div className="gt-ct-consulta">
        <button type="button" className="btn-g" onClick={volverAPortada} aria-label="Nueva búsqueda" title="Nueva búsqueda">
          <i className="ti ti-arrow-left" aria-hidden="true"></i>
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
        >
          <i className="ti ti-sparkles" style={{ color: MORADO, fontSize: 17 }} aria-hidden="true"></i>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Búsqueda"
            placeholder="Describe a quién buscas"
          />
          <button type="submit" className="btn-ai" style={{ padding: '7px 12px' }} disabled={interpretando}>
            {interpretando ? 'Preparando…' : 'Buscar'}
          </button>
        </form>
        <button type="button" className="btn-g" onClick={() => abrirExportacion(false)} disabled={total === 0}>
          Exportar
        </button>
      </div>

      {aviso && <div className="gt-ct-aviso" style={{ marginBottom: 12 }}>{aviso}</div>}

      <div className="gt-ct-res">
        <PanelFiltros filtros={filtros} setFiltros={setFiltros} resumen={resumen} />

        <section className="gt-ct-main" aria-live="polite">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
            <span>
              <strong>{miles(total)} {total === 1 ? 'persona' : 'personas'}</strong>
              {buscando && <span style={{ color: GRIS }}> · buscando…</span>}
            </span>
            <span style={{ fontSize: 12, color: GRIS }}>Buscar no consume créditos</span>
          </div>

          {seleccion.size > 0 && (
            <div className="gt-ct-sel">
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {seleccion.size} {seleccion.size === 1 ? 'seleccionada' : 'seleccionadas'}
              </span>
              <span style={{ flexGrow: 1 }}></span>
              <button type="button" className="btn-g" onClick={() => setSeleccion(new Map())}>
                Quitar selección
              </button>
              <button type="button" className="btn-p" onClick={() => abrirExportacion(true)}>
                Exportar selección
              </button>
            </div>
          )}

          {error && <div className="gt-ct-aviso">{error}</div>}

          {!buscando && !error && total === 0 ? (
            <div className="gt-ct-aviso" style={{ padding: '18px 16px' }}>
              No hay nadie con estos filtros. Prueba a quitar alguno o a describir la búsqueda de otra forma.
            </div>
          ) : (
            <div className="gt-ct-tabla">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>
                      <input type="checkbox" checked={todasMarcadas} onChange={marcarPagina} aria-label="Seleccionar esta página" />
                    </th>
                    <th>Nombre</th>
                    <th>Cargo</th>
                    <th>Institución</th>
                    <th>Contacto</th>
                    <th>Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <input type="checkbox" checked={seleccion.has(f.id)} onChange={() => marcar(f)} aria-label={`Seleccionar a ${f.nombre}`} />
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        {f.nombre}
                        {f.es_titular && <span className="gt-ct-tit">Titular</span>}
                      </td>
                      <td style={{ color: '#3a3a3d' }}>{f.cargo}</td>
                      <td>
                        <div>{f.institucion}</div>
                        {f.unidad && f.unidad !== f.institucion && <div style={{ fontSize: 12, color: GRIS, marginTop: 2 }}>{f.unidad}</div>}
                      </td>
                      <td>
                        <CeldaContacto f={f} />
                      </td>
                      <td style={{ fontSize: 12, color: GRIS }}>
                        <div>{f.fuente || '—'}</div>
                        {fecha(f.fuente_fecha) && <div>{fecha(f.fuente_fecha)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Paginacion pag={pag} dentro />
            </div>
          )}
        </section>
      </div>

      {exportando && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && !exportBusy && setExportando(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }} role="dialog" aria-modal="true" aria-labelledby="gt-exp-tit">
            <div className="modal-head">
              <h2 id="gt-exp-tit">Exportar a Excel</h2>
              <button type="button" className="modal-x" onClick={() => !exportBusy && setExportando(null)} aria-label="Cerrar" style={{ border: 'none', background: 'transparent' }}>
                <i className="ti ti-x"></i>
              </button>
            </div>
            <p style={{ fontSize: 13, color: '#666', margin: '4px 0 14px', lineHeight: 1.6 }}>
              {exportando.soloSeleccion
                ? `Vas a exportar ${miles(seleccion.size)} ${seleccion.size === 1 ? 'persona' : 'personas'}.`
                : `Vas a exportar ${miles(Math.min(total, 2000))} ${total === 1 ? 'persona' : 'personas'}${total > 2000 ? ' (las 2.000 primeras)' : ''}.`}
              {cuota && ` Llevas ${miles(cuota.usedThisMonth)} de ${miles(cuota.limit)} filas exportadas este mes.`}
            </p>
            {exportError && <p style={{ fontSize: 12.5, color: '#444', margin: '0 0 12px' }}>{exportError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-g" onClick={() => setExportando(null)} disabled={exportBusy}>
                Cancelar
              </button>
              <button type="button" className="btn-p" onClick={confirmarExportacion} disabled={exportBusy}>
                {exportBusy ? 'Exportando…' : 'Exportar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContactosPage() {
  return (
    <Suspense fallback={<div className="spinner"></div>}>
      <ContactosPagina />
    </Suspense>
  );
}
