// Buscar personas fuera de GovTalent por cargo (sql/97).
//
// «Secretarios del Departament de Territori de la Generalitat» → quién
// ocupa hoy esos cargos, según fuentes oficiales. Claude busca con
// web_search y devuelve una lista; el servidor comprueba que el apellido de
// cada persona sale en las citas de la búsqueda. Si no sale, se marca como
// dudosa (el usuario la ve sin seleccionar). Solo servidor.

import { limpiar } from '@/lib/patronesCorreo';

const MODELO = 'claude-sonnet-5-5';
// USD por millón de tokens y por búsqueda (los de lib/enriquecer.js).
const PRECIO = { input: 2, output: 10, busqueda: 0.01 };
const MAX_BUSQUEDAS = 8;
const MAX_PERSONAS = 50;
const TIMEOUT_MS = 150000;

const DOMINIOS_BLOQUEADOS = [
  'linkedin.com', 'rocketreach.co', 'zoominfo.com', 'contactout.com', 'signalhire.com',
  'lusha.com', 'apollo.io', 'theorg.com', 'crunchbase.com', 'hunter.io', 'adapt.io',
];

const SISTEMA = `Eres un documentalista de GovTalent, una plataforma de asuntos públicos. Te describen un conjunto de cargos (por ejemplo, «secretarios del Departament de Territori de la Generalitat» o «directores generales del Ministerio de Hacienda») y tienes que averiguar QUIÉN LOS OCUPA HOY.

Reglas estrictas:
- Busca solo en fuentes oficiales: organigramas y webs de gobiernos, ministerios, consejerías, organismos, parlamentos, instituciones de la UE, portales de transparencia y boletines oficiales (nombramientos y ceses).
- No uses redes sociales, directorios comerciales ni agregadores de contactos.
- Solo personas que ocupan el cargo AHORA. Si ves un cese o un nombramiento posterior, manda el más reciente.
- Nunca inventes una persona ni completes un nombre. Si no estás seguro de alguien, pon "confianza": "baja".
- Como máximo ${MAX_PERSONAS} personas.
- Si ves el dominio de los correos de su organización escrito en alguna dirección (lo que va detrás de la @), indícalo.

Haz como máximo ${MAX_BUSQUEDAS} búsquedas. Termina SIEMPRE con un único objeto JSON, sin texto después:
{"personas":[{"nombre":"Nombre y apellidos completos","cargo":"cargo exacto, en el idioma de la fuente","organizacion":"nombre oficial de la organización","unidad":"departamento, consejería o unidad"|null,"ambito":"España"|"UE"|"internacional","fuente_url":"https://...","fecha_fuente":"AAAA-MM-DD"|null,"confianza":"alta"|"baja"}],"dominio_correo":"..."|null,"notas":"una frase"}`;

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

const plano = (t) => limpiar(t).replace(/[^a-z0-9@. ]+/g, ' ');
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'da', 'm', 'ma']);
export const palabrasNombre = (n) =>
  limpiar(n)
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !PARTICULAS.has(w));

const dominioDe = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/**
 * q: la descripción de los cargos.
 * → { personas: [{ nombre, cargo, organizacion, unidad, ambito, fuente_url, fuente_dominio, fecha_fuente, dudoso }],
 *     dominio_correo, notas, coste_usd }
 * Lanza si la IA falla (no se cobra nada en ese caso).
 */
export async function descubrirPorCargo(q) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 6000,
        system: SISTEMA,
        messages: [{ role: 'user', content: `Cargos a localizar: ${q}\n\nFecha de hoy: ${new Date().toISOString().slice(0, 10)}.` }],
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
  const citas = plano(
    bloques
      .flatMap((b) => (b.type === 'text' && b.citations) || [])
      .map((c) => `${c.cited_text || ''} ${c.title || ''}`)
      .join('\n')
  );
  // Lo que devuelve la búsqueda (títulos y fragmentos), además de las citas.
  const resultados = plano(
    bloques
      .filter((b) => b.type === 'web_search_tool_result' && Array.isArray(b.content))
      .flatMap((b) => b.content.map((r) => `${r.title || ''}`))
      .join('\n')
  );
  const j = extraerJSON(texto) || {};

  const u = data.usage || {};
  const busquedas = u.server_tool_use?.web_search_requests || 0;
  const coste =
    (((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)) / 1e6) * PRECIO.input +
    ((u.output_tokens || 0) / 1e6) * PRECIO.output +
    busquedas * PRECIO.busqueda;

  const vistos = new Set();
  const personas = [];
  for (const p of Array.isArray(j.personas) ? j.personas : []) {
    const nombre = typeof p?.nombre === 'string' ? p.nombre.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    const cargo = typeof p?.cargo === 'string' ? p.cargo.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
    const organizacion = typeof p?.organizacion === 'string' ? p.organizacion.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    const palabras = palabrasNombre(nombre);
    if (palabras.length < 2 || !cargo || !organizacion) continue;
    const clave = palabras.join('-');
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const fuente = typeof p.fuente_url === 'string' && p.fuente_url.startsWith('https://') ? p.fuente_url.slice(0, 500) : null;
    // El apellido tiene que salir en las citas o en los resultados.
    const apellidos = palabras.slice(1);
    const citado = apellidos.some((a) => citas.includes(a) || resultados.includes(a));
    personas.push({
      nombre,
      cargo,
      organizacion,
      unidad: typeof p.unidad === 'string' && p.unidad.trim() ? p.unidad.trim().slice(0, 200) : null,
      ambito: ['España', 'UE', 'internacional'].includes(p.ambito) ? p.ambito : 'España',
      fuente_url: fuente,
      fuente_dominio: fuente ? dominioDe(fuente) : null,
      fecha_fuente: typeof p.fecha_fuente === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha_fuente) ? p.fecha_fuente : null,
      dudoso: !citado || p.confianza === 'baja' || !fuente,
    });
    if (personas.length >= MAX_PERSONAS) break;
  }

  const dom = typeof j.dominio_correo === 'string' ? j.dominio_correo.trim().toLowerCase().replace(/^@/, '') : '';
  return {
    personas,
    dominio_correo: /^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom) && citas.includes(`@${dom}`) ? dom : null,
    notas: typeof j.notas === 'string' ? j.notas.slice(0, 400) : null,
    coste_usd: Number(coste.toFixed(5)),
  };
}

/** Tipo de institución del directorio para una organización nueva. */
export function tipoInstitucion(organizacion, ambito) {
  if (ambito === 'UE') return 'órganos UE';
  if (ambito === 'internacional') return 'internacional';
  const o = limpiar(organizacion);
  if (/generalitat|xunta|junta de|gobierno de (?!espana)|govern|consejer|conselleria|comunidad de|comunitat|principado|cabildo|parlament|cortes de|asamblea de|diputacion foral|eusko/.test(o)) return 'autonómico';
  if (/ayuntamiento|ajuntament|concello|diputacion|udala|consell comarcal/.test(o)) return 'local';
  if (/ministerio|secretaria de estado|agencia estatal|gobierno de espana/.test(o)) return 'ejecutivo';
  return 'institucional';
}

/** Nivel del cargo, con los del directorio (lib/contactosFiltros.js, BANDAS). */
export function bandaDeCargo(cargo) {
  const c = limpiar(cargo);
  if (/^(president|vicepresident|conseller|consejer|ministr|secretari[oa]? de estado|subsecretari|comisari)/.test(c)) return 'alta_direccion';
  if (/^secretari[oa]? (general|de |del |d |per |para )/.test(c)) return 'alta_direccion';
  if (/^director(a)? general/.test(c)) return 'alta_direccion';
  if (/^subdirect/.test(c)) return 'subdireccion';
  if (/^(director|directora|delegad|delegat|comisionad|comissionat|gerent|jef[ae] de gabinete|cap del gabinet)/.test(c)) return 'direccion';
  return 'mando_intermedio';
}
