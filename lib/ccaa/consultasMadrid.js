// =====================================================================
// Consultas públicas del Gobierno de la Comunidad de Madrid
// lib/ccaa/consultasMadrid.js
//
// Fuente (verificada el 23-11-2026): las exportaciones del Portal de
// Transparencia. Se llaman «XLS» pero son una tabla HTML, con todo el
// histórico (no solo lo abierto):
//
//   consulta pública previa     /transparencia/exportar-consulta-publica/consulta-publica
//   audiencia e información     /transparencia/exportar-audiencia-información/tramite-audiencia-e-informacion-publica
//
// Columnas: Tipo, Temas, Consejería, fecha de publicación, inicio y fin
// del plazo de alegaciones, y enlace a la ficha. La exportación NO trae
// el título: sale de la ficha (Drupal 7), que aporta además el resumen y
// los PDF (resolución de apertura, memoria, texto del proyecto…).
//
// Lectura con agente de navegador (decisión de Jorge, 23-11-2026), como la
// agenda y las fotos del Gobierno de Madrid: la web devuelve 404 a
// cualquier User-Agent con «Bot», aunque su robots.txt permite estas
// rutas. Se pide de una en una, con un segundo de pausa entre peticiones,
// y solo las fichas de lo nuevo o abierto.
// =====================================================================

import { fetchGob } from '@/lib/fetchGob';
import { textoPlano } from '@/lib/ccaa/web';

const NAVEGADOR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-ES,es;q=0.9',
};
const PAUSA_MS = 1000;
let ultima = 0;

/** HTML de una página de la Comunidad, con pausa entre peticiones. */
export async function pedir(url) {
  const espera = ultima + PAUSA_MS - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const res = await fetchGob(url, { headers: NAVEGADOR, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return await res.text();
  } finally {
    ultima = Date.now();
  }
}

const BASE = 'https://www.comunidad.madrid/transparencia';

export const FUENTES = [
  { tipo: 'consulta_previa', url: `${BASE}/exportar-consulta-publica/consulta-publica` },
  { tipo: 'audiencia_publica', url: `${BASE}/exportar-audiencia-informaci%C3%B3n/tramite-audiencia-e-informacion-publica` },
];

/** '01/12/2026' → '2026-12-01'. */
function fechaISO(t) {
  const m = String(t || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

const celdas = (fila, etiqueta) =>
  [...fila.matchAll(new RegExp(`<${etiqueta}[^>]*>([\\s\\S]*?)</${etiqueta}>`, 'gi'))].map((m) => textoPlano(m[1]).replace(/\s+/g, ' ').trim());

/**
 * Filas de una exportación. Las columnas se buscan por su nombre, no por
 * su posición: las dos exportaciones las llaman distinto («Fecha fin
 * presentación alegaciones» / «Plazo fin alegaciones»).
 */
export function leerExportacion(html, tipo) {
  const cab = celdas((html.match(/<thead[\s\S]*?<\/thead>/i) || [''])[0], 'th').map((c) => c.toLowerCase());
  const col = (re) => cab.findIndex((c) => re.test(c));
  const iTipo = col(/^tipo/);
  const iTemas = col(/^temas/);
  const iCons = col(/consejer/);
  const iPub = col(/publicaci/);
  const iIni = col(/inicio/);
  const iFin = col(/fin/);
  const iUrl = col(/enlace/);
  if (iFin < 0 || iUrl < 0) throw new Error(`exportación sin las columnas esperadas: ${cab.join(' | ')}`);

  const cuerpo = (html.match(/<tbody[\s\S]*?<\/tbody>/i) || [''])[0];
  const filas = [];
  for (const m of cuerpo.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const c = celdas(m[1], 'td');
    const url = (c[iUrl] || '').trim();
    if (!/^https:\/\/www\.comunidad\.madrid\/transparencia\//.test(url)) continue;
    filas.push({
      tipo,
      tipo_norma: c[iTipo] || null,
      temas: c[iTemas] || null,
      consejeria: c[iCons] || null,
      fecha_publicacion: fechaISO(c[iPub]),
      fecha_inicio: fechaISO(c[iIni]),
      fecha_fin: fechaISO(c[iFin]),
      url,
    });
  }
  return filas;
}

/** Título, consejería, resumen y documentos de la ficha. */
export function leerFicha(html) {
  const og = (html.match(/<meta property="og:title" content="([^"]+)"/i) || [])[1];
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => textoPlano(m[1])).find((t) => t && !/portal de transparencia/i.test(t));
  const titulo = textoPlano(og || h1 || '').replace(/\s+/g, ' ').trim() || null;

  const consejeria = textoPlano(
    (html.match(/Consejer[ií]a Responsable:[\s\S]*?<div class="field-item[^"]*">([\s\S]*?)<\/div>/i) || [])[1] || '',
  ).trim() || null;

  const cuerpo = (html.match(/field-name-body[\s\S]*?<div class="field-item[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
  const resumen = cuerpo ? textoPlano(cuerpo).replace(/[ \t]+/g, ' ').trim() || null : null;

  const vistos = new Set();
  const documentos = [];
  for (const m of html.matchAll(/<a href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = m[1].startsWith('http') ? m[1] : `https://www.comunidad.madrid${m[1]}`;
    if (vistos.has(url)) continue;
    vistos.add(url);
    documentos.push({ nombre: textoPlano(m[2]).replace(/\s+/g, ' ').trim() || url.split('/').pop(), url });
  }
  return { titulo, consejeria, resumen, documentos };
}

/** El texto del proyecto, si la ficha lo publica (es el que se enseña como «Texto del proyecto»). */
export function textoDelProyecto(documentos) {
  return (documentos || []).find((d) => /texto|borrador|proyecto de (decreto|orden|ley)|anteproyecto/i.test(d.nombre) && !/memoria|resoluci|acuerdo|certificad/i.test(d.nombre))?.url || null;
}
