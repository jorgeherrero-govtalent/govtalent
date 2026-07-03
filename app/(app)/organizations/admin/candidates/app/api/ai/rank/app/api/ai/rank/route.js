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

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('title, description, organization_id')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: 'No se encontró la oferta' }, { status: 404 });
  }

  const { data: apps, error: appsErr } = await supabase
    .from('job_applications')
    .select('id, cover_note, candidate_id, users(first_name, last_name, professional_title)')
    .eq('job_id', jobId)
    .neq('status', 'retirada');

  if (appsErr || !apps || apps.length === 0) {
    return NextResponse.json({ error: 'No hay candidaturas que ordenar todavía' }, { status: 400 });
  }

  // Limitamos a 25 candidatos por llamada para mantener el prompt manejable.
  const batch = apps.slice(0, 25);

  const candidateIds = batch.map((a) => a.candidate_id);
  const [{ data: allExperiences }, { data: allEducation }, { data: allSkills }] = await Promise.all([
    supabase.from('experiences').select('user_id, title, organization_name').in('user_id', candidateIds),
    supabase.from('education').select('user_id, degree, institution').in('user_id', candidateIds),
    supabase.from('skills').select('user_id, skill_name').in('user_id', candidateIds),
  ]);

  function byUser(list, userId) {
    return (list || []).filter((x) => x.user_id === userId);
  }

  const candidatesBlock = batch
    .map((a, i) => {
      const exp = byUser(allExperiences, a.candidate_id)
        .map((e) => `${e.title} en ${e.organization_name}`)
        .join('; ');
      const edu = byUser(allEducation, a.candidate_id)
        .map((e) => `${e.degree} (${e.institution})`)
        .join('; ');
      const skills = byUser(allSkills, a.candidate_id)
        .map((s) => s.skill_name)
        .join(', ');
      return `ID:${a.id}
Nombre: ${a.users?.first_name} ${a.users?.last_name}
Título: ${a.users?.professional_title || 'No especificado'}
Experiencia: ${exp || 'No especificada'}
Educación: ${edu || 'No especificada'}
Habilidades: ${skills || 'No especificadas'}
Carta de presentación: ${a.cover_note || 'No incluida'}
---`;
    })
    .join('\n');

  const prompt = `Eres un asistente que ayuda a un reclutador de asuntos públicos y gobierno a priorizar candidaturas para un puesto concreto.

Puesto: ${job.title}
Descripción del puesto: ${job.description || ''}

Candidatos (cada uno con su ID):
${candidatesBlock}

Evalúa el encaje de cada candidato con este puesto concreto, en una escala de 0 a 100 (100 = encaje excelente). Responde ÚNICAMENTE con un array JSON válido, sin texto adicional antes ni después, con este formato exacto:
[{"id": "ID_DEL_CANDIDATO", "score": 85, "rationale": "motivo breve en una frase"}, ...]

Incluye una entrada por cada candidato de la lista, usando el ID exacto que aparece junto a "ID:" en cada bloque.`;

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
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Error de la API de Anthropic:', errText);
    return NextResponse.json({ error: 'Error al generar el ranking con IA' }, { status: 502 });
  }

  const aiData = await aiRes.json();
  const rawText = aiData.content?.find((b) => b.type === 'text')?.text?.trim() || '[]';

  let parsed;
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch (e) {
    console.error('No se pudo parsear la respuesta de la IA:', rawText);
    return NextResponse.json({ error: 'La IA devolvió un formato inesperado' }, { status: 502 });
  }

  const rankings = parsed
    .filter((r) => r.id && typeof r.score === 'number')
    .map((r) => ({ applicationId: r.id, score: Math.round(r.score), rationale: r.rationale || '' }));

  // Guardamos los resultados para no tener que repetir la llamada la próxima vez.
  await Promise.all(
    rankings.map((r) =>
      supabase
        .from('job_applications')
        .update({ ai_score: r.score, ai_rationale: r.rationale, ai_analyzed_at: new Date().toISOString() })
        .eq('id', r.applicationId)
    )
  );

  return NextResponse.json({ rankings });
}
