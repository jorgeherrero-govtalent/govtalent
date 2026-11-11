import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkAndLogAiUsage } from '@/lib/aiRateLimit';
import { PROCEDIMIENTOS, SECTORES, TERRITORIOS, TIPOS } from '@/lib/contratacion/etiquetas';

// POST /api/licitaciones/interpretar
//   body: { modo: 'texto', q }          → la frase, en filtros
//         { modo: 'organizacion' }      → el perfil de la organización
//                                          del usuario, en filtros
// Devuelve { filtros, frase, organizacion? }. Los filtros solo llevan
// valores de las listas de lib/contratacion/etiquetas: lo que la IA
// invente se descarta aquí.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SECT = new Set(SECTORES.map((o) => o.v));
const TERR = new Set(TERRITORIOS.map((o) => o.v));
const TIP = new Set(TIPOS.map((o) => o.v));
const PROC = new Set(PROCEDIMIENTOS.map((o) => o.v));

function lista(xs, validos) {
  return Array.isArray(xs) ? [...new Set(xs.map(String).filter((x) => validos.has(x)))] : [];
}

function numero(x) {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : '';
}

function texto(x, max = 80) {
  return typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : '';
}

function instrucciones(entrada) {
  return `Traduces una búsqueda de licitaciones públicas españolas a filtros.

${entrada}

Responde SOLO con un objeto JSON, sin texto antes ni después:
{
  "sectores": ["códigos de división CPV que encajen"],
  "territorios": ["códigos NUTS 2 si se menciona una comunidad, provincia o ciudad"],
  "organo": "parte del nombre del órgano de contratación si se menciona uno concreto (p. ej. «Ministerio de Sanidad», «Ayuntamiento de Madrid»), o null",
  "tipos": ["tipos de contrato, solo si se piden expresamente"],
  "procedimientos": ["procedimientos, solo si se piden expresamente"],
  "importeMin": número en euros sin IVA o null,
  "importeMax": número en euros sin IVA o null,
  "menores": true solo si pide contratos menores,
  "previos": true solo si pide anuncios previos o consultas preliminares al mercado,
  "ue": true solo si pide licitaciones de instituciones, órganos o agencias de la Unión Europea (Comisión, Parlamento…),
  "palabras": "una o dos palabras clave muy concretas para buscar en el título si los filtros no bastan (p. ej. «limpieza», «ciberseguridad»), o null",
  "frase": "la búsqueda resumida en una frase corta en español, sin comillas"
}

Divisiones CPV (código: nombre): ${SECTORES.map((o) => `${o.v}: ${o.label}`).join('; ')}
Territorios (código: nombre): ${TERRITORIOS.map((o) => `${o.v}: ${o.label}`).join('; ')}. Una provincia o ciudad va con su comunidad.
Tipos de contrato: ${TIPOS.map((o) => `${o.v} (${o.label})`).join(', ')}
Procedimientos: ${PROCEDIMIENTOS.map((o) => `${o.v} (${o.label})`).join(', ')}

Reglas:
- No inventes códigos fuera de las listas.
- Mejor uno o dos sectores precisos que muchos: cada sector de más trae licitaciones que no interesan.
- «Ministerios» en general no es un órgano concreto: usa "organo": "Ministerio".
- «Más de 100.000 €», «por encima de 1 millón»: importeMin. «Hasta», «menos de»: importeMax.
- Usa "palabras" solo si aportan algo que los sectores no recogen.`;
}

export async function POST(request) {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const modo = body.modo === 'organizacion' ? 'organizacion' : 'texto';

  let entrada;
  let organizacion = null;
  if (modo === 'texto') {
    const q = String(body.q || '').trim().slice(0, 600);
    if (q.length < 3) return NextResponse.json({ error: 'Escribe qué licitaciones buscas' }, { status: 400 });
    entrada = `Búsqueda del usuario: «${q}»`;
  } else {
    const { data: miembro } = await supabase
      .from('organization_members')
      .select('organizations(name, org_type, sector, location, bio, ai_context)')
      .eq('user_id', authData.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const o = miembro?.organizations;
    if (!o?.name) {
      return NextResponse.json(
        { error: 'Para usar esta opción, tu cuenta tiene que estar vinculada a una organización.' },
        { status: 404 },
      );
    }
    organizacion = o.name;
    const perfil = [
      `Nombre: ${o.name}`,
      o.org_type && `Tipo: ${o.org_type}`,
      o.sector && `Sector: ${o.sector}`,
      o.location && `Ubicación: ${o.location}`,
      o.bio && `Descripción: ${String(o.bio).slice(0, 1500)}`,
      o.ai_context && `Más contexto: ${String(o.ai_context).slice(0, 1500)}`,
    ]
      .filter(Boolean)
      .join('\n');
    entrada = `Propón la búsqueda de licitaciones a las que esta organización podría presentarse como licitadora, según lo que hace. No limites el territorio salvo que su actividad sea claramente local.\n\nOrganización:\n${perfil}`;
  }

  const uso = await checkAndLogAiUsage(authData.user.id, 'licitaciones-busqueda');
  if (!uso.allowed) return NextResponse.json({ error: uso.reason }, { status: 429 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Falta configurar la IA en el servidor' }, { status: 500 });

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 600, messages: [{ role: 'user', content: instrucciones(entrada) }] }),
    });
  } catch (e) {
    console.error('[licitaciones/interpretar]', e.message);
    return NextResponse.json({ error: 'No hemos podido interpretar la búsqueda. Vuelve a intentarlo.' }, { status: 502 });
  }
  if (!r.ok) {
    console.error('[licitaciones/interpretar]', r.status, (await r.text()).slice(0, 300));
    return NextResponse.json({ error: 'No hemos podido interpretar la búsqueda. Vuelve a intentarlo.' }, { status: 502 });
  }

  const datos = await r.json();
  const crudo = datos.content?.find((b) => b.type === 'text')?.text || '{}';
  let p;
  try {
    const m = crudo.match(/\{[\s\S]*\}/);
    p = JSON.parse(m ? m[0] : crudo);
  } catch {
    console.error('[licitaciones/interpretar] JSON inesperado:', crudo.slice(0, 300));
    return NextResponse.json({ error: 'No hemos podido interpretar la búsqueda. Prueba a decirlo de otra forma.' }, { status: 502 });
  }

  let importeMin = numero(p.importeMin);
  let importeMax = numero(p.importeMax);
  if (importeMin !== '' && importeMax !== '' && importeMin > importeMax) [importeMin, importeMax] = [importeMax, importeMin];

  return NextResponse.json({
    organizacion,
    frase: texto(p.frase, 200),
    filtros: {
      sectores: lista(p.sectores, SECT).slice(0, 4),
      territorios: lista(p.territorios, TERR),
      organo: texto(p.organo),
      tipos: lista(p.tipos, TIP),
      procedimientos: lista(p.procedimientos, PROC),
      importeMin,
      importeMax,
      menores: p.menores === true,
      previos: p.previos === true,
      ue: p.ue === true,
      palabras: texto(p.palabras, 40),
    },
  });
}
