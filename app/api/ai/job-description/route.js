import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  const { prompt, title, area, modality, employmentType } = await request.json();

  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: 'Falta describir brevemente el puesto' }, { status: 400 });
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

  // AI Playbook: usamos el tono y contexto que la organización haya
  // definido, si tiene una página administrada.
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organizations(ai_tone, ai_context)')
    .eq('user_id', authData.user.id)
    .maybeSingle();
  const org = membership?.organizations;
  const toneMap = {
    profesional: 'un tono profesional pero cercano',
    formal: 'un tono formal e institucional',
    cercano: 'un tono cálido y cercano',
    entusiasta: 'un tono entusiasta y positivo',
  };
  const toneText = toneMap[org?.ai_tone] || toneMap.profesional;

  const promptText = `Eres un experto en redacción de ofertas de empleo para el sector de asuntos públicos, política y gobierno en España.

Datos ya conocidos de la oferta:
- Título del puesto: ${title || 'no especificado'}
- Área: ${area || 'no especificada'}
- Modalidad: ${modality || 'no especificada'}
- Tipo de jornada: ${employmentType || 'no especificado'}

Instrucciones del reclutador sobre lo que busca:
"${prompt.trim()}"

Redacta el contenido para publicar esta oferta de empleo en español, con ${toneText}.${
    org?.ai_context ? ` Ten en cuenta este contexto sobre la organización: ${org.ai_context}` : ''
  } Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes ni después, con este formato exacto:

{
  "description": "un párrafo de 3-5 frases describiendo el puesto y la organización de forma atractiva",
  "responsibilities": ["responsabilidad 1", "responsabilidad 2", "responsabilidad 3", "responsabilidad 4"],
  "requirements": ["requisito 1", "requisito 2", "requisito 3", "requisito 4"],
  "tags": ["etiqueta1", "etiqueta2", "etiqueta3"]
}

Las responsabilidades y requisitos deben ser frases completas y concretas, relevantes para el sector de asuntos públicos y gobierno. Las etiquetas deben ser palabras clave cortas (2-3 máximo por etiqueta).`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: promptText }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Error de la API de Anthropic:', errText);
    return NextResponse.json({ error: 'Error al generar el contenido con IA' }, { status: 502 });
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

  return NextResponse.json({
    description: parsed.description || '',
    responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
    requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  });
}
