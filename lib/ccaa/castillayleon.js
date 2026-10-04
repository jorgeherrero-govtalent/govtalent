// =====================================================================
// Cortes de Castilla y León — lector
// lib/ccaa/castillayleon.js
//
// · «Iniciativas legislativas en tramitación»: proyectos y proposiciones
//   de ley con su número (p. ej. «PPL 1/12») y título.
// · Ficha de publicaciones de cada iniciativa: cada publicación del BOCCL
//   relativa a ella, con su PDF propio (pequeño): esos PDF son los que se
//   leen con IA, no el boletín entero (que pasa de 5 MB).
// La web tiene el certificado intermedio sin instalar: lo resuelve
// lib/fetchGob.js.
// =====================================================================

import { textoPlano, fechaDeTexto, enlacesDe } from '@/lib/ccaa/web';

const BASE = 'https://www.ccyl.es';
const LISTADO = `${BASE}/Actividad/TramitacionParlamentaria`;
const MAX_PDF_POR_EXP = 25;

export async function leer(web, ctx = {}) {
  const html = await web.texto(LISTADO);
  const expedientes = [];
  const boletines = new Map();
  const vistos = new Set();
  for (const a of enlacesDe(html, LISTADO)) {
    if (!/PublicacionesIniciativa\?/i.test(a.href) || vistos.has(a.href)) continue;
    vistos.add(a.href);
    const m = a.texto.match(/^([A-Z]+)\s+(\d+\/\d+)\s*(.*)$/);
    const u = new URL(a.href);
    const codigo = u.searchParams.get('codigoIniciativa');
    const numero = u.searchParams.get('NumeroExpediente');
    const leg = u.searchParams.get('Legislatura');
    const num = m ? `${m[1]} ${m[2]}` : `${codigo} ${numero}/${leg}`;
    // El título va en el texto del enlace o justo después.
    let titulo = m?.[3]?.trim();
    if (!titulo) {
      const i = html.indexOf(a.href.replace(BASE, '').replace(/^\//, ''));
      titulo = i > 0 ? textoPlano(html.slice(i, i + 1500).split(/<\/a>/i)[1] || '').split('\n')[0].trim() : '';
    }
    if (!titulo) continue;
    if (ctx.saltar?.(num) || ctx.tiempoAgotado?.()) continue;

    // Publicaciones de la iniciativa: un PDF por publicación.
    const tramites = [];
    try {
      const f = await web.texto(a.href);
      let n = 0;
      for (const e of enlacesDe(f, a.href)) {
        if (!/\.pdf(\?|$)/i.test(e.href) || !/sirdoc/i.test(e.href) || n >= MAX_PDF_POR_EXP) continue;
        n += 1;
        const cod = e.href.split('/').pop().replace(/\.pdf.*$/i, '');
        boletines.set(`castillayleon:${cod}`, {
          id: `castillayleon:${cod}`,
          numero: (e.texto.match(/BOCCL\s*n?\.?\s*([\d/]+)/i) || [])[1] || null,
          fecha: fechaDeTexto(e.texto),
          titulo: `${num} · ${e.texto}`.slice(0, 200),
          url: e.href,
          url_pdf: e.href,
        });
      }
    } catch (e) {
      if (e.robots) throw e;
    }

    expedientes.push({
      num_expediente: num,
      tipo: codigo === 'PL' ? 'Proyecto de ley' : codigo === 'PPL' ? 'Proposición de ley' : codigo,
      titulo: titulo.replace(/\s+/g, ' '),
      autor: (titulo.match(/presentada por (el|la|los) (.+?)(\.|,|$)/i) || [])[2] || null,
      situacion: 'En tramitación',
      is_closed: false,
      url: a.href,
      tramites,
    });
  }
  return { expedientes, boletines: [...boletines.values()] };
}
