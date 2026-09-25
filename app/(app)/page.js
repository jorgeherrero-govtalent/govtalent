'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { frasePlazo } from '@/lib/plazos';
import FollowButton from '@/components/FollowButton';
import FilaInferior from '@/components/FilaInferior';
import ConsolaAlarmas from '@/components/ConsolaAlarmas';

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

const BENTO = { background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
/**
 * Actividad normativa en curso, en una barra por tramos (estilo Stripe).
 *
 * Sustituye al anillo: una barra se compara de un vistazo y deja sitio
 * para leer cada cifra en grande, que es lo que de verdad se mira. Cada
 * fuente tiene siempre el mismo color, se ordene como se ordene: morados
 * para lo legislativo (Congreso, Parlamento Europeo), verdes para lo
 * que abre la Administración (consultas, Comisión) y un neutro para el
 * BOE de hoy, que es otra escala (publicaciones del día, no expedientes
 * abiertos).
 */
const COLOR_FUENTE = {
  Congreso: '#6d5aef',
  'Parlamento Europeo': '#a597ef',
  'Consultas públicas': '#3f8a78',
  'Comisión Europea': '#a8d5c8',
  'BOE hoy': '#c9c6bd',
};

function BarraActividad({ datos }) {
  // Las cuatro de expedientes abiertos, de mayor a menor; el BOE de hoy,
  // que es otra escala (publicaciones del día), siempre al final.
  const orden = [
    ...datos.filter((d) => d.clave !== 'BOE hoy').sort((a, b) => (b.valor || 0) - (a.valor || 0)),
    ...datos.filter((d) => d.clave === 'BOE hoy'),
  ];
  const total = orden.reduce((s, d) => s + (d.valor || 0), 0);
  return (
    <div className="bento" style={{ ...BENTO, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18' }}>
        Actividad normativa en curso
        {total === 0 && <span style={{ fontWeight: 400, color: '#a8a49c' }}> · sin datos</span>}
      </div>
      <div
        role="img"
        aria-label={orden.map((d) => `${d.clave}: ${d.valor}`).join(', ')}
        style={{ display: 'flex', gap: 4, height: 14 }}
      >
        {total > 0
          ? orden.map((d) => (
              <span
                key={d.clave}
                title={`${d.titulo}: ${d.valor}`}
                style={{ flex: `${d.valor || 0} 1 0`, minWidth: d.valor ? 10 : 0, borderRadius: 4, background: COLOR_FUENTE[d.clave] || '#d9d6ce' }}
              />
            ))
          : <span style={{ flex: 1, borderRadius: 4, background: '#f2f0ec' }} />}
      </div>
      {/* Dos columnas: las cuatro de expedientes abiertos y, debajo, el
          BOE de hoy, con el mismo estilo que las demás. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 16px' }}>
        {orden.map((d) => (
          <div key={d.clave} title={d.titulo} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#6f6b64' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLOR_FUENTE[d.clave] || '#d9d6ce', flexShrink: 0 }}></span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.clave === 'BOE hoy' ? 'BOE, hoy' : d.clave}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 500, color: '#1a1a18', lineHeight: 1.15, paddingLeft: 14, letterSpacing: '-.3px' }}>
              {d.valor}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const supabase = createClient();

  const [resumen, setResumen] = useState(null);
  const [nombre, setNombre] = useState('');
  const [plazos, setPlazos] = useState([]);
  const [sector, setSector] = useState([]);
  const [temas, setTemas] = useState([]);
  const [seguidos, setSeguidos] = useState([]);
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

      const [
        { data: es },
        { data: eu },
        leyes,
        procedimientos,
        expedientes,
        consultas,
        boeHoy,
        { data: sec },
        { data: porTema },
        { data: sigue },
        { data: cons },
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

        // --- Lo que alimenta la barra de actividad ---
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
        // Lo publicado hoy en el BOE, sobre boe_directory (la tabla está
        // detrás de RLS y desde el cliente contaba cero). «Hoy» en Madrid.
        supabase
          .from('boe_directory')
          .select('id', { count: 'exact', head: true })
          .eq('fecha_publicacion', new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())),


        // Las tres fuentes que deciden la tarjeta grande, en paralelo y
        // no en cascada: hacen falta las tres a la vez para cruzarlas.
        supabase
          .from('alarma_encaja')
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
        supabase.from('my_follows').select('kind, ref_id, label, ruta, fuente').eq('es_actor', false).eq('activo', true),
        // Consultas públicas españolas abiertas: son la cuarta fuente de
        // plazos y hasta ahora no entraban en la tarjeta ni en la lista.
        supabase
          .from('consultas_estado')
          .select('id, titulo, fecha_fin, ministerio, estado')
          .in('estado', ['abierta', 'urgente'])
          .not('fecha_fin', 'is', null)
          .order('fecha_fin', { ascending: true })
          .limit(40),
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
        ...(cons || []).map((r) => ({
          id: `co-${r.id}`,
          dias: diasHasta(r.fecha_fin),
          fecha: r.fecha_fin,
          title: r.titulo,
          fuente: ['Consulta pública', r.ministerio].filter(Boolean).join(' · '),
          ruta: `/regulatorio/consultas/${r.id}`,
          kind: 'consulta',
          refId: String(r.id),
        })),
      ]
        .filter((x) => x.dias !== null && x.dias >= 0)
        .sort((a, b) => a.dias - b.dias);

      setPlazos(todos);

      const ep = procedimientos.count;
      const ce = expedientes.count;

      // La barra de actividad: lo abierto en cada institución y, aparte,
      // lo publicado hoy en el BOE.
      setActividad([
        { clave: 'Comisión Europea', titulo: 'Expedientes abiertos en la Comisión Europea', valor: ce ?? 0 },
        { clave: 'Parlamento Europeo', titulo: 'Procedimientos abiertos en el Parlamento Europeo', valor: ep ?? 0 },
        { clave: 'Congreso', titulo: 'Leyes en tramitación en el Congreso', valor: leyes.count ?? 0 },
        { clave: 'Consultas públicas', titulo: 'Consultas públicas abiertas', valor: consultas.count ?? 0 },
        { clave: 'BOE hoy', titulo: 'Disposiciones publicadas hoy en el BOE', valor: boeHoy.count ?? 0 },
      ]);

      setSector(sec || []);
      setTemas(porTema || []);
      setSeguidos(sigue || []);

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
  /**
   * Lo que es tuyo y tiene plazo abierto.
   *
   * EL PLAZO NO VIVE EN LAS COINCIDENCIAS (antes sector_matches, hoy
   * alarma_encaja). Ese es el fallo que traía loca a
   * esta tarjeta: el análisis guarda `plazo` a null en casi todas sus
   * filas, así que filtrar por él dejaba la lista vacía y la home caía al
   * plazo más próximo del regulatorio general, que es de donde salía
   * Ucrania. La fecha de verdad está en las tablas de origen, y se busca
   * ahí por kind + ref_id.
   *
   * Entran las cuatro áreas: Congreso, Comisión Europea, consultas
   * públicas y lo que se siga del Parlamento Europeo. Los procedimientos
   * del PE no tienen fecha de cierre en el directorio, así que aparecen
   * como asunto tuyo pero no compiten por el plazo.
   */
  const misAsuntos = useMemo(() => {
    // Índice de plazos reales, por kind + ref_id.
    const plazoDe = new Map();
    for (const p of plazos) plazoDe.set(clave(p.kind, p.refId), p);

    const porClave = new Map();

    const anadir = (kind, refId, datos) => {
      if (!kind || !refId) return;
      const k = clave(kind, refId);
      const real = plazoDe.get(k);
      const previo = porClave.get(k) || {};
      porClave.set(k, {
        ...previo,
        ...datos,
        kind,
        refId,
        // El plazo propio si lo hay; si no, el de la tabla de origen.
        plazo: datos.plazo || previo.plazo || (real ? real.fecha : null),
        ruta: datos.ruta || previo.ruta || (real ? real.ruta : null),
        fuente: datos.fuente || previo.fuente || (real ? real.fuente : null),
        titulo: datos.titulo || previo.titulo || (real ? real.title : null),
      });
    };

    // Coincidencia por palabras del onboarding.
    for (const t of temas) {
      anadir(t.kind, t.ref_id, {
        titulo: t.titulo,
        motivo: t.motivo || null,
        temas: Array.isArray(t.temas) ? t.temas : null,
        plazo: t.plazo,
        ruta: t.ruta,
        fuente: t.fuente,
        origen: 'temas',
      });
    }

    // El análisis pisa a las palabras: sabe por qué te afecta y lo dice.
    // Relevancia 1 es "contexto útil" según su propio prompt, así que no
    // opta a la tarjeta grande.
    for (const m of sector) {
      if ((Number(m.relevancia) || 0) < 2) continue;
      anadir(m.kind, m.ref_id, {
        titulo: m.titulo,
        motivo: m.motivo || null,
        plazo: m.plazo,
        ruta: m.ruta,
        fuente: m.fuente,
        relevancia: Number(m.relevancia) || null,
        origen: 'analisis',
      });
    }

    // Lo que sigue entra siempre: seguir algo ya es decir que te importa.
    for (const f of seguidos || []) {
      anadir(f.kind, f.ref_id, {
        titulo: f.label,
        ruta: f.ruta,
        fuente: f.fuente,
        origen: 'seguido',
      });
    }

    const sigue = new Set((seguidos || []).filter((f) => f.kind && f.ref_id).map((f) => clave(f.kind, f.ref_id)));

    return [...porClave.values()]
      .map((a) => ({ ...a, sigues: sigue.has(clave(a.kind, a.refId)), dias: diasHasta(a.plazo) }))
      .filter((a) => a.dias !== null && a.dias >= 0)
      .sort((a, b) => a.dias - b.dias);
  }, [sector, temas, seguidos, plazos]);


  /**
   * Quién ocupa la tarjeta grande.
   *
   * El tema es un filtro, no un criterio de orden: lo que no es tuyo no
   * puede entrar aquí ni cerrando esta tarde. Dentro de lo tuyo manda la
   * fecha, y el número grande de la tarjeta es la de ese mismo asunto.
   */
  const urgente = useMemo(() => {
    const conTema = (a) => a.origen === 'analisis' || a.origen === 'temas';

    const elegido =
      misAsuntos.find((a) => a.sigues && conTema(a)) ||
      misAsuntos.find((a) => a.sigues) ||
      misAsuntos.find(conTema) ||
      null;

    if (elegido) {
      return { ...elegido, title: elegido.titulo, fecha: elegido.plazo };
    }
    // Nada tuyo con plazo abierto: se enseña lo primero del calendario y
    // se dice que no es tuyo.
    return plazos[0] ? { ...plazos[0], motivo: null, temas: null, origen: 'general', sigues: false } : null;
  }, [misAsuntos, plazos]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '26px 20px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>
          Hola{nombre ? `, ${nombre}` : ''}
        </h1>
        <p style={{ fontSize: 13.5, color: '#8b8780', margin: '4px 0 0', lineHeight: 1.55 }}>
          {fechaLarga()}
          {cargado && misAsuntos.length > 0
            ? ` · ${misAsuntos.length} ${misAsuntos.length === 1 ? 'asunto tuyo' : 'asuntos tuyos'} con plazo abierto`
            : ''}
        </p>
      </div>

      {/* Arriba, la consola de tus alarmas: siempre la tarjeta negra y
          siempre en el mismo sitio, tengas alarmas o no. Es donde vive el
          agente, y lo que hace la home distinta de un listado. */}
      <div style={{ marginBottom: 14 }}>
        <ConsolaAlarmas />
      </div>

      {/* Debajo, lo que cierra antes, grande, y al lado el reparto de la
          actividad normativa en curso. */}
      <div className="bento-fila" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginBottom: 14, alignItems: 'stretch' }}>
        <div
          className="bento"
          style={{ ...BENTO, padding: '24px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
        >
          {urgente ? (
            <>
              {/* Altura reservada y títulos recortados a dos líneas: el
                  nombre oficial de una ley puede ocupar tres renglones y
                  el de una consulta uno, y con la altura suelta esta
                  tarjeta y la de al lado subían y bajaban según qué
                  asunto tocara ese día. El título completo sigue estando
                  en el atributo title. */}
              <div className="urgente-texto">
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
                  {urgente.sigues
                    ? 'Lo más urgente que sigues'
                    : urgente.origen === 'analisis'
                      ? 'Lo más urgente de tus alarmas'
                      : urgente.origen === 'temas'
                        ? 'Lo más urgente de tus temas'
                        : 'Lo más urgente'}
                </span>
                <Link href={urgente.ruta} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div
                    className="clamp-2"
                    title={urgente.title}
                    style={{ fontSize: 19, lineHeight: 1.4, fontWeight: 600, letterSpacing: '-.2px' }}
                  >
                    {urgente.title}
                  </div>
                </Link>
                {urgente.motivo ? (
                  <div
                    className="clamp-2"
                    title={urgente.motivo}
                    style={{ fontSize: 13, color: '#8b8780', lineHeight: 1.6, paddingTop: 10 }}
                  >
                    {urgente.motivo}
                  </div>
                ) : urgente.temas && urgente.temas.length > 0 ? (
                  <div className="clamp-2" style={{ fontSize: 13, color: '#8b8780', lineHeight: 1.6, paddingTop: 10 }}>
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
                  <div style={{ fontSize: 11.5, color: '#8b8780', paddingTop: 3 }}>
                    {urgente.kind === 'ley' ? 'fin del plazo de enmiendas' : 'cierre de alegaciones'}
                  </div>
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

          {actividad ? (
            <Link href="/regulatorio" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <BarraActividad datos={actividad} />
            </Link>
          ) : (
            <div className="bento" style={{ ...BENTO, padding: '18px 22px' }}>
              <div style={{ fontSize: 12.5, color: '#8b8780' }}>Actividad normativa en curso</div>
            </div>
          )}
      </div>

      {/* Y abajo, en qué estás trabajando. Ocupa el hueco de las cuatro
          cifras del sector, que se quitaron: repetían la barra de
          actividad en otro formato. Cambia de forma según el plan, y
          es a propósito: en Free hay al lado una muestra del directorio,
          porque quien no paga necesita descubrir el producto; con Pro los
          proyectos ocupan el ancho entero. Antes eran los plazos —que ya
          salen arriba— y las ofertas de empleo, que tienen su pestaña. */}
      <FilaInferior />

    </div>
  );
}
