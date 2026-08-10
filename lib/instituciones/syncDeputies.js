import { createClient } from '@supabase/supabase-js';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// El nombre del fichero cambia cada vez que el Congreso lo regenera
// (DiputadosActivos__20260810050006.json), así que hay que descubrirlo cada
// vez en vez de guardar una URL fija.
async function getDiputadosActivosUrl() {
  const res = await fetch('https://www.congreso.es/es/opendata/diputados', { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`No se pudo cargar la página de datos abiertos (HTTP ${res.status})`);
  const html = await res.text();
  const match = html.match(/https:\/\/www\.congreso\.es\/webpublica\/opendata\/diputados\/DiputadosActivos__\d+\.json/);
  if (!match) {
    const snippet = html.slice(0, 500).replace(/\s+/g, ' ').trim();
    throw new Error(
      `No se encontró el enlace del JSON. HTTP ${res.status}, ${html.length} caracteres recibidos. Primeros 500: "${snippet}"`
    );
  }
  return match[0];
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// "Abades Martínez, Cristina" -> { firstName: 'Cristina', lastName: 'Abades Martínez' }
function splitName(nombreOficial) {
  const [lastName, firstName] = nombreOficial.split(',').map((s) => s.trim());
  return { firstName: firstName || '', lastName: lastName || nombreOficial };
}

// "17/08/2023" -> "2023-08-17"
function parseFechaEs(fecha) {
  if (!fecha) return null;
  const [d, m, y] = fecha.split('/');
  if (!d || !m || !y) return null;
  return `${y}-${m}-${d}`;
}

export async function syncDeputiesFase1() {
  const supabase = admin();
  const stats = { records_received: 0, records_created: 0, records_updated: 0, records_deactivated: 0 };

  // 1. Legislatura vigente (XV) — se asume vigente hasta que se indique lo contrario.
  const { data: legislature, error: legError } = await supabase
    .from('legislatures')
    .upsert({ code: 'XV', name: 'XV Legislatura (2023-Actualidad)', active: true }, { onConflict: 'code' })
    .select()
    .single();
  if (legError) throw new Error(`No se pudo preparar la legislatura: ${legError.message}`);

  // 2. Descargar el JSON del día.
  const jsonUrl = await getDiputadosActivosUrl();
  const jsonRes = await fetch(jsonUrl, { headers: BROWSER_HEADERS });
  if (!jsonRes.ok) throw new Error(`No se pudo descargar el JSON de diputados (HTTP ${jsonRes.status})`);
  const rows = await jsonRes.json();

  if (!Array.isArray(rows) || rows.length < 300) {
    // Punto 25 del brief: si el dataset trae muchos menos registros de lo
    // esperado (normalmente ~350), no se toca nada — se marca error y ya.
    throw new Error(`El dataset trajo ${Array.isArray(rows) ? rows.length : 0} registros — muy pocos, no se continúa`);
  }
  stats.records_received = rows.length;

  // 3. Grupos parlamentarios — se derivan de los propios diputados.
  const groupNames = [...new Set(rows.map((r) => r.GRUPOPARLAMENTARIO).filter(Boolean))];
  const groupIdByName = {};
  for (const name of groupNames) {
    const slug = slugify(name);
    const { data: group, error: groupError } = await supabase
      .from('parliamentary_groups')
      .upsert(
        { legislature_id: legislature.id, name, slug, source: 'congreso.es', source_updated_at: new Date().toISOString() },
        { onConflict: 'legislature_id,slug' }
      )
      .select()
      .single();
    if (groupError) throw new Error(`No se pudo guardar el grupo "${name}": ${groupError.message}`);
    groupIdByName[name] = group.id;
  }

  // 4. Diputados que ya teníamos activos, para detectar bajas por diferencia.
  const { data: existingActive } = await supabase
    .from('deputies')
    .select('id, slug')
    .eq('legislature_id', legislature.id)
    .eq('active', true);
  const existingSlugs = new Set((existingActive || []).map((d) => d.slug));
  const incomingSlugs = new Set();

  // 5. Upsert de cada diputado. No se toca cod_parlamentario, photo_url ni
  // email — esos los rellena la Fase 2, no queremos pisarlos aquí.
  for (const row of rows) {
    const { firstName, lastName } = splitName(row.NOMBRE);
    const baseSlug = slugify(`${firstName} ${lastName}`);
    let slug = baseSlug;
    let attempt = 1;
    // Evita colisiones de slug entre homónimos reales (poco frecuente, pero posible).
    while (incomingSlugs.has(slug)) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }
    incomingSlugs.add(slug);

    const payload = {
      legislature_id: legislature.id,
      full_name: row.NOMBRE,
      first_name: firstName,
      last_name: lastName,
      slug,
      constituency: row.CIRCUNSCRIPCION,
      parliamentary_group_id: row.GRUPOPARLAMENTARIO ? groupIdByName[row.GRUPOPARLAMENTARIO] : null,
      mandate_start: parseFechaEs(row.FECHAALTA),
      active: true,
      official_bio: row.BIOGRAFIA || null,
      source: 'congreso.es',
      source_updated_at: new Date().toISOString(),
    };

    const wasExisting = existingSlugs.has(slug);
    const { error: upsertError } = await supabase.from('deputies').upsert(payload, { onConflict: 'slug' });
    if (upsertError) throw new Error(`No se pudo guardar a "${row.NOMBRE}": ${upsertError.message}`);

    if (wasExisting) stats.records_updated += 1;
    else stats.records_created += 1;
  }

  // 6. Bajas: quien estaba activo y ya no aparece en el dataset de hoy.
  const droppedSlugs = [...existingSlugs].filter((s) => !incomingSlugs.has(s));
  if (droppedSlugs.length > 0) {
    const { error: deactivateError } = await supabase
      .from('deputies')
      .update({ active: false, mandate_end: new Date().toISOString().slice(0, 10) })
      .in('slug', droppedSlugs);
    if (deactivateError) throw new Error(`No se pudieron marcar las bajas: ${deactivateError.message}`);
    stats.records_deactivated = droppedSlugs.length;
  }

  // 7. Recalcular member_count por grupo (dato informativo, no fuente de verdad).
  for (const [name, groupId] of Object.entries(groupIdByName)) {
    const { count } = await supabase
      .from('deputies')
      .select('id', { count: 'exact', head: true })
      .eq('parliamentary_group_id', groupId)
      .eq('active', true);
    await supabase.from('parliamentary_groups').update({ member_count: count || 0 }).eq('id', groupId);
  }

  return stats;
}
