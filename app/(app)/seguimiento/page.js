'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Desplegable from '@/components/Desplegable';
import { toast } from '@/lib/toast';

/**
 * Seguimiento: lo que sigue el usuario.
 *
 * Diseño del 04-10-2026 (propuesta B):
 *   1. «Con cambios»: lo que se ha movido desde la última visita, con qué
 *      pasó (el último aviso: «Quedan 3 días de plazo», «Ha pasado a
 *      Pleno»…).
 *   2. Un bloque por fuente (Congreso, Parlamento Europeo…) con los tres
 *      más recientes y «Ver los N».
 *   3. Personas e instituciones, con foto.
 *   4. Consejo de Ministros: los acuerdos que han hecho saltar alguna de
 *      tus alarmas (sector_alert_matches, kind 'consejo').
 *
 * Datos: la vista my_follows (sql/69 añade foto, ultimo_tipo y
 * ultimo_detalle). «Dejar de seguir» va en el menú «···» de cada fila.
 *
 * Los enlaces antiguos a ?alarmas=1 y ?ajustes=1 llevan a /alarmas.
 */

const MORADO = '#6d5aef';
const GRIS = '#6f6b64';
const LINEA = '1px solid #efeee8';
const CARD = { background: '#fff', borderRadius: 14, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const POR_BLOQUE = 3;

// El orden de los bloques: primero dónde se tramita, luego lo publicado.
const ORDEN_FUENTES = ['Congreso', 'Parlamentos autonómicos', 'Consultas públicas', 'BOE', 'Parlamento Europeo', 'Comisión Europea', 'Gobierno'];
const PERSONAS = 'Personas e instituciones';
const CONSEJO = 'Consejo de Ministros';

// Lo que no es una persona se pinta con un icono en vez de iniciales.
const ICONO_ACTOR = { comision: 'ti-users-group', 'comision-eu': 'ti-users-group', grupo: 'ti-flag', direccion: 'ti-building-bank' };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function cuando(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  const anio = d.getFullYear() !== hoy.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MESES[d.getMonth()]}${anio}`;
}

function iniciales(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·';
}

export default function SeguimientoPage() {
  return (
    <Suspense
      fallback={
        <div className="sec" style={{ maxWidth: 880 }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <Seguimiento />
    </Suspense>
  );
}

function Avatar({ item }) {
  const [rota, setRota] = useState(false);
  const caja = {
    width: 40,
    height: 40,
    borderRadius: '50%',
    flexShrink: 0,
    background: '#ebe9e2',
    color: '#5f5b54',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 600,
    overflow: 'hidden',
  };
  if (item.foto && !rota) {
    return (
      <span style={caja}>
        <img src={item.foto} alt="" onError={() => setRota(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
      </span>
    );
  }
  const icono = ICONO_ACTOR[item.kind];
  return (
    <span style={caja} aria-hidden="true">
      {icono ? <i className={`ti ${icono}`} style={{ fontSize: 18 }}></i> : iniciales(item.label)}
    </span>
  );
}

/** El menú «···» de una fila: por ahora, dejar de seguir. */
function MenuFila({ onDejar }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => {
      if (!caja.current?.contains(e.target)) setAbierto(false);
    };
    const tecla = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('mousedown', fuera);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('mousedown', fuera);
      window.removeEventListener('keydown', tecla);
    };
  }, [abierto]);
  return (
    <div ref={caja} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        style={{ width: 32, height: 32, borderRadius: 7, border: 'none', background: abierto ? '#f4f3ee' : 'transparent', color: GRIS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <i className="ti ti-dots" style={{ fontSize: 16 }} aria-hidden="true"></i>
      </button>
      {abierto && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 36, background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.10)', padding: 5, zIndex: 20, minWidth: 170 }}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              onDejar();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', borderRadius: 7, padding: '8px 10px', font: 'inherit', fontSize: 13, color: '#1a1a18', textAlign: 'left' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f4f1')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <i className="ti ti-bell-off" style={{ fontSize: 15, color: GRIS }} aria-hidden="true"></i>
            Dejar de seguir
          </button>
        </div>
      )}
    </div>
  );
}

function Fila({ item, conCambio, conFoto, onDejar }) {
  const sub = [item.estado, item.activo === false ? 'concluido' : null].filter(Boolean).join(' · ');
  const fecha = cuando(item.ultima_novedad);
  const nueva = item.n_novedades > 0;
  const contenido = (
    <>
      <span style={{ display: 'block', fontWeight: nueva ? 600 : 500, lineHeight: 1.4 }}>{item.label}</span>
      {conCambio && item.ultimo_detalle && (
        <span style={{ display: 'block', fontSize: 12.5, color: '#3a3a36', marginTop: 3 }}>{item.ultimo_detalle}</span>
      )}
      {(sub || conCambio) && (
        <span style={{ display: 'block', fontSize: 12, color: GRIS, marginTop: 3 }}>
          {conCambio ? [item.fuente, sub].filter(Boolean).join(' · ') : sub}
        </span>
      )}
    </>
  );
  return (
    <div style={{ display: 'flex', gap: 14, padding: '12px 18px', borderTop: LINEA, alignItems: conFoto ? 'center' : 'flex-start' }}>
      {conFoto ? (
        <Avatar item={item} />
      ) : (
        <span
          aria-label={nueva ? 'Con novedades' : undefined}
          style={{ width: 8, height: 8, borderRadius: '50%', background: nueva ? MORADO : 'transparent', marginTop: 7, flexShrink: 0 }}
        ></span>
      )}
      {item.ruta ? (
        <Link href={item.ruta} style={{ flex: 1, minWidth: 0, color: '#1a1a18', textDecoration: 'none' }}>
          {contenido}
        </Link>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>{contenido}</div>
      )}
      {fecha && (
        <span style={{ fontSize: 12.5, color: nueva ? '#1a1a18' : GRIS, whiteSpace: 'nowrap', paddingTop: conFoto ? 0 : 2 }}>{fecha}</span>
      )}
      <MenuFila onDejar={onDejar} />
    </div>
  );
}

function Bloque({ titulo, derecha, children }) {
  return (
    <section style={CARD}>
      <h2 style={{ margin: 0, padding: '14px 18px 10px', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        {titulo}
        {derecha != null && <span style={{ fontSize: 12, fontWeight: 400, color: GRIS }}>{derecha}</span>}
      </h2>
      {children}
    </section>
  );
}

const VER_MAS = { display: 'block', width: '100%', textAlign: 'left', padding: '11px 18px', border: 'none', borderTop: LINEA, background: 'none', font: 'inherit', fontSize: 12.5, color: '#4b3bc4', cursor: 'pointer', borderRadius: '0 0 14px 14px' };

function Seguimiento() {
  const supabase = createClient();
  const sp = useSearchParams();
  const router = useRouter();

  const [items, setItems] = useState(null);
  const [consejo, setConsejo] = useState([]);
  const [soloNovedades, setSoloNovedades] = useState(false);
  const [fuente, setFuente] = useState(null);
  const [abiertos, setAbiertos] = useState(new Set());
  const [sinSesion, setSinSesion] = useState(false);

  useEffect(() => {
    if (sp?.get('ajustes') === '1' || sp?.get('alarmas') === '1') router.replace('/alarmas');
  }, [sp, router]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || null;
      if (!uid) {
        if (!cancelado) {
          setSinSesion(true);
          setItems([]);
        }
        return;
      }
      const [{ data: f }, { data: m }] = await Promise.all([
        supabase.from('my_follows').select('*').eq('user_id', uid).order('ultima_novedad', { ascending: false, nullsFirst: false }),
        supabase
          .from('sector_alert_matches')
          .select('id, alert_id, ref_id, titulo, ruta, created_at')
          .eq('kind', 'consejo')
          .eq('descartado', false)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      // Del acuerdo, el ministerio y la fecha del Consejo; de la alarma, el
      // nombre, para decir por qué sale.
      let acuerdos = [];
      let alarmas = [];
      const ids = [...new Set((m || []).map((x) => x.ref_id))];
      const alertIds = [...new Set((m || []).map((x) => x.alert_id).filter(Boolean))];
      if (ids.length || alertIds.length) {
        const [{ data: a }, { data: al }] = await Promise.all([
          ids.length ? supabase.from('consejo_acuerdos').select('id, titulo, ministerio, fecha_consejo').in('id', ids) : Promise.resolve({ data: [] }),
          alertIds.length ? supabase.from('sector_alerts').select('id, nombre').in('id', alertIds) : Promise.resolve({ data: [] }),
        ]);
        acuerdos = a || [];
        alarmas = al || [];
      }
      const porId = new Map(acuerdos.map((a) => [a.id, a]));
      const nombreAlarma = new Map(alarmas.map((a) => [a.id, a.nombre]));
      const vistos = new Set();
      const lista = [];
      for (const x of m || []) {
        if (vistos.has(x.ref_id)) continue;
        vistos.add(x.ref_id);
        const a = porId.get(x.ref_id);
        lista.push({
          id: x.ref_id,
          titulo: x.titulo || a?.titulo || 'Acuerdo del Consejo de Ministros',
          ministerio: a?.ministerio || null,
          alarma: nombreAlarma.get(x.alert_id) || null,
          fecha: a?.fecha_consejo || x.created_at,
          ruta: x.ruta || `/regulatorio/consejo/${encodeURIComponent(x.ref_id)}`,
        });
      }
      lista.sort((p, q) => String(q.fecha).localeCompare(String(p.fecha)));
      if (cancelado) return;
      setItems(f || []);
      setConsejo(lista);
    })();
    return () => {
      cancelado = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function dejarDeSeguir(item) {
    setItems((prev) => (prev || []).filter((i) => i.id !== item.id));
    const { error } = await supabase.from('follows').delete().eq('id', item.id);
    if (error) {
      toast.error('No se ha podido dejar de seguir');
      setItems((prev) => [...(prev || []), item]);
      return;
    }
    toast.info('Has dejado de seguirlo');
  }

  const todos = items || [];
  const conCambios = useMemo(
    () => todos.filter((i) => i.n_novedades > 0).sort((a, b) => String(b.ultima_novedad).localeCompare(String(a.ultima_novedad))),
    [todos]
  );

  // Bloques: uno por fuente para lo que se tramita, uno para personas e
  // instituciones y el del Consejo.
  const bloques = useMemo(() => {
    const m = new Map();
    for (const i of todos) {
      const k = i.es_actor ? PERSONAS : i.fuente || 'Otros';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
    const orden = (k) => {
      if (k === PERSONAS) return 100;
      const n = ORDEN_FUENTES.indexOf(k);
      return n === -1 ? 50 : n;
    };
    return [...m.entries()].sort((a, b) => orden(a[0]) - orden(b[0]));
  }, [todos]);

  const opcionesFuente = useMemo(() => {
    const l = bloques.map(([k, v]) => ({ v: k, label: `${k} (${v.length})` }));
    l.push({ v: CONSEJO, label: CONSEJO });
    return l;
  }, [bloques]);

  const ver = (k) => !fuente || fuente === k;
  const pasaFiltro = (i) => !soloNovedades || i.n_novedades > 0;

  if (sinSesion) {
    return (
      <div className="sec" style={{ maxWidth: 880 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-bell"></i>
            Inicia sesión para ver lo que sigues.
          </div>
        </div>
      </div>
    );
  }

  const segmento = (on) => ({
    font: 'inherit',
    fontSize: 12.5,
    padding: '6px 12px',
    borderRadius: 7,
    border: 'none',
    cursor: 'pointer',
    background: on ? '#fff' : 'transparent',
    boxShadow: on ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
    color: '#1a1a18',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="sec" style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>Seguimiento</h1>
          <p style={{ fontSize: 13, color: GRIS, margin: '4px 0 0' }}>
            {items === null
              ? '—'
              : todos.length === 0
                ? 'Aún no sigues nada.'
                : `${todos.length} ${todos.length === 1 ? 'asunto' : 'asuntos'}${
                    conCambios.length ? ` · ${conCambios.length} con cambios desde tu última visita` : ''
                  }`}
          </p>
        </div>
        {todos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div role="group" aria-label="Ver" style={{ display: 'flex', background: '#e6e4dc', borderRadius: 9, padding: 3 }}>
              <button type="button" aria-pressed={!soloNovedades} onClick={() => setSoloNovedades(false)} style={segmento(!soloNovedades)}>
                Todo
              </button>
              <button type="button" aria-pressed={soloNovedades} onClick={() => setSoloNovedades(true)} style={segmento(soloNovedades)}>
                Con novedades{conCambios.length ? ` · ${conCambios.length}` : ''}
              </button>
            </div>
            <div style={{ width: 230 }}>
              <Desplegable value={fuente} onChange={setFuente} opciones={opcionesFuente} vacio="Todas las fuentes" placeholder="Todas las fuentes" />
            </div>
          </div>
        )}
      </div>

      {items === null ? (
        <div className="spinner"></div>
      ) : todos.length === 0 ? (
        <div style={{ ...CARD, padding: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Sigue lo que te importa</div>
          <div style={{ fontSize: 13, color: GRIS, lineHeight: 1.6, margin: '6px 0 14px' }}>
            Pulsa <span style={{ color: MORADO }}>Seguir</span> en cualquier ley, comisión o persona y te avisaremos cuando cambie de fase, se
            designen ponentes o se acerque un plazo.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/congreso" style={{ fontSize: 13, color: '#4b3bc4', background: '#f0eefe', padding: '8px 13px', borderRadius: 8, textDecoration: 'none' }}>
              Ver leyes en trámite
            </Link>
            <Link href="/institutions" style={{ fontSize: 13, color: '#3a3a36', background: '#f5f4f1', padding: '8px 13px', borderRadius: 8, textDecoration: 'none' }}>
              Explorar instituciones
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!fuente && conCambios.length > 0 && (
            <Bloque titulo="Con cambios" derecha={`${conCambios.length}`}>
              {conCambios.map((i) => (
                <Fila key={i.id} item={i} conCambio conFoto={i.es_actor} onDejar={() => dejarDeSeguir(i)} />
              ))}
            </Bloque>
          )}

          {bloques.map(([k, lista]) => {
            if (!ver(k)) return null;
            // Lo que ya sale arriba, en «Con cambios», no se repite aquí
            // salvo que se esté mirando una sola fuente.
            const base = lista.filter(pasaFiltro).filter((i) => fuente || soloNovedades || !(i.n_novedades > 0));
            if (!base.length) return null;
            const abierto = abiertos.has(k) || !!fuente;
            const visibles = abierto ? base : base.slice(0, POR_BLOQUE);
            const esPersonas = k === PERSONAS;
            return (
              <Bloque key={k} titulo={k} derecha={lista.length}>
                {visibles.map((i) => (
                  <Fila key={i.id} item={i} conCambio={esPersonas || soloNovedades} conFoto={esPersonas} onDejar={() => dejarDeSeguir(i)} />
                ))}
                {base.length > POR_BLOQUE && !fuente && (
                  <button
                    type="button"
                    onClick={() =>
                      setAbiertos((s) => {
                        const n = new Set(s);
                        if (n.has(k)) n.delete(k);
                        else n.add(k);
                        return n;
                      })
                    }
                    style={VER_MAS}
                  >
                    {abierto ? 'Ver menos' : `Ver ${base.length - POR_BLOQUE} más`}
                  </button>
                )}
              </Bloque>
            );
          })}

          {ver(CONSEJO) && !soloNovedades && (
            <Bloque titulo={CONSEJO} derecha="lo que te afecta">
              {consejo.length === 0 ? (
                <div style={{ padding: '12px 18px 16px', borderTop: LINEA, fontSize: 13, color: GRIS }}>
                  Ningún acuerdo reciente coincide con tus alarmas.{' '}
                  <Link href="/alarmas" style={{ color: '#4b3bc4', textDecoration: 'none' }}>
                    Revisar alarmas
                  </Link>
                </div>
              ) : (
                (fuente === CONSEJO ? consejo : consejo.slice(0, 5)).map((a) => (
                  <div key={a.id} style={{ display: 'flex', gap: 14, padding: '12px 18px', borderTop: LINEA, alignItems: 'flex-start' }}>
                    <Link href={a.ruta} style={{ flex: 1, minWidth: 0, color: '#1a1a18', textDecoration: 'none' }}>
                      <span style={{ display: 'block', fontWeight: 500, lineHeight: 1.4 }}>{a.titulo}</span>
                      <span style={{ display: 'block', fontSize: 12, color: GRIS, marginTop: 3 }}>
                        {[a.ministerio, a.alarma ? `Coincide con tu alarma «${a.alarma}»` : null].filter(Boolean).join(' · ')}
                      </span>
                    </Link>
                    <span style={{ fontSize: 12.5, color: GRIS, whiteSpace: 'nowrap', paddingTop: 2 }}>{cuando(a.fecha)}</span>
                  </div>
                ))
              )}
              <Link href="/regulatorio" style={{ ...VER_MAS, textDecoration: 'none' }}>
                Ver todas las referencias del Consejo en Regulatorio
              </Link>
            </Bloque>
          )}
        </div>
      )}
    </div>
  );
}
