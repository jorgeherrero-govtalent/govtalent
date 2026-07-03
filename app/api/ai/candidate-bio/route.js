import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  const { prompt, firstName, professionalTitle } = await request.json();

  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: 'Describe brevemente tu trayectoria para poder generarlo' }, { status: 400 });
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

  // Añadimos un poco de contexto real del perfil (experiencia y educación)
  // para que la biografía generada sea más precisa, si el candidato ya
  // tiene datos guardados.
  const { data: authUser } = await supabase.auth.getUser();
  const uid = authUser.user.id;
  const [{ data: experiences }, { data: education }] = await Promise.all([
    supabase.from('experiences').select('title, organization_name').eq('user_id', uid).order('sort_order'),
    supabase.from('education').select('degree, institution').eq('user_id', uid).order('sort_order'),
  ]);

  const expText = (experiences || []).map((e) => `${e.title} en ${e.organization_name}`).join('; ');
  const eduText = (education || []).map((e) => `${e.degree} (${e.institution})`).join('; ');

  const promptText = `Eres un experto en redacción de perfiles profesionales para el sector de asuntos públicos, política y gobierno en España.

Datos ya conocidos del candidato:
- Nombre: ${firstName || 'no especificado'}
- Título profesional: ${professionalTitle || 'no especificado'}
- Experiencia: ${expText || 'no especificada'}
- Educación: ${eduText || 'no especificada'}

Instrucciones del candidato sobre lo que quiere transmitir:
"${prompt.trim()}"

Redacta una biografía profesional en español, en primera persona, de 2-4 frases, con un tono profesional pero cercano, adecuada para mostrarse en la sección "Acerca de" de su perfil dentro de una plataforma de empleo del sector de asuntos públicos. Responde ÚNICAMENTE con el texto de la biografía, sin comillas, sin explicaciones adicionales.`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: promptText }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Error de la API de Anthropic:', errText);
    return NextResponse.json({ error: 'Error al generar la biografía con IA' }, { status: 502 });
  }

  const aiData = await aiRes.json();
  const bio = aiData.content?.find((b) => b.type === 'text')?.text?.trim() || '';

  return NextResponse.json({ bio });
}
