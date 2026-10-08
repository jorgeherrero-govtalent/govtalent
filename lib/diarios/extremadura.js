// =====================================================================
// Diario Oficial de Extremadura (DOE) — lector
// lib/diarios/extremadura.js
//
// RSS del sumario completo (sección 6), un elemento por disposición
// (comprobado desde Vercel el 08-10-2026):
//   https://doe.juntaex.es/rss/rss.php?seccion=6
// Cada elemento trae la sección en <category> («III.OTRAS RESOLUCIONES»),
// y en la descripción la consejería y la materia. El enlace es el PDF de
// la disposición. La fecha viene sin hora. Va en ISO-8859-1 (lo resuelve
// lib/ccaa/web.js).
// =====================================================================

import { elementosRss, textoPlano, fechaDeTexto } from '@/lib/ccaa/web';

const RSS = 'https://doe.juntaex.es/rss/rss.php?seccion=6';

export async function leer(web, ctx = {}) {
  const xml = await web.texto(RSS);
  const entradas = [];
  for (const it of elementosRss(xml)) {
    if (!it.enlace || !it.titulo) continue;
    const categoria = textoPlano((it.raw.match(/<category\b[^>]*>([\s\S]*?)<\/category>/i) || [])[1]) || null;
    const desc = String(it.descripcion || '').split('\n').map((s) => s.trim()).filter(Boolean);
    // El número del DOE va en la ruta del PDF: /pdfs/doe/2026/1940o/…
    const numero = (it.enlace.match(/\/doe\/\d{4}\/(\d+)[oe]\//i) || [])[1] || null;
    const ref = (it.enlace.split('/').pop() || '').replace(/\.pdf$/i, '');
    entradas.push({
      ref,
      fecha: fechaDeTexto(it.fecha),
      numero,
      seccion: categoria,
      organo: desc[0] || null,
      materia: desc[1] || null,
      titulo: it.titulo,
      url: it.enlace,
      url_pdf: it.enlace,
      publicado_en: null,
    });
  }
  if (ctx.debug) ctx.diagnostico.extremadura = { primer_elemento: (xml.match(/<item[\s>][\s\S]*?<\/item>/i) || [])[0]?.slice(0, 1500) };
  return entradas;
}
