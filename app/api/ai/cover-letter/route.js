import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  const { jobId } = await request.json();
  if (!jobId) {
    return NextResponse.json({ error: 'Falta jobId' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const uid = authData.user.id;

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('title, description, organizations(name)')
    .eq('id', jobId)
    .single();
  if (jobErr || !job) {
    return NextResponse.json({ error: 'No se encontró la oferta' }, { status: 404 });
  }

  const [{ data: user }, { data: profile }, { data: experiences }, { data: skills }] = await Promise.all([
    supabase.from('users').select('first_name, professional_title').eq('id', uid).single(),
    supabase.from('candidate_profiles').select('bio').eq('user_id', uid).single(),
    supabase.from('experiences').select('title, organization_name, description').eq('user_id', uid).order('sort_order').limit(4),
    supabase.from('skills').select('skill_name').eq('user_id', uid),
  ]);

  const expText = (experiences || []).map((e) => `${e.title} en ${e.organization_name}: ${e.description || ''}`).join('; ');
  const skillsText = (skills || []).map((s) => s.skill_name).join(', ');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor' }, { status: 500 });
  }

  const promptText = `Eres un experto en redacción de cartas de presentación para el sector de asuntos públicos y gobierno.

Datos del candidato:
- Nombre: ${user?.first_name || 'el candidato'}
- Título profesional: ${user?.professional_title || 'no especificado'}
- Bio: ${profile?.bio || 'no especificada'}
- Experiencia relevante: ${expText || 'no especificada'}
- Habilidades: ${skillsText || 'no especificadas'}

Datos de la oferta a la que aplica:
- Puesto: ${job.title}
- Organización: ${job.organizations?.name}
- Descripción del puesto: ${job.description}

Redacta una carta de presentación breve (4-6 frases) en español, en primera persona, con un tono profesional y motivado, conectando la experiencia real del candidato con los requisitos concretos de este puesto. No inventes datos que no se hayan dado. Responde ÚNICAMENTE con el texto de la carta, sin encabezados ni explicaciones adicionales.`;

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
    return NextResponse.json({ error: 'Error al generar la carta con IA' }, { status: 502 });
  }

  const aiData = await aiRes.json();
  const coverLetter = aiData.content?.find((b) => b.type === 'text')?.text?.trim() || '';

  return NextResponse.json({ coverLetter });
}
