import { createClient } from '@supabase/supabase-js';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
};

const ORIGIN = 'https://www.lamoncloa.gob.es';
const COMPOSICION_URL = `${ORIGIN}/gobierno/composiciondelgobierno/Paginas/index.aspx`;

const MIN_BIO_LENGTH = 200;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function rankFromRole(role) {
  const r = role.toLowerCase();
  if (r.includes('presidente del gobierno')) return 'presidente';
  if (r.includes('vicepresident')) return 'vicepresidente';
  return 'ministro';
}

function ministryNameFromRole(role) {
  const match = role.match(/ministr[oa]\s+(?:de|para|del|para la)\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim().replace(/^(la|el|los|las)\s+/i, '');
}

// La Moncloa publica algunos microdatos con el dominio REPETIDO dentro del
// propio valor ("https://www.lamoncloa.gob.eshttps://www.lamoncloa.gob.es/...").
// No es un fallo de concatenación nuestro: viene así del origen, y por eso
// cualquier corrección hecha a mano en base de datos se revertía cada noche.
function normalizeUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  const schemes = u.match(/https?:\/\//gi) || [];
  if (schemes.length > 1) {
    u = u.slice(u.lastIndexOf(schemes[schemes.length - 1]));
  }
  if (u.startsWith('/')) u = ORIGIN + u;
  return u || null;
}

function decodeEntities(s) {
  const named = {
    oacute: 'ó', aacute: 'á', eacute: 'é', iacute: 'í', uacute: 'ú',
    Oacute: 'Ó', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Uacute: 'Ú',
    ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç',
    nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
    laquo: '«', raquo: '»', ldquo: '"', rdquo: '"', mdash: '—', ndash: '–',
    hellip: '…', deg: '°', ordm: 'º', ordf: 'ª', middot: '·', euro: '€',
  };
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (named[name] !== undefined ? named[name] : m));
}

const NOISE = [
  /^compartir en$/i,
  /^escuchar$/i,
  /^idioma$/i,
  /^biograf[íi]a$/i,
  /^inicio$/i,
  /^cerrar$/i,
  /^aceptar$/i,
  /^rechazar$/i,
  /^descargar$/i,
  /^galer[íi]a/i,
  /^ver m[áa]s fotos$/i,
  /abre ventana nueva/i,
  /^foto oficial/i,
  /^\(pool moncloa/i,
  /pool moncloa\//i,
  /^m[áa]s informaci[óo]n$/i,
  /^imprimir$/i,
  /^compartir$/i,
];

function isNoise(line) {
  const t = line.trim();
  // Viñeta sin contenido: viene de <li> que solo llevan un icono o imagen
  // (el bloque de "Compartir en" son 6 seguidas).
  if (/^[•\-–—*]?\s*$/.test(t)) return true;
  return NOISE.some((re) => re.test(t));
}

// Las fichas con carrusel de fotos (Robles, por ejemplo) tienen pies de imagen
// que conservan retornos de carro del HTML original. El texto de la biografía
// nunca los lleva: es el marcador más fiable para distinguirlos.
function isCaption(line) {
  return /\r/.test(line);
}

/**
 * Extrae la trayectoria de una ficha de biografía oficial.
 *
 * Las plantillas de La Moncloa no son homogéneas: la del presidente no tiene
 * ningún <h2> y es solo párrafos; la de Defensa mete un carrusel de fotos
 * antes del texto. Por eso se prueban varias anclas de inicio y se valida el
 * resultado por longitud antes de darlo por bueno.
 *
 * Devuelve { text, reason }: si text es null, reason explica por qué.
 */
export async function fetchBioText(bioUrl) {
  const url = normalizeUrl(bioUrl);
  if (!url) return { text: null, reason: 'sin URL' };

  let html;
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) return { text: null, reason: `HTTP ${res.status}` };
    html = await res.text();
  } catch (e) {
    return { text: null, reason: `fetch falló: ${e.message}` };
  }

  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const startCandidates = [
    clean.search(/<\/h1>/i),
    clean.search(/<h2[\s>]/i),
    clean.search(/<div[^>]+id="ctl00_maincontainer"/i),
  ].filter((i) => i >= 0);

  if (startCandidates.length === 0) {
    return { text: null, reason: 'no se encontró inicio de contenido (ni </h1> ni <h2>)' };
  }
  const startIdx = Math.min(...startCandidates);

  const tail = clean.slice(startIdx);
  const endCandidates = [
    tail.search(/M(?:&#225;|&aacute;|á)s\s+informaci/i),
    tail.search(/Mapa del sitio/i),
    tail.search(/<footer[\s>]/i),
    tail.search(/Aviso legal/i),
  ].filter((i) => i > 0);

  const endIdx = endCandidates.length > 0 ? startIdx + Math.min(...endCandidates) : clean.length;
  const raw = clean.slice(startIdx, endIdx);

  const lines = decodeEntities(
    raw
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<h[2-6][^>]*>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .filter((l) => !isCaption(l))
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l.length > 0 && !isNoise(l));

  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (text.length < MIN_BIO_LENGTH) {
    return { text: null, reason: `texto demasiado corto (${text.length} caracteres)` };
  }

  return { text: text.slice(0, 4000), reason: null };
}

async function fetchComposicion() {
  const res = await fetch(COMPOSICION_URL, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`No se pudo cargar Composición del Gobierno (HTTP ${res.status})`);
  const html = await res.text();

  const personRegex =
    /typeof="Person"[\s\S]*?<meta content="([^"]*)" property="jobTitle"[\s\S]*?<meta content="([^"]*)" property="name"[\s\S]*?<meta content="([^"]*)" property="image"[\s\S]*?<meta content="([^"]*)" property="url"/g;

  const people = [];
  let match;
  let orderIndex = 0;
  while ((match = personRegex.exec(html)) !== null) {
    const [, role, fullName, photoUrl, bioUrl] = match;
    if (!fullName || !role) continue;
    if (!/presidente|ministr|vicepresident/i.test(role)) continue;
    orderIndex += 1;
    people.push({
      fullName: fullName.trim(),
      role: role.trim(),
      photoUrl: normalizeUrl(photoUrl),
      bioUrl: normalizeUrl(bioUrl),
      orderIndex,
    });
  }

  if (people.length === 0) {
    const idx = html.indexOf('typeof="Person"');
    const around =
      idx >= 0
        ? html.slice(Math.max(0, idx - 50), idx + 700).replace(/\s+/g, ' ').trim()
        : '(no aparece "typeof=\\"Person\\"" en el HTML)';
    throw new Error(`0 personas encontradas. Alrededor del primer "Person": ${around}`);
  }

  return { people, htmlLength: html.length };
}

/**
 * SINCRONIZACIÓN DIARIA — solo datos volátiles.
 *
 * Quién ocupa cada cartera, con qué cargo, foto y URL de ficha. Eso sí cambia
 * y conviene tenerlo al día.
 *
 * NO toca bio_text. Las biografías son texto estable que cambia dos veces por
 * legislatura; descargarlas cada noche solo servía para que un fallo puntual
 * de la fuente borrara datos buenos, que es exactamente lo que ocurrió.
 * Se cargan aparte con seedBios().
 */
export async function syncGovernment() {
  const stats = { records_received: 0, records_created: 0, records_updated: 0, records_deactivated: 0 };
  const supabase = admin();

  const { people, htmlLength } = await fetchComposicion();
  if (people.length < 15) {
    throw new Error(
      `Solo se encontraron ${people.length} personas (HTML de ${htmlLength} caracteres) — muy pocas, no se continúa`
    );
  }
  stats.records_received = people.length;

  const { data: existingActive } = await supabase.from('government_members').select('id, slug').eq('active', true);
  const existingSlugs = new Set((existingActive || []).map((m) => m.slug));
  const incomingSlugs = new Set();

  for (const person of people) {
    const slug = slugify(person.fullName);
    incomingSlugs.add(slug);

    const payload = {
      full_name: person.fullName,
      slug,
      role: person.role,
      ministry_name: ministryNameFromRole(person.role),
      rank: rankFromRole(person.role),
      order_index: person.orderIndex,
      photo_url: person.photoUrl,
      bio_url: person.bioUrl,
      active: true,
      source: 'lamoncloa.gob.es',
      source_updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('government_members').upsert(payload, { onConflict: 'slug' });
    if (error) throw new Error(`No se pudo guardar a "${person.fullName}": ${error.message}`);

    if (existingSlugs.has(slug)) stats.records_updated += 1;
    else stats.records_created += 1;
  }

  const droppedSlugs = [...existingSlugs].filter((s) => !incomingSlugs.has(s));
  if (droppedSlugs.length > 0) {
    const { error } = await supabase.from('government_members').update({ active: false }).in('slug', droppedSlugs);
    if (error) throw new Error(`No se pudieron marcar los ceses: ${error.message}`);
    stats.records_deactivated = droppedSlugs.length;
  }

  return stats;
}

/**
 * CARGA DE BIOGRAFÍAS — puntual, lanzada a mano.
 *
 * Recorre las fichas oficiales y rellena bio_text. Por defecto solo escribe
 * donde está vacío, así que es seguro relanzarla: no pisa lo que ya hay.
 * Con force=true reescribe todas (útil tras una remodelación).
 *
 * Nunca escribe null: si una ficha falla, se reporta y se deja lo que hubiera.
 */
export async function seedBios({ force = false, only = null } = {}) {
  const supabase = admin();

  let query = supabase.from('government_members').select('slug, full_name, bio_url, bio_text').eq('active', true);
  if (only) query = query.eq('slug', only);

  const { data: members, error } = await query;
  if (error) throw new Error(`No se pudieron leer los miembros: ${error.message}`);

  const resultado = { procesados: 0, rellenados: 0, ya_tenian: 0, fallidos: [] };

  for (const m of members || []) {
    const yaTiene = m.bio_text && m.bio_text.length > MIN_BIO_LENGTH;
    if (yaTiene && !force) {
      resultado.ya_tenian += 1;
      continue;
    }

    resultado.procesados += 1;
    const { text, reason } = await fetchBioText(m.bio_url);

    if (!text) {
      resultado.fallidos.push({ slug: m.slug, name: m.full_name, reason, url: normalizeUrl(m.bio_url) });
      continue;
    }

    const { error: upErr } = await supabase
      .from('government_members')
      .update({ bio_text: text })
      .eq('slug', m.slug);

    if (upErr) resultado.fallidos.push({ slug: m.slug, name: m.full_name, reason: `guardado: ${upErr.message}` });
    else resultado.rellenados += 1;
  }

  return resultado;
}

// Diagnóstico de una sola ficha, sin escribir nada.
export async function debugBio(slugOrUrl) {
  const supabase = admin();
  let url = slugOrUrl;

  if (!/^https?:\/\//i.test(slugOrUrl)) {
    const { data } = await supabase
      .from('government_members')
      .select('full_name, bio_url')
      .eq('slug', slugOrUrl)
      .limit(1)
      .maybeSingle();
    if (!data) return { error: `no existe nadie con slug "${slugOrUrl}"` };
    url = data.bio_url;
  }

  const normalized = normalizeUrl(url);
  const result = await fetchBioText(normalized);

  return {
    url_en_bd: url,
    url_normalizada: normalized,
    url_estaba_rota: url !== normalized,
    extraccion_ok: !!result.text,
    motivo_fallo: result.reason,
    longitud: result.text ? result.text.length : 0,
    primeros_400: result.text ? result.text.slice(0, 400) : null,
    ultimos_200: result.text ? result.text.slice(-200) : null,
  };
}
