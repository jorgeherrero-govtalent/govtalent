// =====================================================================
// PARLAMENTO DE LA RIOJA — composición
// lib/ccaa/composicion/rioja.js
//
//   · composicion-y-organos/grupos-parlamentarios-link — los grupos; cada
//     ficha de grupo (legislatura-11/grupos-parlamentarios/<grupo>) trae
//     sus diputados, el correo del grupo y su «Personal del grupo
//     parlamentario» (los técnicos).
//   · legislatura-11/diputados/<nombre> — correo publicado del diputado y foto.
//   · legislatura-11/organos/{mesa,portavoces,diputacion,comisiones} —
//     «Cargo (GPP) Nombre ( Alta: dd/mm/aaaa )».
// Se guarda con lib/ccaa/composicion/comun.js.
// =====================================================================

import { textoPlano } from '@/lib/ccaa/web';

export const P = 'rioja';
export const LEGISLATURA = 'XI';
export const FUENTE = 'parlamento-larioja.org';
const O = 'https://www.parlamento-larioja.org';
const C = `${O}/composicion-y-organos`;
const L = `${C}/legislatura-11`;

export function siglaGrupo(nombre) {
  const t = String(nombre || '').toLowerCase();
  if (/popular/.test(t)) return 'PP';
  if (/socialista/.test(t)) return 'PSOE';
  if (/vox/.test(t)) return 'VOX';
  if (/podemos|izquierda unida/.test(t)) return 'Podemos-IU';
  if (/mixto/.test(t)) return 'Mixto';
  return null;
}

const sinScripts = (h) => h.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
const limpiar = (t) => textoPlano(String(t || '')).replace(/\s+/g, ' ').trim();
const SLUG_DIP = /legislatura-11\/diputados\/([a-z0-9-]+)\/?(?=["#?]|$)/;

/** Texto principal de una página Plone: desde «Info» (cabecera del contenido) hasta el pie. */
function cuerpo(html) {
  const t = limpiar(sinScripts(html));
  const i = t.indexOf(' Info ');
  const f = t.indexOf('C/ Marqués de San Nicolás');
  return t.slice(i >= 0 ? i + 6 : 0, f > 0 ? f : undefined);
}

async function paginasDeGrupo(web) {
  const h = await web.texto(`${C}/grupos-parlamentarios-link`);
  const urls = [...new Set([...h.matchAll(/href="([^"]*legislatura-11\/grupos-parlamentarios\/[a-z0-9-]+)"/g)].map((m) => m[1]))];
  const out = [];
  for (const url of urls) {
    const g = await web.texto(url);
    const nombre = limpiar((sinScripts(g).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) || limpiar((g.match(/<title>([^<—–-]+)/i) || [])[1]);
    out.push({ url, nombre, html: g });
  }
  return out;
}

let cacheGrupos = null;

export async function leerDiputados(web) {
  cacheGrupos = await paginasDeGrupo(web);
  const out = new Map();
  for (const g of cacheGrupos) {
    const correoGrupo = (g.html.match(/gp-[\w.-]+@parlamento-larioja\.org/i) || [])[0] || null;
    for (const m of g.html.matchAll(/<a[^>]+href="([^"]*legislatura-11\/diputados\/([a-z0-9-]+))"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const nombre = limpiar(m[3]);
      if (!nombre || out.has(m[2])) continue;
      out.set(m[2], { id_fuente: m[2], nombre, grupo: g.nombre, grupo_url: g.url, url_ficha: m[1].startsWith('http') ? m[1] : `${O}${m[1]}`, circunscripcion: 'La Rioja', correo_grupo: correoGrupo });
    }
  }
  return [...out.values()];
}

export async function leerFicha(web, d) {
  const h = await web.texto(d.url_ficha || `${L}/diputados/${d.id_fuente}`);
  const email = (h.match(/[\w.+-]+@parlamento-larioja\.org/gi) || []).find((e) => !/^(secretaria|gp-|prensa|info)/i.test(e))?.toLowerCase() || null;
  const fotos = [...h.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]).filter((s) => s.includes(`/diputados/${d.id_fuente}`) || /@@images|\/image(_\w+)?$/.test(s) && s.includes(d.id_fuente));
  const twitter = (h.match(/href="(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"]+)"/i) || [])[1] || null;
  return { email, foto_url: fotos[0] ? (fotos[0].startsWith('http') ? fotos[0] : `${O}${fotos[0]}`) : null, twitter };
}

function cargoDe(bruto) {
  if (!bruto) return null;
  const c = bruto.split(/\.\s+/).pop().replace(/^.*Sustituye a:\s*/i, '');
  const k = c.match(/((?:President[ea]|Vicepresident[ea]|Secretari[oa]|Portavoz|Diputado\/a|Miembro|Vocal)\b.*)$/);
  return k ? k[1].trim() : null;
}

/** «Cargo (GPP) Nombre ( Alta: 22/06/2023 )», repetido; el cargo puede valer para varios seguidos. */
export function leerMiembros(texto) {
  const out = [];
  const RE = /(?:([A-ZÁÉÍÓÚÑ][^()]*?)\s*)?\((GP[^)]*)\)\s*([^()]+?)\s*\(\s*Alta:\s*(\d{2})\/(\d{2})\/(\d{4})\s*\)/g;
  let m;
  let ultimo = 'Vocal';
  while ((m = RE.exec(texto))) {
    // Delante del cargo puede ir la introducción de la página («La Mesa es
    // el órgano rector…») o la nota del anterior («Sustituye a: Fulano»): se
    // queda solo la fórmula del cargo; si no hay, sigue el mismo.
    const c = cargoDe(m[1]);
    if (c) ultimo = c;
    out.push({ nombre: m[3].trim(), cargo: ultimo === 'Diputado/a' ? 'Vocal' : ultimo, fecha_inicio: `${m[6]}-${m[5]}-${m[4]}`, gp: m[2] });
  }
  return out;
}

export async function leerOrganos(web) {
  const organos = [];
  for (const [nombre, ruta] of [
    ['Mesa del Parlamento', '/organos/mesa'],
    ['Junta de Portavoces', '/organos/portavoces'],
    ['Diputación Permanente', '/organos/diputacion'],
  ]) {
    try {
      organos.push({ nombre, tipo: 'organo', url: `${L}${ruta}`, miembros: leerMiembros(cuerpo(await web.texto(`${L}${ruta}`))) });
    } catch {
      // Sigue.
    }
  }
  const indice = await web.texto(`${L}/organos/comisiones`);
  const coms = new Map();
  for (const m of indice.matchAll(/<a[^>]+href="([^"]*legislatura-11\/organos\/comisiones\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const nombre = limpiar(m[2]);
    if (nombre && !coms.has(m[1])) coms.set(m[1], nombre);
  }
  for (const [href, nombre] of coms) {
    const url = href.startsWith('http') ? href : `${O}${href}`;
    try {
      organos.push({ nombre, url, miembros: leerMiembros(cuerpo(await web.texto(url))) });
    } catch {
      // Sigue.
    }
  }
  return organos;
}

/** «Personal del grupo parlamentario: Nombre Nombre … Teléfono» en la ficha de cada grupo. */
export async function leerTecnicos(web) {
  const grupos = cacheGrupos || (await paginasDeGrupo(web));
  const out = [];
  for (const g of grupos) {
    const h = sinScripts(g.html);
    const i = h.search(/Personal del grupo parlamentario/i);
    if (i < 0) continue;
    const tramo = h.slice(i, i + 4000).split(/Tel[eé]fono/i)[0];
    const nombres = tramo
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((x) => limpiar(x).replace(/^Personal del grupo parlamentario:?\s*/i, ''))
      .filter((x) => x && x.split(' ').length >= 2 && x.length < 70 && !/:/.test(x));
    for (const nombre of nombres) out.push({ nombre, grupo: g.nombre, cargo: 'Personal del grupo parlamentario' });
  }
  return out;
}
