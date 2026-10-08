// =====================================================================
// Diario Oficial de Galicia (DOG) — lector
// lib/diarios/galicia.js
//
// RSS del sumario del día, un elemento por disposición (comprobado desde
// Vercel el 08-10-2026; se genera a las 00:00 en Madrid):
//   https://www.xunta.gal/diario-oficial-galicia/rss/Sumario_gl.rss
// Se prueba antes la versión en castellano (Sumario_es.rss) por si
// existe; si no, la gallega.
//
// La descripción de cada elemento trae la subsección («b) Nomeamentos»,
// «III. Outras disposicións»…) y, tras un salto de línea, el órgano.
// El robots.txt solo prohíbe los PDF: se enlaza al HTML.
// =====================================================================

import { elementosRss, textoPlano, fechaDeTexto } from '@/lib/ccaa/web';
import { instante } from '@/lib/diarios/comun';

const BASE = 'https://www.xunta.gal/diario-oficial-galicia/rss';
const FEEDS = [`${BASE}/Sumario_es.rss`, `${BASE}/Sumario_gl.rss`];

export async function leer(web, ctx = {}) {
  let xml = null;
  let usado = null;
  for (const url of FEEDS) {
    try {
      const t = await web.texto(url);
      if (/<item[\s>]/i.test(t)) { xml = t; usado = url; break; }
    } catch (e) {
      if (e.robots) throw e;
    }
  }
  if (!xml) throw new Error('No se pudo leer el RSS del sumario del DOG');

  const canal = xml.split(/<item[\s>]/i)[0];
  const numero = (textoPlano((canal.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).match(/n[uú]m(?:ero|\.)?\s*(\d+)/i) || [])[1] || null;

  const entradas = [];
  for (const it of elementosRss(xml)) {
    if (!it.enlace || !it.titulo) continue;
    const descRaw = (it.raw.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '';
    const partes = descRaw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .split(/<\/?br\s*\/?>/i)
      .map((p) => textoPlano(p))
      .filter(Boolean);
    const codigo = (it.enlace.match(/Anuncio([^_/]+)_/i) || [])[1] || it.enlace.split('/').pop();
    const fechaRuta = (it.enlace.match(/\/(\d{4})(\d{2})(\d{2})\//) || []).slice(1);
    entradas.push({
      ref: codigo,
      fecha: fechaRuta.length === 3 ? fechaRuta.join('-') : fechaDeTexto(it.fecha),
      numero,
      seccion: partes[0] || null,
      organo: partes[1] || null,
      titulo: it.titulo,
      url: it.enlace,
      url_pdf: null,
      publicado_en: instante(it.fecha),
    });
  }

  if (ctx.debug) ctx.diagnostico.galicia = { feed: usado, canal: canal.slice(0, 600), primer_elemento: (xml.match(/<item[\s>][\s\S]*?<\/item>/i) || [])[0]?.slice(0, 1500) };
  return entradas;
}
