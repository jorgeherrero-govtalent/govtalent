import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  const { applicationId } = await request.json();
  if (!applicationId) {
    return NextResponse.json({ error: 'Falta applicationId' }, { status: 400 });
  }

  const supabase = createClient();

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  // Esta consulta respeta las políticas de seguridad (RLS): solo funcionará
  // si quien la pide es el propio candidato o un miembro de la organización
  // dueña de la oferta.
  const { data: app, error: appErr } = await supabase
    .from('job_applications')
    .select(
      `id, cover_note, candidate_id,
       jobs ( title, description ),
       users ( first_name, last_name, professional_title )`
    )
    .eq('id', applicationId)
    .single();

  if (appErr || !app) {
    return NextResponse.json({ error: 'No se encontró la candidatura' }, { status: 404 });
  }

  const [{ data: profile }, { data: experiences }, { data: education }, { data: skills }] = await Promise.all([
    supabase.from('candidate_profiles').select('bio').eq('user_id', app.candidate_id).single(),
    supabase
      .from('experiences')
      .select('title, organization_name, description, start_date, end_date')
      .eq('user_id', app.candidate_id)
      .order('start_date', { ascending: false }),
    supabase.from('education').select('degree, institution').eq('user_id', app.candidate_id),
    supabase.from('skills').select('skill_name').eq('user_id', app.candidate_id),
  ]);

  const candidateInfo = `
Nombre: ${app.users?.first_name} ${app.users?.last_name}
Título profesional: ${app.users?.professional_title || 'No especificado'}
Bio: ${profile?.bio || 'No especificada'}

Experiencia:
${(experiences || [])
  .map((e) => `- ${e.title} en ${e.organization_name} (${e.start_date} - ${e.end_date || 'actualidad'}): ${e.description || ''}`)
  .join('\n') || 'No especificada'}

Educación:
${(education || []).map((e) => `- ${e.degree}, ${e.institution}`).join('\n') || 'No especificada'}

Habilidades: ${(skills || []).map((s) => s.skill_name).join(', ') || 'No especificadas'}

Carta de presentación adjunta a esta solicitud:
${app.cover_note || 'No incluyó carta de presentación'}
`.trim();

  const jobInfo = `Puesto: ${app.jobs?.title}\nDescripción del puesto: ${app.jobs?.description || ''}`;

  const prompt = `Eres un asistente que ayuda a un reclutador de asuntos públicos y gobierno a evaluar candidaturas rápidamente.

Datos del puesto:
${jobInfo}

Datos del candidato:
${candidateInfo}

Escribe un resumen breve (3-4 frases, en español) para el reclutador, destacando: (1) su experiencia y encaje más relevante para este puesto concreto, (2) cualquier punto fuerte destacable, y (3) cualquier carencia o duda razonable a tener en cuenta. Sé directo y objetivo, sin adornos. No uses listas, solo prosa.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor' }, { status: 500 });
  }

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
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Error de la API de Anthropic:', errText);
    return NextResponse.json({ error: 'Error al generar el resumen con IA' }, { status: 502 });
  }

  const aiData = await aiRes.json();
  const summary = aiData.content?.find((b) => b.type === 'text')?.text?.trim() || 'No se pudo generar el resumen.';

  await supabase
    .from('job_applications')
    .update({ ai_summary: summary, ai_analyzed_at: new Date().toISOString() })
    .eq('id', applicationId);

  return NextResponse.json({ summary });
}
