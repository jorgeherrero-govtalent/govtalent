import { createClient } from '@supabase/supabase-js';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
};

const COMPOSICION_URL = 'https://www.lamoncloa.gob.es/gobierno/composiciondelgobierno/Paginas/index.aspx';

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

// "Vicepresidente primero y ministro de Economía, Comercio y Empresa" -> "Economía, Comercio y Empresa"
// "Ministra de Sanidad" -> "Sanidad"
function ministryNameFromRole(role) {
  const match = role.match(/ministr[oa]\s+(?:de|para|del|para la)\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// La página de Composición del Gobierno es HTML plano — cada persona aparece
// como: <img ... alt="Biografía de NOMBRE" src="FOTO" /> ... <a href="URL_BIO">NOMBRE</a> ... CARGO
async function fetchComposicion() {
  const res = await fetch(COMPOSICION_URL, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`No se pudo cargar Composición del Gobierno (HTTP ${res.status})`);
  const html = await res.text();

  // Cada bloque de persona: imagen con alt="Biografía de X", seguida del
  // enlace a su ficha con el nombre, seguida de una línea con el cargo.
  const blockRegex =
    /<img[^>]*alt="Biografía de ([^"]+)"[^>]*src="([^"]+)"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>\s*[\s\S]*?<\/a>\s*<\/p>\s*<p[^>]*>\s*([\s\S]*?)\s*<\/p>/g;

  const people = [];
  let match;
  let orderIndex = 0;
  while ((match = blockRegex.exec(html)) !== null) {
    const [, altName, photoUrl, bioUrl, roleRaw] = match;
    const role = roleRaw.replace(/<[^>]+>/g, '').trim();
    if (!altName || !role) continue;
    orderIndex += 1;
    people.push({
      fullName: altName.trim(),
      photoUrl,
      bioUrl: bioUrl.startsWith('http') ? bioUrl : `https://www.lamoncloa.gob.es${bioUrl}`,
      role,
      orderIndex,
    });
  }
  return { people, htmlLength: html.length };
}

// Trae la trayectoria (texto plano) de la ficha individual de biografía.
async function fetchBioText(bioUrl) {
  try {
    const res = await fetch(bioUrl, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;
    const html = await res.text();
    // El contenido principal de la biografía suele ir en un bloque <main> o
    // dentro de párrafos tras el título — nos quedamos con el texto plano,
    // recortado a un tamaño razonable.
    const mainMatch = html.match(/<div[^>]*class="[^"]*ms-rtestate-field[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const raw = mainMatch ? mainMatch[1] : null;
    if (!raw) return null;
    const text = raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
    return text ? text.slice(0, 4000) : null;
  } catch {
    return null;
  }
}

export async function syncGovernment() {
  const stats = { records_received: 0, records_created: 0, records_updated: 0, records_deactivated: 0 };
  const supabase = admin();

  const { people, htmlLength } = await fetchComposicion();
  if (people.length < 15) {
    // Validación de seguridad: si el parser trae muy pocos registros
    // (normalmente son ~24), algo ha cambiado en la página — no se toca nada.
    throw new Error(`Solo se encontraron ${people.length} personas (HTML de ${htmlLength} caracteres) — muy pocas, no se continúa`);
  }
  stats.records_received = people.length;

  const { data: existingActive } = await supabase.from('government_members').select('id, slug').eq('active', true);
  const existingSlugs = new Set((existingActive || []).map((m) => m.slug));
  const incomingSlugs = new Set();

  for (const person of people) {
    const slug = slugify(person.fullName);
    incomingSlugs.add(slug);

    const bioText = await fetchBioText(person.bioUrl);

    const payload = {
      full_name: person.fullName,
      slug,
      role: person.role,
      ministry_name: ministryNameFromRole(person.role),
      rank: rankFromRole(person.role),
      order_index: person.orderIndex,
      photo_url: person.photoUrl,
      bio_url: person.bioUrl,
      bio_text: bioText,
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
