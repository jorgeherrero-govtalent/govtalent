// Enriquecer un contacto con IA (sql/76). Probado el 07-10-2026 con 83
// personas (doc del proyecto «prueba-enriquecimiento-contactos»): ningún
// dato inventado; lo habitual es el contacto del cargo, la unidad o la
// institución, y a veces el personal.
//
// Claude busca con web_search solo en fuentes oficiales y únicamente puede
// devolver un email o teléfono que aparezca escrito en una página. Después
// el servidor lo comprueba: tiene que estar literalmente en una cita de la
// búsqueda o en la página de la fuente. Si no, se guarda como «sin
// verificar» (suele ser una web que bloquea la lectura desde el servidor).

import { safeFetchText } from '@/lib/safeFetch';

const MODELO = 'claude-sonnet-5-5';
// USD por millón de tokens (los de lib/agenteAlarmas.js) y por búsqueda.
const PRECIO = { input: 2, output: 10, busqueda: 0.01 };
const MAX_BUSQUEDAS = 3;
const TIMEOUT_MS = 90000;

const DOMINIOS_BLOQUEADOS = [
  'linkedin.com', 'rocketreach.co', 'zoominfo.com', 'contactout.com', 'signalhire.com',
  'lusha.com', 'apollo.io', 'theorg.com', 'crunchbase.com', 'hunter.io', 'adapt.io',
];

const SISTEMA = `Eres un documentalista de GovTalent, una plataforma de asuntos públicos. Tu tarea es localizar el contacto profesional PUBLICADO de un cargo público, diplomático o profesional de una organización.

Reglas estrictas:
- Busca solo en fuentes oficiales: webs de gobiernos, ministerios, organismos, embajadas y consulados, instituciones de la UE (incluido el EU Whoiswho de op.europa.eu), boletines oficiales y directorios oficiales (administracion.gob.es y similares), y la web oficial de la organización de la persona.
- No uses directorios comerciales, redes sociales ni agregadores de contactos.
- Solo puedes devolver un email o un teléfono que aparezca ESCRITO en una página que hayas visto en los resultados. Nunca lo deduzcas a partir del patrón del dominio ni lo completes.
- Tipo: "personal" si es de la persona; "cargo" si es del cargo o de su despacho (p. ej. secretaría del director); "unidad" si es de su unidad o departamento; "generico" si es el general de la institución.
- Prefiere personal > cargo > unidad > generico.
- Si no encuentras nada publicado, encontrado = false. Es mejor no devolver nada que devolver un dato dudoso.

Haz como máximo ${MAX_BUSQUEDAS} búsquedas. Termina SIEMPRE con un único objeto JSON, sin texto después:
{"encontrado": true|false, "email": "..."|null, "telefono": "..."|null, "tipo": "personal"|"cargo"|"unidad"|"generico"|null, "fuente_url": "https://..."|null, "notas": "una frase"}`;

const normalizarPagina = (t) =>
  (t || '')
    .toLowerCase()
    .replace(/&#64;|&#x40;|\s*\[at\]\s*|\s*\(at\)\s*|\s*\(arroba\)\s*/g, '@')
    .replace(/&#46;|&#x2e;|\s*\[dot\]\s*/g, '.');
const soloDigitos = (s) => (s || '').replace(/\D/g, '');
const digitosPagina = (t) => (t || '').replace(/[\s.\-()/]/g, '');

function extraerJSON(texto) {
  const ms = String(texto || '').match(/\{[\s\S]*\}/g);
  if (!ms) return null;
  for (let i = ms.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(ms[i]);
    } catch {
      /* sigue */
    }
  }
  return null;
}

/**
 * persona: fila de directorio_pro (nombre, cargo, unidad, institucion…).
 * Devuelve { estado, email, telefono, tipo, fuente_url, verificado, notas, coste_usd }.
 * Lanza si la IA falla (no se cobra nada en ese caso).
 */
export async function enriquecerPersona(persona) {
  const prompt = `Persona: ${persona.nombre}
Cargo: ${persona.cargo || 'desconocido'}
Unidad: ${persona.unidad || '—'}
Institución u organización: ${persona.institucion || '—'}
Ámbito: ${persona.jurisdiccion || '—'}${persona.provincia ? `, ${persona.provincia}` : ''}

Localiza su email y teléfono profesional publicados.`;

  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1500,
        system: SISTEMA,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: MAX_BUSQUEDAS, blocked_domains: DOMINIOS_BLOQUEADOS }],
      }),
      cache: 'no-store',
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'La búsqueda ha tardado demasiado' : 'No se pudo llamar a la IA');
  } finally {
    clearTimeout(reloj);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`Anthropic ${res.status}`);

  const bloques = data.content || [];
  const texto = bloques.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const citas = bloques.flatMap((b) => (b.type === 'text' && b.citations) || []);
  const j = extraerJSON(texto) || {};

  const u = data.usage || {};
  const busquedas = u.server_tool_use?.web_search_requests || 0;
  const coste =
    (((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)) / 1e6) * PRECIO.input +
    ((u.output_tokens || 0) / 1e6) * PRECIO.output +
    busquedas * PRECIO.busqueda;

  const email = typeof j.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(j.email.trim()) ? j.email.trim() : null;
  const telefono = typeof j.telefono === 'string' && soloDigitos(j.telefono).length >= 6 ? j.telefono.trim().slice(0, 60) : null;
  const fuente = typeof j.fuente_url === 'string' && j.fuente_url.startsWith('https://') ? j.fuente_url.slice(0, 500) : null;
  const tipo = ['personal', 'cargo', 'unidad', 'generico'].includes(j.tipo) ? j.tipo : null;

  // Verificación: el dato tiene que aparecer literalmente en una cita o en la página fuente.
  const textoCitas = normalizarPagina(citas.map((c) => c.cited_text || '').join('\n'));
  let pagina = '';
  if (fuente && (email || telefono)) {
    try {
      pagina = normalizarPagina(await safeFetchText(fuente, { timeoutMs: 12000, truncar: true, maxBytes: 3 * 1024 * 1024, navegador: true }));
    } catch {
      /* PDF, bloqueo o error: queda solo la verificación por citas */
    }
  }
  const emailOk = email ? textoCitas.includes(email.toLowerCase()) || pagina.includes(email.toLowerCase()) : null;
  const telDig = soloDigitos(telefono).slice(-9);
  const telOk = telefono ? digitosPagina(textoCitas).includes(telDig) || digitosPagina(pagina).includes(telDig) : null;

  return {
    estado: email || telefono ? 'encontrado' : 'no_encontrado',
    email,
    telefono,
    tipo: email || telefono ? tipo || 'generico' : null,
    fuente_url: email || telefono ? fuente : null,
    verificado: email ? !!emailOk : telefono ? !!telOk : null,
    notas: typeof j.notas === 'string' ? j.notas.slice(0, 400) : null,
    coste_usd: Number(coste.toFixed(5)),
  };
}

const SISTEMA_PUBLICADO = `Eres un documentalista de GovTalent. Te damos una dirección de correo exacta y tienes que comprobar si aparece ESCRITA en alguna página pública: boletines oficiales, webs institucionales, documentos en PDF, notas de prensa, convocatorias o la web oficial de su organización.

Reglas estrictas:
- Busca la dirección exacta, entre comillas.
- No uses directorios comerciales, redes sociales ni agregadores de contactos.
- Solo cuenta si la dirección completa aparece escrita tal cual en una página que hayas visto. Si aparece otra parecida, no cuenta.

Haz como máximo 2 búsquedas. Termina SIEMPRE con un único objeto JSON, sin texto después:
{"publicado": true|false, "fuente_url": "https://..."|null}`;

/**
 * ¿Aparece esta dirección exacta publicada en alguna página? Para los
 * correos deducidos del patrón en dominios que aceptan cualquier dirección:
 * si aparece, queda verificado; si no, se queda como probable.
 * Devuelve { publicado, fuente_url, coste_usd }. Lanza si la IA falla.
 */
export async function buscarCorreoPublicado(email, persona) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), 60000);
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 800,
        system: SISTEMA_PUBLICADO,
        messages: [{ role: 'user', content: `Correo: ${email}\nPersona: ${persona.nombre}\nOrganización: ${persona.institucion || '—'}` }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2, blocked_domains: DOMINIOS_BLOQUEADOS }],
      }),
      cache: 'no-store',
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'La búsqueda ha tardado demasiado' : 'No se pudo llamar a la IA');
  } finally {
    clearTimeout(reloj);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`Anthropic ${res.status}`);

  const bloques = data.content || [];
  const texto = bloques.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const citas = bloques.flatMap((b) => (b.type === 'text' && b.citations) || []);
  const j = extraerJSON(texto) || {};
  const fuente = typeof j.fuente_url === 'string' && j.fuente_url.startsWith('https://') ? j.fuente_url.slice(0, 500) : null;

  const u = data.usage || {};
  const coste =
    (((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)) / 1e6) * PRECIO.input +
    ((u.output_tokens || 0) / 1e6) * PRECIO.output +
    (u.server_tool_use?.web_search_requests || 0) * PRECIO.busqueda;

  // Igual que en enriquecerPersona: la dirección tiene que estar
  // literalmente en una cita o en la página fuente. La palabra de la IA no basta.
  const buscado = email.toLowerCase();
  let ok = normalizarPagina(citas.map((c) => c.cited_text || '').join('\n')).includes(buscado);
  if (!ok && j.publicado === true && fuente) {
    try {
      const pagina = normalizarPagina(await safeFetchText(fuente, { timeoutMs: 12000, truncar: true, maxBytes: 3 * 1024 * 1024, navegador: true }));
      ok = pagina.includes(buscado);
    } catch {
      /* PDF, bloqueo o error: no cuenta */
    }
  }
  return { publicado: ok, fuente_url: ok ? fuente : null, coste_usd: Number(coste.toFixed(5)) };
}
