import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  const { prompt, name, sector, orgType } = await request.json();

  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: 'Describe brevemente la organización para poder generarlo' }, { status: 400 });
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

  // AI Playbook: usamos el tono y contexto que la organización ya tenga
  // definidos, si los tiene, para mantener consistencia con el resto de
  // contenido generado con IA en su página.
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

  const promptText = `Eres un experto en redacción corporativa para organizaciones del sector de asuntos públicos, política y gobierno en España.

Datos ya conocidos de la organización:
- Nombre: ${name || 'no especificado'}
- Sector: ${sector || 'no especificado'}
- Tipo de organización: ${orgType || 'no especificado'}

Instrucciones de quien gestiona la página sobre lo que quiere transmitir:
"${prompt.trim()}"

Redacta una descripción de la organización en español, de 3-5 frases, con ${toneText}, adecuada para mostrarse en la página de la organización dentro de una plataforma de empleo del sector de asuntos públicos. Debe transmitir la misión, lo que hace la organización y qué la diferencia.${
    org?.ai_context ? ` Ten en cuenta este contexto adicional: ${org.ai_context}` : ''
  } Responde ÚNICAMENTE con el texto de la descripción, sin comillas, sin explicaciones adicionales, sin encabezados.`;

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
    return NextResponse.json({ error: 'Error al generar la descripción con IA' }, { status: 502 });
  }

  const aiData = await aiRes.json();
  const bio = aiData.content?.find((b) => b.type === 'text')?.text?.trim() || '';

  return NextResponse.json({ bio });
}
