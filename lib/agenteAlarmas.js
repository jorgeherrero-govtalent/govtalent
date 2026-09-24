// =====================================================================
// EL AGENTE DE LAS ALARMAS
// lib/agenteAlarmas.js
//
// Lo que antes hacía el análisis de sector (app/api/sector/analyze), en
// piezas que usan tanto la creación de una alarma como la vigilancia
// diaria:
//
//   1. proponer()   de un texto (y, si hay, la web de la organización)
//                   saca los criterios: nombre, resumen, temas, palabras
//                   clave, normativa, territorios y exclusiones.
//   2. candidatos() busca en lo abierto lo que toca esas palabras.
//   3. evaluar()    Claude decide qué afecta de verdad y por qué.
//
// SOLO SERVIDOR. Usa la clave de Anthropic.
//
// COSTE. Las instrucciones de cada llamada van marcadas para la caché de
// prompts: la parte fija se cobra a una décima parte a partir de la
// segunda llamada. Precios de Sonnet 5 a 24-09-2026: 2 $ por millón de
// tokens de entrada y 10 $ de salida.
// =====================================================================

export const MODELO = 'claude-sonnet-5';

// Cuántos candidatos ve la IA de una vez. Más y la llamada se alarga sin
// mejorar: los que quedan fuera son los que menos coinciden.
export const MAX_CANDIDATOS = 120;

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
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    }),
    cache: 'no-store',
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
  const inicio = limpio.search(/[[{]/);
  return JSON.parse(inicio > 0 ? limpio.slice(inicio) : limpio);
}

const lista = (v, max) =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, max);

// ---------------------------------------------------------------------
// 1. Criterios
// ---------------------------------------------------------------------

const SISTEMA_CRITERIOS = `Eres un analista de asuntos públicos en España. Una organización te describe a qué se dedica o qué le preocupa, y tú preparas una alarma que vigilará la normativa que le afecte en España y la UE.

Devuelve SOLO un objeto JSON, sin texto alrededor ni markdown:
{
  "nombre": "...",
  "resumen": "...",
  "temas": ["..."],
  "keywords": ["..."],
  "normativa": ["..."],
  "territorios": ["..."],
  "excluye": ["..."],
  "sectores": ["..."]
}

Reglas:
- "nombre": 2 a 5 palabras que identifiquen la alarma. Nada de "Alarma de…".
- "resumen": UNA frase que diga qué vas a vigilar, en segunda persona implícita, como "Normativa sobre centros de datos, acceso a la red eléctrica y eficiencia energética, en España y la UE."
- "temas": 3 a 6 temas legibles para una persona, en minúscula.
- "keywords": 8 a 15 términos en español y en minúscula que aparecerían en el TÍTULO de una norma, una consulta o un expediente. Incluye sinónimos y la forma en que los escribe la administración ("autoconsumo" sí, "sostenibilidad" no). Nada de nombres de empresas.
- "normativa": leyes o normas vigentes que regulan esa actividad, solo si estás seguro de que existen, con su nombre oficial abreviado ("Ley 24/2013, del Sector Eléctrico"). Si no estás seguro, déjalo vacío: es mejor nada que una norma inventada.
- "territorios": "España", "Unión Europea" y las comunidades autónomas que se mencionen. Si no se menciona ninguna, solo "España" y "Unión Europea".
- "excluye": lo que la organización dice expresamente que no le interesa. Vacío si no dice nada.
- "sectores": los que apliquen de esta lista cerrada del BOE: Agricultura, Cultura y ocio, Derecho Administrativo, Educación y enseñanza, Energía, Función Pública, Ganadería y animales, Industria, Medio ambiente, Organización de la Administración, Relaciones internacionales, Seguridad Social, Seguridad y Defensa, Sistema financiero, Sistema tributario, Tecnología e investigación, Telecomunicaciones, Trabajo y empleo, Transportes y tráfico, Unión Europea, Vivienda y urbanismo.`;

export async function proponer(texto, web = '', dominio = '') {
  const partes = [];
  if (texto) partes.push(`LO QUE ESCRIBE LA ORGANIZACIÓN (manda sobre todo lo demás):\n${texto}`);
  if (web) partes.push(`TEXTO DE SU WEB${dominio ? ` (${dominio})` : ''}:\n${web}`);
  if (!web && dominio) {
    partes.push(
      `SU WEB ES ${dominio}, PERO NO SE HA PODIDO LEER. Usa solo lo que sepas con seguridad de esa organización. Si no la conoces o no estás seguro de a qué se dedica, devuelve "keywords": [] y no inventes nada.`
    );
  }
  const entrada = partes.join('\n\n');
  const c = await llamarIA(SISTEMA_CRITERIOS, entrada, 900);
  return {
    nombre: String(c.nombre || '').trim().slice(0, 60) || 'Mi alarma',
    criterios: {
      resumen: String(c.resumen || '').trim().slice(0, 240),
      temas: lista(c.temas, 6),
      normativa: lista(c.normativa, 6),
      territorios: lista(c.territorios, 8),
      excluye: lista(c.excluye, 6),
    },
    keywords: lista(c.keywords, 15).map((k) => k.toLowerCase()),
    sectores: lista(c.sectores, 6),
  };
}

// ---------------------------------------------------------------------
// 2. Candidatos
// ---------------------------------------------------------------------

/**
 * Lo abierto que toca alguna palabra clave. Una consulta por palabra y
 * se juntan: un OR con quince términos es lento y devuelve peor.
 *
 * Lo que tiene plazo va primero, que es lo accionable.
 */
export async function candidatos(supabase, keywords, { limite = MAX_CANDIDATOS, alBuscar } = {}) {
  const vistos = new Map();
  const validas = keywords.filter((k) => k && k.length >= 3);
  for (let i = 0; i < validas.length; i++) {
    const k = validas[i];
    // Para contar en pantalla lo que se está haciendo de verdad.
    if (alBuscar) alBuscar({ termino: k, hecho: i + 1, total: validas.length, encontrados: vistos.size });
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
  return ordenar([...vistos.values()]).slice(0, limite);
}

export function ordenar(filas) {
  return [...filas].sort((a, b) => {
    if (!!a.plazo !== !!b.plazo) return a.plazo ? -1 : 1;
    return String(b.fecha || '').localeCompare(String(a.fecha || ''));
  });
}

// ---------------------------------------------------------------------
// 3. Evaluación
// ---------------------------------------------------------------------

const SISTEMA_EVALUACION = `Eres un analista de asuntos públicos. Te doy la descripción de una organización, lo que quiere vigilar y lo que NO le interesa, y una lista numerada de asuntos normativos de España y la UE.

Selecciona SOLO los que le afecten de verdad. Sé exigente: es mejor devolver cinco relevantes que veinte dudosos. Si un asunto cae en lo que la organización excluye, no lo incluyas.

Devuelve SOLO un array JSON, sin texto alrededor ni markdown:
[
  { "i": 3, "motivo": "...", "relevancia": 3 }
]

- "i" es el número de la lista.
- "motivo": UNA frase concreta en español que diga qué cambia y a quién. Nada de "es relevante para el sector".
- "relevancia": 3 si le afecta directamente, 2 si le afecta de forma indirecta, 1 si es contexto útil.
- Máximo 20 resultados. Si nada encaja, devuelve [].`;

export async function evaluar({ descripcion, criterios = {} }, filas) {
  if (!filas.length) return [];
  const excl = (criterios.excluye || []).length ? `\nNO LE INTERESA: ${criterios.excluye.join('; ')}` : '';
  const terr = (criterios.territorios || []).length ? `\nTERRITORIOS: ${criterios.territorios.join(', ')}` : '';
  const texto = filas
    .map((c, i) => `${i}. [${c.fuente || c.kind}] ${c.titulo}${c.contexto ? ` (${c.contexto})` : ''}`)
    .join('\n');

  const seleccion = await llamarIA(
    SISTEMA_EVALUACION,
    `ORGANIZACIÓN Y LO QUE QUIERE VIGILAR:\n${descripcion}${terr}${excl}\n\nASUNTOS:\n${texto}`,
    2500
  );

  return (Array.isArray(seleccion) ? seleccion : [])
    .filter((m) => filas[m.i])
    .map((m) => {
      const c = filas[m.i];
      return {
        kind: c.kind,
        ref_id: c.ref_id,
        titulo: c.titulo,
        motivo: String(m.motivo || '').slice(0, 300),
        relevancia: Math.min(3, Math.max(1, parseInt(m.relevancia, 10) || 2)),
        plazo: c.plazo || null,
        ruta: c.ruta || null,
        fuente: c.fuente || null,
      };
    })
    .sort((a, b) => b.relevancia - a.relevancia);
}

/**
 * El texto de una web, para dárselo a la IA como contexto.
 *
 * Primero el título y las descripciones del <head> (meta description y
 * og:description): en las webs hechas con JavaScript son casi lo único
 * que hay en el HTML, y en todas son el mejor resumen de a qué se dedica
 * la organización. Después, el texto visible.
 */
export function textoDeHtml(html, max = 6000) {
  const h = String(html || '');
  const meta = (re) => (h.match(re) || [])[1] || '';
  const cabecera = [
    meta(/<title[^>]*>([\s\S]*?)<\/title>/i),
    meta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
      meta(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i),
    meta(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i),
  ]
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const cuerpo = cuerpoVisible(h.replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<title[\s\S]*?<\/title>/i, ' '));
  return [...new Set(cabecera), cuerpo].filter(Boolean).join('\n').slice(0, max);
}

function cuerpoVisible(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Si la página se cortó por tamaño, puede quedar un <script> o un
    // <style> sin cerrar: todo lo que sigue es código, no texto.
    .replace(/<(script|style)[\s\S]*$/i, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
