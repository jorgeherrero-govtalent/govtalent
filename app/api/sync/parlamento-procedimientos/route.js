// =====================================================================
// SYNC — Procedimientos legislativos del Parlamento Europeo
// app/api/sync/parlamento-procedimientos/route.js
//
// Dos fases, porque tienen coste muy distinto:
//
//   FASE 1 (?fase=catalogo) — la ficha de cada procedimiento por años.
//   Trae título, etapa y ponentes. Una petición por procedimiento.
//
//   FASE 2 (?fase=eventos) — el recorrido. Otra petición más, así que
//   solo se piden los de procedimientos que aún no lo tengan, y primero
//   los que están vivos: la cronología de uno cerrado en 2015 no corre
//   prisa.
//
// LÍMITE DE LA API: 500 peticiones cada 5 minutos. Con paralelismo 5 y
// pausa entre lotes se queda holgadamente por debajo.
//
// LECCIONES APLICADAS del sync de la Comisión, que costó media sesión:
//   - Cliente de Supabase SIN caché de Next.js. Su fetch parcheado
//     devolvía respuestas idénticas al byte y el sync daba vueltas.
//   - Las escrituras se verifican con .select(): contar llamadas sin
//     error no es contar filas modificadas.
//   - Sin memoria de posición: se busca lo que falta, no dónde se iba.
//
// Uso:
//   ?key=<DEBUG_KEY>&fase=catalogo&desde=2024&hasta=2026
//   ?key=<DEBUG_KEY>&fase=eventos
//   ?dry=1                sin escribir
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EP = 'https://data.europarl.europa.eu/api/v2';
const TIMEOUT_MS = 15000;
// El presupuesto controla la DESCARGA, pero después viene la escritura y
// el lanzamiento del siguiente eslabón. Medido en la fase de eventos: con
// 40 s de presupuesto la función terminaba en 55,7 s, al borde del límite
// de 60 de Vercel. Si un eslabón muere por timeout, no llega a lanzar el
// siguiente y la cadena se rompe — que es lo que pasó a los 90 de 808.
const PRESUPUESTO_MS = 30000;

// LÍMITE REAL DE LA API: 500 peticiones cada 5 minutos = 1,67 por segundo.
//
// La primera versión iba con 5 en paralelo y 150 ms de pausa, o sea unas
// 30 por segundo: dieciocho veces por encima. Resultado: 101 respuestas
// HTTP 429 en una sola pasada.
//
// Con 3 en paralelo y 2 s de pausa el ritmo baja a ~1,5 por segundo, por
// debajo del límite y con margen para los reintentos.
const PARALELO = 3;
const PAUSA_MS = 2000;
// A ese ritmo, en los 40 s de presupuesto caben unas 60 peticiones.
const MAX_POR_PASADA = 60;

// Encadenamiento: al terminar, si queda trabajo, la función se llama a sí
// misma. Ayer di por hecho que Vercel cortaba la petición saliente; era
// falso. Lo que impedía avanzar era la caché de Next.js en el cliente de
// Supabase, que hacía leer siempre el mismo resultado.
const MAX_CADENA = 60;
const MS_LANZAR_SIGUIENTE = 1500;

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
 * Lanza la siguiente pasada sin esperar respuesta. Se aborta a propósito:
 * basta con que Vercel reciba la petición para que arranque una función
 * independiente. El AbortError es el comportamiento buscado, no un fallo.
 */
async function lanzarSiguiente(request, eslabon, extra = {}) {
  const url = new URL(request.url);
  url.searchParams.set('cadena', String(eslabon));
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MS_LANZAR_SIGUIENTE);
  try {
    await fetch(url.toString(), {
      signal: controller.signal,
      headers: request.headers.get('authorization') ? { authorization: request.headers.get('authorization') } : {},
      cache: 'no-store',
    });
    return { lanzado: true };
  } catch (e) {
    if (e.name === 'AbortError') return { lanzado: true };
    return { lanzado: false, motivo: e.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const dry = sp.get('dry') === '1';
  const fase = sp.get('fase') || 'catalogo';
  const eslabon = Math.max(parseInt(sp.get('cadena') || '0', 10), 0);
  const encadenar = sp.get('encadenar') !== '0';
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), fase, dry_run: dry, eslabon };

  // ===================================================================
  // FASE 1 — catálogo por años
  // ===================================================================
  if (fase === 'catalogo') {
    // Por defecto, las tres legislaturas: 8ª (2014-2019), 9ª (2019-2024) y
    // 10ª (2024-2029). El cron no lleva parámetros, así que estos valores
    // son los que usará cada noche.
    const desde = parseInt(sp.get('desde') || '2014', 10);
    const hasta = parseInt(sp.get('hasta') || String(new Date().getFullYear()), 10);
    const tipo = sp.get('tipo') || 'COD';

    const procedimientos = [];
    const participaciones = [];
    const fallidos = [];
    const porAno = {};
    let cortado = false;

    for (let ano = hasta; ano >= desde; ano--) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        cortado = true;
        break;
      }

      // El listado solo da id, tipo y label: hace falta pedir cada ficha.
      const lista = await pedir(`${EP}/procedures?process-type=${tipo}&year=${ano}&limit=200&format=application%2Fld%2Bjson`);
      if (!lista.ok) {
        fallidos.push({ ano, motivo: lista.motivo });
        continue;
      }
      const ids = (lista.data || []).map((x) => x.process_id).filter(Boolean);
      porAno[ano] = ids.length;

      // Las que ya están cargadas no se vuelven a pedir.
      const { data: existentes } = await supabase
        .from('ep_procedures')
        .select('process_id')
        .in('process_id', ids.length ? ids : ['-']);
      const yaEstan = new Set((existentes || []).map((x) => x.process_id));
      const pendientes = ids.filter((id) => !yaEstan.has(id));

      for (let i = 0; i < pendientes.length; i += PARALELO) {
        if (Date.now() - t0 > PRESUPUESTO_MS) {
          cortado = true;
          break;
        }
        const grupo = pendientes.slice(i, i + PARALELO);
        const res = await Promise.all(
          grupo.map((id) => pedir(`${EP}/procedures/${id}?format=application%2Fld%2Bjson`))
        );
        for (let j = 0; j < res.length; j++) {
          const r = res[j];
          if (!r.ok) {
            fallidos.push({ id: grupo[j], motivo: r.motivo });
            continue;
          }
          const p = r.data?.[0];
          if (!p) continue;
          const fila = transformarProcedimiento(p);
          if (!fila) continue;
          procedimientos.push(fila);
          participaciones.push(...transformarParticipaciones(p, fila.process_id));
        }
        await espera(PAUSA_MS);
        if (procedimientos.length >= MAX_POR_PASADA) {
          cortado = true;
          break;
        }
      }
      if (cortado) break;
    }

    informe.anos_recorridos = porAno;
    informe.procedimientos = procedimientos.length;
    informe.participaciones = participaciones.length;
    informe.con_titulo_es = procedimientos.filter((p) => p.title_es).length;
    informe.con_ponentes = new Set(participaciones.map((x) => x.process_id)).size;
    informe.cerrados = procedimientos.filter((p) => p.is_closed).length;
    informe.fallidos = fallidos.length;
    informe.limitados_429 = fallidos.filter((f) => f.motivo === 'HTTP 429').length;
    informe.detalle_fallos = fallidos.slice(0, 5);
    informe.cortado_por_tiempo = cortado;

    if (dry) {
      // Reparto de roles: had_participation no solo trae personas, también
      // comisiones (COMMITTEE_LEAD). Sin ver el reparto no se sabe si se
      // están perdiendo ponentes o si son otro tipo de participante.
      const porRol = {};
      for (const p of participaciones) {
        const k = p.role || '(sin rol)';
        if (!porRol[k]) porRol[k] = { total: 0, con_mep: 0, con_comision: 0 };
        porRol[k].total += 1;
        if (p.mep_id) porRol[k].con_mep += 1;
        if (p.body_code) porRol[k].con_comision += 1;
      }
      informe.roles = porRol;
      informe.sin_mep_ni_comision = participaciones.filter((p) => !p.mep_id && !p.body_code).length;
      // Los identificadores en crudo de los que no tienen persona: ahí
      // debería estar el código de comisión que no estoy extrayendo.
      informe.ids_sin_persona = participaciones
        .filter((p) => !p.mep_id)
        .slice(0, 8)
        .map((p) => ({ id: p.id, rol: p.role }));
      informe.muestra = procedimientos[0] ? { ...procedimientos[0], raw: '[...recortado]' } : null;
      informe.muestra_participacion_persona = participaciones.find((p) => p.mep_id) || null;
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    const wProc = await escribir(supabase, 'ep_procedures', procedimientos, 'process_id');
    const wPart = await escribir(supabase, 'ep_procedure_participants', participaciones, 'id');
    informe.escritura = { procedimientos: wProc, participaciones: wPart };

    // Se encadena si quedó trabajo. Tres frenos:
    //   - si la API devolvió 429, se para: insistir empeora el bloqueo
    //   - si no se escribió nada habiendo procesado, algo falla
    //   - tope de eslabones como red de seguridad
    const quedaTrabajo = cortado || procedimientos.length >= MAX_POR_PASADA;
    const limitado = informe.limitados_429 > 0;

    if (!quedaTrabajo) {
      informe.nota = 'Catálogo al día para los años indicados.';
      // Terminado el catálogo, se pasa sola a la fase de eventos: así una
      // única invocación del cron completa el módulo entero.
      if (encadenar && eslabon + 1 < MAX_CADENA) {
        const r = await lanzarSiguiente(request, eslabon + 1, {
          fase: 'eventos',
          ...(sp.get('key') ? { key: sp.get('key') } : {}),
        });
        informe.siguiente_fase = { fase: 'eventos', ...r };
        informe.nota = 'Catálogo completo. Lanzada la fase de eventos.';
      }
    } else if (limitado) {
      informe.nota = `La API devolvió ${informe.limitados_429} veces HTTP 429. Se detiene la cadena; espera 5 minutos y relánzalo.`;
    } else if (!encadenar) {
      informe.nota = 'Queda trabajo y el encadenado está desactivado.';
    } else if (wProc.escritas === 0 && procedimientos.length > 0) {
      informe.nota = 'Se procesaron procedimientos pero no se escribió ninguno: se detiene la cadena para no repetir el error.';
    } else if (eslabon + 1 >= MAX_CADENA) {
      informe.nota = `Tope de ${MAX_CADENA} eslabones. Vuelve a lanzarlo para continuar.`;
    } else {
      const r = await lanzarSiguiente(request, eslabon + 1, {
        fase: 'catalogo',
        desde: String(desde),
        hasta: String(hasta),
        ...(sp.get('key') ? { key: sp.get('key') } : {}),
      });
      informe.siguiente_eslabon = { numero: eslabon + 1, ...r };
      informe.nota = r.lanzado ? 'Siguiente pasada lanzada sola.' : `No se pudo encadenar (${r.motivo}).`;
    }

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  }

  // ===================================================================
  // FASE 2 — eventos, primero de los procedimientos vivos
  // ===================================================================
  if (fase === 'eventos') {
    const { data: pendientes, error } = await supabase
      .from('ep_procedures')
      .select('process_id, is_closed, last_activity_at')
      .is('events_synced_at', null)
      // Los vivos primero: la cronología de uno cerrado en 2015 no corre
      // prisa. El desempate por process_id evita el orden inestable que
      // hizo dar vueltas al sync de la Comisión.
      .order('is_closed', { ascending: true })
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .order('process_id', { ascending: true })
      .limit(MAX_POR_PASADA);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!pendientes?.length) {
      return NextResponse.json({ ...informe, nada_pendiente: true, ms_total: Date.now() - t0 });
    }

    const eventos = [];
    const hechos = [];
    const fallidos = [];
    let cortado = false;

    for (let i = 0; i < pendientes.length; i += PARALELO) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        cortado = true;
        break;
      }
      const grupo = pendientes.slice(i, i + PARALELO);
      const res = await Promise.all(
        grupo.map((p) => pedir(`${EP}/procedures/${p.process_id}/events?format=application%2Fld%2Bjson`))
      );
      for (let j = 0; j < res.length; j++) {
        const r = res[j];
        const pid = grupo[j].process_id;
        if (!r.ok) {
          fallidos.push({ id: pid, motivo: r.motivo });
          continue;
        }
        for (const e of r.data || []) {
          const aid = e.activity_id || String(e.id || '').split('/').pop();
          if (!aid) continue;
          eventos.push({
            id: aid,
            process_id: pid,
            activity_date: e.activity_date || null,
            activity_type: ultimoTramo(e.had_activity_type),
            stage: e.occured_at_stage || null,
            raw: e,
          });
        }
        hechos.push(pid);
      }
      await espera(PAUSA_MS);
    }

    informe.procedimientos_procesados = hechos.length;
    informe.eventos = eventos.length;
    informe.fallidos = fallidos.length;
    informe.limitados_429 = fallidos.filter((f) => f.motivo === 'HTTP 429').length;
    informe.detalle_fallos = fallidos.slice(0, 5);
    informe.cortado_por_tiempo = cortado;

    if (dry) {
      informe.muestra = eventos[0] ? { ...eventos[0], raw: '[...recortado]' } : null;
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    const wEv = await escribir(supabase, 'ep_procedure_events', eventos, 'id');

    // Se marcan como hechos aunque no tuvieran eventos: si no, volverían
    // a la cola indefinidamente. Es el fallo que hizo repetir 600 filas
    // en el sync de la Comisión.
    let marcados = 0;
    for (let i = 0; i < hechos.length; i += 50) {
      const grupo = hechos.slice(i, i + 50);
      const { data } = await supabase
        .from('ep_procedures')
        .update({ events_synced_at: new Date().toISOString() })
        .in('process_id', grupo)
        .select('process_id');
      marcados += Array.isArray(data) ? data.length : 0;
    }

    const { count: quedan } = await supabase
      .from('ep_procedures')
      .select('process_id', { count: 'exact', head: true })
      .is('events_synced_at', null);

    informe.escritura = { eventos: wEv, procedimientos_marcados: marcados };
    informe.quedan_pendientes = quedan ?? null;
    informe.limitados_429 = fallidos.filter((f) => f.motivo === 'HTTP 429').length;

    if (!quedan || quedan === 0) {
      informe.nota = 'Recorridos completos: no queda ningún procedimiento sin eventos.';
    } else if (informe.limitados_429 > 0) {
      informe.nota = `La API devolvió ${informe.limitados_429} veces HTTP 429. Se detiene la cadena; espera 5 minutos.`;
    } else if (!encadenar) {
      informe.nota = 'Quedan pendientes y el encadenado está desactivado.';
    } else if (marcados === 0 && hechos.length > 0) {
      informe.nota = 'Se procesaron procedimientos pero ninguno quedó marcado: se detiene la cadena.';
    } else if (eslabon + 1 >= MAX_CADENA) {
      informe.nota = `Tope de ${MAX_CADENA} eslabones. Vuelve a lanzarlo para continuar.`;
    } else {
      const r = await lanzarSiguiente(request, eslabon + 1, {
        fase: 'eventos',
        ...(sp.get('key') ? { key: sp.get('key') } : {}),
      });
      informe.siguiente_eslabon = { numero: eslabon + 1, ...r };
      informe.nota = r.lanzado ? 'Siguiente pasada lanzada sola.' : `No se pudo encadenar (${r.motivo}).`;
    }

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  }

  return NextResponse.json({ error: 'fase no reconocida: usa catalogo o eventos' }, { status: 400 });
}
