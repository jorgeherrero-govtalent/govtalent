import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_TYPES = [
  'empresa',
  'consultora_public_affairs',
  'tercer_sector_ong',
  'partido_politico',
  'institucion_publica',
  'think_tank_fundacion',
  'medios_comunicacion',
  'universidad_centro_educativo',
  'asociacion_profesional',
  'otro',
];

const VALID_SIZES = ['1-10', '11-50', '50-200', '200-1000', '+1000'];

function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function requireSuperadmin() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
  if (profile?.role !== 'platform_admin') return null;
  return authData.user;
}

export async function POST(request) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await request.json();
  const { rows, org_type, source } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No hay filas para importar' }, { status: 400 });
  }
  if (!VALID_TYPES.includes(org_type)) {
    return NextResponse.json({ error: 'Tipo de organización no válido' }, { status: 400 });
  }
  if (rows.length > 5000) {
    return NextResponse.json({ error: 'Máximo 5.000 filas por lote — divide el archivo en varias cargas' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Traemos también los slugs existentes — el bug anterior solo comprobaba duplicados
  // por nombre, pero nunca contra los slugs (URLs) ya usados en la base de datos.
  const { data: existingOrgs, error: existingError } = await admin.from('organizations').select('name, slug');
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const existingNames = new Set((existingOrgs || []).map((o) => normalize(o.name)));
  const usedSlugs = new Set((existingOrgs || []).map((o) => o.slug));

  const seenInBatch = new Set();
  const toInsert = [];
  let skippedDuplicates = 0;
  let skippedNoName = 0;

  for (const row of rows) {
    const name = (row.name || '').trim().replace(/\s+/g, ' ');
    if (!name) {
      skippedNoName++;
      continue;
    }
    const key = normalize(name);
    if (existingNames.has(key) || seenInBatch.has(key)) {
      skippedDuplicates++;
      continue;
    }
    seenInBatch.add(key);

    const sizeRaw = (row.size_range || '').trim();
    const size_range = VALID_SIZES.includes(sizeRaw) ? sizeRaw : null;

    // Genera un slug único de verdad: comprueba contra los ya existentes en la BD
    // y contra los que ya se han asignado en este mismo lote.
    let baseSlug = slugify(name) || `org-${Math.random().toString(36).slice(2, 8)}`;
    let finalSlug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(finalSlug)) {
      finalSlug = `${baseSlug}-${suffix}`;
      suffix++;
    }
    usedSlugs.add(finalSlug);

    toInsert.push({
      name,
      slug: finalSlug,
      org_type,
      sector: row.sector?.trim() || null,
      location: row.location?.trim() || null,
      size_range,
      website_url: row.website_url?.trim() || null,
      linkedin_url: row.linkedin_url?.trim() || null,
      contact_email: row.contact_email?.trim() || null,
      claimed: false,
      verified: false,
      source: source?.trim() || 'Carga masiva backoffice',
    });
  }

  if (toInsert.length === 0) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      skippedDuplicates,
      skippedNoName,
    });
  }

  const { error: insertError } = await admin.from('organizations').insert(toInsert);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted: toInsert.length,
    skippedDuplicates,
    skippedNoName,
  });
}
