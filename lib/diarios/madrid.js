// =====================================================================
// Boletín Oficial de la Comunidad de Madrid (BOCM) — lector
// lib/diarios/madrid.js
//
// · RSS de sumarios (comprobado desde Vercel el 08-10-2026): los últimos
//   20 boletines, uno por elemento, con el sumario dentro:
//     https://www.bocm.es/sumarios.rss
// · Si un elemento no trae las disposiciones, se lee la página del
//   boletín completo que enlaza (/boletin-completo/…).
//
// OJO: el XML del sumario (/boletin/CM_Boletin_BOCM/…) está prohibido por
// su robots.txt; no se usa. El robots.txt pide Crawl-delay: 10, que
// aplica lib/ccaa/web.js. Se leen solo los 2 boletines más recientes.
// =====================================================================

import { elementosRss, fechaDeTexto } from '@/lib/ccaa/web';
import { enlacesConSeccion } from '@/lib/diarios/comun';

const RSS = 'https://www.bocm.es/sumarios.rss';
const BOLETINES = 2;
const DISPOSICION = /bocm-(\d{8})-(\d+)/i;
const SECCIONES = /^([ivx]+\.\s|[a-e]\)\s)|^(comunidad de madrid|disposiciones generales|autoridades y personal|otras disposiciones|anuncios|administracion del estado|administracion local|administracion de justicia|otros anuncios)/;
const ORGANO = /^(consejeria|vicepresidencia|presidencia|universidad|canal de isabel|agencia|servicio madrileno|instituto|organismo|consorcio|empresa|ente |delegacion|asamblea|camara|tribunal)/;

export async function leer(web, ctx = {}) {
  const xml = await web.texto(RSS);
  const items = elementosRss(xml).slice(0, BOLETINES);
  const porRef = new Map();
  const diag = [];

  for (const it of items) {
    const numero = (String(it.titulo || '').match(/n[ºo°.]*\s*(\d+)/i) || [])[1] || null;
    const descRaw = ((it.raw.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let enlaces = enlacesConSeccion(descRaw, RSS, { enlace: DISPOSICION, seccion: SECCIONES, organo: ORGANO });
    let origen = 'rss';
    if (!enlaces.length && it.enlace) {
      const html = await web.texto(new URL(it.enlace, RSS).toString());
      enlaces = enlacesConSeccion(html, it.enlace, { enlace: DISPOSICION, seccion: SECCIONES, organo: ORGANO });
      origen = 'pagina';
    }
    if (ctx.debug) diag.push({ boletin: it.titulo, enlace: it.enlace, origen, enlaces: enlaces.length, muestra: enlaces.slice(0, 8), descripcion: descRaw.slice(0, 1500) });

    for (const e of enlaces) {
      const m = e.href.match(DISPOSICION);
      const ref = `BOCM-${m[1]}-${m[2]}`;
      const esPdf = /\.pdf$/i.test(e.href);
      const titulo = !e.texto || /^(pdf|html|epub|ver|descargar)/i.test(e.texto) ? e.previo : e.texto;
      const previo = porRef.get(ref);
      if (previo) {
        if (esPdf && !previo.url_pdf) previo.url_pdf = e.href;
        if (!esPdf && /\.pdf$/i.test(previo.url)) previo.url = e.href;
        if ((!previo.titulo || previo.titulo.length < 20) && titulo) previo.titulo = titulo;
        continue;
      }
      porRef.set(ref, {
        ref,
        fecha: fechaDeTexto(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`),
        numero,
        seccion: e.seccion,
        organo: e.organo,
        titulo,
        url: e.href,
        url_pdf: esPdf ? e.href : null,
        publicado_en: null,
      });
    }
  }
  if (ctx.debug) ctx.diagnostico.madrid = diag;
  return [...porRef.values()].filter((e) => e.titulo);
}
