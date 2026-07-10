import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  const { applicationId, messageType } = await request.json();
  if (!applicationId || !['oferta', 'rechazada'].includes(messageType)) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: app, error: appErr } = await supabase
    .from('job_applications')
    .select(
      `rejection_reason, rejection_details,
       jobs ( title, organization_id, organizations ( name, ai_tone, ai_context, email_signature ) ),
       users ( first_name, last_name )`
    )
    .eq('id', applicationId)
    .single();

  if (appErr || !app) {
    return NextResponse.json({ error: 'No se encontró la candidatura' }, { status: 404 });
  }

  const org = app.jobs?.organizations;
  const toneMap = {
    profesional: 'un tono profesional y cercano',
    formal: 'un tono formal e institucional',
    cercano: 'un tono cálido, cercano y humano',
    entusiasta: 'un tono entusiasta y positivo',
  };
  const toneText = toneMap[org?.ai_tone] || toneMap.profesional;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor' }, { status: 500 });
  }

  let instructions;
  if (messageType === 'oferta') {
    instructions = `Redacta un mensaje breve (email) comunicando a ${app.users?.first_name} que ha sido seleccionado/a para el puesto de "${app.jobs?.title}" en ${org?.name}, felicitándole y proponiendo dar los siguientes pasos (llamada o reunión para formalizar la oferta). No inventes fechas ni condiciones concretas, deja eso para una conversación posterior.`;
  } else {
    instructions = `Redacta un mensaje breve (email) comunicando a ${app.users?.first_name} que, tras revisar su candidatura para el puesto de "${app.jobs?.title}" en ${org?.name}, no se va a avanzar en el proceso de selección en esta ocasión. Motivo interno a tener en cuenta (no lo cites literalmente ni de forma hiriente, incorpóralo con tacto si aporta valor al candidato): "${app.rejection_reason || 'no especificado'}${app.rejection_details ? ' — ' + app.rejection_details : ''}". Agradece su interés y el tiempo dedicado, y deséale suerte en su búsqueda.`;
  }

  const promptText = `Eres la persona encargada de selección de personal en ${org?.name || 'una organización'}, del sector de asuntos públicos y gobierno.

${instructions}

Usa ${toneText}. El mensaje debe ser breve (4-6 frases), en español, listo para enviar por email (sin asunto, solo el cuerpo). No incluyas placeholders entre corchetes.
${org?.ai_context ? `\nContexto adicional sobre la organización: ${org.ai_context}` : ''}
${org?.email_signature ? `\nTermina el mensaje con esta firma exacta:\n${org.email_signature}` : ''}

Responde ÚNICAMENTE con el texto del mensaje, sin explicaciones adicionales.`;

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
    return NextResponse.json({ error: 'Error al generar el mensaje con IA' }, { status: 502 });
  }

  const aiData = await aiRes.json();
  const message = aiData.content?.find((b) => b.type === 'text')?.text?.trim() || '';

  return NextResponse.json({ message });
}
