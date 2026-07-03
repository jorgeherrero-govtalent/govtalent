import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  const { cvUrl } = await request.json();
  if (!cvUrl) {
    return NextResponse.json({ error: 'Falta la URL del CV' }, { status: 400 });
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

  // Descargamos el PDF ya subido y lo convertimos a base64 para enviarlo a la IA.
  let base64Pdf;
  try {
    const pdfRes = await fetch(cvUrl);
    if (!pdfRes.ok) throw new Error('No se pudo descargar el CV');
    const arrayBuffer = await pdfRes.arrayBuffer();
    base64Pdf = Buffer.from(arrayBuffer).toString('base64');
  } catch (err) {
    return NextResponse.json({ error: 'No se pudo leer el archivo del CV' }, { status: 400 });
  }

  const promptText = `Analiza este currículum (CV) y extrae la información estructurada. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes ni después, con este formato exacto:

{
  "professional_title": "título profesional actual, breve",
  "bio": "resumen profesional de 2-4 frases en primera persona, en español, basado en el CV",
  "experiences": [
    {
      "title": "puesto",
      "organization_name": "empresa u organización",
      "location": "ciudad, país si aparece, si no vacío",
      "start_date": "YYYY-MM-DD (usa el día 01 si solo hay mes/año, o 01-01 si solo hay año)",
      "end_date": "YYYY-MM-DD o null si es el puesto actual",
      "description": "breve descripción de responsabilidades, 1-2 frases"
    }
  ],
  "education": [
    {
      "degree": "titulación",
      "institution": "universidad o centro",
      "start_date": "YYYY-MM-DD o null si no aparece",
      "end_date": "YYYY-MM-DD o null si no aparece"
    }
  ],
  "skills": ["habilidad1", "habilidad2", "..."]
}

Si el CV está en otro idioma, traduce los textos generados (bio, description) al español, pero conserva los nombres propios (empresas, instituciones, titulaciones) tal cual aparecen. Ordena experiences y education de más reciente a más antigua. Si no encuentras algún dato, usa un array vacío o null según corresponda, nunca inventes información que no esté en el documento.`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
            { type: 'text', text: promptText },
          ],
        },
      ],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('Error de la API de Anthropic:', errText);
    return NextResponse.json({ error: 'Error al analizar el CV con IA' }, { status: 502 });
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
    professional_title: parsed.professional_title || '',
    bio: parsed.bio || '',
    experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [],
    education: Array.isArray(parsed.education) ? parsed.education : [],
    skills: Array.isArray(parsed.skills) ? parsed.skills : [],
  });
}
