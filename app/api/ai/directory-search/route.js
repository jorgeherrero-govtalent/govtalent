import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkAndLogAiUsage } from '@/lib/aiRateLimit';
import { ORG_TYPES, SECTORS } from '@/lib/orgTaxonomy';

const VALID_SIZES = ['1-10', '11-50', '50-200', '200-1000', '+1000'];

export async function POST(request) {
  const { query, patronales } = await request.json();

  if (!query || !query.trim()) {
    return NextResponse.json({ error: 'Escribe qué estás buscando' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const rateCheck = await checkAndLogAiUsage(authData.user.id, 'directory-search');
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor' }, { status: 500 });
  }

  const typeOptions = ORG_TYPES.map(([code, label]) => `${code} (${label})`).join(', ');
  const sectorOptions = SECTORS.map(([code, label]) => `${code} (${label})`).join(', ');
  const patronalOptions = (patronales || []).length ? (patronales || []).join(', ') : 'ninguna registrada todavía';

  const promptText = `Eres un asistente que traduce una búsqueda en lenguaje natural en español a filtros
estructurados sobre un directorio de organizaciones del sector de asuntos públicos en España.

Búsqueda del usuario: "${query.trim()}"

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes ni después, con este formato exacto:

{
  "types": ["array de códigos de tipo que encajen, o vacío si no aplica ninguno"],
  "sectors": ["array de códigos de sector que encajen, o vacío si no aplica ninguno"],
  "sizes": ["array de rangos de tamaño que encajen, o vacío si no aplica ninguno"],
  "location": "una ciudad o ubicación mencionada, en texto libre, o null",
  "patronal": "el nombre EXACTO de una patronal si el usuario la menciona por nombre, o null",
  "searchText": "cualquier palabra clave residual útil para buscar por nombre (ej. un nombre propio de organización), o null"
}

Tipos válidos (usa el código, no la etiqueta): ${typeOptions}

Sectores válidos (usa el código, no la etiqueta): ${sectorOptions}

Rangos de tamaño válidos (número de empleados): ${VALID_SIZES.join(', ')}

Patronales conocidas en el directorio (usa el nombre EXACTO tal cual aparece aquí si el usuario se refiere a alguna, si no coincide con ninguna deja "patronal" en null): ${patronalOptions}

Reglas importantes:
- No inventes tipos, sectores, tamaños ni patronales que no estén en las listas de arriba.
- Si la búsqueda menciona "grandes empresas" o similar sin más detalle, interpreta "sizes" como ["200-1000", "+1000"].
- Si la búsqueda menciona "pymes" o "pequeñas", interpreta "sizes" como ["1-10", "11-50"].
- Si menciona "patronal", "asociación" o "afiliadas a X", usa el campo "patronal", no "types".
- Sé generoso incluyendo varios tipos o sectores relacionados si la búsqueda es ambigua, mejor mostrar de más que dejar fuera resultados relevantes.`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: promptText }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Error de la API de Anthropic:', errText);
    return NextResponse.json({ error: 'Error al interpretar la búsqueda con IA' }, { status: 502 });
  }

  const aiData = await aiRes.json();
  const rawText = aiData.content?.find((b) => b.type === 'text')?.text?.trim() || '{}';

  let parsed;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch (e) {
    console.error('No se pudo parsear la respuesta de la IA:', rawText);
    return NextResponse.json({ error: 'La IA devolvió un formato inesperado' }, { status: 502 });
  }

  const VALID_TYPES = new Set(ORG_TYPES.map(([code]) => code));
  const VALID_SECTORS = new Set(SECTORS.map(([code]) => code));
  const VALID_SIZES_SET = new Set(VALID_SIZES);
  const knownPatronales = new Set(patronales || []);

  return NextResponse.json({
    types: Array.isArray(parsed.types) ? parsed.types.filter((t) => VALID_TYPES.has(t)) : [],
    sectors: Array.isArray(parsed.sectors) ? parsed.sectors.filter((s) => VALID_SECTORS.has(s)) : [],
    sizes: Array.isArray(parsed.sizes) ? parsed.sizes.filter((s) => VALID_SIZES_SET.has(s)) : [],
    location: typeof parsed.location === 'string' && parsed.location.trim() ? parsed.location.trim() : null,
    patronal: knownPatronales.has(parsed.patronal) ? parsed.patronal : null,
    searchText: typeof parsed.searchText === 'string' && parsed.searchText.trim() ? parsed.searchText.trim() : null,
  });
}
