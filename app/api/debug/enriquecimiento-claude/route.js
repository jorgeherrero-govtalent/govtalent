// =====================================================================
// RUTA TEMPORAL — Prueba de enriquecimiento con Claude + búsqueda web
// app/api/debug/enriquecimiento-claude/route.js
//
// Segunda prueba (la de Prospeo encontró 0 de 33 diplomáticos). Aquí Claude
// busca el contacto en fuentes oficiales con la herramienta web_search y
// solo puede devolver un email o teléfono que aparezca escrito en una página.
// El servidor lo comprueba después: el dato tiene que estar literalmente en
// una cita de la búsqueda o en la página de la fuente; si no, se marca como
// no verificado.
//
// Muestra (tabla temporal `prueba_enriquecimiento`, proveedor = 'claude'):
//   diplomatico (33), control Comisión (15), embajador_es (10),
//   control_embajador (5), age (15), control_age (5).
// Los grupos «control» tienen el email conocido en `email_esperado`, que
// nunca se envía a la IA.
//
// Variables de entorno: ANTHROPIC_API_KEY y DEBUG_KEY.
//
// Uso:
//   ?key=<DEBUG_KEY>&n=3     procesa 3 pendientes (prueba)
//   ?key=<DEBUG_KEY>         procesa hasta 30 pendientes (llamar 3 veces)
//   ?key=<DEBUG_KEY>&ver=1   solo el resumen
//
// BORRAR esta ruta, la de Prospeo y la tabla al terminar la prueba.
// =====================================================================

import { createAdminClient } from '@/lib/supabase/admin';
import { safeFetchText } from '@/lib/safeFetch';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 800;

const MODELO = 'claude-sonnet-5-5';
// USD por millón de tokens (mismos precios que lib/agenteAlarmas.js) y por búsqueda.
const PRECIO = { input: 2, output: 10, busqueda: 0.01 };
const CONCURRENCIA = 5;

const DOMINIOS_BLOQUEADOS = [
  'linkedin.com', 'rocketreach.co', 'zoominfo.com', 'contactout.com', 'signalhire.com',
  'lusha.com', 'apollo.io', 'theorg.com', 'crunchbase.com', 'hunter.io', 'adapt.io',
];

const SISTEMA = `Eres un documentalista de GovTalent, una plataforma de asuntos públicos. Tu tarea es localizar el contacto profesional PUBLICADO de un cargo público o diplomático.

Reglas estrictas:
- Busca solo en fuentes oficiales: webs de gobiernos, ministerios, organismos, embajadas y consulados, instituciones de la UE (incluido el EU Whoiswho de op.europa.eu), boletines oficiales (BOE y equivalentes) y directorios oficiales (administracion.gob.es y similares).
- No uses directorios comerciales, redes sociales ni agregadores de contactos.
- Solo puedes devolver un email o un teléfono que aparezca ESCRITO en una página que hayas visto en los resultados. Nunca lo deduzcas a partir del patrón del dominio ni lo completes.
- Si el dato es de la persona, tipo "personal". Si es del cargo o del despacho (p. ej. secretaria del director), "cargo". Si es de su unidad o departamento, "unidad". Si es el genérico de la institución o embajada, "generico".
- Prefiere personal > cargo > unidad > generico.
- Si no encuentras nada publicado, responde con encontrado = false. Es mejor no devolver nada que devolver un dato dudoso.

Haz como máximo 4 búsquedas. Termina SIEMPRE con un único objeto JSON, sin texto después:
{"encontrado": true|false, "email": "..."|null, "telefono": "..."|null, "tipo": "personal"|"cargo"|"unidad"|"generico"|null, "fuente_url": "https://..."|null, "notas": "una frase"}`;

function promptPersona(f) {
  return `Persona: ${f.first_name} ${f.last_name}
Cargo: ${f.cargo || 'desconocido'}
Institución: ${f.company}
Dominio de referencia de la institución: ${f.domain}

Localiza su email y teléfono profesional publicados.`;
}

const normalizarPagina = (t) =>
  (t || '')
    .toLowerCase()
    .replace(/&#64;|&#x40;|\s*\[at\]\s*|\s*\(at\)\s*|\s*\(arroba\)\s*/g, '@')
    .replace(/&#46;|&#x2e;|\s*\[dot\]\s*/g, '.');

const soloDigitos = (s) => (s || '').replace(/\D/g, '');
const digitosPagina = (t) => (t || '').replace(/[\s.\-()\/]/g, '');

function extraerJSON(texto) {
  const ms = texto.match(/\{[\s\S]*\}/g);
  if (!ms) return null;
  for (let i = ms.length - 1; i >= 0; i--) {
    try { return JSON.parse(ms[i]); } catch { /* sigue */ }
  }
  return null;
}

async function enriquecer(f, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1500,
      system: SISTEMA,
      messages: [{ role: 'user', content: promptPersona(f) }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4, blocked_domains: DOMINIOS_BLOQUEADOS }],
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return { estado: 'error', error_code: data?.error?.type || `HTTP_${res.status}`, respuesta: data };
  }

  const bloques = data.content || [];
  const texto = bloques.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const citas = bloques.flatMap((b) => (b.type === 'text' && b.citations) || []);
  const urlsVistas = bloques
    .filter((b) => b.type === 'web_search_tool_result' && Array.isArray(b.content))
    .flatMap((b) => b.content.map((r) => r.url))
    .filter(Boolean);
  const j = extraerJSON(texto) || {};

  const u = data.usage || {};
  const busquedas = u.server_tool_use?.web_search_requests || 0;
  const coste =
    ((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)) / 1e6 * PRECIO.input +
    (u.output_tokens || 0) / 1e6 * PRECIO.output +
    busquedas * PRECIO.busqueda;

  const email = typeof j.email === 'string' && j.email.includes('@') ? j.email.trim() : null;
  const telefono = typeof j.telefono === 'string' && soloDigitos(j.telefono).length >= 6 ? j.telefono.trim() : null;
  const fuente = typeof j.fuente_url === 'string' && j.fuente_url.startsWith('https://') ? j.fuente_url : null;

  // Verificación: el dato tiene que aparecer literalmente en una cita o en la página fuente.
  const textoCitas = normalizarPagina(citas.map((c) => c.cited_text || '').join('\n'));
  let pagina = '';
  if (fuente && (email || telefono)) {
    try {
      pagina = normalizarPagina(await safeFetchText(fuente, { timeoutMs: 12000, truncar: true, maxBytes: 3 * 1024 * 1024, navegador: true }));
    } catch { /* PDF, bloqueo o error: queda solo la verificación por citas */ }
  }
  const emailOk = email ? (textoCitas.includes(email.toLowerCase()) || pagina.includes(email.toLowerCase())) : null;
  const telDig = soloDigitos(telefono).slice(-9);
  const telOk = telefono ? (digitosPagina(textoCitas).includes(telDig) || digitosPagina(pagina).includes(telDig)) : null;

  return {
    estado: email || telefono ? 'encontrado' : 'no_encontrado',
    email,
    telefono,
    tipo_contacto: j.tipo || null,
    fuente_url: fuente,
    verificado: email ? !!emailOk : telefono ? !!telOk : null,
    coste_usd: Number(coste.toFixed(5)),
    respuesta: {
      json: j,
      email_verificado: emailOk,
      telefono_verificado: telOk,
      pagina_leida: pagina.length > 0,
      urls_vistas: urlsVistas.slice(0, 20),
      citas: citas.slice(0, 10).map((c) => ({ url: c.url, texto: (c.cited_text || '').slice(0, 300) })),
      busquedas,
      usage: u,
      stop_reason: data.stop_reason,
    },
  };
}

async function resumen(supabase) {
  const { data } = await supabase
    .from('prueba_enriquecimiento')
    .select('grupo, estado, verificado, coste_usd')
    .eq('proveedor', 'claude');
  const out = {};
  let coste = 0;
  for (const f of data || []) {
    const k = `${f.grupo} · ${f.estado}${f.estado === 'encontrado' ? (f.verificado ? ' · verificado' : ' · sin verificar') : ''}`;
    out[k] = (out[k] || 0) + 1;
    coste += Number(f.coste_usd || 0);
  }
  return { grupos: out, coste_total_usd: Number(coste.toFixed(3)) };
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (sp.get('ver')) return Response.json({ resumen: await resumen(supabase) });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'Falta ANTHROPIC_API_KEY' }, { status: 500 });

  const n = Math.min(Math.max(parseInt(sp.get('n') || '30', 10) || 30, 1), 40);
  const { data: filas, error } = await supabase
    .from('prueba_enriquecimiento')
    .select('id, grupo, first_name, last_name, company, domain, cargo')
    .eq('proveedor', 'claude')
    .eq('estado', 'pendiente')
    .order('id')
    .limit(n);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const detalle = [];
  let i = 0;
  async function trabajador() {
    while (i < filas.length) {
      const f = filas[i++];
      let r;
      try {
        r = await enriquecer(f, apiKey);
      } catch (e) {
        r = { estado: 'error', error_code: String(e?.message || e).slice(0, 200) };
      }
      await supabase
        .from('prueba_enriquecimiento')
        .update({ ...r, procesado_at: new Date().toISOString() })
        .eq('id', f.id);
      detalle.push({ id: f.id, grupo: f.grupo, estado: r.estado, tipo: r.tipo_contacto || null, verificado: r.verificado ?? null, error: r.error_code || null });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, filas.length) }, trabajador));

  const { count: pendientes } = await supabase
    .from('prueba_enriquecimiento')
    .select('id', { count: 'exact', head: true })
    .eq('proveedor', 'claude')
    .eq('estado', 'pendiente');

  return Response.json({ procesadas: detalle.length, pendientes, detalle, resumen: await resumen(supabase) });
}
