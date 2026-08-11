// =====================================================================
// SYNC — Parlamento Europeo
// app/api/sync/instituciones-parlamento-europeo/route.js
//
// Fuente: https://data.europarl.europa.eu/api/v2 (API oficial, sin auth,
// licencia abierta). Estructura verificada en 3 rondas de diagnóstico.
//
// TRES REGLAS QUE VIENEN DE ERRORES REALES:
//
//  1. Las pertenencias incluyen HISTÓRICO (media de 30 por eurodiputado).
//     Solo las que no tienen endDate están vigentes. Sin este filtro,
//     mostraríamos comisiones que alguien dejó hace años.
//
//  2. El catálogo de órganos NO se sincroniza entero: su paginación es
//     poco fiable (devuelve <1000 y aún así hay más) y mezcla todas las
//     legislaturas desde 1979. En su lugar resolvemos solo los órganos
//     referenciados por pertenencias vigentes.
//
//  3. NUNCA sobrescribir con vacío. Si la ficha individual falla, se
//     conserva lo que ya hubiera en base de datos. (Lección de
//     La Moncloa: un 404 dejó ministros sin biografía.)
//
// Parámetros opcionales:
//   ?offset=0&limit=250   procesar solo un tramo (para la primera carga)
//   ?dry=1                no escribe nada, solo informa
// =====================================================================

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://data.europarl.europa.eu/api/v2';
const TIMEOUT_MS = 20000;
const CONCURRENCIA = 10;
const LOTE_BD = 1000;

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

async function callEP(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/ld+json' },
      cache: 'no-store',
    });
    if (res.status !== 200) return { ok: false, status: res.status, data: null };
    const txt = await res.text();
    try {
      const data = JSON.parse(txt);
      if (data && data.error) return { ok: false, status: 200, data: null };
      return { ok: true, status: 200, data };
    } catch {
      return { ok: false, status: 200, data: null };
    }
  } catch (e) {
    return { ok: false, status: null, data: null, motivo: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

// La API sirve el array bajo la clave "data" (el @context la aliasea a @graph).
function items(d) {
  if (!d || typeof d !== 'object') return [];
  if (Array.isArray(d.data)) return d.data;
  if (Array.isArray(d['@graph'])) return d['@graph'];
  return [];
}

async function enParalelo(tareas, concurrencia) {
  const out = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tareas.length) {
      const i = cursor++;
      out[i] = await tareas[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrencia, tareas.length || 1) }, worker));
  return out;
}

function slugify(txt) {
  return (txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Quita null / undefined / cadena vacía. Es LA salvaguarda del punto 3:
// PostgREST solo actualiza las columnas presentes en el payload, así que
// omitir un campo preserva el valor que ya hubiera guardado.
function limpiar(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

// "http://.../country/POL" -> "POL" ; "mailto:x@y" -> "x@y"
function ultimoSegmento(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const limpio = uri.replace(/^mailto:/, '').replace(/^tel:/, '');
  if (!uri.includes('/')) return limpio;
  const partes = limpio.split('/');
  return partes[partes.length - 1] || null;
}

const TIPOS_ORGANO = {
  COMMITTEE_PARLIAMENTARY_STANDING: 'committee',
  COMMITTEE_PARLIAMENTARY_TEMPORARY: 'committee',
  COMMITTEE_PARLIAMENTARY_SUB: 'subcommittee',
  DELEGATION_PARLIAMENTARY: 'delegation',
  DELEGATION_JOINT_COMMITTEE: 'delegation',
  DELEGATION_PARLIAMENTARY_ASSEMBLY: 'delegation',
  EU_POLITICAL_GROUP: 'eu_group',
  NATIONAL_POLITICAL_GROUP: 'national_party',
  GOVERNING_BODY: 'governing',
  EU_INSTITUTION: 'institution',
  WORKING_GROUP: 'working_group',
};

function tipoDeOrgano(classification) {
  const clave = ultimoSegmento(classification);
  return TIPOS_ORGANO[clave] || 'other';
}

const REDES = { YTB: 'youtube', FBW: 'facebook', IST: 'instagram', TWT: 'x', LKD: 'linkedin' };

// ---------------------------------------------------------------------
// Transformación de una ficha individual de eurodiputado
// ---------------------------------------------------------------------
function parsearMep(ficha, basico, slugsUsados) {
  const pertenencias = Array.isArray(ficha?.hasMembership) ? ficha.hasMembership : [];

  // Contacto: vive dentro de la pertenencia de mandato (MEMBER_PARLIAMENT),
  // no en la raíz. Se distingue Bruselas de Estrasburgo por prefijo
  // telefónico: +32 = Bruselas, +33 = Estrasburgo.
  let oficinaBru = null, telBru = null, oficinaStr = null, telStr = null, inicioMandato = null;

  for (const p of pertenencias) {
    const puntos = Array.isArray(p.contactPoint) ? p.contactPoint : [];
    for (const c of puntos) {
      const tel = c?.hasTelephone?.hasValue ? String(c.hasTelephone.hasValue).replace('tel:', '') : null;
      if (tel && tel.startsWith('+32')) {
        oficinaBru = c.officeAddress || oficinaBru;
        telBru = tel;
      } else if (tel && tel.startsWith('+33')) {
        oficinaStr = c.officeAddress || oficinaStr;
        telStr = tel;
      }
    }
    if (ultimoSegmento(p.role) === 'MEMBER_PARLIAMENT' && p.memberDuring?.startDate) {
      inicioMandato = p.memberDuring.startDate;
    }
  }

  // Partido nacional: pertenencia VIGENTE de clase NATIONAL_POLITICAL_GROUP.
  const partido = pertenencias.find(
    (p) =>
      ultimoSegmento(p.membershipClassification) === 'NATIONAL_POLITICAL_GROUP' &&
      !p.memberDuring?.endDate
  );

  const redes = (Array.isArray(ficha?.account) ? ficha.account : [])
    .map((a) => ({ tipo: REDES[ultimoSegmento(a.dcterms_type)] || 'otra', url: a.id }))
    .filter((r) => r.url);

  const nombre = ficha?.label || basico.label;
  let slug = slugify(nombre);
  if (!slug || slugsUsados.has(slug)) slug = `${slug || 'mep'}-${basico.identifier}`;
  slugsUsados.add(slug);

  return limpiar({
    id: String(basico.identifier),
    full_name: nombre,
    family_name: ficha?.familyName || basico.familyName,
    given_name: ficha?.givenName || basico.givenName,
    sort_label: ficha?.sortLabel || basico.sortLabel,
    slug,
    country_code: basico['api:country-of-representation'],
    political_group_code: basico['api:political-group'],
    national_party_id: partido?.organization || null,
    photo_url: ficha?.img,
    email: ficha?.hasEmail ? String(ficha.hasEmail).replace(/^mailto:/, '') : null,
    birth_date: ficha?.bday,
    place_of_birth: ficha?.placeOfBirth,
    citizenship: ultimoSegmento(ficha?.citizenship),
    gender: ultimoSegmento(ficha?.hasGender),
    office_brussels: oficinaBru,
    phone_brussels: telBru,
    office_strasbourg: oficinaStr,
    phone_strasbourg: telStr,
    socials: redes.length > 0 ? redes : null,
    mandate_start: inicioMandato,
    active: true,
    last_synced_at: new Date().toISOString(),
  });
}

function parsearPertenencias(ficha, mepId) {
  const lista = Array.isArray(ficha?.hasMembership) ? ficha.hasMembership : [];
  return lista
    .filter((p) => p.identifier && p.organization)
    .map((p) => ({
      id: String(p.identifier),
      mep_id: mepId,
      body_id: p.organization,
      role: ultimoSegmento(p.role),
      classification: ultimoSegmento(p.membershipClassification),
      start_date: p.memberDuring?.startDate || null,
      end_date: p.memberDuring?.endDate || null,
    }));
}

function parsearOrgano(o) {
  if (!o || !o.id) return null;
  return limpiar({
    id: o.id,
    identifier: o.identifier,
    canonical_code: o.isVersionOf ? String(o.isVersionOf).replace(/^org\//, '') : null,
    code: o.label,
    name_es: o.prefLabel?.es,
    name_en: o.prefLabel?.en,
    short_name_es: o.altLabel?.es,
    classification: ultimoSegmento(o.classification),
    body_type: tipoDeOrgano(o.classification),
    country_code: Array.isArray(o.represents) ? ultimoSegmento(o.represents[0]) : null,
    term_start: o.temporal?.startDate,
    term_end: o.temporal?.endDate,
    slug: `${slugify(o.label || o.identifier)}-${o.identifier}`,
    active: true,
  });
}

async function enLotes(filas, fn) {
  let escritas = 0;
  const errores = [];
  for (let i = 0; i < filas.length; i += LOTE_BD) {
    const lote = filas.slice(i, i + LOTE_BD);
    const { error } = await fn(lote);
    if (error) errores.push(`${i}: ${error.message}`);
    else escritas += lote.length;
  }
  return { escritas, errores };
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------
export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const dry = sp.get('dry') === '1';
  const offset = parseInt(sp.get('offset') || '0', 10);
  const limite = parseInt(sp.get('limit') || '0', 10);

  // Protección: cabecera de cron de Vercel o secreto explícito.
  const secreto = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (secreto && auth !== `Bearer ${secreto}`) {
    return Response.json({ error: 'no autorizado' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const informe = { inicio: new Date().toISOString(), dry_run: dry, fases: {} };

  // --- FASE 1: listado de eurodiputados vigentes -----------------------
  const t1 = Date.now();
  const lista = await callEP(`${BASE}/meps/show-current?limit=900&format=application%2Fld%2Bjson`);
  if (!lista.ok) {
    return Response.json(
      { error: 'no se pudo leer el listado de eurodiputados', detalle: lista, ms: Date.now() - t0 },
      { status: 502 }
    );
  }
  let basicos = items(lista.data).filter((m) => m.identifier);

  // Salvaguarda: si la fuente devuelve un listado anormalmente corto,
  // abortamos en vez de desactivar a media cámara.
  if (basicos.length < 500) {
    return Response.json(
      { error: `listado sospechosamente corto (${basicos.length}), se aborta sin escribir`, ms: Date.now() - t0 },
      { status: 502 }
    );
  }

  const totalVigentes = basicos.length;
  if (limite > 0) basicos = basicos.slice(offset, offset + limite);

  informe.fases['1_listado'] = { total_vigentes: totalVigentes, a_procesar: basicos.length, ms: Date.now() - t1 };

  // --- FASE 2: fichas individuales -------------------------------------
  const t2 = Date.now();
  const slugsUsados = new Set();
  const resultados = await enParalelo(
    basicos.map((b) => async () => {
      const r = await callEP(`${BASE}/meps/${b.identifier}?format=application%2Fld%2Bjson`);
      const ficha = r.ok ? items(r.data)[0] : null;
      return { basico: b, ficha, ok: !!ficha };
    }),
    CONCURRENCIA
  );

  const fallidas = resultados.filter((r) => !r.ok);
  const meps = [];
  let pertenencias = [];

  for (const r of resultados) {
    // Si la ficha falló, igualmente guardamos los datos del listado.
    // Al omitir el resto de campos, los valores previos se conservan.
    meps.push(parsearMep(r.ficha, r.basico, slugsUsados));
    if (r.ficha) pertenencias = pertenencias.concat(parsearPertenencias(r.ficha, String(r.basico.identifier)));
  }

  informe.fases['2_fichas'] = {
    solicitadas: basicos.length,
    fallidas: fallidas.length,
    pertenencias_totales: pertenencias.length,
    pertenencias_vigentes: pertenencias.filter((p) => !p.end_date).length,
    ms: Date.now() - t2,
  };

  // --- FASE 3: órganos referenciados por pertenencias VIGENTES ---------
  // No se sincroniza el catálogo completo: solo lo que hace falta.
  const t3 = Date.now();
  const orgsNecesarios = [...new Set(pertenencias.filter((p) => !p.end_date).map((p) => p.body_id))];

  let orgsConocidos = new Set();
  if (!dry) {
    const { data: existentes } = await supabase.from('eu_bodies').select('id');
    orgsConocidos = new Set((existentes || []).map((o) => o.id));
  }
  const orgsAResolver = orgsNecesarios.filter((id) => !orgsConocidos.has(id));

  const organos = [];
  if (orgsAResolver.length > 0) {
    const res = await enParalelo(
      orgsAResolver.map((orgId) => async () => {
        const num = String(orgId).replace(/^org\//, '');
        const r = await callEP(`${BASE}/corporate-bodies/${num}?format=application%2Fld%2Bjson`);
        return r.ok ? parsearOrgano(items(r.data)[0]) : null;
      }),
      CONCURRENCIA
    );
    for (const o of res) if (o) organos.push(o);
  }

  informe.fases['3_organos'] = {
    referenciados_vigentes: orgsNecesarios.length,
    ya_en_bd: orgsNecesarios.length - orgsAResolver.length,
    resueltos_ahora: organos.length,
    fallidos: orgsAResolver.length - organos.length,
    ms: Date.now() - t3,
  };

  if (dry) {
    informe.ms_total = Date.now() - t0;
    informe.nota = 'dry run: no se ha escrito nada';
    informe.muestra_mep = meps[0] || null;
    informe.muestra_organo = organos[0] || null;
    return Response.json(informe);
  }

  // --- FASE 4: escritura -----------------------------------------------
  // Orden obligado por las claves foráneas: órganos, eurodiputados,
  // pertenencias.
  const t4 = Date.now();

  const wOrg = await enLotes(organos, (lote) =>
    supabase.from('eu_bodies').upsert(lote, { onConflict: 'id' })
  );
  const wMep = await enLotes(meps, (lote) =>
    supabase.from('eu_meps').upsert(lote, { onConflict: 'id' })
  );

  // Solo pertenencias cuyo órgano exista, para no violar la FK.
  const { data: orgsBd } = await supabase.from('eu_bodies').select('id');
  const idsOrg = new Set((orgsBd || []).map((o) => o.id));
  const pertenenciasValidas = pertenencias.filter((p) => idsOrg.has(p.body_id));

  const wPer = await enLotes(pertenenciasValidas, (lote) =>
    supabase.from('eu_mep_memberships').upsert(lote, { onConflict: 'id' })
  );

  informe.fases['4_escritura'] = {
    organos: wOrg,
    eurodiputados: wMep,
    pertenencias: { ...wPer, descartadas_sin_organo: pertenencias.length - pertenenciasValidas.length },
    ms: Date.now() - t4,
  };

  // --- FASE 5: bajas ----------------------------------------------------
  // Solo en pasada completa: en modo troceado no sabemos quién falta.
  if (limite === 0) {
    const vigentes = basicos.map((b) => String(b.identifier));
    const { error, count } = await supabase
      .from('eu_meps')
      .update({ active: false })
      .not('id', 'in', `(${vigentes.join(',')})`)
      .eq('active', true)
      .select('id', { count: 'exact', head: true });
    informe.fases['5_bajas'] = { desactivados: count ?? 0, error: error?.message || null };
  } else {
    informe.fases['5_bajas'] = { omitido: 'pasada parcial (offset/limit)' };
  }

  // --- Registro de la ejecución (no debe tumbar el sync si falla) ------
  try {
    await supabase.from('institutional_sync_runs').insert({
      source: 'parlamento-europeo',
      status: fallidas.length === 0 ? 'ok' : 'parcial',
      records_processed: meps.length,
      details: informe,
    });
  } catch (e) {
    informe.aviso_log = `no se pudo registrar en institutional_sync_runs: ${e.message}`;
  }

  informe.ms_total = Date.now() - t0;
  return Response.json(informe);
}
