// =====================================================================
// Boletín Oficial del País Vasco (BOPV) — lector
// lib/diarios/paisvasco.js
//
// · RSS del último boletín (comprobado desde Vercel el 08-10-2026; el
//   boletín de cada día está disponible la víspera, hacia las 13:45):
//     https://www.euskadi.eus/bopv2/datos/Ultimo.xml
//   Un elemento por disposición, pero SIN sección.
// · La sección se toma del sumario en HTML del mismo boletín, donde va
//   como encabezado (robots.txt permite /*web01-*):
//     https://www.euskadi.eus/web01-bopv/es/bopv2/datos/Ultimo.shtml
//   Si el sumario no se puede leer, se clasifica solo por el título.
// =====================================================================

import { elementosRss, textoPlano, fechaDeTexto } from '@/lib/ccaa/web';
import { enlacesConSeccion } from '@/lib/diarios/comun';

const RSS = 'https://www.euskadi.eus/bopv2/datos/Ultimo.xml';
const SUMARIO = 'https://www.euskadi.eus/web01-bopv/es/bopv2/datos/Ultimo.shtml';
const SECCIONES = /^(\d+\.?\s*)?(disposiciones generales|autoridades y personal|otras disposiciones|administracion de justicia|anuncios)/;
const ORGANO = /^(departamento|presidencia|lehendakaritza|vicepresidencia|osakidetza|universidad|instituto|ente|agencia|parlamento|tribunal|ararteko|comision|consejo|diputacion|ayuntamiento|junta)\b/;

/** '2604137a' a partir de un enlace o un guid. */
const refDe = (s) => (String(s || '').match(/(\d{6,8})[ae]?\.(?:shtml|pdf|epub)/i) || String(s || '').match(/\b(\d{7})[ae]?\b/) || [])[1] || null;

export async function leer(web, ctx = {}) {
  const xml = await web.texto(RSS);
  const canal = xml.split(/<item[\s>]/i)[0];
  const tituloCanal = textoPlano((canal.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const numero = (tituloCanal.match(/(\d+)/) || [])[1] || null;
  const fechaCanal = fechaDeTexto(tituloCanal);

  // Secciones del sumario en HTML, por referencia.
  const secciones = new Map();
  let diagSumario = null;
  try {
    const html = await web.texto(SUMARIO);
    const enlaces = enlacesConSeccion(html, SUMARIO, { enlace: /\d{6,8}[ae]?\.shtml/i, seccion: SECCIONES, organo: ORGANO });
    for (const e of enlaces) {
      const r = refDe(e.href);
      if (r && !secciones.has(r)) secciones.set(r, e);
    }
    if (ctx.debug) diagSumario = { enlaces: enlaces.length, muestra: enlaces.slice(0, 6) };
  } catch (e) {
    if (ctx.debug) diagSumario = { error: String(e.message || e).slice(0, 200) };
  }

  const entradas = [];
  for (const it of elementosRss(xml)) {
    if (!it.enlace || !it.titulo) continue;
    const ref = refDe(it.enlace) || refDe(it.raw);
    if (!ref) continue;
    const s = secciones.get(ref);
    let url = it.enlace;
    try { url = new URL(it.enlace, RSS).toString(); } catch { /* se deja tal cual */ }
    entradas.push({
      ref,
      fecha: fechaDeTexto(it.fecha) || fechaCanal,
      numero,
      seccion: s?.seccion || null,
      organo: s?.organo || null,
      titulo: it.titulo,
      url,
      url_pdf: null,
      publicado_en: null,
    });
  }
  if (ctx.debug) ctx.diagnostico.paisvasco = { canal: canal.slice(0, 600), primer_elemento: (xml.match(/<item[\s>][\s\S]*?<\/item>/i) || [])[0]?.slice(0, 1200), sumario: diagSumario };
  return entradas;
}
