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
 *   /api/sync/boe-cargos?key=...                    los últimos 30 días
 *   /api/sync/boe-cargos?key=...&desde=2023-11-01&hasta=2023-11-30
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

export async function GET(req) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);

  if (searchParams.get('key') !== process.env.SYNC_KEY) {
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

  // 2. El directorio, para el cruce. Se indexa por organismo y por
  //    cargo compuesto, que son las dos formas en que puede casar.
  const { data: oficiales } = await supabase
    .from('government_officials')
    .select('id, ministry_name, unit_name, role, full_name')
    .eq('active', true);

  const porOrganismo = new Map();
  const porCargo = new Map();
  for (const o of oficiales || []) {
    if (o.unit_name && o.unit_name !== o.ministry_name) {
      const k = clave(o.unit_name);
      if (k && !porOrganismo.has(k)) porOrganismo.set(k, o);
    }
    // El cargo completo, para las unidades del ministerio: 'Director
    // General de Financiación Internacional'.
    const compuesto =
      o.unit_name && o.unit_name !== o.ministry_name
        ? `${o.role} de ${o.unit_name.replace(/^(Dirección General|Subdirección General|Secretaría General|Secretaría de Estado|Subsecretaría)\s*(de\s+|del\s+)?/i, '')}`
        : o.role;
    const kc = clave(compuesto);
    if (kc && !porCargo.has(kc)) porCargo.set(kc, o);
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

    // Primero por organismo, que es el cruce fiable: el INAP casa así y
    // no por título. Si el cargo no menciona organismo, por cargo.
    let match = null;
    if (organismo) match = porOrganismo.get(clave(organismo)) || null;
    if (!match) match = porCargo.get(clave(e.cargo)) || null;

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
      official_id: match?.id || null,
      estado: esExterior ? 'descartado' : match ? 'casado' : 'sin_equivalencia',
    });
  }

  // 4. Guardar. onConflict por boe_id: reejecutar no duplica.
  let guardadas = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const grupo = filas.slice(i, i + 200);
    const { error } = await supabase
      .from('boe_appointments')
      .upsert(grupo, { onConflict: 'boe_id' });
    if (!error) guardadas += grupo.length;
  }

  const resumen = filas.reduce((acc, f) => {
    acc[f.estado] = (acc[f.estado] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    rango: { desde, hasta },
    documentos_leidos: docs?.length || 0,
    sin_patron: sinPatron,
    extraidos: filas.length,
    guardados: guardadas,
    por_estado: resumen,
    ms: Date.now() - t0,
  });
}
