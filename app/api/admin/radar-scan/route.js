import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

async function requireSuperadmin() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
  if (profile?.role !== 'platform_admin') return null;
  return authData.user;
}

// Fuentes de prensa especializada a las que se restringe la búsqueda de medios,
// para evitar el ruido genérico (nombramientos de gobierno, BOE, etc. que no
// nos interesan aquí — esos van por su propio motor más adelante).
const MEDIOS_ESPECIALIZADOS = [
  'dircomfidencial.com',
  'topcomunicacion.com',
  'prnoticias.com',
  'elpublicista.com',
  'servimedia.es',
  'elmundo.es',
  'elconfidencial.com',
  'elpais.com',
  'eleconomista.es',
  'expansion.com',
];

const CONSULTAS_BASE = [
  'asuntos públicos nombramiento',
  'nuevo director asuntos públicos',
  'nueva directora asuntos públicos',
  'fichaje asuntos públicos',
];

const PUNTOS_POR_FUENTE = {
  nota_prensa: 70,
  medio_profesional: 40,
  pagina_corporativa: 50,
  boe: 90,
  usuario_propio: 80,
  fuente_secundaria: 20,
  registro_transparencia: 60,
};

export async function POST(request) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor' }, { status: 500 });
  }

  const admin = createAdminClient();

  const mediosQuery = MEDIOS_ESPECIALIZADOS.map((d) => `site:${d}`).join(' OR ');

  const promptText = `Eres un analista que rastrea nombramientos y ceses de directivos de Asuntos Públicos,
Relaciones Institucionales y Comunicación Corporativa en España.

Haz varias búsquedas web para encontrar anuncios RECIENTES (últimas 2-3 semanas) de este tipo. Usa
EXACTAMENTE estas consultas base, una por una:
${CONSULTAS_BASE.map((q) => `- "${q}"`).join('\n')}

Y además, consultas restringidas a estos medios especializados: ${mediosQuery}

Para cada nombramiento o cese que encuentres con una fuente clara y verificable, extrae los datos.
Ignora cualquier resultado que no sea sobre asuntos públicos/relaciones institucionales/comunicación
corporativa (por ejemplo, nombramientos de gobierno vía BOE no cuentan aquí, ni de otras áreas como
marketing o RRHH salvo que el cargo combine explícitamente asuntos públicos).

Cuando termines de buscar, responde ÚNICAMENTE con un array JSON (sin texto antes ni después, sin
backticks de markdown) con este formato exacto:

[
  {
    "claim_type": "appointment o departure",
    "person_name": "nombre completo de la persona",
    "organization_name": "nombre de la organización, tal cual aparece en la fuente",
    "role_title": "cargo exacto mencionado",
    "claim_text": "una frase corta y clara resumiendo el hallazgo, en español",
    "source_type": "nota_prensa o medio_profesional",
    "provider": "nombre del medio o de la organización que publicó la nota",
    "source_url": "URL exacta de la fuente",
    "published_at": "fecha de publicación en formato YYYY-MM-DD si se puede determinar, o null",
    "evidence_text": "la frase literal de la fuente que sustenta el hallazgo, entre comillas"
  }
]

Si no encuentras ningún nombramiento verificable, responde con un array vacío: []
No inventes ningún dato. Si no estás seguro de algún campo, pon null en ese campo concreto,
pero nunca inventes una URL o una cita que no exista en los resultados de búsqueda.`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: promptText }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Error de la API de Anthropic en radar-scan:', errText);
    return NextResponse.json({ error: 'Error al ejecutar la búsqueda con IA' }, { status: 502 });
  }

  const aiData = await aiRes.json();
  const rawText = (aiData.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  let hallazgos;
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    hallazgos = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch (e) {
    console.error('No se pudo parsear la respuesta del radar-scan:', rawText);
    return NextResponse.json({ error: 'La IA devolvió un formato inesperado', raw: rawText }, { status: 502 });
  }

  if (!Array.isArray(hallazgos) || hallazgos.length === 0) {
    return NextResponse.json({ created: 0, message: 'No se encontraron nombramientos nuevos en esta pasada.' });
  }

  // Cruzar organización contra el directorio real
  const { data: orgs } = await admin.from('organizations').select('id, name');
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const orgByNormalizedName = new Map((orgs || []).map((o) => [normalize(o.name), o]));

  let created = 0;
  const results = [];

  for (const h of hallazgos) {
    if (!h.person_name || !h.organization_name || !h.source_url) continue;

    const matchedOrg = orgByNormalizedName.get(normalize(h.organization_name));
    const points = PUNTOS_POR_FUENTE[h.source_type] || 20;

    const { data: claim, error: claimErr } = await admin
      .from('claims')
      .insert({
        claim_type: h.claim_type === 'departure' ? 'departure' : 'appointment',
        person_name: h.person_name,
        organization_id: matchedOrg ? matchedOrg.id : null,
        organization_name_raw: h.organization_name,
        role_title: h.role_title || null,
        claim_text: h.claim_text || `${h.person_name} — ${h.role_title || ''} en ${h.organization_name}`,
      })
      .select()
      .single();

    if (claimErr || !claim) {
      console.error('Error creando claim:', claimErr);
      continue;
    }

    await admin.from('claim_evidence').insert({
      claim_id: claim.id,
      source_type: h.source_type === 'medio_profesional' ? 'medio_profesional' : 'nota_prensa',
      source_url: h.source_url,
      provider: h.provider || null,
      published_at: h.published_at || null,
      points,
      evidence_text: h.evidence_text || null,
    });

    created += 1;
    results.push({ person_name: h.person_name, organization_name: h.organization_name, matched: !!matchedOrg });
  }

  return NextResponse.json({ created, results });
}
