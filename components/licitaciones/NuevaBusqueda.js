'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CampoBusqueda from '@/components/CampoBusqueda';
import { PROCEDIMIENTOS, SECTORES, TERRITORIOS, TIPOS } from '@/lib/contratacion/etiquetas';
import { FILTROS_VACIOS, consultaLicitaciones } from '@/lib/contratacion/consulta';

/**
 * «Nueva búsqueda» de Licitaciones (11-11-2026), en el estilo del «Crear
 * lista» de Enginy (maquetas M1 a M3 del canvas). A la izquierda, las
 * formas de buscar; a la derecha, la elegida. Todas terminan igual: unos
 * filtros que se aplican a la página con onAplicar({ f, pestana,
 * busqueda, expediente }).
 *
 * La búsqueda con IA (y la del perfil de la organización) enseña lo que
 * va haciendo con los mismos efectos que el asistente de alarmas: los
 * pasos con el actual latiendo, la frase del paso, los filtros que se
 * encienden uno a uno y el contador.
 */

const MORADO = '#6d5aef';
const MORADO_S = '#f0eefe';
const MORADO_O = '#3c3489';
const TINTA = '#1a1a18';
const GRIS = '#8b8780';
const GRIS2 = '#a8a49c';
const LINEA = '#e6e4dc';

const OPCIONES = [
  { v: 'ia', label: 'Describe lo que buscas', icono: 'ti-sparkles' },
  { v: 'organizacion', label: 'A partir de mi organización', icono: 'ti-building' },
  { v: 'sector', label: 'Por sector (CPV)', icono: 'ti-category' },
  { v: 'organo', label: 'Por órgano de contratación', icono: 'ti-building-bank' },
  { v: 'territorio', label: 'Por territorio', icono: 'ti-map-pin' },
  { v: 'competidores', label: 'Lo que ganan mis competidores', icono: 'ti-users' },
  { v: 'previos', label: 'Anuncios previos', icono: 'ti-speakerphone' },
  { v: 'vencimientos', label: 'Contratos que vencen', icono: 'ti-calendar-time', pronto: true },
];

const SUGERENCIAS = [
  'Comunicación institucional para ministerios, más de 100.000 €',
  'Formación para empleados públicos en Madrid',
  'Organización de eventos y congresos',
  'Software para ayuntamientos de Andalucía',
];

const PASOS = [
  { id: 0, label: 'Entender' },
  { id: 1, label: 'Traducir a filtros' },
  { id: 2, label: 'Contar' },
];

function euros(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n));
}

function miles(n) {
  return Number(n || 0).toLocaleString('es-ES');
}

const nombre = (lista, v) => lista.find((o) => o.v === v)?.label || v;

// Lo que devuelve la IA → el estado de la página.
function aBusqueda(r) {
  return {
    f: {
      ...FILTROS_VACIOS,
      sectores: r.sectores || [],
      territorios: r.territorios || [],
      organo: r.organo || '',
      tipos: r.tipos || [],
      procedimientos: r.procedimientos || [],
      importeMin: r.importeMin === '' || r.importeMin == null ? '' : String(r.importeMin),
      importeMax: r.importeMax === '' || r.importeMax == null ? '' : String(r.importeMax),
      previos: !!r.previos,
    },
    pestana: r.previos ? 'todas' : r.menores ? 'todas' : 'plazo',
    busqueda: r.palabras || '',
    expediente: r.menores ? 'menores' : 'licitaciones',
  };
}

// Las etiquetas de una búsqueda, cada una con cómo quitarla.
function etiquetas(b) {
  const { f } = b;
  const quitar = (cambio) => (x) => ({ ...x, f: { ...x.f, ...cambio(x.f) } });
  const out = [];
  if (b.expediente === 'menores') out.push({ k: 'men', label: 'Contratos menores', quitar: (x) => ({ ...x, expediente: 'licitaciones', pestana: 'plazo' }) });
  if (f.previos) out.push({ k: 'prev', label: 'Anuncios previos', quitar: (x) => ({ ...x, pestana: 'plazo', f: { ...x.f, previos: false } }) });
  else if (b.pestana === 'plazo') out.push({ k: 'plazo', label: 'En plazo', quitar: (x) => ({ ...x, pestana: 'todas' }) });
  f.sectores.forEach((v) => out.push({ k: `s${v}`, label: nombre(SECTORES, v), quitar: quitar((y) => ({ sectores: y.sectores.filter((z) => z !== v) })) }));
  f.territorios.forEach((v) => out.push({ k: `t${v}`, label: nombre(TERRITORIOS, v), quitar: quitar((y) => ({ territorios: y.territorios.filter((z) => z !== v) })) }));
  if (f.organo) out.push({ k: 'org', label: `Órgano: ${f.organo}`, quitar: quitar(() => ({ organo: '' })) });
  if (f.adjudicatario) out.push({ k: 'adj', label: `Ganadas por: ${f.adjudicatario}`, quitar: quitar(() => ({ adjudicatario: '' })) });
  f.tipos.forEach((v) => out.push({ k: `ti${v}`, label: nombre(TIPOS, v), quitar: quitar((y) => ({ tipos: y.tipos.filter((z) => z !== v) })) }));
  f.procedimientos.forEach((v) =>
    out.push({ k: `pr${v}`, label: nombre(PROCEDIMIENTOS, v), quitar: quitar((y) => ({ procedimientos: y.procedimientos.filter((z) => z !== v) })) }),
  );
  if (f.importeMin !== '' || f.importeMax !== '') {
    const label =
      f.importeMin !== '' && f.importeMax !== ''
        ? `Importe: ${miles(f.importeMin)} a ${miles(f.importeMax)} €`
        : f.importeMin !== ''
          ? `Importe desde ${miles(f.importeMin)} €`
          : `Importe hasta ${miles(f.importeMax)} €`;
    out.push({ k: 'imp', label, quitar: quitar(() => ({ importeMin: '', importeMax: '' })) });
  }
  if (b.busqueda) out.push({ k: 'pal', label: `Con «${b.busqueda}» en el título`, quitar: (x) => ({ ...x, busqueda: '' }) });
  return out;
}

// Cuántas hay y las tres primeras, con la misma consulta que la página.
async function contar(supabase, b, ocultas) {
  let q = consultaLicitaciones(supabase, {
    columnas: 'id, titulo, organo_nombre, importe_sin_iva, valor_estimado',
    opciones: { count: 'exact' },
    pestana: b.pestana,
    busqueda: b.busqueda,
    f: b.f,
    expediente: b.expediente,
    ocultas,
  });
  q = b.pestana === 'plazo' ? q.order('fin_ofertas', { ascending: true, nullsFirst: false }) : q.order('detectado_en', { ascending: false });
  const { data, count, error } = await q.order('id').range(0, 2);
  if (error) throw error;
  return { total: count ?? 0, ejemplos: data || [] };
}

/* ---------- Piezas ---------- */

function Etiqueta({ children, onQuitar, encendida = true, latiendo = false }) {
  return (
    <span
      className={latiendo ? 'gt-nb-anim' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12.5,
        fontWeight: 500,
        borderRadius: 8,
        padding: onQuitar ? '4px 4px 4px 10px' : '4px 10px',
        border: `1px solid ${encendida || latiendo ? MORADO : LINEA}`,
        background: encendida ? '#f3f1fe' : latiendo ? MORADO_S : '#fff',
        color: encendida ? MORADO : latiendo ? MORADO_O : GRIS,
        animation: latiendo ? 'gt-nb-brillo 1s ease-in-out infinite' : 'none',
        transition: 'background .25s ease, color .25s ease, border-color .25s ease',
      }}
    >
      {children}
      {onQuitar && (
        <button type="button" className="gt-nb-x" onClick={onQuitar} aria-label={`Quitar ${children}`} title="Quitar">
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

function Trabajando({ fase, frase, chips, encendidas, total }) {
  const actual = fase === 'entender' ? 0 : fase === 'traducir' ? 1 : 2;
  return (
    <div role="status" aria-live="polite" className="gt-nb-tarjeta" style={{ boxShadow: '0 6px 24px rgba(109,90,239,.08)' }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        {PASOS.map((p) => {
          const hecho = p.id < actual;
          const ahora = p.id === actual;
          return (
            <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: hecho || ahora ? MORADO_O : GRIS2 }}>
              {hecho ? (
                <span aria-hidden="true" style={{ color: MORADO, fontSize: 11 }}>
                  ✓
                </span>
              ) : (
                <span
                  className={ahora ? 'gt-nb-anim' : undefined}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: ahora ? MORADO : '#dcd8ce',
                    animation: ahora ? 'gt-nb-latido 1.1s ease-in-out infinite' : 'none',
                    display: 'inline-block',
                  }}
                />
              )}
              {p.label}
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 13.5, color: TINTA, lineHeight: 1.5, fontWeight: 500 }}>{frase}</div>
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {chips.map((c, i) => (
            <Etiqueta key={c.k} encendida={i < encendidas} latiendo={fase === 'traducir' && i === encendidas}>
              {c.label}
            </Etiqueta>
          ))}
        </div>
      )}
      {fase === 'contar' && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
          <span className={total == null ? 'gt-nb-anim' : undefined} style={{ fontSize: 22, fontWeight: 600, color: MORADO, lineHeight: 1, fontVariantNumeric: 'tabular-nums', animation: total == null ? 'gt-nb-latido 1.1s ease-in-out infinite' : 'none' }}>
            {total == null ? '…' : miles(total)}
          </span>
          <span style={{ fontSize: 12.5, color: GRIS }}>licitaciones</span>
        </div>
      )}
    </div>
  );
}

function Resultado({ b, setB, total, ejemplos, contando, onAplicar }) {
  const chips = etiquetas(b);
  const uno = total === 1;
  const que = b.f.previos
    ? uno ? 'anuncio previo' : 'anuncios previos'
    : b.expediente === 'menores'
      ? uno ? 'contrato menor' : 'contratos menores'
      : b.pestana === 'plazo'
        ? uno ? 'licitación en plazo' : 'licitaciones en plazo'
        : uno ? 'licitación' : 'licitaciones';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <small className="gt-nb-mini">Lo he convertido en estos filtros</small>
        {chips.length ? (
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chips.map((c) => (
              <Etiqueta key={c.k} onQuitar={() => setB(c.quitar(b))}>
                {c.label}
              </Etiqueta>
            ))}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: GRIS }}>Sin filtros: todas las licitaciones.</span>
        )}
      </div>
      <div className="gt-nb-tarjeta" style={{ background: '#fafaf8' }}>
        <b style={{ fontSize: 14, display: 'block', marginBottom: ejemplos.length ? 8 : 0, opacity: contando ? 0.5 : 1 }}>
          {contando ? 'Contando…' : `${miles(total)} ${que}`}
        </b>
        {!contando &&
          ejemplos.map((e) => (
            <div key={e.id} style={{ fontSize: 13, color: '#3d3a35', lineHeight: 1.45, padding: '5px 0', borderTop: '1px solid #efeee8' }}>
              {e.titulo}
              <span style={{ color: GRIS }}>
                {' '}
                {[e.organo_nombre, euros(e.importe_sin_iva ?? e.valor_estimado)].filter(Boolean).join(', ')}
              </span>
            </div>
          ))}
        {!contando && total === 0 && <div style={{ fontSize: 13, color: GRIS }}>Prueba a quitar algún filtro.</div>}
      </div>
      <span>
        <button type="button" className="gt-nb-ok" disabled={contando || total === 0} onClick={() => onAplicar(b)}>
          {contando ? 'Ver licitaciones' : `Ver ${total === 1 ? 'la licitación' : `las ${miles(total)}`}`}
        </button>
      </span>
    </div>
  );
}

/* ---------- Búsqueda con IA (frase u organización) ---------- */

function PanelIA({ modo, supabase, ocultas, onAplicar }) {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState('inicio'); // inicio | trabajando | resultado | error
  const [fase, setFase] = useState('entender');
  const [b, setB] = useState(null);
  const [encendidas, setEncendidas] = useState(0);
  const [total, setTotal] = useState(null);
  const [ejemplos, setEjemplos] = useState([]);
  const [contando, setContando] = useState(false);
  const [error, setError] = useState('');
  const [organizacion, setOrganizacion] = useState('');
  const turno = useRef(0);
  const primeraVez = useRef(true);

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  async function lanzar(frase) {
    const n = ++turno.current;
    setEstado('trabajando');
    setFase('entender');
    setEncendidas(0);
    setTotal(null);
    setError('');
    try {
      const r = await fetch('/api/licitaciones/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modo === 'organizacion' ? { modo } : { modo, q: frase }),
      });
      const j = await r.json().catch(() => ({}));
      if (n !== turno.current) return;
      if (!r.ok) throw new Error(j.error || 'No hemos podido interpretar la búsqueda.');
      if (j.organizacion) setOrganizacion(j.organizacion);
      if (modo === 'organizacion' && j.frase) setTexto(j.frase);
      const nueva = aBusqueda(j.filtros || {});
      setB(nueva);
      // Los filtros se encienden uno a uno.
      setFase('traducir');
      const cuantos = etiquetas(nueva).length;
      for (let i = 1; i <= cuantos; i++) {
        await espera(320);
        if (n !== turno.current) return;
        setEncendidas(i);
      }
      setFase('contar');
      const c = await contar(supabase, nueva, ocultas);
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
  useEffect(() => {
    if (estado !== 'resultado' || !b) return;
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    let vivo = true;
    setContando(true);
    contar(supabase, b, ocultas)
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
  }, [b]);

  const enviar = (e) => {
    e?.preventDefault();
    if (texto.trim().length >= 3) lanzar(texto.trim());
  };

  const fraseTrabajo =
    fase === 'entender'
      ? modo === 'organizacion'
        ? 'Leyendo el perfil de tu organización para ver a qué licitaciones podría presentarse…'
        : 'Leyendo lo que buscas…'
      : fase === 'traducir'
        ? `Convirtiéndolo en filtros: ${Math.min(encendidas + 1, Math.max(1, b ? etiquetas(b).length : 1))} de ${b ? etiquetas(b).length : 0}`
        : 'Contando las licitaciones que encajan…';

  const caja =
    modo === 'texto' ? (
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
            placeholder="Servicios de comunicación institucional para ministerios, por encima de 100.000 €"
            aria-label="Describe qué licitaciones buscas"
            maxLength={600}
          />
        </span>
        <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="gt-nb-enviar" disabled={texto.trim().length < 3 || estado === 'trabajando'} aria-label="Buscar">
            <i className="ti ti-arrow-up" aria-hidden="true" />
          </button>
        </span>
      </form>
    ) : null;

  if (estado === 'inicio') {
    if (modo === 'organizacion') {
      return (
        <div className="gt-nb-centro">
          <b className="gt-nb-pregunta">Licitaciones para tu organización</b>
          <p style={{ fontSize: 13.5, color: '#55524c', textAlign: 'center', maxWidth: 460, margin: 0, lineHeight: 1.55 }}>
            Leemos lo que hace tu organización y te proponemos los filtros: sectores, territorio e importes. Después puedes quitar los que
            no te encajen.
          </p>
          <button type="button" className="gt-nb-ok" onClick={() => lanzar('')}>
            <i className="ti ti-sparkles" aria-hidden="true" /> Proponer búsqueda
          </button>
        </div>
      );
    }
    return (
      <div className="gt-nb-centro">
        <b className="gt-nb-pregunta">¿Qué licitaciones te interesan?</b>
        {caja}
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640 }}>
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="button"
              className="gt-nb-sug"
              onClick={() => {
                setTexto(s);
                lanzar(s);
              }}
            >
              {s}
            </button>
          ))}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680, marginTop: 8 }}>
      {modo === 'texto' ? (
        caja
      ) : (
        <div style={{ fontSize: 13.5, color: '#3d3a35', lineHeight: 1.5 }}>
          {organizacion ? (
            <>
              Búsqueda propuesta para <b>{organizacion}</b>
              {texto ? `: ${texto}` : ''}
            </>
          ) : (
            'Búsqueda propuesta para tu organización'
          )}
        </div>
      )}
      {estado === 'trabajando' && <Trabajando fase={fase} frase={fraseTrabajo} chips={b ? etiquetas(b) : []} encendidas={encendidas} total={total} />}
      {estado === 'error' && (
        <div className="gt-nb-tarjeta" style={{ fontSize: 13.5, color: '#3d3a35' }}>
          {error}
          {modo === 'organizacion' && (
            <div style={{ marginTop: 10 }}>
              <button type="button" className="gt-filtro" onClick={() => lanzar('')}>
                Volver a intentarlo
              </button>
            </div>
          )}
        </div>
      )}
      {estado === 'resultado' && b && (
        <Resultado b={b} setB={setB} total={total ?? 0} ejemplos={ejemplos} contando={contando} onAplicar={onAplicar} />
      )}
    </div>
  );
}

/* ---------- Atajos: sector y territorio ---------- */

function PanelLista({ titulo, opciones, rpc, campo, clave, supabase, ocultas, onAplicar, placeholder }) {
  const [cuentas, setCuentas] = useState({});
  const [q, setQ] = useState('');
  const [elegidos, setElegidos] = useState([]);
  const [res, setRes] = useState({ total: null, ejemplos: [] });

  useEffect(() => {
    let vivo = true;
    supabase.rpc(rpc).then(({ data }) => {
      if (!vivo) return;
      setCuentas(Object.fromEntries((data || []).map((r) => [r[campo], Number(r.n)])));
    });
    return () => {
      vivo = false;
    };
  }, [supabase, rpc, campo]);

  const b = useMemo(
    () => ({ f: { ...FILTROS_VACIOS, [clave]: elegidos }, pestana: 'plazo', busqueda: '', expediente: 'licitaciones' }),
    [clave, elegidos],
  );

  useEffect(() => {
    if (!elegidos.length) {
      setRes({ total: null, ejemplos: [] });
      return;
    }
    let vivo = true;
    contar(supabase, b, ocultas)
      .then((c) => vivo && setRes(c))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [supabase, b, ocultas, elegidos.length]);

  const lista = opciones
    .filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()) || o.v.startsWith(q))
    .sort((a, z) => (cuentas[z.v] || 0) - (cuentas[a.v] || 0));
  const alternar = (v) => setElegidos((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <b className="gt-nb-titulo">{titulo}</b>
      <CampoBusqueda atajo={false} estilo={{ width: 320 }} type="text" value={q} onChange={(e) => setQ(e.target.value)} onLimpiar={() => setQ('')} placeholder={placeholder} aria-label={placeholder} />
      <div className="gt-nb-lista">
        {lista.map((o) => (
          <label key={o.v} className={`gt-nb-fila${elegidos.includes(o.v) ? ' on' : ''}`}>
            <input type="checkbox" checked={elegidos.includes(o.v)} onChange={() => alternar(o.v)} />
            <span style={{ flex: 1 }}>{o.label}</span>
            <span style={{ color: GRIS, fontSize: 12.5 }}>{cuentas[o.v] ? `${miles(cuentas[o.v])} en plazo` : 'Ninguna en plazo'}</span>
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
              <b>{miles(res.total)}</b> {res.total === 1 ? 'licitación en plazo' : 'licitaciones en plazo'}
            </>
          )}
        </span>
        <button type="button" className="gt-nb-ok" disabled={!elegidos.length || !res.total} onClick={() => onAplicar(b)}>
          Ver licitaciones
        </button>
      </div>
    </div>
  );
}

/* ---------- Atajos: órgano y competidores ---------- */

function PanelBuscar({ tipo, supabase, onAplicar }) {
  const esOrgano = tipo === 'organo';
  const [q, setQ] = useState('');
  const [filas, setFilas] = useState(null);

  useEffect(() => {
    const t = q.trim();
    if (!esOrgano && t.length < 2) {
      setFilas(null);
      return;
    }
    let vivo = true;
    const h = setTimeout(async () => {
      const { data } = esOrgano
        ? await supabase.rpc('licitaciones_buscar_organos', { p_texto: t })
        : await supabase.rpc('licitaciones_buscar_adjudicatarios', { p_texto: t });
      if (vivo) setFilas(data || []);
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(h);
    };
  }, [q, esOrgano, supabase]);

  const aplicarOrgano = (nombreOrg, enPlazo) =>
    onAplicar({ f: { ...FILTROS_VACIOS, organo: nombreOrg }, pestana: enPlazo > 0 ? 'plazo' : 'todas', busqueda: '', expediente: 'licitaciones' });
  const aplicarEmpresa = (nombreEmp) =>
    onAplicar({ f: { ...FILTROS_VACIOS, adjudicatario: nombreEmp }, pestana: 'adjudicaciones', busqueda: '', expediente: 'licitaciones' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <b className="gt-nb-titulo">{esOrgano ? 'Por órgano de contratación' : 'Lo que ganan mis competidores'}</b>
      {!esOrgano && (
        <span style={{ fontSize: 13, color: '#55524c', marginTop: -4 }}>
          Busca una empresa y mira qué contratos ha ganado, de quién y por cuánto. Los autónomos no se buscan por nombre.
        </span>
      )}
      <CampoBusqueda
        atajo={false}
        autoFocus
        estilo={{ width: 360 }}
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onLimpiar={() => setQ('')}
        placeholder={esOrgano ? 'Ministerio de…, Ayuntamiento de…' : 'Nombre de la empresa'}
        aria-label={esOrgano ? 'Buscar órgano de contratación' : 'Buscar empresa'}
      />
      <div className="gt-nb-lista">
        {filas == null && !esOrgano && <div className="gt-nb-vacio">Escribe al menos dos letras.</div>}
        {filas && filas.length === 0 && <div className="gt-nb-vacio">No hay resultados con «{q.trim()}».</div>}
        {!esOrgano && filas && filas.length > 1 && (
          <button type="button" className="gt-nb-fila boton" onClick={() => aplicarEmpresa(q.trim())}>
            <i className="ti ti-search" style={{ color: GRIS }} aria-hidden="true" />
            <span style={{ flex: 1 }}>Todas las que contienen «{q.trim()}»</span>
          </button>
        )}
        {(filas || []).map((r) =>
          esOrgano ? (
            <button key={r.organo} type="button" className="gt-nb-fila boton" onClick={() => aplicarOrgano(r.organo, Number(r.en_plazo))}>
              <span style={{ flex: 1 }}>{r.organo}</span>
              <span style={{ color: GRIS, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                {Number(r.en_plazo) > 0 ? `${miles(r.en_plazo)} en plazo de ${miles(r.total)}` : `${miles(r.total)} en total`}
              </span>
            </button>
          ) : (
            <button key={r.adjudicatario} type="button" className="gt-nb-fila boton" onClick={() => aplicarEmpresa(r.adjudicatario)}>
              <span style={{ flex: 1 }}>{r.adjudicatario}</span>
              <span style={{ color: GRIS, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                {miles(r.contratos)} {Number(r.contratos) === 1 ? 'contrato' : 'contratos'}
                {euros(r.importe) ? `, ${euros(r.importe)}` : ''}
              </span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/* ---------- Anuncios previos ---------- */

function PanelPrevios({ supabase, ocultas, onAplicar }) {
  const b = useMemo(() => ({ f: { ...FILTROS_VACIOS, previos: true }, pestana: 'todas', busqueda: '', expediente: 'licitaciones' }), []);
  const [res, setRes] = useState(null);
  useEffect(() => {
    let vivo = true;
    contar(supabase, b, ocultas)
      .then((c) => vivo && setRes(c))
      .catch(() => vivo && setRes({ total: 0, ejemplos: [] }));
    return () => {
      vivo = false;
    };
  }, [supabase, b, ocultas]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 680 }}>
      <b className="gt-nb-titulo">Anuncios previos</b>
      <span style={{ fontSize: 13.5, color: '#55524c', lineHeight: 1.55 }}>
        Lo que los organismos anuncian antes de licitar: anuncios de información previa y consultas preliminares al mercado. Es el momento
        de prepararse y de hablar con quien decide.
      </span>
      <div className="gt-nb-tarjeta" style={{ background: '#fafaf8' }}>
        <b style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>{res ? `${miles(res.total)} anuncios previos` : 'Contando…'}</b>
        {(res?.ejemplos || []).map((e) => (
          <div key={e.id} style={{ fontSize: 13, color: '#3d3a35', lineHeight: 1.45, padding: '5px 0', borderTop: '1px solid #efeee8' }}>
            {e.titulo}
            <span style={{ color: GRIS }}> {e.organo_nombre}</span>
          </div>
        ))}
      </div>
      <span>
        <button type="button" className="gt-nb-ok" disabled={!res?.total} onClick={() => onAplicar(b)}>
          {res?.total ? `Ver los ${miles(res.total)}` : 'Ver anuncios'}
        </button>
      </span>
    </div>
  );
}

/* ---------- El modal ---------- */

export default function NuevaBusqueda({ supabase, ocultas, onAplicar, onClose }) {
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
  if (opcion === 'ia' || opcion === 'organizacion') {
    panel = <PanelIA key={opcion} modo={opcion === 'ia' ? 'texto' : 'organizacion'} supabase={supabase} ocultas={ocultas} onAplicar={aplicar} />;
  } else if (opcion === 'sector') {
    panel = (
      <PanelLista
        titulo="Por sector (CPV)"
        opciones={SECTORES}
        rpc="licitaciones_en_plazo_por_sector"
        campo="division"
        clave="sectores"
        placeholder="Buscar sector o código CPV"
        supabase={supabase}
        ocultas={ocultas}
        onAplicar={aplicar}
      />
    );
  } else if (opcion === 'territorio') {
    panel = (
      <PanelLista
        titulo="Por territorio"
        opciones={TERRITORIOS}
        rpc="licitaciones_en_plazo_por_territorio"
        campo="nuts2"
        clave="territorios"
        placeholder="Buscar comunidad"
        supabase={supabase}
        ocultas={ocultas}
        onAplicar={aplicar}
      />
    );
  } else if (opcion === 'organo' || opcion === 'competidores') {
    panel = <PanelBuscar key={opcion} tipo={opcion} supabase={supabase} onAplicar={aplicar} />;
  } else if (opcion === 'previos') {
    panel = <PanelPrevios supabase={supabase} ocultas={ocultas} onAplicar={aplicar} />;
  } else {
    panel = (
      <div className="gt-nb-centro">
        <span className="gt-nb-pronto">Próximamente</span>
        <b className="gt-nb-pregunta">Contratos que vencen</b>
        <p style={{ fontSize: 13.5, color: '#55524c', textAlign: 'center', maxWidth: 440, margin: 0, lineHeight: 1.55 }}>
          Los contratos adjudicados que terminan en los próximos meses, con quién los tiene y por cuánto. Así sabrás qué se va a volver a
          licitar antes de que se publique.
        </p>
      </div>
    );
  }

  return (
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{ESTILOS}</style>
      <div className="gt-nb" role="dialog" aria-modal="true" aria-label="Nueva búsqueda de licitaciones">
        <nav className="gt-nb-izq" aria-label="Formas de buscar">
          <b className="gt-nb-h">Nueva búsqueda</b>
          {OPCIONES.map((o) => (
            <button key={o.v} type="button" className={`gt-nb-op${opcion === o.v ? ' on' : ''}${o.pronto ? ' pronto' : ''}`} onClick={() => setOpcion(o.v)} aria-current={opcion === o.v ? 'true' : undefined}>
              <span className="gt-nb-op-ic">
                <i className={`ti ${o.icono}`} aria-hidden="true" />
              </span>
              <span style={{ flex: 1 }}>{o.label}</span>
              {o.pronto && <span className="gt-nb-pronto">Próximamente</span>}
            </button>
          ))}
        </nav>
        <div className="gt-nb-der">
          <button type="button" className="modal-x gt-nb-cerrar" onClick={onClose} aria-label="Cerrar">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
          {(opcion === 'ia' || opcion === 'organizacion') && (
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

const ESTILOS = `
@keyframes gt-nb-latido { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.82); } }
@keyframes gt-nb-brillo { 0%, 100% { background: ${MORADO_S}; } 50% { background: #ddd6fd; } }
@media (prefers-reduced-motion: reduce) { .gt-nb-anim { animation: none !important; } }
.gt-nb { background: #fff; border-radius: 16px; width: 100%; max-width: 1120px; height: min(680px, 88vh); display: flex; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
.gt-nb-izq { width: 300px; flex: 0 0 300px; border-right: 1px solid #ecebe5; padding: 24px 16px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.gt-nb-h { font-size: 20px; letter-spacing: -.3px; padding: 0 10px 14px; }
.gt-nb-op { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 9px; border: none; background: none; font: inherit; font-size: 14px; color: #2b2a27; cursor: pointer; text-align: left; }
.gt-nb-op:hover { background: rgba(26,26,24,.05); }
.gt-nb-op.on { background: #f3f1fe; color: ${TINTA}; font-weight: 600; }
.gt-nb-op.pronto { color: #8b8780; }
.gt-nb-op-ic { width: 32px; height: 32px; border-radius: 8px; background: #f7f6f2; border: 1px solid #ecebe5; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.gt-nb-op-ic i { font-size: 17px; color: #55524c; }
.gt-nb-op.on .gt-nb-op-ic { background: #fff; }
.gt-nb-op.on .gt-nb-op-ic i { color: ${MORADO}; }
.gt-nb-pronto { font-size: 10px; font-weight: 600; color: #6e6a63; background: #f1f0eb; border-radius: 5px; padding: 1px 6px; white-space: nowrap; }
.gt-nb-der { flex: 1; min-width: 0; padding: 24px 32px; display: flex; flex-direction: column; gap: 10px; position: relative; overflow-y: auto; }
.gt-nb-cerrar { position: absolute; top: 18px; right: 20px; }
.gt-nb-etq { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; border: 1px solid #e0dfd8; border-radius: 9px; padding: 5px 10px; background: #fff; }
.gt-nb-titulo { font-size: 22px; letter-spacing: -.3px; }
.gt-nb-centro { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; padding-bottom: 30px; }
.gt-nb-pregunta { font-size: 22px; font-weight: 600; letter-spacing: -.3px; color: #3d3a35; text-align: center; }
.gt-nb-caja { width: 100%; max-width: 640px; background: #fff; border: 1px solid #e0dfd8; border-radius: 18px; box-shadow: 0 10px 40px rgba(109,90,239,.12); padding: 16px 16px 12px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; }
.gt-nb-caja:focus-within { border-color: #c9c7bd; }
.gt-nb-caja textarea { flex: 1; border: none; outline: none; resize: none; font: inherit; font-size: 15px; line-height: 1.5; color: ${TINTA}; background: transparent; padding: 0; }
.gt-nb-caja textarea::placeholder { color: #a8a49c; }
.gt-nb-enviar { width: 34px; height: 34px; border-radius: 50%; border: none; background: ${TINTA}; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.gt-nb-enviar:disabled { background: #ecebe5; color: #a8a49c; cursor: default; }
.gt-nb-enviar i { font-size: 16px; }
.gt-nb-sug { font: inherit; font-size: 13px; color: ${TINTA}; background: #fff; border: 1px solid #e0dfd8; border-radius: 20px; padding: 6px 12px; cursor: pointer; }
.gt-nb-sug:hover { border-color: #c9c7bd; }
.gt-nb-tarjeta { background: #fff; border: 1px solid ${LINEA}; border-radius: 14px; padding: 14px 16px; }
.gt-nb-mini { color: #6e6a63; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .3px; }
.gt-nb-x { border: none; background: none; color: ${MORADO}; cursor: pointer; padding: 2px 4px; border-radius: 5px; display: inline-flex; line-height: 1; }
.gt-nb-x:hover { background: #e7e3fd; }
.gt-nb-x i { font-size: 13px; }
.gt-nb-ok { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13.5px; font-weight: 500; color: #fff; background: ${TINTA}; border: none; border-radius: 9px; padding: 9px 16px; cursor: pointer; }
.gt-nb-ok:disabled { background: #d6d4cc; cursor: default; }
.gt-nb-lista { border: 1px solid #ecebe5; border-radius: 12px; padding: 6px; overflow-y: auto; flex: 1; min-height: 0; }
.gt-nb-fila { display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box; padding: 9px 12px; border-radius: 8px; font-size: 13.5px; cursor: pointer; border: none; background: none; font-family: inherit; text-align: left; color: ${TINTA}; }
.gt-nb-fila:hover { background: #f7f6f2; }
.gt-nb-fila.on { background: #f7f6f2; }
.gt-nb-fila input { accent-color: ${MORADO}; margin: 0; }
.gt-nb-vacio { padding: 14px 12px; font-size: 13px; color: ${GRIS}; }
.gt-nb-pie { display: flex; align-items: center; gap: 12px; justify-content: space-between; padding-top: 4px; }
@media (max-width: 820px) {
  .gt-nb { flex-direction: column; height: 92vh; }
  .gt-nb-izq { width: auto; flex: none; flex-direction: row; overflow-x: auto; border-right: none; border-bottom: 1px solid #ecebe5; padding: 12px; }
  .gt-nb-h { display: none; }
  .gt-nb-op { white-space: nowrap; }
  .gt-nb-der { padding: 18px; }
}
`;
