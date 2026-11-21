'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import AgenteAlarmasModal from '@/components/AgenteAlarmasModal';
import { PestanasRegulatorio } from '@/components/RegulatorioPortada';
import { etapaDe } from '@/lib/etapaNormativa';

/**
 * Dashboard de Regulatorio (20-11-2026, la pestaña se llamaba «Panel» en el canvas «Regulatorio, Panel de
 * monitorización»). Es la portada de /regulatorio; España y Unión
 * Europea, las portadas de fuentes de siempre, son las otras pestañas.
 *
 * Todo lo que enseña sale de datos reales. Si algo no se puede medir, no
 * se dibuja (ver el comentario de TRAZOS en RegulatorioPortada: nada de
 * gráficos de adorno con forma de dato).
 *
 *   Actividad general   panel_regulatorio_general (sql/140): igual para
 *                       todos. Serie de 30 días y cuatro contadores.
 *   Tus agentes         sector_alerts, sector_alert_matches (RLS) y
 *                       panel_regulatorio_revisados (sql/140).
 *
 * Definiciones:
 *   Asuntos revisados   los que han pasado por tus agentes en el periodo
 *                       (sector_alert_seen).
 *   Te afectan          lo encontrado en el periodo con relevancia 2 o 3
 *                       (la 1 es contexto útil: no avisa).
 *   Por revisar         lo mismo que la pestaña de Seguimiento: encontrado,
 *                       sin revisar, sin descartar y sin seguir.
 *   Plazos abiertos     lo encontrado, sin descartar, con plazo por vencer.
 *
 * Filtros: Periodo (hoy, 7 o 30 días), Ámbito (Estado, comunidades
 * autónomas, Unión Europea) y Agente. Periodo y Ámbito cambian todo el
 * panel; Agente, solo lo tuyo.
 */

const MORADO = '#6d5aef';
const MORADO_SUAVE = '#f0eefe';
const NEGRO = '#1a1a18';
const BORDE = '#e0dfd8';

const CARD = {
  background: '#fff',
  border: `.5px solid ${BORDE}`,
  borderRadius: 14,
  boxShadow: '0 1px 2px rgba(0,0,0,.04)',
};

const PERIODOS = [
  { dias: 1, etiqueta: 'Hoy', texto: 'hoy' },
  { dias: 7, etiqueta: '7 días', texto: 'en los últimos 7 días' },
  { dias: 30, etiqueta: '30 días', texto: 'en los últimos 30 días' },
];

const AMBITOS = [
  { value: 'estado', label: 'Estado' },
  { value: 'ccaa', label: 'Comunidades autónomas' },
  { value: 'ue', label: 'Unión Europea' },
];

// A qué ámbito pertenece cada tipo de asunto que encuentran los agentes.
const AMBITO_DE_KIND = {
  ley: 'estado',
  actividad: 'estado',
  boe: 'estado',
  consulta: 'estado',
  consejo: 'estado',
  agenda: 'estado',
  agenda_ccaa: 'ccaa',
  cnmc: 'estado',
  cargo: 'estado',
  ccaa: 'ccaa',
  ccaa_tramite: 'ccaa',
  diario: 'ccaa',
  expediente: 'ue',
  procedimiento: 'ue',
};

const FUENTE_DE_KIND = {
  ley: 'Congreso',
  actividad: 'Congreso',
  boe: 'BOE',
  consulta: 'Consultas públicas',
  consejo: 'Consejo de Ministros',
  agenda: 'Agenda del Gobierno',
  agenda_ccaa: 'Agendas autonómicas',
  cnmc: 'CNMC',
  ccaa: 'Parlamentos autonómicos',
  ccaa_tramite: 'Parlamentos autonómicos',
  diario: 'Boletines autonómicos',
  expediente: 'Comisión Europea',
  procedimiento: 'Parlamento Europeo',
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

// ---------------------------------------------------------------------
// Fechas, siempre en hora peninsular
// ---------------------------------------------------------------------

/** YYYY-MM-DD de una fecha en Europe/Madrid. */
function diaMadrid(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

/** Los n días que acaban hoy, del más antiguo al más reciente (YYYY-MM-DD). */
function ultimosDias(n, hoy) {
  const base = new Date(`${hoy}T12:00:00Z`);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function restaDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  return new Date(d.getTime() - n * 86400000).toISOString().slice(0, 10);
}

function fechaCorta(dia) {
  if (!dia) return '';
  const [, m, d] = String(dia).slice(0, 10).split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function haceCuanto(iso) {
  if (!iso) return 'todavía no';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

function horaMadrid(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
}

const miles = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-ES'));

// ---------------------------------------------------------------------
// Gráficos pequeños (SVG, sin librerías)
// ---------------------------------------------------------------------

/** Línea de una serie. Con todo a cero no se dibuja: una raya plana parecería un fallo. */
function Sparkline({ valores, ancho = 110, alto = 36, color = MORADO, relleno = false }) {
  if (!valores?.length || valores.every((v) => !v)) {
    return <span style={{ width: ancho, height: alto, display: 'block', flex: 'none' }} aria-hidden="true" />;
  }
  const max = Math.max(...valores);
  const pts = valores.map((v, i) => [
    valores.length === 1 ? ancho / 2 : (i / (valores.length - 1)) * (ancho - 4) + 2,
    alto - 3 - (v / (max || 1)) * (alto - 6),
  ]);
  const linea = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')} L${pts[pts.length - 1][0].toFixed(1)} ${alto} L${pts[0][0].toFixed(1)} ${alto} Z`;
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} width={ancho} height={alto} aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      {relleno && <path d={area} fill={color === MORADO ? MORADO_SUAVE : '#f0efe9'} />}
      <polyline points={linea} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Area({ serie }) {
  const W = 600;
  const H = 150;
  const max = Math.max(1, ...serie.map((x) => x.n));
  const pts = serie.map((x, i) => [(i / Math.max(1, serie.length - 1)) * W, H - 6 - (x.n / max) * (H - 16)]);
  const linea = `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}`;
  const area = `${linea} L${W} ${H} L0 ${H} Z`;
  const total = serie.reduce((s, x) => s + x.n, 0);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Movimientos diarios en los últimos ${serie.length} días: ${miles(total)} en total`}
      style={{ width: '100%', height: H, display: 'block' }}
    >
      <defs>
        <linearGradient id="gtPanelArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MORADO} stopOpacity="0.26" />
          <stop offset="1" stopColor={MORADO} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#f0efe9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={area} fill="url(#gtPanelArea)" />
      <path d={linea} fill="none" stroke={MORADO} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Anillo({ tramite, publicado }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const total = tramite + publicado;
  const t = total ? (tramite / total) * c : 0;
  const p = total ? (publicado / total) * c : 0;
  return (
    <div style={{ position: 'relative', width: 132, height: 132, flex: 'none' }}>
      <svg
        viewBox="0 0 132 132"
        width="132"
        height="132"
        role="img"
        aria-label={`${total} asuntos: ${tramite} en trámite y ${publicado} ya publicados`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle cx="66" cy="66" r={r} fill="none" stroke="#f0efe9" strokeWidth="14" />
        {t > 0 && <circle cx="66" cy="66" r={r} fill="none" stroke={MORADO} strokeWidth="14" strokeDasharray={`${t} ${c}`} />}
        {p > 0 && (
          <circle cx="66" cy="66" r={r} fill="none" stroke={NEGRO} strokeWidth="14" strokeDasharray={`${p} ${c}`} strokeDashoffset={-t} />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{total}</span>
        <span style={{ fontSize: 11, color: '#888' }}>{total === 1 ? 'asunto' : 'asuntos'}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------

function Titulo({ children, derecha }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{children}</h2>
      {derecha}
    </div>
  );
}

function Chip({ children, morado }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 10,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
        color: morado ? MORADO : '#57534e',
        background: morado ? MORADO_SUAVE : '#f0efe9',
      }}
    >
      {children}
    </span>
  );
}

function Variacion({ actual, anterior }) {
  if (anterior === null || anterior === undefined) return null;
  const d = actual - anterior;
  if (d === 0) return <Chip>Igual</Chip>;
  return <Chip morado={d > 0}>{d > 0 ? `+${miles(d)}` : `−${miles(Math.abs(d))}`}</Chip>;
}

function Esqueleto({ alto }) {
  return <div className="skel" style={{ height: alto, borderRadius: 14 }} />;
}

// ---------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------

export default function PanelRegulatorio() {
  const supabase = useMemo(() => createClient(), []);
  const [dias, setDias] = useState(7);
  const [ambitos, setAmbitos] = useState(new Set());
  const [agentesSel, setAgentesSel] = useState(new Set());
  const [general, setGeneral] = useState(null);
  const [mio, setMio] = useState(null);
  const [revisados, setRevisados] = useState(null);
  const [extra, setExtra] = useState({ inicio: new Map(), tipoConsulta: new Map() });
  const [tab, setTab] = useState('tramite');
  const [agente, setAgente] = useState(false);

  // Actividad general: cambia con el periodo.
  useEffect(() => {
    let vivo = true;
    setGeneral(null);
    supabase.rpc('panel_regulatorio_general', { p_dias: dias }).then(({ data }) => {
      if (vivo) setGeneral(data || {});
    });
    supabase.rpc('panel_regulatorio_revisados', { p_dias: Math.max(dias, 7) }).then(({ data }) => {
      if (vivo) setRevisados(data || []);
    });
    return () => {
      vivo = false;
    };
  }, [dias, supabase]);

  // Lo tuyo: agentes, lo que han encontrado y lo que sigues. No depende
  // del periodo: se filtra aquí.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        if (vivo) setMio({ alertas: [], matches: [], seguidos: new Set() });
        return;
      }
      const [{ data: al }, { data: m }, { data: f }] = await Promise.all([
        supabase
          .from('sector_alerts')
          .select('id, nombre, activa, pausada_por_plan, pausada_inactividad_at, evaluada_at, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: true }),
        supabase
          .from('sector_alert_matches')
          .select('alert_id, kind, ref_id, titulo, motivo, fuente, ruta, plazo, relevancia, created_at, descartado, revisado')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(3000),
        supabase.from('my_follows').select('kind, ref_id'),
      ]);
      if (!vivo) return;
      setMio({
        alertas: al || [],
        matches: m || [],
        seguidos: new Set((f || []).map((x) => `${x.kind}:${x.ref_id}`)),
      });
    })();
    return () => {
      vivo = false;
    };
  }, [supabase]);

  const hoy = general?.hoy || diaMadrid(new Date());
  const periodo = PERIODOS.find((p) => p.dias === dias) || PERIODOS[1];
  const desde = restaDias(hoy, dias - 1);
  const desdeAnterior = restaDias(hoy, 2 * dias - 1);
  const enAmbito = (a) => ambitos.size === 0 || ambitos.has(a);

  // ------------------------------------------------------------------
  // Lo tuyo, ya filtrado
  // ------------------------------------------------------------------
  const tuyo = useMemo(() => {
    if (!mio) return null;
    const alertas = mio.alertas.filter((a) => agentesSel.size === 0 || agentesSel.has(a.id));
    const ids = new Set(alertas.map((a) => a.id));
    const validos = mio.matches.filter(
      (m) => ids.has(m.alert_id) && !m.descartado && (ambitos.size === 0 || ambitos.has(AMBITO_DE_KIND[m.kind] || 'estado'))
    );

    // Una vez por asunto aunque lo hayan encontrado dos agentes.
    const porAsunto = new Map();
    for (const m of validos) {
      const k = `${m.kind}:${m.ref_id}`;
      const p = porAsunto.get(k);
      if (!p) {
        porAsunto.set(k, { ...m, clave: k, dia: diaMadrid(m.created_at), alertas: new Set([m.alert_id]) });
      } else {
        p.alertas.add(m.alert_id);
        if ((m.relevancia || 0) > (p.relevancia || 0)) p.motivo = m.motivo || p.motivo;
        p.relevancia = Math.max(p.relevancia || 0, m.relevancia || 0);
        p.revisado = p.revisado && m.revisado;
        if (m.created_at < p.created_at) {
          p.created_at = m.created_at;
          p.dia = diaMadrid(m.created_at);
        }
      }
    }
    const asuntos = [...porAsunto.values()];
    const enPeriodo = (x) => x.dia >= desde && x.dia <= hoy;
    const enAnterior = (x) => x.dia >= desdeAnterior && x.dia < desde;
    const afecta = (x) => (x.relevancia || 0) >= 2;

    const teAfectan = asuntos.filter((x) => afecta(x) && enPeriodo(x));
    const teAfectanAntes = asuntos.filter((x) => afecta(x) && enAnterior(x)).length;
    const porRevisar = asuntos.filter((x) => !x.revisado && !mio.seguidos.has(x.clave));
    const conPlazo = asuntos
      .map((x) => ({ ...x, quedan: diasHasta(x.plazo) }))
      .filter((x) => x.quedan !== null && x.quedan >= 0)
      .sort((a, b) => new Date(a.plazo) - new Date(b.plazo));

    // Revisados por día (todo el periodo y el anterior, para comparar).
    const rev = new Map();
    for (const r of revisados || []) {
      if (!ids.has(r.alert_id)) continue;
      rev.set(r.dia, (rev.get(r.dia) || 0) + Number(r.revisados || 0));
    }
    const diasGrafico = ultimosDias(Math.max(7, dias), hoy);
    const revSerie = diasGrafico.map((d) => rev.get(d) || 0);
    let revPeriodo = 0;
    let revAnterior = 0;
    for (const [d, n] of rev) {
      if (d >= desde && d <= hoy) revPeriodo += n;
      else if (d >= desdeAnterior && d < desde) revAnterior += n;
    }
    const afectanSerie = diasGrafico.map((d) => asuntos.filter((x) => afecta(x) && x.dia === d).length);

    // Qué te afecta: en trámite o ya publicado, y por fuente.
    const etapa = (x) => etapaDe(x.kind, x.titulo);
    const tramite = teAfectan.filter((x) => etapa(x) === 'tramite');
    const publicado = teAfectan.filter((x) => etapa(x) === 'publicado');
    // Lo ya publicado del periodo, con todo lo que encontraron los agentes:
    // lo que te afecta primero y, debajo, lo que es contexto (relevancia 1).
    const publicadoLista = asuntos
      .filter((x) => enPeriodo(x) && etapa(x) === 'publicado')
      .sort((p, q) => (q.relevancia || 0) - (p.relevancia || 0) || String(q.created_at).localeCompare(String(p.created_at)));
    const porFuente = (lista) => {
      const c = new Map();
      for (const x of lista) {
        const f = FUENTE_DE_KIND[x.kind] || String(x.fuente || 'Otras').split(', ')[0];
        c.set(f, (c.get(f) || 0) + 1);
      }
      return [...c.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n);
    };

    // Foco: lo encontrado por cada agente en el periodo frente al anterior.
    const foco = alertas
      .map((a) => {
        const suyos = asuntos.filter((x) => x.alertas.has(a.id));
        const ahora = suyos.filter(enPeriodo);
        const antes = suyos.filter(enAnterior).length;
        const destacado = [...ahora].sort(
          (p, q) => (q.relevancia || 0) - (p.relevancia || 0) || String(q.created_at).localeCompare(String(p.created_at))
        )[0];
        return {
          id: a.id,
          nombre: a.nombre,
          n: ahora.length,
          antes,
          serie: diasGrafico.map((d) => suyos.filter((x) => x.dia === d).length),
          destacado,
        };
      })
      .sort((p, q) => q.n - p.n);

    // Cada agente: estado, pasada, revisados y lo suyo.
    const agentes = alertas.map((a) => {
      const suyos = asuntos.filter((x) => x.alertas.has(a.id));
      const revA = new Map();
      for (const r of revisados || []) if (r.alert_id === a.id) revA.set(r.dia, Number(r.revisados || 0));
      let revisadosA = 0;
      for (const [d, n] of revA) if (d >= desde && d <= hoy) revisadosA += n;
      const afectanA = suyos.filter((x) => afecta(x) && enPeriodo(x)).length;
      let estado = 'Activo';
      if (a.pausada_por_plan) estado = 'Pausado por el plan';
      else if (a.pausada_inactividad_at) estado = 'Pausado por falta de uso';
      else if (!a.activa) estado = 'Pausado';
      return {
        id: a.id,
        nombre: a.nombre,
        activo: estado === 'Activo',
        estado,
        pasada: a.evaluada_at,
        revisados: revisadosA,
        afectan: afectanA,
        porRevisar: suyos.filter((x) => !x.revisado && !mio.seguidos.has(x.clave)).length,
        plazos: suyos.filter((x) => {
          const q = diasHasta(x.plazo);
          return q !== null && q >= 0;
        }).length,
        serie: diasGrafico.map((d) => revA.get(d) || 0),
      };
    });

    const ultimaPasada = mio.alertas.map((a) => a.evaluada_at).filter(Boolean).sort().pop() || null;

    return {
      hay: mio.alertas.length > 0,
      alertasTodas: mio.alertas,
      teAfectan: teAfectan.length,
      teAfectanAntes,
      afectanSerie,
      porRevisar: porRevisar.length,
      plazos: conPlazo,
      revPeriodo,
      revAnterior,
      revSerie,
      tramite: tramite.length,
      publicado: publicado.length,
      fuentesTramite: porFuente(tramite),
      fuentesPublicado: porFuente(publicado),
      publicadoLista,
      foco,
      agentes,
      ultimaPasada,
    };
  }, [mio, revisados, agentesSel, ambitos, dias, hoy, desde, desdeAnterior]);

  // Para la barra de cada plazo hace falta cuándo se abrió, y para la
  // etiqueta de las consultas, si es consulta previa o audiencia.
  const proximos = useMemo(() => (tuyo?.plazos || []).slice(0, 5), [tuyo]);
  const clavesProximos = proximos.map((x) => x.clave).join('|');
  useEffect(() => {
    if (!proximos.length) return;
    let vivo = true;
    const porKind = new Map();
    for (const x of proximos) {
      if (!porKind.has(x.kind)) porKind.set(x.kind, []);
      porKind.get(x.kind).push(x.ref_id);
    }
    const consultas = (porKind.get('consulta') || []).map(Number).filter(Boolean);
    Promise.all([
      ...[...porKind.entries()].map(([kind, refs]) =>
        supabase.from('regulatorio_search').select('kind, ref_id, fecha').eq('kind', kind).in('ref_id', refs)
      ),
      consultas.length
        ? supabase.from('consultas_estado').select('id, tipo').in('id', consultas)
        : Promise.resolve({ data: [] }),
    ]).then((res) => {
      if (!vivo) return;
      const inicio = new Map();
      for (const r of res.slice(0, -1)) for (const x of r.data || []) inicio.set(`${x.kind}:${x.ref_id}`, x.fecha);
      const tipoConsulta = new Map((res[res.length - 1].data || []).map((x) => [`consulta:${x.id}`, x.tipo]));
      setExtra({ inicio, tipoConsulta });
    });
    return () => {
      vivo = false;
    };
  }, [clavesProximos]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Actividad general, sumando los ámbitos marcados
  // ------------------------------------------------------------------
  const gen = useMemo(() => {
    if (!general?.serie) return null;
    const suma = (o, sufijo = '') =>
      ['estado', 'ccaa', 'ue'].reduce((s, a) => s + (enAmbito(a) && o?.[`${a}${sufijo}`] != null ? Number(o[`${a}${sufijo}`]) : 0), 0);
    const tiene = (o) => ['estado', 'ccaa', 'ue'].some((a) => enAmbito(a) && o?.[a] != null);
    const serie = (general.serie || []).map((x) => ({ d: x.d, n: suma(x) }));
    // El total y la comparación siguen al periodo: hoy frente a ayer, 7
    // frente a los 7 anteriores, 30 frente a los 30 anteriores. El gráfico
    // enseña el periodo; con «Hoy», los últimos 7 días para que haya forma.
    const ult = serie.slice(-dias);
    const prev = serie.slice(-2 * dias, -dias);
    const grafico = serie.slice(-Math.max(7, dias));
    const total = ult.reduce((s, x) => s + x.n, 0);
    const totalPrev = prev.reduce((s, x) => s + x.n, 0);
    const contador = (clave, etiqueta, icono, abierto, href) => {
      const o = general[clave];
      return {
        clave,
        etiqueta,
        icono,
        href,
        valor: tiene(o) ? suma(o) : null,
        hoy: tiene(o) ? suma(o, '_hoy') : 0,
        abierto,
      };
    };
    return {
      serie: grafico,
      total,
      cambio: totalPrev > 0 ? Math.round(((total - totalPrev) / totalPrev) * 100) : null,
      contadores: [
        contador('consultas', 'Consultas públicas abiertas', 'ti-message-2', true, '/regulatorio/consultas'),
        contador('audiencias', 'Audiencias públicas abiertas', 'ti-clipboard-text', true, '/regulatorio/consultas'),
        contador('leyes', 'Normas publicadas en BOE y boletines autonómicos', 'ti-file-text', false, '/boe'),
        contador('iniciativas', 'Iniciativas en Congreso, parlamentos autonómicos, PE y CE', 'ti-activity', false, '/regulatorio/espana'),
      ],
    };
  }, [general, ambitos, dias]); // eslint-disable-line react-hooks/exhaustive-deps

  const opcionesAgentes = (mio?.alertas || []).map((a) => ({ value: a.id, label: a.nombre }));
  const hayFiltros = ambitos.size > 0 || agentesSel.size > 0 || dias !== 7;
  const tituloFoco = dias === 1 ? 'Foco de hoy' : dias === 7 ? 'Foco de la semana' : 'Foco del mes';

  return (
    <div className="sec" style={{ maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>Actividad legislativa</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {tuyo?.ultimaPasada && (
            <span style={{ fontSize: 12, color: '#888' }}>
              Actualizado {diaMadrid(tuyo.ultimaPasada) === hoy ? `hoy a las ${horaMadrid(tuyo.ultimaPasada)}` : haceCuanto(tuyo.ultimaPasada)}
            </span>
          )}
          <button type="button" className="btn-ai" onClick={() => setAgente(true)}>
            <i className="ti ti-sparkles" aria-hidden="true"></i>
            Nuevo agente
          </button>
        </div>
      </div>

      <PestanasRegulatorio activa="panel" />

      {/* Filtros */}
      <div role="toolbar" aria-label="Filtros" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <div className="gt-seg" role="group" aria-label="Periodo">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              className={`gt-seg-it${dias === p.dias ? ' on' : ''}`}
              aria-pressed={dias === p.dias}
              onClick={() => setDias(p.dias)}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
        <MultiSelectFilter label="Ámbito" values={AMBITOS} selected={ambitos} onApply={setAmbitos} />
        {opcionesAgentes.length > 1 && (
          <MultiSelectFilter label="Agente" values={opcionesAgentes} selected={agentesSel} onApply={setAgentesSel} />
        )}
        {hayFiltros && (
          <button
            type="button"
            onClick={() => {
              setDias(7);
              setAmbitos(new Set());
              setAgentesSel(new Set());
            }}
            style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: '#888', cursor: 'pointer', padding: '7px 6px' }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 1. Actividad general */}
        {!gen ? (
          <Esqueleto alto={250} />
        ) : (
          <section aria-labelledby="pr-general" className="pr-general" style={{ ...CARD, display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10, borderRight: '.5px solid #ecebe5' }}>
              <Titulo derecha={<span style={{ fontSize: 12, color: '#888' }}>Movimientos detectados {periodo.texto}</span>}>
                <span id="pr-general">Actividad general</span>
              </Titulo>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.02em' }}>{miles(gen.total)}</span>
                {gen.cambio !== null && (
                  <Chip morado={gen.cambio >= 0}>
                    {gen.cambio >= 0 ? '+' : '−'}
                    {Math.abs(gen.cambio)} % frente a {dias === 1 ? 'ayer' : `los ${dias} días anteriores`}
                  </Chip>
                )}
              </div>
              <Area serie={gen.serie} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888' }}>
                <span>{fechaCorta(gen.serie[0]?.d)}</span>
                <span>{fechaCorta(gen.serie[Math.floor(gen.serie.length / 2)]?.d)}</span>
                <span>Hoy</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {gen.contadores.map((c, i) => (
                <Link
                  key={c.clave}
                  href={c.href}
                  style={{
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    textDecoration: 'none',
                    color: 'inherit',
                    borderRight: i % 2 === 0 ? '.5px solid #ecebe5' : 'none',
                    borderBottom: i < 2 ? '.5px solid #ecebe5' : 'none',
                  }}
                >
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: MORADO_SUAVE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`ti ${c.icono}`} aria-hidden="true" style={{ color: MORADO, fontSize: 17 }}></i>
                  </span>
                  <span style={{ fontSize: 12, color: '#555', lineHeight: 1.35 }}>{c.etiqueta}</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>{miles(c.valor)}</span>
                    {c.valor !== null && c.hoy > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: MORADO }}>+{miles(c.hoy)} hoy</span>}
                  </span>
                  <span style={{ fontSize: 11, color: '#888' }}>
                    {c.valor === null ? 'Sin datos para este ámbito' : c.abierto ? 'Ahora mismo' : periodo.texto.charAt(0).toUpperCase() + periodo.texto.slice(1)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Sin agentes */}
        {tuyo && !tuyo.hay && (
          <section style={{ background: NEGRO, color: '#fff', borderRadius: 14, padding: '30px 34px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 22 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 620 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#c4bbf8' }}>AI Agent</span>
              <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>Crea tu primer agente</h2>
              <p style={{ margin: 0, fontSize: 14, color: '#d6d3cc', lineHeight: 1.55 }}>
                Describe tu organización o la normativa que te interesa. El agente monitoriza BOE, Congreso, parlamentos y boletines
                autonómicos, Unión Europea y CNMC, y aquí verás sus plazos y lo que te afecta.
              </p>
            </div>
            <button type="button" className="btn-ai" onClick={() => setAgente(true)} style={{ padding: '11px 20px', fontSize: 14 }}>
              Crear agente
            </button>
          </section>
        )}

        {!tuyo && (
          <>
            <Esqueleto alto={130} />
            <Esqueleto alto={380} />
          </>
        )}

        {tuyo?.hay && (
          <>
            {/* 2. Cifras de tus agentes */}
            <section aria-label="Tus agentes" className="pr-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
              <Kpi
                etiqueta="Asuntos revisados"
                valor={tuyo.revPeriodo}
                variacion={<Variacion actual={tuyo.revPeriodo} anterior={tuyo.revAnterior} />}
                nota={`${periodo.texto.charAt(0).toUpperCase() + periodo.texto.slice(1)}, por ${tuyo.agentes.length === 1 ? 'tu agente' : `${tuyo.agentes.length} agentes`}`}
                serie={tuyo.revSerie}
              />
              <Kpi
                etiqueta="Te afectan"
                valor={tuyo.teAfectan}
                variacion={<Variacion actual={tuyo.teAfectan} anterior={tuyo.teAfectanAntes} />}
                nota={`${tuyo.tramite} en trámite y ${tuyo.publicado} ya publicados`}
                serie={tuyo.afectanSerie}
              />
              <Kpi etiqueta="Por revisar" valor={tuyo.porRevisar} nota="Pendientes en Seguimiento" href="/novedades" />
              <Kpi
                etiqueta="Plazos abiertos"
                valor={tuyo.plazos.length}
                nota={
                  tuyo.plazos[0]
                    ? tuyo.plazos[0].quedan === 0
                      ? 'El más próximo vence hoy'
                      : tuyo.plazos[0].quedan === 1
                        ? 'El más próximo vence mañana'
                        : `El más próximo, en ${tuyo.plazos[0].quedan} días`
                    : 'Ninguno por vencer'
                }
              />
            </section>

            {/* 3. Plazos y qué te afecta */}
            <section className="pr-dos" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)', gap: 14, alignItems: 'stretch' }}>
              <div style={{ ...CARD, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Titulo derecha={<Link href="/novedades" style={{ fontSize: 12, color: '#888', textDecoration: 'none' }}>Ver en Seguimiento</Link>}>
                  Próximos plazos
                </Titulo>
                {proximos.length > 0 && (
                  <span style={{ fontSize: 12, color: '#888', paddingBottom: 8 }}>La barra indica cuánto tiempo del plazo ha pasado ya.</span>
                )}
                {proximos.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#888', margin: '12px 0 0' }}>
                    Nada de lo que han encontrado tus agentes tiene un plazo abierto ahora mismo.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {proximos.map((p) => (
                      <Plazo key={p.clave} p={p} inicio={extra.inicio.get(p.clave)} tipoConsulta={extra.tipoConsulta.get(p.clave)} />
                    ))}
                  </div>
                )}
              </div>

              <div style={{ ...CARD, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Titulo derecha={<Link href="/novedades" style={{ fontSize: 12, color: '#888', textDecoration: 'none' }}>Abrir Seguimiento</Link>}>
                  Qué te afecta
                </Titulo>
                {tuyo.teAfectan === 0 ? (
                  <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Tus agentes no han encontrado nada que te afecte {periodo.texto}.</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                      <Anillo tramite={tuyo.tramite} publicado={tuyo.publicado} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                        {[
                          ['tramite', 'En trámite', tuyo.tramite, MORADO],
                          ['publicado', 'Ya publicado', tuyo.publicado, NEGRO],
                        ].map(([id, et, n, col]) => (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={tab === id}
                            onClick={() => setTab(id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              width: '100%',
                              borderRadius: 8,
                              padding: '9px 12px',
                              fontFamily: 'inherit',
                              fontSize: 13,
                              color: NEGRO,
                              cursor: 'pointer',
                              background: tab === id ? '#f7f6f2' : '#fff',
                              border: `1px solid ${tab === id ? BORDE : 'transparent'}`,
                            }}
                          >
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: col, flex: 'none' }} />
                            <span style={{ flex: 1, textAlign: 'left' }}>{et}</span>
                            <span style={{ fontWeight: 700 }}>{n}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '.5px solid #ecebe5', paddingTop: 14 }}>
                      <span style={{ fontSize: 12, color: '#888' }}>{tab === 'tramite' ? 'En trámite' : 'Ya publicado'}, por fuente</span>
                      {(tab === 'tramite' ? tuyo.fuentesTramite : tuyo.fuentesPublicado).length === 0 ? (
                        <span style={{ fontSize: 12.5, color: '#888' }}>Nada en este grupo.</span>
                      ) : (
                        (tab === 'tramite' ? tuyo.fuentesTramite : tuyo.fuentesPublicado).map((f, _i, arr) => (
                          <div key={f.nombre} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 26px', alignItems: 'center', gap: 10, fontSize: 13 }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}</span>
                            <span style={{ display: 'block', height: 8, background: '#f0efe9', borderRadius: 4, overflow: 'hidden' }}>
                              <span
                                style={{
                                  display: 'block',
                                  height: 8,
                                  borderRadius: 4,
                                  background: tab === 'tramite' ? MORADO : NEGRO,
                                  width: `${Math.round((f.n / arr[0].n) * 100)}%`,
                                }}
                              />
                            </span>
                            <span style={{ fontWeight: 600, textAlign: 'right' }}>{f.n}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* 3b. Ya publicado */}
            <YaPublicado lista={tuyo.publicadoLista} periodo={periodo} />

            {/* 4. Foco */}
            <section style={{ ...CARD, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Titulo
                derecha={
                  <span style={{ fontSize: 12, color: '#888' }}>
                    Asuntos encontrados por cada agente, comparados con {dias === 1 ? 'ayer' : `los ${dias} días anteriores`}
                  </span>
                }
              >
                {tituloFoco}
              </Titulo>
              <div className="pr-foco" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, tuyo.foco.length))}, minmax(0, 1fr))`, gap: 14 }}>
                {tuyo.foco.map((t, i) => (
                  <Foco key={t.id} t={t} pos={i + 1} primero={i === 0 && t.n > 0 && tuyo.foco.length > 1} />
                ))}
              </div>
            </section>

            {/* 5. Tus agentes */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Titulo
                derecha={
                  <Link href="/novedades?agentes=1" style={{ fontSize: 12, color: '#888', textDecoration: 'none' }}>
                    Gestionar agentes
                  </Link>
                }
              >
                Tus agentes
              </Titulo>
              <div className="pr-agentes" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                {tuyo.agentes.map((a) => (
                  <TarjetaAgente key={a.id} a={a} periodo={periodo} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {agente && <AgenteAlarmasModal onClose={() => setAgente(false)} />}

      <style>{`
        @media (max-width: 900px) {
          .pr-general, .pr-dos { grid-template-columns: minmax(0,1fr) !important; }
          .pr-general > div:first-child { border-right: none !important; border-bottom: .5px solid #ecebe5; }
          .pr-kpis, .pr-foco { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .pr-agentes { grid-template-columns: minmax(0,1fr) !important; }
        }
      `}</style>
    </div>
  );
}

const RELEVANCIA = {
  3: { texto: 'Te afecta directamente', morado: true },
  2: { texto: 'Te afecta', morado: true },
  1: { texto: 'Contexto', morado: false },
};

/**
 * Lo ya publicado que han encontrado tus agentes en el periodo (BOE,
 * boletines autonómicos, Consejo de Ministros y CNMC). Primero lo que te
 * afecta, con el motivo; debajo, lo que es contexto. Como mucho seis: el
 * resto, en Seguimiento.
 */
function YaPublicado({ lista, periodo }) {
  const [todo, setTodo] = useState(false);
  const afectan = lista.filter((x) => (x.relevancia || 0) >= 2).length;
  const visibles = todo ? lista : lista.slice(0, 6);
  return (
    <section style={{ ...CARD, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Titulo derecha={<Link href="/novedades" style={{ fontSize: 12, color: '#888', textDecoration: 'none' }}>Ver en Seguimiento</Link>}>
        Ya publicado
      </Titulo>
      <span style={{ fontSize: 12, color: '#888', paddingBottom: 6 }}>
        {lista.length === 0
          ? `Tus agentes no han encontrado nada publicado ${periodo.texto}.`
          : `${lista.length} ${lista.length === 1 ? 'norma publicada' : 'normas publicadas'} ${periodo.texto}${
              afectan ? `, ${afectan} te ${afectan === 1 ? 'afecta' : 'afectan'}` : ''
            }. BOE, boletines autonómicos, Consejo de Ministros y CNMC.`}
      </span>
      {visibles.map((x) => {
        const r = RELEVANCIA[x.relevancia] || RELEVANCIA[1];
        const fuente = FUENTE_DE_KIND[x.kind] || String(x.fuente || '').split(', ')[0];
        const cuerpo = (
          <>
            <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flex: 'none', background: r.morado ? MORADO : '#c9c6bd' }} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{x.titulo}</span>
              {x.motivo && <span style={{ fontSize: 12.5, color: '#555', lineHeight: 1.45 }}>{x.motivo}</span>}
              <span style={{ fontSize: 11.5, color: '#888' }}>
                {fuente}, {fechaCorta(x.dia)}
              </span>
            </span>
            <span style={{ flex: 'none' }}>
              <Chip morado={r.morado}>{r.texto}</Chip>
            </span>
          </>
        );
        const estilo = { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderTop: '.5px solid #ecebe5', textDecoration: 'none', color: 'inherit' };
        return x.ruta ? (
          <Link key={x.clave} href={x.ruta} style={estilo}>
            {cuerpo}
          </Link>
        ) : (
          <div key={x.clave} style={estilo}>
            {cuerpo}
          </div>
        );
      })}
      {lista.length > 6 && (
        <button
          type="button"
          onClick={() => setTodo((v) => !v)}
          style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 12.5, color: '#57534e', cursor: 'pointer', padding: '8px 0 0' }}
        >
          {todo ? 'Ver menos' : `Ver las ${lista.length}`}
        </button>
      )}
    </section>
  );
}

function Kpi({ etiqueta, valor, variacion, nota, serie, href }) {
  const cuerpo = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#555' }}>{etiqueta}</span>
        {variacion}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, minHeight: 36 }}>
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1 }}>{miles(valor)}</span>
        {serie && <Sparkline valores={serie} />}
      </div>
      <span style={{ fontSize: 12, color: '#888' }}>{nota}</span>
    </>
  );
  const estilo = { ...CARD, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, textDecoration: 'none', color: 'inherit' };
  return href ? (
    <Link href={href} style={estilo}>
      {cuerpo}
    </Link>
  ) : (
    <div style={estilo}>{cuerpo}</div>
  );
}

function tipoDePlazo(p, tipoConsulta) {
  if (p.kind === 'consulta') return tipoConsulta === 'audiencia_publica' ? 'Audiencia pública' : 'Consulta pública';
  if (p.kind === 'expediente') return 'Comentarios a la Comisión';
  if (p.kind === 'ley' || p.kind === 'ccaa' || p.kind === 'ccaa_tramite') return 'Enmiendas';
  return 'Plazo';
}

function Plazo({ p, inicio, tipoConsulta }) {
  const urgente = p.quedan <= 3;
  const fin = diaMadrid(p.plazo);
  const ini = inicio ? String(inicio).slice(0, 10) : null;
  let pct = null;
  if (ini && fin && ini < fin) {
    const total = (new Date(`${fin}T12:00:00Z`) - new Date(`${ini}T12:00:00Z`)) / 86400000;
    const pasado = total - p.quedan;
    pct = Math.max(3, Math.min(100, Math.round((pasado / total) * 100)));
  }
  const fuente = FUENTE_DE_KIND[p.kind] || String(p.fuente || '').split(', ')[0];
  const contenido = (
    <>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          background: urgente ? MORADO : '#f7f6f2',
          color: urgente ? '#fff' : NEGRO,
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{p.quedan}</span>
        <span style={{ fontSize: 10, lineHeight: 1.2 }}>{p.quedan === 1 ? 'día' : 'días'}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.titulo}>
            {p.titulo}
          </span>
          <span style={{ fontSize: 11, color: NEGRO, background: '#f0efe9', borderRadius: 5, padding: '3px 8px', whiteSpace: 'nowrap' }}>
            {tipoDePlazo(p, tipoConsulta)}
          </span>
        </span>
        <span style={{ fontSize: 12, color: '#888' }}>{fuente}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {pct !== null && (
            <span style={{ flex: 1, display: 'block', height: 6, background: '#f0efe9', borderRadius: 3, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: 6, borderRadius: 3, width: `${pct}%`, background: urgente ? MORADO : NEGRO }} />
            </span>
          )}
          <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap', marginLeft: pct === null ? 0 : 'auto' }}>
            {pct !== null ? `Abrió el ${fechaCorta(ini)}, cierra el ${fechaCorta(fin)}` : `Cierra el ${fechaCorta(fin)}`}
          </span>
        </span>
      </div>
    </>
  );
  const estilo = { display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0', borderTop: '.5px solid #ecebe5', textDecoration: 'none', color: 'inherit' };
  return p.ruta ? (
    <Link href={p.ruta} style={estilo}>
      {contenido}
    </Link>
  ) : (
    <div style={estilo}>{contenido}</div>
  );
}

function Foco({ t, pos, primero }) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        border: `1px solid ${primero ? '#d9d3fb' : '#ecebe5'}`,
        background: primero ? '#fbfaff' : '#fff',
        minWidth: 0,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            background: primero ? MORADO : '#f0efe9',
            color: primero ? '#fff' : NEGRO,
          }}
        >
          {pos}
        </span>
        {primero && <span style={{ fontSize: 11, fontWeight: 600, color: MORADO }}>Más activo</span>}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, minHeight: 36 }}>{t.nombre}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1 }}>{t.n}</span>
        <Variacion actual={t.n} anterior={t.antes} />
      </span>
      <div style={{ width: '100%' }}>
        <SparkAncha valores={t.serie} color={primero ? MORADO : NEGRO} />
      </div>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '.5px solid #ecebe5', paddingTop: 12 }}>
        <span style={{ fontSize: 11, color: '#888' }}>Lo más destacado</span>
        {t.destacado ? (
          t.destacado.ruta ? (
            <Link href={t.destacado.ruta} style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: NEGRO, textDecoration: 'none' }}>
              {t.destacado.titulo}
            </Link>
          ) : (
            <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4 }}>{t.destacado.titulo}</span>
          )
        ) : (
          <span style={{ fontSize: 12.5, color: '#888' }}>Nada nuevo en este periodo</span>
        )}
      </span>
    </div>
  );
}

/** Serie a todo el ancho de su caja. Sin datos, una nota en vez de una raya plana. */
function SparkAncha({ valores, color }) {
  if (!valores?.length || valores.every((v) => !v)) {
    return <div style={{ height: 48, display: 'flex', alignItems: 'center', fontSize: 11, color: '#a8a49c' }}>Sin asuntos nuevos en estos días</div>;
  }
  const W = 200;
  const H = 48;
  const max = Math.max(...valores);
  const pts = valores.map((v, i) => [(i / Math.max(1, valores.length - 1)) * W, H - 3 - (v / max) * (H - 8)]);
  const linea = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')} L${W} ${H} L0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: H, display: 'block' }}>
      <path d={area} fill={color === MORADO ? MORADO_SUAVE : '#f0efe9'} />
      <polyline points={linea} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TarjetaAgente({ a, periodo }) {
  const tasa = a.revisados > 0 ? Math.round((a.afectan / a.revisados) * 1000) / 10 : null;
  return (
    <div style={{ ...CARD, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: a.activo ? MORADO_SUAVE : '#f0efe9',
          }}
        >
          <i className="ti ti-sparkles" aria-hidden="true" style={{ fontSize: 19, color: a.activo ? MORADO : '#8b8780' }}></i>
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.nombre}</span>
          <span style={{ fontSize: 12, color: '#888' }}>Última pasada: {haceCuanto(a.pasada)}</span>
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            borderRadius: 20,
            padding: '4px 10px',
            whiteSpace: 'nowrap',
            background: a.activo ? '#f7f6f2' : '#fff',
            color: a.activo ? NEGRO : '#888',
            border: a.activo ? '1px solid transparent' : `1px solid ${BORDE}`,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 4, background: a.activo ? MORADO : '#b4b1a8' }} />
          {a.estado}
        </span>
      </span>
      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) 120px', gap: 10, alignItems: 'end' }}>
        <Dato n={a.afectan} etiqueta="Te afectan" />
        <Dato n={a.porRevisar} etiqueta="Por revisar" />
        <Dato n={a.plazos} etiqueta="Plazos" />
        <Sparkline valores={a.serie} ancho={120} color={a.activo ? MORADO : '#8b8780'} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#888' }}>
          <span>
            {miles(a.revisados)} asuntos revisados {periodo.texto}
          </span>
          {tasa !== null && <span>{String(tasa).replace('.', ',')} % te afectan</span>}
        </span>
        <span style={{ display: 'block', height: 6, background: '#f0efe9', borderRadius: 3, overflow: 'hidden' }}>
          <span
            style={{
              display: 'block',
              height: 6,
              borderRadius: 3,
              background: a.activo ? MORADO : '#b4b1a8',
              width: `${tasa === null ? 0 : Math.max(2, Math.min(100, tasa))}%`,
            }}
          />
        </span>
      </span>
    </div>
  );
}

function Dato({ n, etiqueta }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 20, fontWeight: 700 }}>{miles(n)}</span>
      <span style={{ fontSize: 11, color: '#888' }}>{etiqueta}</span>
    </span>
  );
}
