'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import TextoCreciente, { enviarConIntro } from '@/components/TextoCreciente';
import Paginacion, { usePaginacion } from '@/components/Paginacion';
import { BANDAS, TIPOS_INSTITUCION, FILTROS_VACIOS } from '@/lib/contactosFiltros';
import {
  ESTILOS_CONTACTOS,
  MORADO,
  BORDE,
  GRIS,
  miles,
  fecha,
  TarjetaCreditos,
  ModalComprar,
  Modal,
  CeldaContacto,
  useEnriquecer,
  enriquecible,
  ModalEnriquecerVarios,
  ModalGuardarLista,
  exportarExcel,
  registrarExportacion,
} from '@/components/ContactosUI';

/**
 * Contactos (Buscar y enriquecer, 07-10-2026).
 *
 * Una caja en lenguaje natural, como el Asistente. La IA convierte la
 * frase en filtros (sin ver datos de personas) y la tabla sale de
 * directorio_pro (sql/75). Los filtros se editan a mano y la búsqueda se
 * repite al momento. Buscar es gratis.
 *
 * «Enriquecer» (sql/76) busca con IA el contacto que falta en fuentes
 * oficiales: 1 crédito por persona, solo si encuentra algo; lo que ya
 * enriqueció otro usuario sale gratis. Las búsquedas y selecciones se
 * guardan en Listas, que avisan de los cambios.
 *
 * Maquetas aprobadas: canvas «Buscador de contactos — maquetas».
 */

// Búsquedas recomendadas: con filtros fijos (no pasan por la IA), así que
// siempre dan el mismo resultado. Comprobadas contra los datos el
// 07-10-2026; si cambia una fuente, revisar que sigan devolviendo gente.
const IDEAS = [
  {
    texto: 'Asesores de los grupos parlamentarios del Congreso',
    resumen: 'Personal de los grupos parlamentarios del Congreso de los Diputados.',
    filtros: { jurisdiccion: 'España', tipos: ['legislativo'], unidades: ['grupo parlamentario'] },
  },
  {
    texto: 'Eurodiputados españoles',
    resumen: 'Diputados al Parlamento Europeo elegidos en España.',
    filtros: { jurisdiccion: 'UE', tipos: ['legislativo'], paises: ['ES'] },
  },
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
        <input className="gt-ct-in" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder={placeholder} aria-label={`Añadir ${titulo.toLowerCase()}`} />
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
      <Chips titulo="País" placeholder="Código de dos letras, p. ej. ES" {...lista('paises')} />

      <div className="gt-ct-flt">
        <span className="gt-ct-flt-t">Ámbito</span>
        <select className="gt-ct-in" value={filtros.jurisdiccion || ''} onChange={(e) => setFiltros({ ...filtros, jurisdiccion: e.target.value || null })} aria-label="Ámbito">
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
          <input type="checkbox" checked={filtros.solo_titulares} onChange={(e) => setFiltros({ ...filtros, solo_titulares: e.target.checked })} />
          Solo titulares
        </label>
        <label className="gt-ct-chk">
          <input type="checkbox" checked={filtros.con_contacto} onChange={(e) => setFiltros({ ...filtros, con_contacto: e.target.checked })} />
          Con correo o teléfono
        </label>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function ContactosPagina() {
  const params = useSearchParams();
  const router = useRouter();
  const cajaRef = useRef(null);
  const [acceso, setAcceso] = useState(null); // null cargando · true · false
  const [saldo, setSaldo] = useState(null);
  const [packs, setPacks] = useState([]);
  const [modalComprar, setModalComprar] = useState(false);
  const [avisoCompra, setAvisoCompra] = useState(params.get('compra') === 'ok');

  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [filtros, setFiltros] = useState(null); // null = portada
  const [resumen, setResumen] = useState('');
  const [aviso, setAviso] = useState('');
  const [interpretando, setInterpretando] = useState(false);

  const [total, setTotal] = useState(0);
  const [filas, setFilas] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState(() => new Map());

  const [exportando, setExportando] = useState(null);
  const [cuota, setCuota] = useState(null);
  const [exportError, setExportError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const [confirmarEnr, setConfirmarEnr] = useState(null); // ids
  const [guardarLista, setGuardarLista] = useState(null); // 'busqueda' | 'seleccion'

  const { estado: enr, enMarcha, enriquecer, enriquecerVarios } = useEnriquecer({ onSaldo: setSaldo });

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

  // Una búsqueda recomendada: filtros fijos, sin pasar por la IA.
  function usarIdea(idea) {
    setTexto(idea.texto);
    setConsulta(idea.texto);
    setAviso('');
    setError('');
    setSeleccion(new Map());
    setResumen(idea.resumen);
    setFiltros({ ...FILTROS_VACIOS, ...idea.filtros });
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

  // Enriquecer: lo de esta página o lo seleccionado que no tenga correo directo.
  const enriqueciblesPagina = filas.filter((f) => enriquecible(f, enr)).map((f) => f.id);
  const enriqueciblesSeleccion = [...seleccion.values()].filter((f) => enriquecible(f, enr)).map((f) => f.id);

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
      await registrarExportacion(filasExport.length, { contactos: consulta, ...filtros });
      exportarExcel(filasExport, 'contactos', enr);
      setExportando(null);
    } catch (e) {
      setExportError(e.message || 'No se pudo exportar.');
      if (e.cuota) setCuota(e.cuota);
    }
    setExportBusy(false);
  }

  if (acceso === null) return <div className="spinner"></div>;

  const pestanas = (
    <nav className="gt-ct-tabs" aria-label="Buscar y enriquecer">
      <Link href="/contactos" className="on" aria-current="page">
        Buscador
      </Link>
      <Link href="/contactos/listas">Listas</Link>
    </nav>
  );

  if (acceso === false) {
    return (
      <div className="gt-ct">
        <style>{ESTILOS_CONTACTOS}</style>
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
            Describe a quién buscas y GovTalent lo encuentra entre más de dieciocho mil cargos y contactos, con su correo, su teléfono y
            la fuente de cada dato. Guarda listas que te avisan de los cambios. Incluye 50 créditos al mes para enriquecer contactos.
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

  const comunes = (
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
        <style>{ESTILOS_CONTACTOS}</style>
        {cabecera}
        {pestanas}
        {comunes}
        <section className="gt-ct-portada">
          <h2>Describe los contactos que estás buscando</h2>
          <p>La IA convierte tu descripción en filtros que puedes ajustar.</p>
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
                aria-label="Describe los contactos que estás buscando"
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
              <button key={idea.texto} type="button" className="gt-ct-idea" onClick={() => usarIdea(idea)}>
                <i className="ti ti-sparkles" aria-hidden="true"></i>
                {idea.texto}
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
              <span>Si falta el contacto, la IA lo busca en fuentes oficiales y cita de dónde sale. 1 crédito por persona, solo si lo encuentra.</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // --- Resultados -----------------------------------------------------------
  return (
    <div className="gt-ct">
      <style>{ESTILOS_CONTACTOS}</style>
      {cabecera}
      {pestanas}
      {comunes}

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
          <input value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Búsqueda" placeholder="Describe a quién buscas" />
          <button type="submit" className="btn-ai" style={{ padding: '7px 12px' }} disabled={interpretando}>
            {interpretando ? 'Preparando…' : 'Buscar'}
          </button>
        </form>
        <button type="button" className="btn-g" onClick={() => abrirExportacion(false)} disabled={total === 0}>
          Exportar
        </button>
        <button type="button" className="btn-ai" onClick={() => setGuardarLista('busqueda')} disabled={total === 0}>
          Guardar como lista
        </button>
      </div>

      {aviso && <div className="gt-ct-aviso" style={{ marginBottom: 12 }}>{aviso}</div>}

      <div className="gt-ct-res">
        <PanelFiltros filtros={filtros} setFiltros={setFiltros} resumen={resumen} />

        <section className="gt-ct-main" aria-live="polite">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
            <span>
              <strong>
                {miles(total)} {total === 1 ? 'persona' : 'personas'}
              </strong>
              {buscando && <span style={{ color: GRIS }}> · buscando…</span>}
              {enMarcha > 0 && <span style={{ color: '#5443d6' }}> · enriqueciendo {miles(enMarcha)}…</span>}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: GRIS }}>Buscar no consume créditos</span>
              {enriqueciblesPagina.length > 0 && (
                <button type="button" className="btn-ai-o" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setConfirmarEnr(enriqueciblesPagina)}>
                  Enriquecer los de esta página · máx. {miles(enriqueciblesPagina.length)} créditos
                </button>
              )}
            </span>
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
              <button type="button" className="btn-g" onClick={() => abrirExportacion(true)}>
                Exportar
              </button>
              <button type="button" className="btn-g" onClick={() => setGuardarLista('seleccion')}>
                Añadir a lista
              </button>
              {enriqueciblesSeleccion.length > 0 && (
                <button type="button" className="btn-ai" onClick={() => setConfirmarEnr(enriqueciblesSeleccion)}>
                  Enriquecer · hasta {miles(enriqueciblesSeleccion.length)} créditos
                </button>
              )}
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
                        <CeldaContacto f={f} estado={enr} onEnriquecer={(id) => (saldo?.disponibles >= 1 ? enriquecer(id) : setModalComprar(true))} />
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

      {confirmarEnr && (
        <ModalEnriquecerVarios
          cuantos={confirmarEnr.length}
          saldo={saldo}
          onClose={() => setConfirmarEnr(null)}
          onConfirmar={() => {
            const ids = confirmarEnr;
            setConfirmarEnr(null);
            enriquecerVarios(ids);
          }}
        />
      )}

      {guardarLista && (
        <ModalGuardarLista
          modo={guardarLista}
          cuantos={guardarLista === 'busqueda' ? total : seleccion.size}
          filtros={filtros}
          consulta={consulta}
          ids={[...seleccion.keys()]}
          onClose={() => setGuardarLista(null)}
          onHecho={(id) => router.push(`/contactos/listas/${id}`)}
        />
      )}

      {exportando && (
        <Modal titulo="Exportar a Excel" onClose={() => setExportando(null)} bloqueado={exportBusy}>
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
            <button type="button" className="btn-ai" onClick={confirmarExportacion} disabled={exportBusy}>
              {exportBusy ? 'Exportando…' : 'Exportar'}
            </button>
          </div>
        </Modal>
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
