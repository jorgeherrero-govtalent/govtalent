'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { frasePlazo } from '@/lib/plazos';
import FollowButton from '@/components/FollowButton';

/**
 * Home.
 *
 * Antes era una lista de listas: cuatro pestañas, cuatro barras y tres
 * ofertas, todo del mismo tamaño. Cuando todo pesa igual, el ojo no sabe
 * dónde ir y la página acaba sin decir nada.
 *
 * Ahora es un mosaico donde el tamaño es el mensaje: lo que cierra antes
 * ocupa la tarjeta grande, lo que la plataforma ha deducido va en negro,
 * y el resto acompaña en piezas pequeñas.
 *
 * Todas las cifras salen de consultas reales. Cuando una no se puede
 * calcular se queda en null y la tarjeta enseña un guion: poner un cero
 * sería afirmar que no hay nada, y no es lo mismo que no saberlo.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function haceDiasISO(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

/** Identidad de un asunto: el par kind + ref_id, que es como lo nombran las tres vistas. */
function clave(kind, refId) {
  return `${kind}:${refId}`;
}

function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function fechaLarga() {
  const d = new Date();
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}`;
}

function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/**
 * Cómo se nombra un plazo en la columna de la izquierda.
 *
 * "Hoy" y "mañana" antes que la fecha: son las dos únicas etiquetas que
 * se leen sin tener que calcular nada.
 */
function etiquetaPlazo(iso, dias) {
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return fechaCorta(iso) || `${dias} días`;
}

/**
 * Qué contador enseñar en una oferta.
 *
 * Las candidaturas dicen cuánta competencia hay, que es más útil que las
 * visitas. Pero solo cuando hay varias: "1 candidatura" no informa. Y las
 * visitas solo a partir de diez: hay ofertas con 2 y otras con 77, y
 * enseñar el 2 resta.
 */
function interes(v) {
  const cand = v.application_count || 0;
  const vistas = v.views_count || 0;
  if (cand >= 3) return `${cand} candidaturas`;
  if (vistas >= 10) return `${vistas} personas la han visto`;
  return null;
}

const BENTO = { background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const CABECERA = { fontSize: 13.5, fontWeight: 600, letterSpacing: '-.1px' };
const ENLACE = { fontSize: 12, color: '#8b8780', textDecoration: 'none' };
const BANDERA = { position: 'absolute', top: 16, right: 16, display: 'block' };

const ESTRELLAS = [
  [9, 3], [10.5, 3.4], [11.6, 4.5], [12, 6], [11.6, 7.5], [10.5, 8.6],
  [9, 9], [7.5, 8.6], [6.4, 7.5], [6, 6], [6.4, 4.5], [7.5, 3.4],
];

/** Banderas a 11 px: marca de origen del dato, no contenido. */
function Bandera({ pais }) {
  if (pais === 'ue') {
    return (
      <svg viewBox="0 0 18 12" width="11" height="7.3" role="img" aria-label="Unión Europea" style={BANDERA}>
        <rect width="18" height="12" rx="2" fill="#003399" />
        <g fill="#FFCC00">
          {ESTRELLAS.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="0.5" />
          ))}
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 12" width="11" height="7.3" role="img" aria-label="España" style={BANDERA}>
      <rect width="18" height="12" rx="2" fill="#C60B1E" />
      <rect y="3" width="18" height="6" fill="#FFC400" />
    </svg>
  );
}

/** Una cifra, su rótulo y la bandera de quién la produce. */
function TarjetaCifra({ valor, rotulo, bandera, href }) {
  return (
    <Link
      href={href}
      className="bento"
      style={{
        ...BENTO,
        padding: '18px 20px',
        position: 'relative',
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <Bandera pais={bandera} />
      <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, letterSpacing: '-.5px' }}>
        {valor === null || valor === undefined ? '—' : valor}
      </div>
      <div style={{ fontSize: 11.5, color: '#8b8780', paddingTop: 6, lineHeight: 1.4 }}>{rotulo}</div>
    </Link>
  );
}

/**
 * Anillo de actividad por fuente.
 *
 * Cuatro tonos del morado y no cuatro colores distintos: todo esto es
 * dato agregado por la plataforma, y un arcoíris haría pensar que cada
 * segmento es de otra naturaleza.
 *
 * Los segmentos se dibujan sobre una circunferencia de longitud 100
 * (r = 15.915), así que cada dasharray es directamente su porcentaje y
 * no hay que calcular arcos.
 */
function AnilloActividad({ datos }) {
  const TONOS = ['#6d5aef', '#8f7ff5', '#b3a8f7', '#d8d2fb'];
  const total = datos.reduce((s, d) => s + (d.valor || 0), 0);

  let acumulado = 0;
  const segmentos = datos.map((d, i) => {
    const pct = total > 0 ? ((d.valor || 0) / total) * 100 : 0;
    const seg = { pct, offset: 25 - acumulado, tono: TONOS[i] };
    acumulado += pct;
    return seg;
  });

  return (
    <div className="bento" style={{ ...BENTO, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg
        viewBox="0 0 42 42"
        width="92"
        height="92"
        role="img"
        aria-label="Reparto de la actividad por fuente en los últimos 30 días"
        style={{ flexShrink: 0, display: 'block' }}
      >
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f2f0ec" strokeWidth="5" />
        {total > 0 &&
          segmentos.map((s, i) => (
            <circle
              key={i}
              cx="21"
              cy="21"
              r="15.915"
              fill="none"
              stroke={s.tono}
              strokeWidth="5"
              strokeDasharray={`${s.pct} ${100 - s.pct}`}
              strokeDashoffset={s.offset}
            />
          ))}
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: '#8b8780', marginBottom: 9, lineHeight: 1.4 }}>
          Actividad en los últimos 30 días
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 10px' }}>
          {datos.map((d, i) => (
            <div key={d.clave} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }} title={`${d.titulo}: ${d.valor}`}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: TONOS[i], flexShrink: 0 }}></span>
              <span>{d.clave}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const supabase = createClient();

  const [resumen, setResumen] = useState(null);
  const [nombre, setNombre] = useState('');
  const [plazos, setPlazos] = useState([]);
  const [novedades, setNovedades] = useState([]);
  const [sector, setSector] = useState([]);
  const [temas, setTemas] = useState([]);
  const [seguidos, setSeguidos] = useState([]);
  const [desdeTemas, setDesdeTemas] = useState(false);
  const [cifras, setCifras] = useState({ leyes: null, ue: null, consultas: null, boe: null });
  const [actividad, setActividad] = useState(null);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    fetch('/api/radar/summary')
      .then((r) => r.json())
      .then((d) => {
        setResumen(d);
        setNombre(d?.perfil?.nombre || '');
      })
      .catch(() => setResumen({}));

    (async () => {
      const hoy = hoyISO();
      const hace30 = haceDiasISO(30);

      const [
        { data: es },
        { data: eu },
        { data: nov },
        leyes,
        procedimientos,
        expedientes,
        consultas,
        boeHoy,
        actCd,
        actPe,
        actCe,
        actBoe,
        { data: sec },
        { data: porTema },
        { data: sigue },
      ] = await Promise.all([
        // Plazos españoles: leyes con enmiendas abiertas.
        supabase
          .from('es_initiatives_directory')
          .select('num_expediente, slug, title, comision, plazo_enmiendas, dias_plazo')
          .not('dias_plazo', 'is', null)
          .eq('is_blocked', false)
          .order('dias_plazo', { ascending: true })
          // 40 y no 6: esta lista también sirve para emparejar el asunto
          // del sector con su kind y su refId, y con seis apenas casaba.
          .limit(40),
        // Y europeos: consultas abiertas de la Comisión.
        supabase
          .from('eu_initiatives_directory')
          .select('id, slug, title, act_type, feedback_end, dias_restantes')
          .eq('is_open', true)
          .not('dias_restantes', 'is', null)
          .order('dias_restantes', { ascending: true })
          .limit(40),
        supabase
          .from('my_follow_events')
          .select('event_id, kind, title, detail, occurred_at, es_nueva')
          .eq('es_nueva', true)
          .order('occurred_at', { ascending: false })
          .limit(4),

        // --- Las cuatro cifras ---
        supabase.from('es_initiatives').select('num_expediente', { count: 'exact', head: true }).eq('is_closed', false),
        // "Actos jurídicos en la UE" suma las dos patas del proceso
        // legislativo europeo: lo que tramita el Parlamento y lo que abre
        // la Comisión. Por separado, ninguna de las dos dice gran cosa a
        // quien mira desde fuera.
        supabase.from('ep_procedures').select('process_id', { count: 'exact', head: true }).eq('is_closed', false),
        supabase.from('eu_initiatives_directory').select('id', { count: 'exact', head: true }).eq('is_open', true),
        // Consultas públicas españolas. Se cuenta sobre la vista y no
        // sobre la tabla porque el estado se calcula allí a partir de
        // fecha_fin: repetir ese cálculo aquí sería garantizar que algún
        // día dejen de coincidir.
        supabase.from('consultas_estado').select('*', { count: 'exact', head: true }).in('estado', ['abierta', 'urgente']),
        supabase.from('boe_documents').select('id', { count: 'exact', head: true }).eq('fecha_publicacion', hoy),

        // --- El anillo: actividad de los últimos 30 días ---
        supabase.from('es_initiatives').select('num_expediente', { count: 'exact', head: true }).gte('fecha_presentacion', hace30),
        supabase.from('ep_procedures').select('process_id', { count: 'exact', head: true }).gte('last_activity_at', hace30),
        // En la Comisión se filtra por created_at y no por updated_at: el
        // sync hace upsert con onConflict, así que updated_at se toca en
        // cada pasada y contaría el directorio entero como actividad.
        supabase.from('eu_initiatives_directory').select('id', { count: 'exact', head: true }).gte('created_at', hace30),
        supabase.from('boe_documents').select('id', { count: 'exact', head: true }).gte('fecha_publicacion', hace30),

        // Las tres fuentes que deciden la tarjeta grande, en paralelo y
        // no en cascada: hacen falta las tres a la vez para cruzarlas.
        supabase
          .from('sector_matches')
          .select('*')
          .order('relevancia', { ascending: false })
          .order('plazo', { ascending: true, nullsFirst: false })
          .limit(60),
        supabase
          .from('asuntos_de_mis_temas')
          .select('*')
          .order('plazo', { ascending: true, nullsFirst: false })
          .limit(60),
        // Solo asuntos: un diputado seguido no tiene plazo que vencer.
        supabase.from('my_follows').select('kind, ref_id').eq('es_actor', false).eq('activo', true),
      ]);

      // Los dos orígenes se mezclan y se ordenan por lo que cierra antes:
      // a quien mira le da igual de qué institución venga.
      const todos = [
        ...(es || []).map((r) => ({
          id: `es-${r.num_expediente}`,
          dias: r.dias_plazo,
          fecha: r.plazo_enmiendas,
          title: r.title,
          fuente: ['Congreso', r.comision].filter(Boolean).join(' · '),
          ruta: `/congreso/${r.slug}`,
          kind: 'ley',
          refId: r.num_expediente,
        })),
        ...(eu || []).map((r) => ({
          id: `eu-${r.id}`,
          dias: r.dias_restantes,
          fecha: r.feedback_end,
          title: r.title,
          fuente: ['Comisión Europea', r.act_type].filter(Boolean).join(' · '),
          ruta: `/initiatives/${r.slug}`,
          kind: 'expediente',
          refId: String(r.id),
        })),
      ].sort((a, b) => a.dias - b.dias);

      setPlazos(todos);
      setNovedades(nov || []);

      const ep = procedimientos.count;
      const ce = expedientes.count;
      setCifras({
        leyes: leyes.count ?? null,
        ue: ep == null || ce == null ? null : ep + ce,
        consultas: consultas.count ?? null,
        boe: boeHoy.count ?? null,
      });

      setActividad([
        { clave: 'CD', titulo: 'Congreso de los Diputados', valor: actCd.count ?? 0 },
        { clave: 'PE', titulo: 'Parlamento Europeo', valor: actPe.count ?? 0 },
        { clave: 'BOE', titulo: 'Boletín Oficial del Estado', valor: actBoe.count ?? 0 },
        { clave: 'CE', titulo: 'Comisión Europea', valor: actCe.count ?? 0 },
      ]);

      setSector(sec || []);
      setTemas(porTema || []);
      setSeguidos(sigue || []);
      setDesdeTemas((sec || []).length === 0 && (porTema || []).length > 0);

      setCargado(true);
    })();
  }, []);

  /**
   * Qué ocupa la tarjeta grande.
   *
   * EL TEMA ES UN FILTRO, NO UN CRITERIO DE ORDEN. Esta es la regla que
   * antes estaba mal: se ordenaba por fecha entre todo lo abierto, así
   * que cualquier asunto que cerrara pronto se colaba en la tarjeta
   * aunque no tuviera nada que ver con el usuario. Ahora, lo que no toca
   * uno de sus temas no puede llegar aquí ni cerrando esta tarde.
   *
   * La cadena, en este orden:
   *   1. Lo que sigue y además toca un tema suyo.
   *   2. Si no sigue nada de eso, lo que toca un tema suyo.
   *   3. Y solo si nada encaja, lo más urgente del regulatorio general,
   *      diciendo claramente que es general y no suyo.
   *
   * Dentro de cada eslabón manda la fecha, que es lo accionable.
   */
  const misAsuntos = useMemo(() => {

    // Los dos orígenes temáticos se funden por kind + ref_id. El
    // análisis pisa a la coincidencia por palabras cuando hay ambos:
    // sabe por qué te afecta y lo dice en el motivo.
    const porClave = new Map();
    for (const t of temas) {
      if (!t.kind || !t.ref_id) continue;
      porClave.set(clave(t.kind, t.ref_id), {
        titulo: t.titulo,
        motivo: t.motivo || null,
        temas: Array.isArray(t.temas) ? t.temas : null,
        plazo: t.plazo,
        ruta: t.ruta,
        kind: t.kind,
        refId: t.ref_id,
        fuente: t.fuente,
        origen: 'temas',
      });
    }
    for (const m of sector) {
      if (!m.kind || !m.ref_id) continue;
      // Relevancia 1 es "contexto útil" según el propio prompt del
      // análisis. Útil para leer, no para ocupar la tarjeta grande.
      if ((Number(m.relevancia) || 0) < 2) continue;
      porClave.set(clave(m.kind, m.ref_id), {
        titulo: m.titulo,
        motivo: m.motivo || null,
        temas: null,
        plazo: m.plazo,
        ruta: m.ruta,
        kind: m.kind,
        refId: m.ref_id,
        fuente: m.fuente,
        relevancia: Number(m.relevancia) || null,
        origen: 'analisis',
      });
    }

    return [...porClave.values()]
      .filter((a) => a.plazo && diasHasta(a.plazo) !== null && diasHasta(a.plazo) >= 0)
      .sort((a, b) => diasHasta(a.plazo) - diasHasta(b.plazo));
  }, [sector, temas]);

  /** Lo que la plataforma ha deducido, en una línea. Va en la tarjeta negra. */
  const lectura = useMemo(() => {
    if (!cargado) return 'Preparando tu resumen…';
    // Cuenta exactamente lo mismo que alimenta la tarjeta grande: si
    // aquí saliera un número mayor, el usuario buscaría asuntos que la
    // otra tarjeta nunca le va a enseñar.
    if (misAsuntos.length > 0) {
      const min = diasHasta(misAsuntos[0].plazo);
      return `${misAsuntos.length} ${
        misAsuntos.length === 1 ? 'asunto de tus temas tiene' : 'asuntos de tus temas tienen'
      } plazo abierto. El más urgente cierra ${frasePlazo(min)}.`;
    }
    if (novedades.length > 0) {
      return `${novedades.length} ${
        novedades.length === 1 ? 'novedad' : 'novedades'
      } en lo que sigues desde tu última visita.`;
    }
    if (plazos.length > 0) {
      return plazos[0].dias === 0
        ? 'Nada de tus temas hoy. El plazo más próximo del regulatorio vence hoy.'
        : `Nada de tus temas ahora mismo. El plazo más próximo del regulatorio vence ${frasePlazo(plazos[0].dias)}.`;
    }
    return 'Sin plazos abiertos ahora mismo.';
  }, [cargado, misAsuntos, novedades, plazos]);

  const urgente = useMemo(() => {
    const sigueClaves = new Set(
      (seguidos || []).filter((f) => f.kind && f.ref_id).map((f) => clave(f.kind, f.ref_id))
    );

    // Eslabón 1: lo que sigue y además toca un tema suyo.
    const seguidoConTema = misAsuntos.find((a) => sigueClaves.has(clave(a.kind, a.refId)));
    // Eslabón 2: lo que toca un tema suyo, siga o no.
    const elegido = seguidoConTema || misAsuntos[0];

    if (elegido) {
      return {
        ...elegido,
        title: elegido.titulo,
        fecha: elegido.plazo,
        dias: diasHasta(elegido.plazo),
        ruta: elegido.ruta || '/regulatorio/sector',
        seguido: Boolean(seguidoConTema),
      };
    }

    // Eslabón 3: nada encaja. Se enseña lo general y se dice que lo es.
    return plazos[0] ? { ...plazos[0], motivo: null, temas: null, origen: 'general', seguido: false } : null;
  }, [misAsuntos, seguidos, plazos]);

  const vacantes = resumen?.vacantes_recomendadas || [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '26px 20px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>
          Hola{nombre ? `, ${nombre}` : ''}
        </h1>
        <p style={{ fontSize: 13.5, color: '#8b8780', margin: '4px 0 0', lineHeight: 1.55 }}>
          {fechaLarga()}
          {cargado && misAsuntos.length > 0
            ? ` · ${misAsuntos.length} ${misAsuntos.length === 1 ? 'asunto' : 'asuntos'} de tus temas con plazo abierto`
            : ''}
        </p>
      </div>

      {/* Sin análisis de sector no hay mosaico que valga: la tarjeta negra
          vive de ahí. Se pide como acción principal, y también cuando lo
          que se ve viene solo de los temas del onboarding, que es una
          aproximación por palabras y no el análisis de verdad. */}
      {cargado && (sector.length === 0 || desdeTemas) && (
        <div style={{ ...BENTO, padding: 20, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: '#f0eefe',
                color: '#6d5aef',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className="ti ti-sparkles" style={{ fontSize: 16 }}></i>
            </span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.1px' }}>
                ¿Y a tu organización qué le afecta?
              </div>
              <div style={{ fontSize: 12, color: '#8b8780', marginTop: 3, lineHeight: 1.5 }}>
                Analizamos los proyectos normativos abiertos y te decimos qué te toca, con el motivo.
              </div>
            </div>
            <Link
              href="/regulatorio/sector"
              style={{
                background: '#6d5aef',
                color: '#fff',
                borderRadius: 8,
                padding: '9px 16px',
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Analizar mi sector
            </Link>
          </div>
        </div>
      )}

      {/* Fila 1: lo que cierra antes, grande. Al lado, lo deducido y el
          reparto de actividad. */}
      <div className="bento-fila" style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 14, marginBottom: 14 }}>
        <div
          className="bento"
          style={{ ...BENTO, padding: '24px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
        >
          {urgente ? (
            <>
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    background: '#f0eefe',
                    color: '#3c3489',
                    borderRadius: 20,
                    padding: '4px 12px',
                    fontSize: 11,
                    marginBottom: 14,
                  }}
                >
                  {urgente.seguido
                    ? 'Lo más urgente que sigues'
                    : urgente.origen === 'analisis'
                      ? 'Lo más urgente de tu sector'
                      : urgente.origen === 'temas'
                        ? 'Lo más urgente de tus temas'
                        : 'Lo más urgente del regulatorio'}
                </span>
                <Link href={urgente.ruta} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div style={{ fontSize: 19, lineHeight: 1.4, fontWeight: 600, letterSpacing: '-.2px' }}>
                    {urgente.title}
                  </div>
                </Link>
                {urgente.motivo ? (
                  <div style={{ fontSize: 13, color: '#8b8780', lineHeight: 1.6, paddingTop: 10 }}>{urgente.motivo}</div>
                ) : urgente.temas && urgente.temas.length > 0 ? (
                  <div style={{ fontSize: 13, color: '#8b8780', lineHeight: 1.6, paddingTop: 10 }}>
                    Toca {urgente.temas.slice(0, 2).join(' y ')}.
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: '#a8a49c', lineHeight: 1.6, paddingTop: urgente.motivo ? 6 : 10 }}>
                  {urgente.fuente}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  marginTop: 22,
                  paddingTop: 18,
                  borderTop: '.5px solid #f2f0ec',
                }}
              >
                <div>
                  <div style={{ fontSize: 24, color: '#6d5aef', fontWeight: 600, lineHeight: 1 }}>
                    {etiquetaPlazo(urgente.fecha, urgente.dias)}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8b8780', paddingTop: 3 }}>cierre de alegaciones</div>
                </div>
                {urgente.kind && urgente.refId && (
                  <div style={{ marginLeft: 'auto' }}>
                    {/* Variante completa y no "icon": la de icono no trae el
                        botón de proyecto, que es justo el que hace falta aquí. */}
                    <FollowButton kind={urgente.kind} refId={urgente.refId} label={urgente.title} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#8b8780', lineHeight: 1.6 }}>
              {cargado ? (
                <>
                  No hay plazos abiertos ahora mismo.{' '}
                  <Link href="/regulatorio" style={{ color: '#6d5aef', textDecoration: 'none' }}>
                    Ver el regulatorio
                  </Link>
                </>
              ) : (
                'Cargando…'
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 14 }}>
          <div className="bento" style={{ background: '#15140f', borderRadius: 16, padding: '20px 22px' }}>
            <div style={{ fontSize: 11.5, color: '#8f7ff5', letterSpacing: '.3px', marginBottom: 10 }}>
              QUÉ IMPACTA EN TU SECTOR
            </div>
            <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.5 }}>{lectura}</div>
          </div>
          {actividad ? (
            <AnilloActividad datos={actividad} />
          ) : (
            <div className="bento" style={{ ...BENTO, padding: '18px 22px' }}>
              <div style={{ fontSize: 12.5, color: '#8b8780' }}>Actividad en los últimos 30 días</div>
            </div>
          )}
        </div>
      </div>

      {/* Fila 2: el tamaño del sector, en cuatro cifras. */}
      <div className="bento-cifras" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <TarjetaCifra valor={cifras.ue} rotulo="Actos jurídicos en la UE" bandera="ue" href="/initiatives" />
        <TarjetaCifra valor={cifras.leyes} rotulo="Leyes en Congreso" bandera="es" href="/congreso" />
        <TarjetaCifra valor={cifras.consultas} rotulo="Consultas públicas" bandera="es" href="/regulatorio/consultas" />
        <TarjetaCifra valor={cifras.boe} rotulo="BOE hoy" bandera="es" href="/boe" />
      </div>

      {/* Fila 3: lo que hay que hacer y lo que puede interesar. */}
      <div className="bento-fila" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="bento" style={{ ...BENTO, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 10 }}>
            <div style={CABECERA}>Plazos más próximos</div>
            <Link href="/regulatorio" style={ENLACE}>
              Ver todos
            </Link>
          </div>
          {plazos.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6 }}>
              {cargado ? 'Ninguno abierto ahora mismo.' : 'Cargando…'}
            </div>
          ) : (
            plazos.slice(0, 4).map((p, i) => (
              <Link
                key={p.id}
                href={p.ruta}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'baseline',
                  padding: i === 0 ? '0 0 11px' : '11px 0',
                  borderTop: i === 0 ? 'none' : '.5px solid #f2f0ec',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ fontSize: 11.5, color: p.dias <= 1 ? '#6d5aef' : '#8b8780', width: 64, flexShrink: 0 }}>
                  {etiquetaPlazo(p.fecha, p.dias)}
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.45 }}>{p.title}</span>
              </Link>
            ))
          )}
        </div>

        <div className="bento" style={{ ...BENTO, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 10 }}>
            <div style={CABECERA}>Oportunidades para ti</div>
            <Link href="/jobs" style={ENLACE}>
              Ver empleos
            </Link>
          </div>
          {vacantes.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6 }}>
              Todavía no hay ofertas que encajen con tu perfil.
            </div>
          ) : (
            vacantes.slice(0, 3).map((v, i) => (
              <Link
                key={v.id}
                href={`/jobs?job=${v.id}`}
                style={{
                  display: 'flex',
                  gap: 11,
                  alignItems: 'center',
                  padding: i === 0 ? '0 0 11px' : '11px 0',
                  borderTop: i === 0 ? 'none' : '.5px solid #f2f0ec',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 7,
                    background: '#f5f4f1',
                    flexShrink: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {v.organization_logo ? (
                    <img src={v.organization_logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <i className="ti ti-building" style={{ fontSize: 14, color: '#a8a49c' }}></i>
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.4 }}>{v.title}</div>
                  <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 2 }}>
                    {[v.organization_name, v.location].filter(Boolean).join(' · ')}
                    {interes(v) && <span> · {interes(v)}</span>}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
