// =====================================================================
// SYNC — Procedimientos legislativos del Parlamento Europeo
// app/api/sync/parlamento-procedimientos/route.js
//
// Cada noche, en una sola ejecución y en este orden:
//
//   1. DESCUBRIR. La lista de procedimientos COD de cada año, de 2014 al
//      actual: una petición por año. Así se detectan los nuevos.
//
//   2. FICHAS. La ficha de cada procedimiento nuevo y de CADA uno que
//      siga vivo. La ficha trae la fase, si está cerrado, la lista de
//      actos y los ponentes.
//
//   3. EVENTOS. La cronología de esos mismos procedimientos.
//
// -------------------------------------------------------------------
// POR QUÉ SE REHIZO, septiembre de 2026
//
// La versión anterior solo pedía la ficha de los procedimientos que no
// conocía, y los eventos de los que nunca los habían tenido. Un
// procedimiento se cargaba una vez y se congelaba para siempre: su
// fase, su cierre, su cronología y SUS PONENTES. El motor de avisos
// vigila fase y cierre, así que seguir un procedimiento del PE no generó
// nunca un aviso. Había fichas sin tocar desde el 14 de agosto.
//
// Ahora todo lo vivo se refresca cada noche. Con 231 vivos son unas 475
// peticiones, unos siete minutos. Lo cerrado no se vuelve a pedir: un
// procedimiento firmado o publicado ya no cambia.
//
// Y ya no se encadena: con el límite de 60 s de antes había que trocear
// el trabajo en eslabones que se relanzaban solos, y esa cadena era
// frágil. En Pro una ejecución puede durar 800 s y todo cabe en una.
//
// -------------------------------------------------------------------
// LÍMITE DE LA API: 500 peticiones cada 5 minutos, 1,67 por segundo.
// La primera versión iba dieciocho veces por encima y cosechó 101
// respuestas HTTP 429 en una pasada. Con 3 en paralelo y 2 s de pausa
// el ritmo queda por debajo de 1,5 por segundo. Si aun así llega un
// 429, se espera un minuto y se reintenta; si se repite, se para.
//
// SOLO COD —procedimiento legislativo ordinario—, por decisión de
// producto. Ampliar a CNS, NLE, INI y demás multiplicaría los vivos y
// habría que revisar la política de refresco.
//
// LECCIONES APLICADAS del sync de la Comisión:
//   - Cliente de Supabase SIN caché de Next.js. Su fetch parcheado
//     devolvía respuestas idénticas al byte y el sync daba vueltas.
//   - Las escrituras se verifican con .select(): contar llamadas sin
//     error no es contar filas modificadas.
//
// Uso a mano:
//   ?key=<DEBUG_KEY>&dry=1                  prueba sin escribir
//   ?key=<DEBUG_KEY>&desde=2024&hasta=2026  solo esos años al descubrir
//   ?key=<DEBUG_KEY>                        carga real
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';

export const dynamic = 'force-dynamic';

// El máximo de Pro con Fluid compute. Lo normal son unos siete minutos.
export const maxDuration = 800;

const EP = 'https://data.europarl.europa.eu/api/v2';
const TIMEOUT_MS = 15000;
const TIPO = 'COD';

// A partir de aquí no se pide otra petición. Quedan ~110 s para guardar
// la última tanda y contestar.
const PRESUPUESTO_MS = 690_000;

// Ritmo: 3 a la vez y 2 s entre lotes, por debajo del límite de la API.
const PARALELO = 3;
const PAUSA_MS = 2000;
// Tras un 429, un minuto de espera antes del único reintento.
const ESPERA_429_MS = 60_000;

// El listado por año se pide con este tope. El año con más COD ronda los
// 134; si alguno llega al tope, se avisa, porque podría haber
// procedimientos sin descubrir.
const LIMITE_LISTADO = 200;

// Cada cuántas fichas o eventos se escribe lo acumulado. Si algo corta
// la ejecución, lo ya procesado queda guardado.
const LOTE_ESCRITURA = 30;

const FORMATO = 'format=application%2Fld%2Bjson';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Sin esto, Next.js cachea las consultas GET y el sync lee siempre
      // el mismo resultado. Costó media sesión descubrirlo.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/ld+json',
        // La API pide identificarse; sin User-Agent puede limitar antes.
        'User-Agent': 'GovTalent/1.0 (govtalent.app)',
      },
      cache: 'no-store',
    });
    if (res.status === 204) return { ok: true, vacio: true, data: [] };
    // 429 es "demasiadas peticiones": no es un fallo del dato, así que se
    // marca aparte para poder frenar en vez de darlo por perdido.
    if (res.status === 429) return { ok: false, motivo: 'HTTP 429', limitado: true };
    if (res.status !== 200) return { ok: false, motivo: `HTTP ${res.status}` };
    const d = await res.json();
    return { ok: true, data: d?.data || (Array.isArray(d) ? d : [d]) };
  } catch (e) {
    return { ok: false, motivo: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

function slugify(t) {
  return (t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

// "def/ep-activities/PLENARY_VOTE" -> "PLENARY_VOTE"
const ultimoTramo = (uri) => (uri ? String(uri).split('/').pop() : null);

// "person/96852" -> "96852", que es eu_meps.id
const idPersona = (uri) => {
  const m = String(uri || '').match(/person\/(\d+)/);
  return m ? m[1] : null;
};

// Los ocho roles observados en had_participation, medidos sobre los 35
// procedimientos de 2026: 130 de 171 participaciones son personas y 41
// son comisiones.
const ROLES = {
  RAPPORTEUR: 'Ponente',
  RAPPORTEUR_CO: 'Coponente',
  RAPPORTEUR_SHADOW: 'Ponente en la sombra',
  RAPPORTEUR_OPINION: 'Ponente de opinión',
  RAPPORTEUR_SHADOW_OPINION: 'Ponente en la sombra (opinión)',
  COMMITTEE_LEAD: 'Comisión competente',
  COMMITTEE_OPINION: 'Comisión de opinión',
  COMMITTEE_BUDGETARY_ASSESSMENT: 'Evaluación presupuestaria',
};

function legibleRol(code) {
  const l = code.replace(/_/g, ' ').toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

// Extrae el código de comisión del identificador de participación.
// Formato observado: "2026-0010-MAIN-BUDG", "2026-0011-AVI-IMCO".
// Solo se acepta si es un código de comisión plausible (2-6 letras en
// mayúsculas), para no capturar fragmentos de otros formatos como
// "2026-0011-NMSR-96833-2026-03-19".
function comisionDelId(id) {
  const ultimo = String(id || '').split('/').pop().split('-').pop();
  return /^[A-Z]{2,6}$/.test(ultimo) ? ultimo : null;
}

// Las fases vienen como URI del vocabulario de la UE. Se traducen las
// conocidas; el resto se muestra legible en vez de como URI cruda.
const FASES = {
  RDG1: 'Primera lectura',
  RDG2: 'Segunda lectura',
  RDG3: 'Tercera lectura',
  AWAITING_SIGNATURE: 'Pendiente de firma',
  SIGNED: 'Firmado',
  PUBLISHED: 'Publicado',
  PROCEDURE_COMPLETED: 'Procedimiento concluido',
  PROCEDURE_LAPSED: 'Procedimiento caducado',
  PROCEDURE_REJECTED: 'Procedimiento rechazado',
};

function faseLabel(uri) {
  const cod = ultimoTramo(uri);
  if (!cod) return null;
  if (FASES[cod]) return FASES[cod];
  const l = cod.replace(/_/g, ' ').toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

// Un procedimiento está cerrado si entre sus actividades hay firma o
// publicación en el Diario Oficial.
//
// La primera versión miraba current_stage buscando PROCEDURE_COMPLETED y
// similares. Estaba mal: comprobado sobre 378 procedimientos de 2017 a
// 2026, current_stage solo toma dos valores, RDG1 y RDG2 — dice en qué
// lectura va, no si terminó. Daba 0 cerrados, lo cual es imposible.
const ACTIVIDADES_DE_CIERRE = new Set([
  'PUBLICATION_OFFICIAL_JOURNAL',
  'SIGNATURE',
  'FINAL_ACT_SIGNED',
  'PROCEDURE_COMPLETED',
  'PROCEDURE_LAPSED',
  'PROCEDURE_REJECTED',
]);

function transformarProcedimiento(p) {
  const processId = p.process_id || String(p.id || '').split('/').pop();
  if (!processId) return null;

  const titulos = typeof p.process_title === 'object' && p.process_title ? p.process_title : {};
  const titleEn = titulos.en?.trim() || null;
  const titleEs = titulos.es?.trim() || null;

  const actividades = Array.isArray(p.consists_of) ? p.consists_of : [];
  const fechas = actividades.map((a) => a.activity_date).filter(Boolean).sort();
  const tiposActividad = actividades.map((a) => ultimoTramo(a.had_activity_type)).filter(Boolean);
  const cerrado = tiposActividad.some((t) => ACTIVIDADES_DE_CIERRE.has(t));

  return {
    process_id: processId,
    label: p.label || processId,
    slug: `${slugify(titleEs || titleEn || processId)}-${processId}`,
    process_type: ultimoTramo(p.process_type) || p.process_type || null,
    year: parseInt(String(processId).slice(0, 4), 10) || null,
    title_es: titleEs,
    title_en: titleEn,
    current_stage: p.current_stage || null,
    current_stage_label: faseLabel(p.current_stage),
    started_at: fechas[0] || null,
    last_activity_at: fechas[fechas.length - 1] || null,
    is_closed: cerrado,
    n_events: actividades.length,
    raw: p,
    synced_at: new Date().toISOString(),
  };
}

function transformarParticipaciones(p, processId) {
  const lista = Array.isArray(p.had_participation) ? p.had_participation : [];
  const out = [];
  for (const x of lista) {
    const mep = Array.isArray(x.had_participant_person) ? idPersona(x.had_participant_person[0]) : idPersona(x.had_participant_person);
    const rol = ultimoTramo(x.participation_role);
    out.push({
      id: String(x.id || `${processId}-${mep}-${x.activity_date}`).split('/').pop(),
      process_id: processId,
      mep_id: mep,
      role: rol,
      role_label: ROLES[rol] || (rol ? legibleRol(rol) : null),
      // La comisión viene en participation_in_name_of cuando el
      // participante es una persona. Cuando el participante ES la comisión
      // (COMMITTEE_LEAD, COMMITTEE_OPINION), ese campo no existe y el
      // código está al final del identificador: "2026-0010-MAIN-BUDG".
      // Son 41 de 171 participaciones: la comisión competente de cada
      // expediente, que es dato de primer nivel para asuntos públicos.
      body_code: ultimoTramo(x.participation_in_name_of) || comisionDelId(x.id),
      political_group: ultimoTramo(x.politicalGroup),
      activity_date: x.activity_date || null,
      stage: x.occured_at_stage || null,
    });
  }
  // Deduplicar: la misma persona puede aparecer varias veces
  const vistos = new Set();
  return out.filter((x) => {
    if (!x.id || vistos.has(x.id)) return false;
    vistos.add(x.id);
    return true;
  });
}

// Escritura verificada: .select() hace que PostgREST devuelva las filas
// afectadas. Contar llamadas sin error no es contar filas modificadas.
async function escribir(supabase, tabla, filas, conflicto) {
  if (filas.length === 0) return { escritas: 0, errores: [] };
  let escritas = 0;
  const errores = [];
  const LOTE = 50;
  for (let i = 0; i < filas.length; i += LOTE) {
    const grupo = filas.slice(i, i + LOTE);
    const { data, error } = await supabase.from(tabla).upsert(grupo, { onConflict: conflicto }).select(conflicto);
    if (error) errores.push(error.message);
    else escritas += Array.isArray(data) ? data.length : 0;
  }
  return { escritas, errores };
}

/**
 * Pide `pedirUno(item)` para cada elemento, PARALELO a la vez y con
 * PAUSA_MS entre lotes.
 *
 * Tras cada lote llama a `alLote(lote)`; si devuelve false, se para
 * —es la forma de cortar cuando la base rechaza lo que se escribe—.
 *
 * Si la API devuelve 429, espera un minuto y reintenta ese lote una
 * vez. Si se repite, se para: insistir solo alarga el bloqueo.
 *
 * Devuelve { parado }, que es null si terminó, o 'tiempo', 'limite' o
 * 'escritura'.
 */
async function porLotes(items, pedirUno, { t0, alLote }) {
  for (let i = 0; i < items.length; i += PARALELO) {
    if (Date.now() - t0 > PRESUPUESTO_MS) return { parado: 'tiempo' };

    const grupo = items.slice(i, i + PARALELO);
    let res = await Promise.all(grupo.map(pedirUno));

    let limitado = false;
    if (res.some((r) => r.limitado)) {
      await espera(ESPERA_429_MS);
      res = await Promise.all(grupo.map(pedirUno));
      limitado = res.some((r) => r.limitado);
    }

    // Lo que sí llegó se aprovecha aunque el lote se quede a medias.
    const lote = grupo.map((item, j) => ({ item, r: res[j] })).filter(({ r }) => !r.limitado);
    if (alLote && (await alLote(lote)) === false) return { parado: 'escritura' };
    if (limitado) return { parado: 'limite' };

    await espera(PAUSA_MS);
  }
  return { parado: null };
}

// Lista para un filtro `in` de PostgREST. Las comillas protegen los
// identificadores con guiones.
function listaIn(valores) {
  return `(${valores.map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')})`;
}

export const GET = conRegistro('/api/sync/parlamento-procedimientos', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const dry = sp.get('dry') === '1';
  const desde = parseInt(sp.get('desde') || '2014', 10);
  const hasta = parseInt(sp.get('hasta') || String(new Date().getUTCFullYear()), 10);
  const supabase = admin();

  const informe = { inicio: new Date(t0).toISOString(), dry_run: dry, tipo: TIPO };
  const fallidos = [];
  const erroresEscritura = [];
  const escritura = {
    procedimientos: { escritas: 0 },
    participaciones: { escritas: 0 },
    eventos: { escritas: 0 },
  };
  let parado = null;

  const responder = (status = 200) => {
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe, { status });
  };

  // ===================================================================
  // 1. DESCUBRIR — el listado de cada año
  // ===================================================================
  const anos = [];
  for (let a = hasta; a >= desde; a--) anos.push(a);

  const porAno = {};
  const anosAlTope = [];
  const idsCatalogo = [];

  const r1 = await porLotes(
    anos,
    (ano) => pedir(`${EP}/procedures?process-type=${TIPO}&year=${ano}&limit=${LIMITE_LISTADO}&${FORMATO}`),
    {
      t0,
      alLote: (lote) => {
        for (const { item: ano, r } of lote) {
          if (!r.ok) {
            fallidos.push({ ano, motivo: r.motivo });
            continue;
          }
          const ids = (r.data || []).map((x) => x.process_id).filter(Boolean);
          porAno[ano] = ids.length;
          if (ids.length >= LIMITE_LISTADO) anosAlTope.push(ano);
          idsCatalogo.push(...ids);
        }
      },
    }
  );
  parado = r1.parado;
  informe.anos_recorridos = porAno;
  if (anosAlTope.length) {
    informe.aviso = `El listado de ${anosAlTope.join(', ')} llegó al tope de ${LIMITE_LISTADO}: puede haber procedimientos sin descubrir.`;
  }

  // Cuáles son nuevos
  const conocidos = new Set();
  for (let i = 0; i < idsCatalogo.length; i += 200) {
    const { data, error } = await supabase
      .from('ep_procedures')
      .select('process_id')
      .in('process_id', idsCatalogo.slice(i, i + 200));
    if (error) {
      informe.error = `No se pudo leer ep_procedures: ${error.message}`;
      return responder(500);
    }
    for (const x of data || []) conocidos.add(x.process_id);
  }
  const nuevos = [...new Set(idsCatalogo.filter((id) => !conocidos.has(id)))];

  // Los vivos salen de la base, no del listado: si el listado de un año
  // falla, sus vivos se siguen refrescando igual.
  //
  // Se piden los que MÁS tiempo llevan sin refrescarse primero. Si una
  // noche no diera tiempo a todos, la siguiente empezaría por los que se
  // quedaron fuera, y ninguno puede quedarse atrás para siempre.
  const { data: filasVivos, error: eVivos } = await supabase
    .from('ep_procedures')
    .select('process_id, synced_at')
    .eq('is_closed', false)
    .order('synced_at', { ascending: true, nullsFirst: true })
    .order('process_id', { ascending: true })
    .limit(5000);
  if (eVivos) {
    informe.error = `No se pudieron leer los procedimientos vivos: ${eVivos.message}`;
    return responder(500);
  }
  const vivos = (filasVivos || []).map((x) => x.process_id);
  const estabaAbierto = new Set(vivos);
  // Supabase devuelve como mucho 1.000 filas por consulta. Con 231 vivos
  // queda lejos, pero si algún día se llega, que se vea.
  if (vivos.length >= 1000) {
    informe.aviso = [informe.aviso, `Hay ${vivos.length} vivos o más: la consulta pudo quedarse corta.`].filter(Boolean).join(' ');
  }

  // Primero los nuevos, que no tenemos en absoluto.
  const aPedir = [...new Set([...nuevos, ...vivos])];
  informe.nuevos = nuevos.length;
  informe.vivos = vivos.length;

  // ===================================================================
  // 2. FICHAS — fase, cierre, actos y ponentes
  // ===================================================================
  let bufProc = [];
  let bufPart = [];
  const idsPartDe = new Map();
  const fichasOk = [];
  let cerradosHoy = 0;
  let retiradas = 0;
  const sinFicha = [];
  let muestra = null;

  async function volcarFichas() {
    if (bufProc.length === 0) return true;
    const procs = bufProc;
    const parts = bufPart;
    bufProc = [];
    bufPart = [];
    if (dry) return true;

    const wP = await escribir(supabase, 'ep_procedures', procs, 'process_id');
    const wPa = await escribir(supabase, 'ep_procedure_participants', parts, 'id');
    escritura.procedimientos.escritas += wP.escritas;
    escritura.participaciones.escritas += wPa.escritas;
    erroresEscritura.push(...wP.errores, ...wPa.errores);

    // Si una tanda con procedimientos no guarda ninguno, la base lo
    // está rechazando todo: no tiene sentido seguir pidiendo.
    if (procs.length > 0 && wP.escritas === 0) return false;

    // Los ponentes que ya no están en la ficha se retiran. Sin esto, un
    // ponente sustituido seguiría apareciendo como si lo fuera.
    //
    // SOLO si la ficha trae participaciones. Una ficha que llegara sin
    // ninguna podría ser un fallo puntual de la API, y borrar todos los
    // ponentes de un expediente por eso sería peor que dejar uno de más.
    for (const p of procs) {
      const ids = idsPartDe.get(p.process_id) || [];
      if (ids.length === 0) continue;
      const { data, error } = await supabase
        .from('ep_procedure_participants')
        .delete()
        .eq('process_id', p.process_id)
        .not('id', 'in', listaIn(ids))
        .select('id');
      if (error) erroresEscritura.push(error.message);
      else retiradas += Array.isArray(data) ? data.length : 0;
    }
    return true;
  }

  if (!parado) {
    const r2 = await porLotes(aPedir, (pid) => pedir(`${EP}/procedures/${pid}?${FORMATO}`), {
      t0,
      alLote: async (lote) => {
        for (const { item: pid, r } of lote) {
          if (!r.ok) {
            fallidos.push({ id: pid, motivo: r.motivo });
            continue;
          }
          const p = r.data?.[0];
          if (!p) {
            // La API contestó sin ficha: el procedimiento ya no existe o
            // cambió de identificador. Se cuenta para que se vea.
            sinFicha.push(pid);
            continue;
          }
          const fila = transformarProcedimiento(p);
          if (!fila) continue;
          const parts = transformarParticipaciones(p, fila.process_id);
          bufProc.push(fila);
          bufPart.push(...parts);
          idsPartDe.set(fila.process_id, parts.map((x) => x.id));
          fichasOk.push(fila.process_id);
          if (estabaAbierto.has(fila.process_id) && fila.is_closed) cerradosHoy += 1;
          if (!muestra) muestra = { ...fila, raw: '[...recortado]' };
        }
        if (bufProc.length >= LOTE_ESCRITURA) return volcarFichas();
        return true;
      },
    });
    parado = r2.parado;
  }
  // Lo que quede se guarda siempre, también si se paró por tiempo.
  if (parado !== 'escritura' && !(await volcarFichas())) parado = 'escritura';

  informe.procedimientos = fichasOk.length;
  informe.cerrados_hoy = cerradosHoy;
  informe.ponentes_retirados = retiradas;
  if (sinFicha.length) informe.sin_ficha = sinFicha.slice(0, 10);

  // ===================================================================
  // 3. EVENTOS — la cronología de lo que se acaba de refrescar
  // ===================================================================
  let bufEv = [];
  let bufHechos = [];
  let eventosProcesados = 0;

  async function volcarEventos() {
    if (bufHechos.length === 0) return true;
    const evs = bufEv;
    const hechos = bufHechos;
    bufEv = [];
    bufHechos = [];
    if (dry) return true;

    const wEv = await escribir(supabase, 'ep_procedure_events', evs, 'id');
    escritura.eventos.escritas += wEv.escritas;
    erroresEscritura.push(...wEv.errores);
    if (evs.length > 0 && wEv.escritas === 0) return false;

    // Se marca la fecha aunque no tuviera eventos: dice cuándo se miró
    // por última vez, no si había algo.
    const { error } = await supabase
      .from('ep_procedures')
      .update({ events_synced_at: new Date().toISOString() })
      .in('process_id', hechos);
    if (error) erroresEscritura.push(error.message);
    return true;
  }

  if (!parado) {
    const r3 = await porLotes(fichasOk, (pid) => pedir(`${EP}/procedures/${pid}/events?${FORMATO}`), {
      t0,
      alLote: async (lote) => {
        for (const { item: pid, r } of lote) {
          if (!r.ok) {
            fallidos.push({ id: pid, eventos: true, motivo: r.motivo });
            continue;
          }
          for (const e of r.data || []) {
            const aid = e.activity_id || String(e.id || '').split('/').pop();
            if (!aid) continue;
            bufEv.push({
              id: aid,
              process_id: pid,
              activity_date: e.activity_date || null,
              activity_type: ultimoTramo(e.had_activity_type),
              stage: e.occured_at_stage || null,
              raw: e,
            });
          }
          bufHechos.push(pid);
          eventosProcesados += 1;
        }
        if (bufHechos.length >= LOTE_ESCRITURA) return volcarEventos();
        return true;
      },
    });
    parado = r3.parado;
  }
  if (parado !== 'escritura' && !(await volcarEventos())) parado = 'escritura';

  informe.eventos_procesados = eventosProcesados;
  informe.escritura = escritura;
  informe.fallidos = fallidos.length;
  informe.limitados_429 = fallidos.filter((f) => f.motivo === 'HTTP 429').length;
  informe.detalle_fallos = fallidos.slice(0, 5);
  if (dry) informe.muestra = muestra;

  // --- Veredicto, por orden de gravedad ------------------------------
  if (parado === 'escritura' || erroresEscritura.length > 0) {
    informe.error = `La base rechazó la escritura: ${erroresEscritura.slice(0, 2).join(' | ') || 'sin detalle'}`;
    return responder(500);
  }
  if (parado === 'limite') {
    informe.quedan = true;
    informe.nota = 'La API devolvió 429 dos veces seguidas y se paró. Lo pendiente se refresca mañana, empezando por ello.';
  } else if (parado === 'tiempo') {
    informe.quedan = true;
    informe.nota = `Se acabó el tiempo: ${fichasOk.length} de ${aPedir.length} fichas. Mañana empieza por las que faltan.`;
  } else if (fallidos.length > 0) {
    informe.quedan = true;
    informe.nota = `Terminado con ${fallidos.length} petición(es) fallida(s); se reintentan mañana.`;
  } else {
    informe.nota = `Completo: ${fichasOk.length} fichas y ${eventosProcesados} cronologías.`;
  }
  return responder(200);
}
