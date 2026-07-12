import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 9000);
}

export async function POST(request) {
  const { websiteUrl, linkedinUrl, name, orgType } = await request.json();

  if (!websiteUrl || !websiteUrl.trim()) {
    return NextResponse.json({ error: 'Añade la web de la organización para poder rellenarlo automáticamente' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor' }, { status: 500 });
  }

  // Leemos el contenido real de la web de la organización. No leemos
  // LinkedIn (bloquea el acceso automático y no es fiable), solo la
  // usamos como referencia textual si el usuario la ha indicado.
  const normalizedUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
  let pageText = '';
  try {
    const pageRes = await fetch(normalizedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GovTalentBot/1.0)' },
    });
    if (!pageRes.ok) throw new Error('No se pudo acceder a la web');
    const html = await pageRes.text();
    pageText = htmlToText(html);
  } catch (err) {
    return NextResponse.json({ error: 'No se pudo leer esa web. Comprueba que la URL es correcta y accesible.' }, { status: 400 });
  }

  if (!pageText || pageText.length < 100) {
    return NextResponse.json({ error: 'La web no tiene suficiente contenido de texto para analizarla' }, { status: 400 });
  }

  // AI Playbook: tono/contexto ya definidos por la organización, si los tiene.
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organizations(ai_tone, ai_context)')
    .eq('user_id', authData.user.id)
    .maybeSingle();
  const orgCtx = membership?.organizations;
  const toneMap = {
    profesional: 'un tono profesional pero cercano',
    formal: 'un tono formal e institucional',
    cercano: 'un tono cálido y cercano',
    entusiasta: 'un tono entusiasta y positivo',
  };
  const toneText = toneMap[orgCtx?.ai_tone] || toneMap.profesional;

  const promptText = `Eres un experto en investigar organizaciones a partir de su web, para el sector de asuntos públicos, política y gobierno en España.

Nombre de la organización: ${name || 'no especificado'}
Tipo de organización: ${orgType || 'no especificado'}
${linkedinUrl ? `LinkedIn (referencia, no se ha podido leer su contenido): ${linkedinUrl}` : ''}

Contenido de texto extraído de su web (${normalizedUrl}):
"""
${pageText}
"""

A partir de ese contenido, extrae la información de la organización. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes ni después, con este formato exacto:

{
  "sector": "sector o industria, 2-4 palabras, o null si no aparece",
  "location": "ciudad y país de la sede principal, o null si no aparece",
  "founded_year": año de fundación como número, o null si no aparece,
  "size_range": "una de estas opciones exactas: 1-10, 11-50, 50-200, 200-1000, +1000 — o null si no hay pistas suficientes para estimarlo",
  "bio": "descripción de la organización en español, 3-5 frases, con ${toneText}, para mostrar en su página de una plataforma de empleo"
}

No inventes datos que no estén respaldados por el contenido de la web. Si algo no aparece, usa null.${
    orgCtx?.ai_context ? ` Ten en cuenta este contexto adicional sobre la organización: ${orgCtx.ai_context}` : ''
  }`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 700,
      messages: [{ role: 'user', content: promptText }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Error de la API de Anthropic:', errText);
    return NextResponse.json({ error: 'Error al analizar la web con IA' }, { status: 502 });
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

  const VALID_SIZES = new Set(['1-10', '11-50', '50-200', '200-1000', '+1000']);

  return NextResponse.json({
    sector: parsed.sector || null,
    location: parsed.location || null,
    founded_year: Number.isInteger(parsed.founded_year) ? parsed.founded_year : null,
    size_range: VALID_SIZES.has(parsed.size_range) ? parsed.size_range : null,
    bio: parsed.bio || '',
  });
}
