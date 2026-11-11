'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ESTILOS, Etiqueta, Trabajando } from '@/components/licitaciones/NuevaBusqueda';
import { BANDAS, FILTROS_VACIOS, TIPOS_INSTITUCION, TIPO_LABEL, filtrosVacios } from '@/lib/contactosFiltros';
import { CREDITOS_CORREO_FUERA, creditosTexto } from '@/lib/costesCreditos';

/**
 * «Nueva búsqueda» del Buscador de contactos (11-11-2026). Es el mismo
 * modal que el de Licitaciones (components/licitaciones/NuevaBusqueda.js):
 * mismas piezas, mismos estilos y los mismos efectos mientras trabaja la
 * IA. Se abre desde la Base de datos, con el botón «Nueva búsqueda».
 *
 * A la izquierda, las formas de buscar; a la derecha, la elegida. Todas
 * terminan igual: unos filtros que se aplican a la página con
 * onAplicar({ filtros, consulta, resumen, persona, aviso, origen }).
 * La excepción es «El correo de una persona concreta», que no filtra la
 * tabla: pide nombre y organización y llama a onCorreo({ nombre, institucion }).
 *
 * Sin el Directorio se ve igual; al usarlo, onUpsell.
 */

const MORADO = '#6d5aef';
const GRIS = '#8b8780';

const OPCIONES = [
  { v: 'ia', label: 'Describe a quién buscas', icono: 'ti-sparkles' },
  { v: 'tipo', label: 'Por tipo de institución', icono: 'ti-building-bank' },
  { v: 'nivel', label: 'Por nivel del cargo', icono: 'ti-hierarchy-2' },
  { v: 'correo', label: 'El correo de una persona concreta', icono: 'ti-mail-search' },
];

// Búsquedas recomendadas: con filtros fijos (no pasan por la IA), así que
// siempre dan el mismo resultado. Comprobadas contra los datos el
// 07-10-2026; si cambia una fuente, revisar que sigan devolviendo gente.
const IDEAS = [
  {
    texto: 'Embajadores y cuerpo diplomático en España',
    resumen: 'Personal de las embajadas extranjeras acreditadas en España (Lista del Cuerpo Diplomático).',
    filtros: { tipos: ['diplomático'] },
  },
  {
    texto: 'Eurodiputados españoles y sus asistentes',
    resumen: 'Los 60 eurodiputados elegidos en España y los asistentes de sus equipos.',
    filtros: { jurisdiccion: 'UE', tipos: ['legislativo'], paises: ['ES'] },
  },
];

const OPCIONES_TIPO = TIPOS_INSTITUCION.map((t) => ({ v: t, label: TIPO_LABEL[t] || t }));
const OPCIONES_NIVEL = Object.entries(BANDAS).map(([v, label]) => ({ v, label }));

function miles(n) {
  return Number(n || 0).toLocaleString('es-ES');
}

// Las etiquetas de unos filtros, cada una con cómo quitarla.
export function etiquetasContactos(f) {
  const out = [];
  const lista = (clave, texto) =>
    (f[clave] || []).forEach((v) =>
      out.push({ k: `${clave}:${v}`, label: texto(v), quitar: (x) => ({ ...x, [clave]: x[clave].filter((z) => z !== v) }) }),
    );
  if (f.nombre) out.push({ k: 'nombre', label: `Nombre: ${f.nombre}`, quitar: (x) => ({ ...x, nombre: '' }) });
  lista('cargos', (v) => `Cargo: ${v}`);
  lista('cargos_exactos', (v) => `Cargo: ${v}`);
  lista('instituciones', (v) => `Institución: ${v}`);
  lista('unidades', (v) => `Unidad: ${v}`);
  lista('grupos', (v) => `Grupo: ${v}`);
  lista('terminos', (v) => `Con «${v}»`);
  lista('tipos', (v) => TIPO_LABEL[v] || v);
  lista('bandas', (v) => BANDAS[v] || v);
  lista('paises', (v) => `País: ${v}`);
  if (f.jurisdiccion) out.push({ k: 'jur', label: f.jurisdiccion === 'UE' ? 'Unión Europea' : 'España', quitar: (x) => ({ ...x, jurisdiccion: null }) });
  if (f.provincia) out.push({ k: 'prov', label: `Territorio: ${f.provincia}`, quitar: (x) => ({ ...x, provincia: null }) });
  if (f.solo_titulares) out.push({ k: 'tit', label: 'Solo titulares', quitar: (x) => ({ ...x, solo_titulares: false }) });
  if (f.con_contacto) out.push({ k: 'cont', label: 'Con correo o teléfono', quitar: (x) => ({ ...x, con_contacto: false }) });
  if (f.correo) out.push({ k: 'correo', label: f.correo === 'con' ? 'Con correo' : 'Sin correo', quitar: (x) => ({ ...x, correo: null }) });
  if (f.con_telefono) out.push({ k: 'tel', label: 'Con teléfono', quitar: (x) => ({ ...x, con_telefono: false }) });
  return out;
}

// Cuántas personas hay y las tres primeras, con la misma búsqueda que la
// página. No se registra como búsqueda: eso lo hace la página al aplicarla.
async function contar(filtros) {
  if (filtrosVacios(filtros)) return { total: 0, ejemplos: [] };
  const res = await fetch('/api/contactos/buscar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filtros, desde: 0, cuantos: 3 }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'No se pudo hacer la búsqueda');
  return { total: Number(json.total) || 0, ejemplos: json.filas || [] };
}

/* ---------- Resultado de la búsqueda con IA ---------- */

function Resultado({ b, setFiltros, total, ejemplos, contando, onAplicar }) {
  const chips = etiquetasContactos(b.filtros);
  // Alguien con nombre y apellidos que no está en el directorio: se puede
  // seguir, porque en la página se ofrece buscar su correo.
  const fuera = !contando && total === 0 && b.persona?.organizacion ? b.persona : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <small className="gt-nb-mini">Lo he convertido en estos filtros</small>
        {chips.length ? (
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chips.map((c) => (
              <Etiqueta key={c.k} onQuitar={() => setFiltros(c.quitar(b.filtros))}>
                {c.label}
              </Etiqueta>
            ))}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: GRIS }}>Sin filtros. Describe la búsqueda de otra forma.</span>
        )}
        {b.aviso && <span style={{ fontSize: 12.5, color: GRIS }}>{b.aviso}</span>}
      </div>
      <div className="gt-nb-tarjeta" style={{ background: '#fafaf8' }}>
        <b style={{ fontSize: 14, display: 'block', marginBottom: ejemplos.length ? 8 : 0, opacity: contando ? 0.5 : 1 }}>
          {contando ? 'Contando…' : `${miles(total)} ${total === 1 ? 'persona' : 'personas'}`}
        </b>
        {!contando &&
          ejemplos.map((e) => (
            <div key={e.id} style={{ fontSize: 13, color: '#3d3a35', lineHeight: 1.45, padding: '5px 0', borderTop: '1px solid #efeee8' }}>
              {e.nombre}
              <span style={{ color: GRIS }}> {[e.cargo, e.institucion].filter(Boolean).join(', ')}</span>
            </div>
          ))}
        {!contando && total === 0 && (
          <div style={{ fontSize: 13, color: GRIS }}>
            {fuera
              ? `${fuera.nombre} no está en el directorio. Al continuar podrás buscar su correo.`
              : chips.length
                ? 'Prueba a quitar algún filtro.'
                : ''}
          </div>
        )}
      </div>
      <span>
        <button type="button" className="gt-nb-ok" disabled={contando || (total === 0 && !fuera)} onClick={() => onAplicar(b)}>
          {contando || total === 0 ? (fuera ? 'Continuar' : 'Ver contactos') : total === 1 ? 'Ver el contacto' : `Ver los ${miles(total)}`}
        </button>
      </span>
    </div>
  );
}

/* ---------- Búsqueda con IA ---------- */

function PanelIA({ bloqueado, onUpsell, onAplicar, inicial = '' }) {
  const [texto, setTexto] = useState(inicial);
  const [estado, setEstado] = useState('inicio'); // inicio | trabajando | resultado | error
  const [fase, setFase] = useState('entender');
  const [b, setB] = useState(null); // { filtros, consulta, resumen, persona, aviso, origen }
  const [encendidas, setEncendidas] = useState(0);
  const [total, setTotal] = useState(null);
  const [ejemplos, setEjemplos] = useState([]);
  const [contando, setContando] = useState(false);
  const [error, setError] = useState('');
  const turno = useRef(0);
  const primeraVez = useRef(true);

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  // frase: pasa por la IA. idea: filtros fijos, sin IA, con los mismos pasos.
  async function lanzar(frase, idea = null) {
    if (bloqueado) {
      onUpsell();
      return;
    }
    const n = ++turno.current;
    setEstado('trabajando');
    setFase('entender');
    setEncendidas(0);
    setTotal(null);
    setError('');
    try {
      let nueva;
      if (idea) {
        await espera(350);
        nueva = { filtros: { ...FILTROS_VACIOS, ...idea.filtros }, consulta: idea.texto, resumen: idea.resumen, persona: null, aviso: '', origen: 'idea' };
      } else {
        const r = await fetch('/api/contactos/interpretar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: frase }),
        });
        const j = await r.json().catch(() => ({}));
        if (n !== turno.current) return;
        if (!r.ok) throw new Error(j.error || 'No hemos podido interpretar la búsqueda.');
        nueva = {
          filtros: { ...FILTROS_VACIOS, ...(j.filtros || {}) },
          consulta: frase,
          resumen: j.resumen || '',
          persona: j.persona || null,
          aviso: j.aviso || '',
          origen: 'frase',
        };
      }
      if (n !== turno.current) return;
      setB(nueva);
      // Los filtros se encienden uno a uno.
      setFase('traducir');
      const cuantos = etiquetasContactos(nueva.filtros).length;
      for (let i = 1; i <= cuantos; i++) {
        await espera(320);
        if (n !== turno.current) return;
        setEncendidas(i);
      }
      setFase('contar');
      const c = await contar(nueva.filtros);
      if (n !== turno.current) return;
      setTotal(c.total);
      setEjemplos(c.ejemplos);
      await espera(500);
      if (n !== turno.current) return;
      primeraVez.current = true;
      setEstado('resultado');
    } catch (e) {
      if (n !== turno.current) return;
      setError(e.message || 'No hemos podido interpretar la búsqueda.');
      setEstado('error');
    }
  }

  // Al quitar una etiqueta del resultado, se vuelve a contar.
  const clave = b ? JSON.stringify(b.filtros) : '';
  useEffect(() => {
    if (estado !== 'resultado' || !b) return;
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    let vivo = true;
    setContando(true);
    contar(b.filtros)
      .then((c) => {
        if (!vivo) return;
        setTotal(c.total);
        setEjemplos(c.ejemplos);
      })
      .catch(() => {})
      .finally(() => vivo && setContando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const enviar = (e) => {
    e?.preventDefault();
    if (texto.trim().length >= 3) lanzar(texto.trim());
  };

  // Si se llega con la frase ya escrita (buscador de arriba), se busca sola.
  const arrancado = useRef(false);
  useEffect(() => {
    if (arrancado.current || inicial.trim().length < 3) return;
    arrancado.current = true;
    lanzar(inicial.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nChips = b ? etiquetasContactos(b.filtros).length : 0;
  const fraseTrabajo =
    fase === 'entender'
      ? 'Leyendo a quién buscas…'
      : fase === 'traducir'
        ? `Convirtiéndolo en filtros: ${Math.min(encendidas + 1, Math.max(1, nChips))} de ${nChips}`
        : 'Contando las personas que encajan…';

  const caja = (
    <form onSubmit={enviar} className="gt-nb-caja">
      <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <i className="ti ti-sparkles" style={{ color: MORADO, fontSize: 18, marginTop: 2 }} aria-hidden="true" />
        <textarea
          autoFocus
          rows={estado === 'inicio' ? 3 : 2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) enviar(e);
          }}
          placeholder="Subdirectores generales del Ministerio de Industria, o Ana López de la CNMC"
          aria-label="Describe los contactos que estás buscando"
          maxLength={600}
        />
      </span>
      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="gt-nb-enviar" disabled={texto.trim().length < 3 || estado === 'trabajando'} aria-label="Buscar">
          <i className="ti ti-arrow-up" aria-hidden="true" />
        </button>
      </span>
    </form>
  );

  if (estado === 'inicio') {
    return (
      <div className="gt-nb-centro">
        <b className="gt-nb-pregunta">¿A quién estás buscando?</b>
        {caja}
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640 }}>
          {IDEAS.map((idea) => (
            <button
              key={idea.texto}
              type="button"
              className="gt-nb-sug"
              onClick={() => {
                setTexto(idea.texto);
                lanzar(idea.texto, idea);
              }}
            >
              {idea.texto}
            </button>
          ))}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680, marginTop: 8 }}>
      {caja}
      {estado === 'trabajando' && (
        <Trabajando fase={fase} frase={fraseTrabajo} chips={b ? etiquetasContactos(b.filtros) : []} encendidas={encendidas} total={total} unidad="personas" />
      )}
      {estado === 'error' && (
        <div className="gt-nb-tarjeta" style={{ fontSize: 13.5, color: '#3d3a35' }}>
          {error}
        </div>
      )}
      {estado === 'resultado' && b && (
        <Resultado
          b={b}
          setFiltros={(filtros) => setB({ ...b, filtros })}
          total={total ?? 0}
          ejemplos={ejemplos}
          contando={contando}
          onAplicar={onAplicar}
        />
      )}
    </div>
  );
}

/* ---------- Atajos: tipo de institución y nivel del cargo ---------- */

function PanelLista({ titulo, opciones, clave, bloqueado, onUpsell, onAplicar }) {
  const [elegidos, setElegidos] = useState([]);
  const [res, setRes] = useState({ total: null, ejemplos: [] });

  const filtros = useMemo(() => ({ ...FILTROS_VACIOS, [clave]: elegidos }), [clave, elegidos]);

  useEffect(() => {
    if (!elegidos.length) {
      setRes({ total: null, ejemplos: [] });
      return;
    }
    let vivo = true;
    setRes({ total: null, ejemplos: [] });
    const h = setTimeout(() => {
      contar(filtros)
        .then((c) => vivo && setRes(c))
        .catch(() => vivo && setRes({ total: 0, ejemplos: [] }));
    }, 200);
    return () => {
      vivo = false;
      clearTimeout(h);
    };
  }, [filtros, elegidos.length]);

  const alternar = (v) => {
    if (bloqueado) {
      onUpsell();
      return;
    }
    setElegidos((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <b className="gt-nb-titulo">{titulo}</b>
      <div className="gt-nb-lista">
        {opciones.map((o) => (
          <label key={o.v} className={`gt-nb-fila${elegidos.includes(o.v) ? ' on' : ''}`}>
            <input type="checkbox" checked={elegidos.includes(o.v)} onChange={() => alternar(o.v)} />
            <span style={{ flex: 1 }}>{o.label}</span>
          </label>
        ))}
      </div>
      <div className="gt-nb-pie">
        <span style={{ fontSize: 13.5, color: '#3d3a35' }}>
          {elegidos.length === 0 ? (
            'Elige uno o varios.'
          ) : res.total == null ? (
            'Contando…'
          ) : (
            <>
              <b>{miles(res.total)}</b> {res.total === 1 ? 'persona' : 'personas'}
            </>
          )}
        </span>
        <button
          type="button"
          className="gt-nb-ok"
          disabled={!elegidos.length || !res.total}
          onClick={() => onAplicar({ filtros, consulta: '', resumen: '', persona: null, aviso: '', origen: 'filtros' })}
        >
          Ver contactos
        </button>
      </div>
    </div>
  );
}

/* ---------- El correo de una persona concreta ---------- */

function PanelCorreo({ bloqueado, onUpsell, onCorreo }) {
  const [nombre, setNombre] = useState('');
  const [institucion, setInstitucion] = useState('');
  const [creditos, setCreditos] = useState(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/creditos', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => vivo && j?.directorio && j.saldo && setCreditos(Number(j.saldo.disponibles) || 0))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const listo = nombre.trim().split(/\s+/).filter((w) => w.length > 1).length >= 2 && institucion.trim().length >= 2;
  const enviar = (e) => {
    e.preventDefault();
    if (bloqueado) {
      onUpsell();
      return;
    }
    if (listo) onCorreo({ nombre: nombre.trim(), institucion: institucion.trim() });
  };

  return (
    <div className="gt-nb-centro">
      <b className="gt-nb-pregunta">¿De quién necesitas el correo?</b>
      <form onSubmit={enviar} className="gt-nb-caja" style={{ maxWidth: 520, gap: 12, padding: 18 }}>
        <label className="gt-nb-campo">
          Nombre y apellidos
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ana López García" maxLength={120} />
        </label>
        <label className="gt-nb-campo">
          Organización
          <input value={institucion} onChange={(e) => setInstitucion(e.target.value)} placeholder="CNMC" maxLength={160} />
        </label>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
          <span style={{ fontSize: 12.5, color: '#5443d6', fontWeight: 600 }}>
            {creditosTexto(CREDITOS_CORREO_FUERA)}, solo si lo encontramos
          </span>
          <button type="submit" className="gt-nb-ok" disabled={!listo}>
            Buscar correo
          </button>
        </span>
      </form>
      {creditos != null && (
        <span style={{ fontSize: 13, color: '#57534e' }}>
          {creditos === 1 ? 'Te queda 1 crédito este mes' : `Te quedan ${miles(creditos)} créditos este mes`}
        </span>
      )}
    </div>
  );
}

const ESTILOS_CORREO = `
.gt-nb-campo { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: #57534e; }
.gt-nb-campo input { font: inherit; font-size: 14px; color: #1a1a18; border: 1px solid #e0dfd8; border-radius: 9px; padding: 9px 11px; outline: none; background: #fff; }
.gt-nb-campo input:focus { border-color: #c9c7bd; }
.gt-nb-campo input::placeholder { color: #a8a49c; }
`;

/* ---------- El modal ---------- */

export default function NuevaBusquedaContactos({ bloqueado = false, inicial = '', onUpsell, onAplicar, onCorreo, onClose }) {
  const [opcion, setOpcion] = useState('ia');

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = antes;
    };
  }, [onClose]);

  const aplicar = useCallback(
    (b) => {
      onAplicar(b);
      onClose();
    },
    [onAplicar, onClose],
  );

  let panel;
  if (opcion === 'ia') {
    panel = <PanelIA bloqueado={bloqueado} onUpsell={onUpsell} onAplicar={aplicar} inicial={inicial} />;
  } else if (opcion === 'tipo') {
    panel = <PanelLista key="tipo" titulo="Por tipo de institución" opciones={OPCIONES_TIPO} clave="tipos" bloqueado={bloqueado} onUpsell={onUpsell} onAplicar={aplicar} />;
  } else if (opcion === 'correo') {
    panel = (
      <PanelCorreo
        bloqueado={bloqueado}
        onUpsell={onUpsell}
        onCorreo={(p) => {
          onCorreo(p);
          onClose();
        }}
      />
    );
  } else {
    panel = <PanelLista key="nivel" titulo="Por nivel del cargo" opciones={OPCIONES_NIVEL} clave="bandas" bloqueado={bloqueado} onUpsell={onUpsell} onAplicar={aplicar} />;
  }

  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{ESTILOS}</style>
      <style>{ESTILOS_CORREO}</style>
      <div className="gt-nb" role="dialog" aria-modal="true" aria-label="Nueva búsqueda de contactos">
        <nav className="gt-nb-izq" aria-label="Formas de buscar">
          <b className="gt-nb-h">Nueva búsqueda</b>
          {OPCIONES.map((o) => (
            <button key={o.v} type="button" className={`gt-nb-op${opcion === o.v ? ' on' : ''}`} onClick={() => setOpcion(o.v)} aria-current={opcion === o.v ? 'true' : undefined}>
              <span className="gt-nb-op-ic">
                <i className={`ti ${o.icono}`} aria-hidden="true" />
              </span>
              <span style={{ flex: 1 }}>{o.label}</span>
            </button>
          ))}
        </nav>
        <div className="gt-nb-der">
          <button type="button" className="modal-x gt-nb-cerrar" onClick={onClose} aria-label="Cerrar">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
          {opcion === 'ia' && (
            <span className="gt-nb-etq">
              <i className="ti ti-sparkles" style={{ color: MORADO }} aria-hidden="true" /> Búsqueda con IA
            </span>
          )}
          {panel}
        </div>
      </div>
    </div>
  );
}
