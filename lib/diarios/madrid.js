// =====================================================================
// Boletín Oficial de la Comunidad de Madrid (BOCM) — lector
// lib/diarios/madrid.js
//
// · RSS de sumarios (comprobado desde Vercel el 08-10-2026): los últimos
//   20 boletines, uno por elemento. La descripción solo trae las
//   referencias (BOCM-20261008-1…) y los PDF, sin título ni sección.
// · Por eso, de cada boletín se lee además la página del boletín completo
//   que enlaza (/boletin-completo/…), que es donde están los títulos y los
//   encabezados de sección.
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

// El título de una entrada: el texto del enlace si es un título, o el
// texto que va justo al lado. Nunca la referencia ni «Descargar PDF».
const NO_TITULO = /^(bocm-\d{8}-\d+|descargar|pdf|html|epub|ver\b)/i;
function tituloDe(e) {
  for (const t of [e.texto, e.siguiente, e.previo]) {
    if (t && t.length >= 15 && !NO_TITULO.test(t.trim())) return t;
  }
  return null;
}

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
    let pagina = null;
    // Si las entradas no traen título (solo la referencia), se lee la
    // página del boletín completo.
    if (it.enlace && !enlaces.some((e) => tituloDe(e))) {
      const url = new URL(it.enlace, RSS).toString();
      pagina = await web.texto(url);
      const dePagina = enlacesConSeccion(pagina, url, { enlace: DISPOSICION, seccion: SECCIONES, organo: ORGANO });
      if (dePagina.length) { enlaces = dePagina; origen = 'pagina'; }
    }
    if (ctx.debug) diag.push({ boletin: it.titulo, enlace: it.enlace, origen, enlaces: enlaces.length, muestra: enlaces.slice(0, 10), pagina: pagina ? pagina.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/\s+/g, ' ').slice(0, 4000) : undefined });

    for (const e of enlaces) {
      const m = e.href.match(DISPOSICION);
      const ref = `BOCM-${m[1]}-${m[2]}`;
      const esPdf = /\.pdf$/i.test(e.href);
      const titulo = tituloDe(e);
      const previo = porRef.get(ref);
      if (previo) {
        if (esPdf && !previo.url_pdf) previo.url_pdf = e.href;
        if (!esPdf && /\.pdf$/i.test(previo.url)) previo.url = e.href;
        if (!previo.titulo && titulo) previo.titulo = titulo;
        if (!previo.seccion && e.seccion) previo.seccion = e.seccion;
        if (!previo.organo && e.organo) previo.organo = e.organo;
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
