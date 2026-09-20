// =====================================================================
// PARLAMENTO EUROPEO — sync de procedimientos, sin rutas
// lib/parlamentoEuropeo.js
//
// Dos trabajos, cada uno con su ruta y su cron:
//
//   sincronizarFichas()   → /api/sync/parlamento-procedimientos
//     Descubre los COD nuevos y refresca la ficha de cada procedimiento
//     vivo: fase, cierre, actos y ponentes. Es lo que vigila el motor de
//     avisos.
//
//   sincronizarEventos()  → /api/sync/parlamento-procedimientos/eventos
//     Refresca la cronología de los vivos y de los que nunca la tuvieron.
//
// -------------------------------------------------------------------
// POR QUÉ DOS CRONES, septiembre de 2026
//
// Hasta el 19 de septiembre un procedimiento se cargaba una vez y se
// congelaba para siempre. Al pasar a refrescarlo todo cada noche, las
// dos primeras ejecuciones reales agotaron el tiempo: fichas completas,
// pero solo 75 y 100 cronologías de 228.
//
// La API del PE, medida esas dos noches, da unas 0,46-0,49 peticiones
// por segundo, y DOBLAR el paralelismo no lo mejoró. Con ese ritmo las
// dos fases juntas necesitan unos 17 minutos y una ejecución tiene 13.
// Por separado caben con margen. Es la misma solución que arregló la
// actividad del Congreso.
//
// POR QUÉ 3 A LA VEZ Y NO MÁS. Con 3 peticiones en vuelo no hubo ni un
// corte por tiempo de espera en toda una noche; con 6 hubo ocho. Más
// paralelismo no daba más ritmo y sí más cortes.
//
// POR QUÉ UNA PISCINA Y NO LOTES. La primera versión mandaba lotes y
// esperaba al más lento antes del siguiente, más una pausa fija: el
// servidor pasaba tiempo parado. Ahora hay siempre 3 peticiones en
// marcha y en cuanto termina una sale la siguiente, con un tope de 1,2
// por segundo para no rozar nunca el límite de la API.
//
// -------------------------------------------------------------------
// LÍMITE DE LA API: 500 peticiones cada 5 minutos, 1,67 por segundo. La
// primera versión del sync, en 2025, iba dieciocho veces por encima y
// cosechó 101 respuestas HTTP 429 en una pasada. Si llega un 429 se
// espera un minuto; si se repite, se para.
//
// SOLO COD —procedimiento legislativo ordinario—, por decisión de
// producto. Ampliar tipos multiplicaría los vivos y habría que revisar
// los tiempos.
//
// LECCIONES del sync de la Comisión, que siguen valiendo:
//   - Cliente de Supabase SIN caché de Next.js: su fetch parcheado
//     devolvía respuestas idénticas al byte y el sync daba vueltas.
//   - Las escrituras se verifican con .select(): contar llamadas sin
//     error no es contar filas modificadas.
// =====================================================================

import { createClient } from '@supabase/supabase-js';

const EP = 'https://data.europarl.europa.eu/api/v2';
const TIPO = 'COD';
const FORMATO = 'format=application%2Fld%2Bjson';

// Con 3 en vuelo, 30 s de espera sobran. Antes eran 15 y, con 6 en
// vuelo, las peticiones que esperaban turno llegaban a cortarse.
const TIMEOUT_MS = 30_000;

// La ruta tiene 800 s. A partir de aquí no sale ninguna petición nueva;
// quedan 60 s para las que están en vuelo —como mucho 30 s— y para
// guardar la última tanda.
export const PRESUPUESTO_MS = 740_000;

const EN_VUELO = 3;
const TASA_MAX = 1.2; // peticiones por segundo; el límite de la API es 1,67
const INTERVALO_MS = Math.ceil(1000 / TASA_MAX);
const ESPERA_429_MS = 60_000;

// El año con más COD ronda los 134. Si un listado llega al tope, se
// avisa: podría haber procedimientos sin descubrir.
const LIMITE_LISTADO = 200;

// Cada cuántos resultados se escribe lo acumulado: si algo corta la
// ejecución, lo ya procesado queda guardado.
const LOTE_ESCRITURA = 30;

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

export { admin as clienteSupabase };

// Lista para un filtro `in` de PostgREST. Las comillas protegen los
// identificadores con guiones.
function listaIn(valores) {
  return `(${valores.map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')})`;
}

/**
 * Pide `pedirUno(item)` para cada elemento con EN_VUELO peticiones
 * siempre en marcha y sin pasar de TASA_MAX por segundo.
 *
 * `tratar(item, r)` recibe cada resultado. Cada LOTE_ESCRITURA
 * resultados se llama a `volcar()`; si devuelve false —la base rechaza
 * lo que se escribe—, se para.
 *
 * Los que se cortan por tiempo de espera se reintentan una vez al final.
 * Si se para antes de reintentarlos, se entregan como fallidos.
 *
 * Devuelve { parado, reintentados }; parado es null si terminó, o
 * 'tiempo', 'limite' o 'escritura'.
 */
async function enPiscina(items, pedirUno, { t0, tratar, volcar }) {
  const e = { parado: null, ultimaSalida: 0, pausaHasta: 0, sinVolcar: 0 };
  const cortados = [];
  let reintentados = 0;

  // Cada salida espera su turno: al menos INTERVALO_MS desde la anterior,
  // y nunca antes de que acabe una pausa por 429.
  async function pedirConTurno(item) {
    const ahora = Date.now();
    const salida = Math.max(ahora, e.ultimaSalida + INTERVALO_MS, e.pausaHasta);
    e.ultimaSalida = salida;
    if (salida > ahora) await espera(salida - ahora);
    return pedirUno(item);
  }

  async function procesar(item, segundaVez) {
    let r = await pedirConTurno(item);
    if (r.limitado) {
      e.pausaHasta = Math.max(e.pausaHasta, Date.now() + ESPERA_429_MS);
      r = await pedirConTurno(item);
      if (r.limitado) {
        e.parado = e.parado || 'limite';
        return;
      }
    }
    if (!r.ok && r.motivo === 'timeout' && !segundaVez) {
      cortados.push(item);
      return;
    }
    tratar(item, r);
    e.sinVolcar += 1;
    if (e.sinVolcar >= LOTE_ESCRITURA) {
      e.sinVolcar = 0;
      if ((await volcar()) === false) e.parado = 'escritura';
    }
  }

  async function trabajador(cola, segundaVez) {
    while (!e.parado) {
      // No sale ninguna petición nueva pasado el presupuesto.
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        e.parado = 'tiempo';
        break;
      }
      const k = cola.siguiente++;
      if (k >= cola.items.length) break;
      await procesar(cola.items[k], segundaVez);
    }
  }

  const principal = { items, siguiente: 0 };
  await Promise.all(Array.from({ length: EN_VUELO }, () => trabajador(principal, false)));

  if (!e.parado && cortados.length) {
    const segunda = { items: cortados.splice(0), siguiente: 0 };
    reintentados = segunda.items.length;
    await Promise.all(Array.from({ length: EN_VUELO }, () => trabajador(segunda, true)));
  }
  for (const item of cortados) tratar(item, { ok: false, motivo: 'timeout' });

  return { parado: e.parado, reintentados };
}

// =====================================================================
// FICHAS
// =====================================================================

/**
 * Descubre los COD nuevos y refresca la ficha de todos los vivos.
 * Devuelve el informe; si trae `error`, la ejecución falló.
 */
export async function sincronizarFichas({ supabase, dry = false, desde = 2014, hasta, t0 = Date.now() }) {
  hasta = hasta || new Date().getUTCFullYear();
  const informe = { inicio: new Date(t0).toISOString(), dry_run: dry, tipo: TIPO, fase: 'fichas' };
  const fallidos = [];
  const erroresEscritura = [];
  const escritura = { procedimientos: { escritas: 0 }, participaciones: { escritas: 0 } };

  // --- 1. Descubrir -------------------------------------------------
  const anos = [];
  for (let a = hasta; a >= desde; a--) anos.push(a);
  const porAno = {};
  const anosAlTope = [];
  const idsCatalogo = [];

  const r1 = await enPiscina(
    anos,
    (ano) => pedir(`${EP}/procedures?process-type=${TIPO}&year=${ano}&limit=${LIMITE_LISTADO}&${FORMATO}`),
    {
      t0,
      tratar: (ano, r) => {
        if (!r.ok) {
          fallidos.push({ ano, motivo: r.motivo });
          return;
        }
        const ids = (r.data || []).map((x) => x.process_id).filter(Boolean);
        porAno[ano] = ids.length;
        if (ids.length >= LIMITE_LISTADO) anosAlTope.push(ano);
        idsCatalogo.push(...ids);
      },
      volcar: () => true,
    }
  );
  let parado = r1.parado;
  informe.anos_recorridos = porAno;
  if (anosAlTope.length) {
    informe.aviso = `El listado de ${anosAlTope.join(', ')} llegó al tope de ${LIMITE_LISTADO}: puede haber procedimientos sin descubrir.`;
  }

  const conocidos = new Set();
  for (let i = 0; i < idsCatalogo.length; i += 200) {
    const { data, error } = await supabase
      .from('ep_procedures')
      .select('process_id')
      .in('process_id', idsCatalogo.slice(i, i + 200));
    if (error) return { ...informe, error: `No se pudo leer ep_procedures: ${error.message}`, ms_total: Date.now() - t0 };
    for (const x of data || []) conocidos.add(x.process_id);
  }
  const nuevos = [...new Set(idsCatalogo.filter((id) => !conocidos.has(id)))];

  // Los vivos salen de la base, no del listado: si el listado de un año
  // falla, sus vivos se siguen refrescando. Primero los que más tiempo
  // llevan sin mirarse: si una noche no diera tiempo, la siguiente
  // empieza por los que quedaron fuera.
  const { data: filasVivos, error: eVivos } = await supabase
    .from('ep_procedures')
    .select('process_id, synced_at')
    .eq('is_closed', false)
    .order('synced_at', { ascending: true, nullsFirst: true })
    .order('process_id', { ascending: true })
    .limit(5000);
  if (eVivos) return { ...informe, error: `No se pudieron leer los vivos: ${eVivos.message}`, ms_total: Date.now() - t0 };
  const vivos = (filasVivos || []).map((x) => x.process_id);
  const estabaAbierto = new Set(vivos);
  // Supabase devuelve como mucho 1.000 filas por consulta.
  if (vivos.length >= 1000) {
    informe.aviso = [informe.aviso, `Hay ${vivos.length} vivos o más: la consulta pudo quedarse corta.`].filter(Boolean).join(' ');
  }

  const aPedir = [...new Set([...nuevos, ...vivos])];
  informe.nuevos = nuevos.length;
  informe.vivos = vivos.length;

  // --- 2. Fichas ----------------------------------------------------
  let bufProc = [];
  let bufPart = [];
  const idsPartDe = new Map();
  const fichasOk = [];
  const sinFicha = [];
  let cerradosHoy = 0;
  let retiradas = 0;
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
    if (procs.length > 0 && wP.escritas === 0) return false;

    // Los ponentes que ya no están en la ficha se retiran; si no, un
    // ponente sustituido seguiría figurando. SOLO si la ficha trae
    // ponentes: una ficha que llegara sin ninguno podría ser un fallo
    // puntual de la API, y borrarlos todos sería peor que dejar uno de
    // más.
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

  let reintentados = 0;
  if (!parado) {
    const r2 = await enPiscina(aPedir, (pid) => pedir(`${EP}/procedures/${pid}?${FORMATO}`), {
      t0,
      tratar: (pid, r) => {
        if (!r.ok) {
          // Un 404 es que la API ya no reconoce el procedimiento. No se
          // cuenta como fallo —dejaría la ejecución en "dejó trabajo"
          // cada noche— y tampoco se cierra: eso sería inventarse un
          // dato. Se lista para revisarlo. El 20 de septiembre dos
          // procedimientos dieron 404 una noche y no la siguiente, así
          // que puede ser pasajero.
          if (r.motivo === 'HTTP 404') sinFicha.push(pid);
          else fallidos.push({ id: pid, motivo: r.motivo });
          return;
        }
        const p = r.data?.[0];
        if (!p) {
          sinFicha.push(pid);
          return;
        }
        const fila = transformarProcedimiento(p);
        if (!fila) return;
        const parts = transformarParticipaciones(p, fila.process_id);
        bufProc.push(fila);
        bufPart.push(...parts);
        idsPartDe.set(fila.process_id, parts.map((x) => x.id));
        fichasOk.push(fila.process_id);
        if (estabaAbierto.has(fila.process_id) && fila.is_closed) cerradosHoy += 1;
        if (!muestra) muestra = { ...fila, raw: '[...recortado]' };
      },
      volcar: volcarFichas,
    });
    parado = r2.parado;
    reintentados = r2.reintentados;
  }
  if (parado !== 'escritura' && !(await volcarFichas())) parado = 'escritura';

  informe.procedimientos = fichasOk.length;
  informe.cerrados_hoy = cerradosHoy;
  informe.ponentes_retirados = retiradas;
  informe.escritura = escritura;
  informe.reintentados = reintentados;
  if (sinFicha.length) informe.sin_ficha = sinFicha.slice(0, 10);
  informe.fallidos = fallidos.length;
  informe.limitados_429 = parado === 'limite' ? 1 : 0;
  informe.detalle_fallos = fallidos.slice(0, 5);
  if (dry) informe.muestra = muestra;

  return veredicto(informe, { parado, erroresEscritura, fallidos, t0, hechos: fichasOk.length, total: aPedir.length, que: 'fichas', sinFicha });
}

// =====================================================================
// EVENTOS
// =====================================================================

/**
 * Refresca la cronología de los procedimientos vivos y de los que nunca
 * la tuvieron —un procedimiento recién descubierto ya cerrado también
 * necesita la suya, una vez—.
 */
export async function sincronizarEventos({ supabase, dry = false, t0 = Date.now() }) {
  const informe = { inicio: new Date(t0).toISOString(), dry_run: dry, tipo: TIPO, fase: 'eventos' };
  const fallidos = [];
  const erroresEscritura = [];
  const escritura = { eventos: { escritas: 0 } };

  // Los que más tiempo llevan sin mirarse, primero.
  const { data: filas, error } = await supabase
    .from('ep_procedures')
    .select('process_id, events_synced_at')
    .or('is_closed.eq.false,events_synced_at.is.null')
    .order('events_synced_at', { ascending: true, nullsFirst: true })
    .order('process_id', { ascending: true })
    .limit(5000);
  if (error) return { ...informe, error: `No se pudo leer ep_procedures: ${error.message}`, ms_total: Date.now() - t0 };
  const pendientes = (filas || []).map((x) => x.process_id);
  informe.pendientes = pendientes.length;
  if (pendientes.length >= 1000) informe.aviso = `Hay ${pendientes.length} o más: la consulta pudo quedarse corta.`;

  let bufEv = [];
  let bufHechos = [];
  const hechos = [];
  let muestra = null;

  async function volcarEventos() {
    if (bufHechos.length === 0) return true;
    const evs = bufEv;
    const listos = bufHechos;
    bufEv = [];
    bufHechos = [];
    if (dry) return true;

    const w = await escribir(supabase, 'ep_procedure_events', evs, 'id');
    escritura.eventos.escritas += w.escritas;
    erroresEscritura.push(...w.errores);
    if (evs.length > 0 && w.escritas === 0) return false;

    // La fecha se marca aunque no tuviera eventos: dice cuándo se miró
    // por última vez, no si había algo.
    const { error: eU } = await supabase
      .from('ep_procedures')
      .update({ events_synced_at: new Date().toISOString() })
      .in('process_id', listos);
    if (eU) erroresEscritura.push(eU.message);
    return true;
  }

  const r = await enPiscina(pendientes, (pid) => pedir(`${EP}/procedures/${pid}/events?${FORMATO}`), {
    t0,
    tratar: (pid, res) => {
      if (!res.ok) {
        fallidos.push({ id: pid, motivo: res.motivo });
        return;
      }
      for (const ev of res.data || []) {
        const aid = ev.activity_id || String(ev.id || '').split('/').pop();
        if (!aid) continue;
        const fila = {
          id: aid,
          process_id: pid,
          activity_date: ev.activity_date || null,
          activity_type: ultimoTramo(ev.had_activity_type),
          stage: ev.occured_at_stage || null,
          raw: ev,
        };
        bufEv.push(fila);
        if (!muestra) muestra = { ...fila, raw: '[...recortado]' };
      }
      bufHechos.push(pid);
      hechos.push(pid);
    },
    volcar: volcarEventos,
  });
  let parado = r.parado;
  if (parado !== 'escritura' && !(await volcarEventos())) parado = 'escritura';

  informe.procedimientos = hechos.length;
  informe.escritura = escritura;
  informe.reintentados = r.reintentados;
  informe.fallidos = fallidos.length;
  informe.limitados_429 = parado === 'limite' ? 1 : 0;
  informe.detalle_fallos = fallidos.slice(0, 5);
  if (dry) informe.muestra = muestra;

  return veredicto(informe, { parado, erroresEscritura, fallidos, t0, hechos: hechos.length, total: pendientes.length, que: 'cronologías', sinFicha: [] });
}

// El cierre del informe, igual para las dos fases, por orden de gravedad.
function veredicto(informe, { parado, erroresEscritura, fallidos, t0, hechos, total, que, sinFicha }) {
  if (parado === 'escritura' || erroresEscritura.length > 0) {
    informe.error = `La base rechazó la escritura: ${erroresEscritura.slice(0, 2).join(' | ') || 'sin detalle'}`;
  } else if (parado === 'limite') {
    informe.quedan = true;
    informe.nota = `La API devolvió 429 dos veces seguidas y se paró en ${hechos} de ${total} ${que}. Mañana empieza por lo pendiente.`;
  } else if (parado === 'tiempo') {
    informe.quedan = true;
    informe.nota = `Se acabó el tiempo: ${hechos} de ${total} ${que}. Mañana empieza por las que faltan.`;
  } else if (fallidos.length > 0) {
    informe.quedan = true;
    informe.nota = `Terminado con ${fallidos.length} petición(es) fallida(s) tras reintentar; van primero mañana.`;
  } else {
    informe.nota = `Completo: ${hechos} ${que}.`;
  }
  if (sinFicha.length) {
    informe.nota = `${informe.nota || ''} ${sinFicha.length} sin ficha en la API: ${sinFicha.slice(0, 5).join(', ')}.`.trim();
  }
  informe.ms_total = Date.now() - t0;
  return informe;
}
