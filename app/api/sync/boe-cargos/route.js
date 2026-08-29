import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Extrae los nombramientos y ceses de la sección II-A del BOE ya
 * sincronizada, y los cruza con el directorio de cargos.
 *
 * No escribe en government_officials. Deja el resultado en
 * boe_appointments para revisarlo: hay 239 cargos correctos en el
 * directorio y un cruce mal hecho los estropearía sin vuelta atrás.
 *
 * Uso:
 *   /api/sync/boe-cargos?key=<DEBUG_KEY>
 *   /api/sync/boe-cargos?key=<DEBUG_KEY>&desde=2023-11-01&hasta=2023-11-30
 *
 * Para el backfill desde el inicio de la legislatura, por tandas de un
 * mes: Vercel corta a los 60 segundos y tres años no caben de una vez.
 */

const PRESUPUESTO_MS = 50_000;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------
// Extracción
//
// Los títulos del BOE siguen tres formas estables:
//
//   "…por el que se nombra <CARGO> a don/doña <NOMBRE>."
//   "…por el que se designa <CARGO> a don/doña <NOMBRE>."
//   "…por el que se dispone el cese de don/doña <NOMBRE> como <CARGO>."
//
// Probado contra los 32 documentos que había en agosto de 2026: los 32
// se extrajeron limpios, incluidos apellidos compuestos y paréntesis.
// ---------------------------------------------------------------------

const RE_NOMBRA = /se (?:nombra|designa)\s+(.+?)\s+a\s+(?:don|doña|D\.|Dª)\s+(.+?)\.?$/i;
const RE_CESE = /se dispone el cese de\s+(?:don|doña|D\.|Dª)\s+(.+?)\s+como\s+(.+?)\.?$/i;

function extraer(titulo) {
  const n = titulo.match(RE_NOMBRA);
  if (n) return { accion: 'nombramiento', cargo: n[1].trim(), persona: n[2].trim() };
  const c = titulo.match(RE_CESE);
  if (c) return { accion: 'cese', persona: c[1].trim(), cargo: c[2].trim() };
  return null;
}

// Los cargos de exterior dominan el volumen —14 de 32 en la muestra— y
// no aportan nada a un directorio de asuntos públicos.
const RE_EXTERIOR = /^(embajador|embajadora|c[oó]nsul|enviad[oa] especial|representante permanente)/i;

/**
 * Saca el organismo del cargo, cuando lo lleva dentro.
 *
 * "Director del Organismo Autónomo Instituto Nacional de Administración
 * Pública" → "Instituto Nacional de Administración Pública"
 *
 * "Presidenta de la Comisión Nacional de los Mercados y la Competencia"
 * → "Comisión Nacional de los Mercados y la Competencia"
 *
 * En cambio "Director General de Financiación Internacional" no lleva
 * organismo: es una unidad del ministerio, y ahí el organismo es el
 * propio departamento.
 */
const RE_ORGANISMO =
  /\b(?:del?|de la|de los|de las)\s+(?:Organismo Aut[oó]nomo\s+)?((?:Comisi[oó]n Nacional|Instituto|Agencia|Consejo|Fondo|Autoridad|Centro|Oficina|Museo|Biblioteca|Fábrica|Entidad|Servicio P[uú]blico|Confederaci[oó]n)\b.+)$/i;

function organismoDe(cargo) {
  const m = cargo.match(RE_ORGANISMO);
  if (!m) return null;
  // Se limpian los paréntesis del final: "(FROB)", "(INAP)".
  return m[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Normaliza para comparar: sin tildes, sin género, sin artículos.
 *
 * Es lo que hace que "Directora General" case con "Director General" y
 * que "Instituto Nacional de Administración Pública (INAP)" case con
 * "Organismo Autónomo Instituto Nacional de Administración Pública".
 */
function clave(texto) {
  if (!texto) return '';
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    // Mapa explícito y no "quitar la última letra": eso convertía
    // "directora" en "directoro" y rompía la mitad de los cruces.
    .replace(
      /\b(directora|subdirectora|presidenta|secretaria|consejera|delegada|interventora|abogada|vicepresidenta)\b/g,
      (m) =>
        ({
          directora: 'director',
          subdirectora: 'subdirector',
          presidenta: 'presidente',
          vicepresidenta: 'vicepresidente',
          secretaria: 'secretario',
          consejera: 'consejero',
          delegada: 'delegado',
          interventora: 'interventor',
          abogada: 'abogado',
        }[m] || m)
    )
    .replace(/\borganismo autonomo\b/g, ' ')
    .replace(/\b(de|del|la|el|los|las|y)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * La materia del cargo: lo que queda al quitarle el rango.
 *
 *   "Director General de Financiación Internacional" → "financiacion internacional"
 *   "Presidenta de la Comisión Nacional…"            → "comision nacional…"
 *
 * Es lo que se puede comparar con el nombre de una unidad, porque DIR3
 * nombra unidades y el BOE nombra puestos.
 */
// Las abreviaturas con las que DIR3 nombra sus unidades. Conviven las
// dos formas: "D.G. de Armamento" y "Dirección General de Estrategia e
// Innovación".
const RE_PREFIJO_DIR3 =
  /^(d\.g\.|direcci[oó]n general|s\. de e\.|secretar[ií]a de estado|s\.gral\.|secretar[ií]a general|s\.g\.|subdirecci[oó]n general|subsecretar[ií]a|gabinete)\s*(del?\s+|de la\s+|)/i;

const RE_RANGO =
  /^(director general|directora general|director|directora|presidente|presidenta|vicepresidente|vicepresidenta|secretario general|secretaria general|secretario de estado|secretaria de estado|subsecretario|subsecretaria|consejero|consejera|subdirector general|subdirectora general|interventor general|interventora general|delegado|delegada)\s*(del?\s+|de la\s+|de los\s+|de las\s+)?(organismo aut[oó]nomo\s+)?/i;

function materiaDe(cargo, organismo) {
  return clave((organismo || cargo || '').replace(RE_RANGO, ''));
}

/**
 * Similitud de trigramas, la misma idea que pg_trgm pero en memoria: se
 * comparan los conjuntos de secuencias de tres letras.
 *
 * Se hace aquí y no en la base para no lanzar una consulta por cada
 * nombramiento: con 2.131 unidades en un Map, comparar es inmediato.
 */
function trigramas(t) {
  const p = `  ${t} `;
  const s = new Set();
  for (let i = 0; i < p.length - 2; i++) s.add(p.slice(i, i + 3));
  return s;
}

function similitud(a, b) {
  if (!a || !b) return 0;
  const ta = trigramas(a);
  const tb = trigramas(b);
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes += 1;
  return comunes / (ta.size + tb.size - comunes);
}

// Por debajo de esto no se propone nada: en las pruebas, 0.26 era ruido
// —"Tesoro y Política Financiera" contra "Segipsa Financiero"— y a
// partir de 0.55 los aciertos eran limpios.
const UMBRAL_AUTO = 0.55;

export async function GET(req) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);

  // Mismo patrón que el sync del BOE: DEBUG_KEY para lanzarlo a mano,
  // CRON_SECRET para cuando entre en vercel.json.
  const esCron = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const esManual = !!process.env.DEBUG_KEY && searchParams.get('key') === process.env.DEBUG_KEY;
  if (!esCron && !esManual) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }

  const supabase = admin();
  const hasta = searchParams.get('hasta') || new Date().toISOString().slice(0, 10);
  const desde =
    searchParams.get('desde') ||
    new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  // 1. Los documentos de personal ya sincronizados en ese rango
  const { data: docs, error: eDocs } = await supabase
    .from('boe_documents')
    .select('id, fecha_publicacion, departamento, titulo')
    .eq('seccion', '2A')
    .gte('fecha_publicacion', desde)
    .lte('fecha_publicacion', hasta)
    .order('fecha_publicacion');

  if (eDocs) return NextResponse.json({ error: eDocs.message }, { status: 500 });

  // 2. Las unidades de la AGE y las equivalencias ya resueltas.
  //
  //    El cruce se hace en tres intentos, de más fiable a menos:
  //      a) cargo_unit_map, decidido a mano y por tanto seguro
  //      b) coincidencia exacta de claves normalizadas
  //      c) similitud por trigramas, que resuelve las diferencias de
  //         redacción entre DIR3 y el BOE
  //
  //    Lo que no pasa ninguno queda pendiente de revisar, y al revisarlo
  //    se convierte en una entrada de cargo_unit_map: cada caso raro se
  //    decide una sola vez.
  const [{ data: unidades }, { data: mapa }] = await Promise.all([
    supabase.from('age_units').select('dir3_code, nombre, categoria, raiz_nombre').eq('activo', true),
    supabase.from('cargo_unit_map').select('clave_cargo, dir3_code, ignorar'),
  ]);

  const equivalencias = new Map((mapa || []).map((m) => [m.clave_cargo, m]));

  const porUnidad = new Map();
  for (const u of unidades || []) {
    // Se quita el prefijo también aquí: DIR3 escribe "D.G. de Política
    // Interior" y el BOE "Director General de Política Interior". Sin
    // esto, las claves son "d g politica interior" y "politica
    // interior", y no casa ninguna dirección general —que son
    // precisamente el grueso de los nombramientos.
    const k = clave(u.nombre.replace(RE_PREFIJO_DIR3, ''));
    if (k && !porUnidad.has(k)) porUnidad.set(k, u);
  }

  // 3. Extraer y cruzar
  const filas = [];
  let sinPatron = 0;

  for (const d of docs || []) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break;

    const e = extraer(d.titulo);
    if (!e) {
      sinPatron += 1;
      continue;
    }

    const esExterior = RE_EXTERIOR.test(e.cargo);
    const organismo = organismoDe(e.cargo);
    const materia = materiaDe(e.cargo, organismo);

    let dir3 = null;
    let via = null;
    let parecido = null;

    // a) Equivalencia decidida a mano. Manda sobre todo lo demás: es la
    //    que resuelve casos como el FROB, que DIR3 llama "Autoridad
    //    Administrativa Indpendiente Frob" y ninguna similitud alcanza.
    const eq = equivalencias.get(materia);
    if (eq) {
      if (eq.ignorar) {
        dir3 = null;
        via = 'ignorado';
      } else {
        dir3 = eq.dir3_code;
        via = 'mapa';
      }
    }

    // b) Coincidencia exacta de claves.
    if (!dir3 && via !== 'ignorado') {
      const u = porUnidad.get(materia);
      if (u) {
        dir3 = u.dir3_code;
        via = 'exacto';
      }
    }

    // c) Similitud. Solo se acepta sola por encima del umbral; lo que
    //    queda por debajo se guarda como sugerencia para revisar, no se
    //    da por bueno.
    let sugerencia = null;
    if (!dir3 && via !== 'ignorado' && materia) {
      let mejor = null;
      let mejorSim = 0;
      for (const [k, u] of porUnidad) {
        const sim = similitud(materia, k);
        if (sim > mejorSim) {
          mejorSim = sim;
          mejor = u;
        }
      }
      if (mejor && mejorSim >= UMBRAL_AUTO) {
        dir3 = mejor.dir3_code;
        via = 'similitud';
        parecido = Number(mejorSim.toFixed(2));
      } else if (mejor && mejorSim >= 0.35) {
        sugerencia = `${mejor.nombre} (${mejor.dir3_code}, ${mejorSim.toFixed(2)})`;
      }
    }

    filas.push({
      boe_id: d.id,
      fecha: d.fecha_publicacion,
      departamento: d.departamento,
      titulo: d.titulo,
      accion: e.accion,
      persona: e.persona,
      cargo: e.cargo,
      organismo,
      es_exterior: esExterior,
      dir3_code: dir3,
      estado: esExterior
        ? 'descartado'
        : via === 'ignorado'
        ? 'descartado'
        : dir3
        ? 'casado'
        : 'sin_equivalencia',
      nota: [via, parecido ? `sim ${parecido}` : null, sugerencia ? `sugerencia: ${sugerencia}` : null]
        .filter(Boolean)
        .join(' · ') || null,
    });
  }

  // 4. Guardar. onConflict por boe_id: reejecutar no duplica y sí
  //    actualiza, que es lo que permite corregir una equivalencia y
  //    relanzar.
  //
  //    Se cuenta lo que devuelve la escritura, no el tamaño del grupo:
  //    sumar a ciegas hacía que el resumen dijera "guardados: 32" cuando
  //    solo se habían escrito 29.
  let guardadas = 0;
  const fallos = [];
  for (let i = 0; i < filas.length; i += 200) {
    const grupo = filas.slice(i, i + 200);
    const { data, error } = await supabase
      .from('boe_appointments')
      .upsert(grupo, { onConflict: 'boe_id', ignoreDuplicates: false })
      .select('id');
    if (error) fallos.push(error.message);
    else guardadas += data?.length || 0;
  }

  // El volcado al directorio, ya que estamos: sin esto los nombramientos
  // se quedaban en la tabla de revisión y había que ejecutar un SQL a
  // mano para que la ficha de la CNMC dejara de decir "todavía no
  // tenemos el titular".
  //
  // Va en una función de Postgres y no aquí porque el orden importa
  // —ceses antes que altas— y la comparación de nombres entre el BOE y
  // el directorio es la misma lógica: duplicarla en JavaScript sería
  // mantenerla en dos sitios.
  let volcado = null;
  const { data: vol, error: eVol } = await supabase.rpc('volcar_titulares_boe');
  if (eVol) volcado = { error: eVol.message };
  else volcado = Array.isArray(vol) ? vol[0] : vol;

  const resumen = filas.reduce((acc, f) => {
    acc[f.estado] = (acc[f.estado] || 0) + 1;
    return acc;
  }, {});

  // Los que no casaron, con su sugerencia si la hay: es la lista de lo
  // que hay que revisar para añadir a cargo_unit_map.
  // Se devuelve también la clave normalizada: sin ella, añadir una
  // equivalencia a mano es adivinar qué cadena espera el sync.
  //
  // Queda un caso sin resolver, la Autoridad de Investigación Técnica de
  // Accidentes: su clave coincide con la del mapa carácter a carácter y
  // aun así no casa, probablemente por algún carácter invisible en el
  // título del BOE. Son ocho documentos de un organismo que no legisla
  // ni tramita expedientes, así que no compensa perseguirlo.
  const revisar = filas
    .filter((f) => f.estado === 'sin_equivalencia')
    .map((f) => ({
      cargo: f.cargo,
      departamento: f.departamento,
      clave: materiaDe(f.cargo, f.organismo),
      nota: f.nota,
    }));

  return NextResponse.json({
    rango: { desde, hasta },
    documentos_leidos: docs?.length || 0,
    sin_patron: sinPatron,
    extraidos: filas.length,
    guardados: guardadas,
    fallos: fallos.length > 0 ? fallos : undefined,
    por_estado: resumen,
    volcado,
    revisar,
    ms: Date.now() - t0,
  });
}
