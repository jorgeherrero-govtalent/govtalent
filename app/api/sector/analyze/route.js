// =====================================================================
// ANÁLISIS POR SECTOR
// app/api/sector/analyze/route.js
//
// El usuario describe a qué se dedica su organización y devolvemos qué
// asuntos de los que hay abiertos le afectan, con el motivo.
//
// CÓMO FUNCIONA, EN DOS PASOS:
//   1. La IA extrae palabras clave y sectores de la descripción.
//   2. Se preseleccionan candidatos por esas palabras y la IA decide
//      cuáles afectan de verdad y por qué.
//
// POR QUÉ DOS PASOS: hay 12.000 asuntos y no caben en una llamada. Se
// filtran por texto y la IA afina sobre unos cientos. Eso significa que
// la IA revisa TÍTULOS, no textos completos — conviene decirlo en la
// interfaz para no prometer de más.
//
// El resultado se guarda: rehacerlo en cada visita costaría una llamada
// cada vez, y guardarlo permite decir "3 asuntos nuevos desde tu último
// análisis".
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODELO = 'claude-sonnet-5';
// Cuántos candidatos ve la IA. Más de 150 y la llamada se alarga sin
// mejorar: los que quedan fuera son los que menos coinciden.
const MAX_CANDIDATOS = 150;

async function llamarIA(system, user, maxTokens = 2000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const texto = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  // La IA a veces envuelve el JSON en ```: se limpia antes de parsear.
  const limpio = texto.replace(/```json|```/g, '').trim();
  return JSON.parse(limpio);
}

export async function POST(request) {
  const t0 = Date.now();

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { descripcion } = await request.json();
    if (!descripcion || descripcion.trim().length < 20) {
      return NextResponse.json(
        { error: 'Describe tu organización con algo más de detalle para que el análisis sea útil.' },
        { status: 400 }
      );
    }

    // --- Paso 1: qué buscar ------------------------------------------
    const criterios = await llamarIA(
      `Eres un analista de asuntos públicos en España. A partir de la descripción de una organización, extraes los términos con los que buscar normativa que le afecte.

Devuelve SOLO un objeto JSON, sin texto alrededor ni markdown:
{
  "keywords": ["término1", "término2", ...],
  "sectores": ["Energía", "Industria", ...]
}

Reglas para keywords:
- Entre 6 y 12 términos en español, en minúscula.
- Palabras que aparecerían en el TÍTULO de una norma, no conceptos abstractos. "autoconsumo" sí, "sostenibilidad" no.
- Incluye sinónimos y variantes que use la administración.
- Nada de nombres propios de empresas.

Los sectores salen de esta lista cerrada del BOE, elige los que apliquen:
Agricultura, Cultura y ocio, Derecho Administrativo, Educación y enseñanza, Energía, Función Pública, Ganadería y animales, Industria, Medio ambiente, Organización de la Administración, Relaciones internacionales, Seguridad Social, Seguridad y Defensa, Sistema financiero, Sistema tributario, Tecnología e investigación, Telecomunicaciones, Trabajo y empleo, Transportes y tráfico, Unión Europea, Vivienda y urbanismo`,
      descripcion.trim(),
      600
    );

    const keywords = (criterios.keywords || []).slice(0, 12).map((k) => String(k).toLowerCase());
    const sectores = (criterios.sectores || []).slice(0, 6);

    if (keywords.length === 0) {
      return NextResponse.json({ error: 'No se han podido extraer criterios de esa descripción.' }, { status: 422 });
    }

    // --- Paso 2: preseleccionar candidatos ----------------------------
    // Se busca cada palabra por separado y se juntan: un OR con doce
    // términos en una sola consulta es lento y devuelve peor.
    const vistos = new Map();
    for (const k of keywords) {
      if (Date.now() - t0 > 30000) break;
      const { data } = await supabase
        .from('regulatorio_search')
        .select('kind, ref_id, titulo, contexto, fuente, ruta, plazo, fecha')
        .eq('activo', true)
        .ilike('titulo', `%${k}%`)
        .order('fecha', { ascending: false })
        .limit(30);
      for (const r of data || []) {
        const clave = `${r.kind}|${r.ref_id}`;
        if (!vistos.has(clave)) vistos.set(clave, r);
      }
    }

    const candidatos = [...vistos.values()]
      // Lo que tiene plazo primero: es lo accionable
      .sort((a, b) => {
        if (!!a.plazo !== !!b.plazo) return a.plazo ? -1 : 1;
        return String(b.fecha || '').localeCompare(String(a.fecha || ''));
      })
      .slice(0, MAX_CANDIDATOS);

    if (candidatos.length === 0) {
      return NextResponse.json({
        keywords,
        sectores,
        candidatos: 0,
        matches: [],
        nota: 'No se ha encontrado nada abierto con esos términos.',
      });
    }

    // --- Paso 3: cuáles afectan de verdad -----------------------------
    const lista = candidatos
      .map((c, i) => `${i}. [${c.fuente}] ${c.titulo}${c.contexto ? ` (${c.contexto})` : ''}`)
      .join('\n');

    const seleccion = await llamarIA(
      `Eres un analista de asuntos públicos. Te doy la descripción de una organización y una lista numerada de asuntos normativos abiertos en España y la UE.

Selecciona SOLO los que afecten de verdad a esa organización. Sé exigente: es mejor devolver ocho relevantes que treinta dudosos.

Devuelve SOLO un array JSON, sin texto alrededor ni markdown:
[
  { "i": 3, "motivo": "...", "relevancia": 3 },
  ...
]

- "i" es el número de la lista.
- "motivo" explica en UNA frase por qué le afecta, concreta y en español. Nada de "es relevante para el sector": di qué cambia y a quién.
- "relevancia": 3 si le afecta directamente, 2 si le afecta de forma indirecta, 1 si es contexto útil. No incluyas nada por debajo de 1.
- Máximo 20 resultados.`,
      `ORGANIZACIÓN:\n${descripcion.trim()}\n\nASUNTOS:\n${lista}`,
      3000
    );

    const matches = (Array.isArray(seleccion) ? seleccion : [])
      .filter((m) => candidatos[m.i])
      .map((m) => {
        const c = candidatos[m.i];
        return {
          user_id: user.id,
          kind: c.kind,
          ref_id: c.ref_id,
          titulo: c.titulo,
          motivo: String(m.motivo || '').slice(0, 300),
          relevancia: Math.min(3, Math.max(1, parseInt(m.relevancia, 10) || 2)),
          plazo: c.plazo,
          ruta: c.ruta,
          fuente: c.fuente,
        };
      });

    // --- Guardar -------------------------------------------------------
    // Lo anterior se marca como visto antes de escribir lo nuevo: así lo
    // que entre ahora queda como novedad.
    await supabase.from('sector_matches').update({ visto: true }).eq('user_id', user.id);

    if (matches.length > 0) {
      await supabase.from('sector_matches').upsert(matches, { onConflict: 'user_id,kind,ref_id' });
    }

    await supabase.from('sector_profiles').upsert(
      {
        user_id: user.id,
        descripcion: descripcion.trim(),
        keywords,
        sectores,
        analizado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    return NextResponse.json({
      keywords,
      sectores,
      candidatos: candidatos.length,
      encontrados: matches.length,
      con_plazo: matches.filter((m) => m.plazo).length,
      ms: Date.now() - t0,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message, ms: Date.now() - t0 }, { status: 500 });
  }
}
