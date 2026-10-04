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
import { tipoTramite } from '@/lib/ccaa/comun';
import { finDePlazo } from '@/lib/parlamentosAutonomicos';

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
      // Cada publicación es un bloque con su descripción y fecha, y al
      // final el enlace «Versión PDF». Se toma el texto entre un enlace y
      // el anterior como descripción de esa publicación.
      const pdfs = [...f.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']*sirdoc[^"']*\.pdf[^"']*)["'][^>]*>/gi)];
      if (ctx.diagnostico && !ctx.diagnostico.ficha && pdfs.length) {
        const i = pdfs[0].index;
        ctx.diagnostico.ficha = f.slice(Math.max(0, i - 4000), i + 2000).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ');
      }
      let previo = Math.max(0, (pdfs[0]?.index || 0) - 1500);
      for (const [n, m] of pdfs.entries()) {
        const bloque = textoPlano(f.slice(previo, m.index)).replace(/\s+/g, ' ').trim().slice(-400);
        previo = m.index + m[0].length;
        if (n >= MAX_PDF_POR_EXP) continue;
        const href = new URL(m[1].replace(/&amp;/g, '&'), a.href).toString();
        const cod = href.split('/').pop().replace(/\.pdf.*$/i, '');
        // El bloque se repite (texto de la entrada y su resumen): basta la
        // última aparición, sin la referencia al boletín.
        const desc = (bloque.split(/BOCCYL n\.?º/i).slice(-2, -1)[0] || bloque).replace(/^.*?\d{2}\/\d{2}\/\d{4}\s*/, '').trim();
        const fecha = fechaDeTexto(bloque);
        // «…plazo de presentación de enmiendas hasta las 14:00 horas del día
        // 11 de junio de 2025»: el plazo viene escrito en la propia entrada.
        const pl = bloque.match(/hasta las (\d{1,2})[:.](\d{2}) horas del d[ií]a (\d{1,2} de [a-záéíóú]+ de \d{4})/i);
        tramites.push({
          tipo: tipoTramite(desc),
          fecha,
          descripcion: desc.slice(0, 300) || null,
          plazo_hasta: pl ? finDePlazo(fechaDeTexto(pl[3]), `${pl[1].padStart(2, '0')}:${pl[2]}`) : null,
          url: href,
        });
        boletines.set(`castillayleon:${cod}`, {
          id: `castillayleon:${cod}`,
          numero: (bloque.match(/BOCCL\s*n?[º.°]*\s*([\d/]+)/i) || [])[1] || null,
          fecha,
          titulo: `${num} · ${bloque.slice(-150)}`.slice(0, 200),
          url: href,
          url_pdf: href,
          expediente: num,
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
