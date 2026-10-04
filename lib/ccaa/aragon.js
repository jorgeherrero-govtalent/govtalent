// =====================================================================
// Cortes de Aragón — lector
// lib/ccaa/aragon.js
//
// · Página «Leyes»: proyectos y proposiciones de ley en tramitación, con
//   enlace a su ficha en la base de tramitación (Lotus Domino,
//   bases.cortesaragon.es/bases/tramitacion.nsf).
// · Ficha: texto corrido, sin número de expediente. Trae legislatura,
//   quién la presenta, la calificación («Admitida el día…»), la
//   publicación en el BOCA (con enlace), el criterio del Gobierno y una
//   última línea con la situación («Pendiente de…»).
// · Como la ficha no da número, el expediente se identifica con el id del
//   documento Domino («XII-<UNID>») y se marca como número provisional:
//   cuando la IA lee el BOCA y encuentra el número impreso, casa por
//   título y lo sustituye (lib/lectorBoletines.js).
// · Boletines a leer con IA: el BOCA enlazado desde la ficha (se abre la
//   página del BOCA para encontrar su PDF).
// =====================================================================

import { textoPlano, fechaDeTexto, enlacesDe } from '@/lib/ccaa/web';
import { cerrado, resultadoDe } from '@/lib/ccaa/comun';

const LEYES = 'https://www.cortesaragon.es/Leyes.2580.0.html?no_cache=1';
const BASES = 'https://bases.cortesaragon.es';

export async function leer(web, ctx = {}) {
  const html = await web.texto(LEYES);
  const expedientes = [];
  const boletines = new Map();
  const vistos = new Set();
  for (const a of enlacesDe(html, LEYES)) {
    // En el HTML las fichas llevan barra invertida («bases\tramitacion.nsf»).
    const href = a.href.replace(/%5C|\\/gi, '/');
    const unid = (href.match(/tramitacion\.nsf\/\(ID\)\/([0-9A-F]{32})/i) || [])[1];
    if (!unid || vistos.has(unid)) continue;
    vistos.add(unid);
    if (ctx.tiempoAgotado?.()) break;
    const tituloListado = a.texto.replace(/\s+/g, ' ').trim();

    let f = '';
    try {
      f = await web.texto(href);
    } catch (e) {
      if (e.robots) throw e;
      continue;
    }
    const plano = textoPlano(f).replace(/&nbsp;?/gi, ' ').replace(/\s+/g, ' ');
    const legislatura = (plano.match(/Legislatura:\s*([IVXLC]+)/i) || [])[1] || 'XII';
    const num = `${legislatura}-${unid.slice(0, 12)}`;
    if (ctx.saltar?.(num)) continue;

    // Título: la frase «PROPOSICION DE LEY, …» o «PROYECTO DE LEY …».
    const tituloFicha = (plano.match(/((?:PROPOSICI[OÓ]N|PROYECTO) DE LEY[\s\S]*?)(?=\s+Legislatura:)/i) || [])[1];
    // «PROPOSICIÓN DE LEY Estatuto…» → «Proposición de Ley Estatuto…», y si
    // el texto repite el tipo («PROPOSICIÓN DE LEY Proposición de Ley por la
    // que…») se deja una sola vez.
    const titulo = (tituloListado || tituloFicha || '')
      .replace(/^(PROPOSICI[OÓ]N|PROYECTO) DE LEY,?\s*/i, (m) => `${m.replace(/,?\s*$/, '').toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace('de ley', 'de Ley')} `)
      .replace(/^(Proposici[oó]n|Proyecto) de Ley\s+((?:Proposici[oó]n|Proyecto) de [Ll]ey\b)/, '$2')
      .replace(/^Proposicion /, 'Proposición ')
      .trim();
    const autor = (plano.match(/Presentan?(?: G\.P\.)?:\s*(.+?)\s+(?:Calificaci|Criterio|Publicad)/i) || [])[1] || null;

    const tramites = [];
    const admitida = plano.match(/Admitida el d[ií]a (\d{2}\/\d{2}\/\d{4})/i);
    if (admitida) tramites.push({ tipo: 'admision', fecha: fechaDeTexto(admitida[1]), descripcion: `Admitida a trámite el ${admitida[1]}`, organo: 'Mesa' });
    const criterio = (plano.match(/Criterio D\.G\.A\.:\s*(.+?)(?=\s+(?:Pendiente|Tomad|Rechazad|Aprobad|Retirad|CORTES DE ARAG)|$)/i) || [])[1];
    if (criterio) tramites.push({ tipo: 'criterio_gobierno', fecha: null, descripcion: `Criterio del Gobierno de Aragón: ${criterio.trim()}`, organo: 'Gobierno de Aragón' });

    // Situación: la frase de estado de la ficha («Pendiente de celebración
    // sesión plenaria…», «En Tramitación»). Sensible a mayúsculas: el criterio
    // del Gobierno también puede decir «PENDIENTE» y no es la situación.
    const situacion =
      (plano.match(/\b((?:Pendiente de|Tomad[ao] en|Rechazad[ao]|Aprobad[ao]|Retirad[ao]|Deca[ií]d[ao]|Caducad[ao])[^.]*?)(?=\s*(?:CORTES DE ARAG|$))/) || [])[1]?.trim() ||
      (/En Tramitaci[oó]n/i.test(plano) ? 'En tramitación' : null);
    const abierto = !(situacion && cerrado(situacion));

    // Publicaciones en el BOCA: «B.O.C.A. núm. 25, de 07/07/2026» y su
    // enlace. Del BOCA se busca el PDF, solo si el expediente sigue abierto.
    for (const m of f.matchAll(/B\.O\.C\.A\.\s*n[uú]m\.\s*(\d+),?\s*de\s*(\d{2}\/\d{2}\/\d{4})[\s\S]{0,400}?<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
      const fecha = fechaDeTexto(m[2]);
      const urlBoca = new URL(m[3].replace(/&amp;/g, '&'), `${BASES}/`).toString();
      tramites.push({ tipo: 'publicacion', fecha, descripcion: `Publicada en el BOCA núm. ${m[1]}, de ${m[2]}`, url: urlBoca });
      if (!abierto) continue;
      let pdf = /\.pdf/i.test(urlBoca) ? urlBoca : null;
      if (!pdf) {
        try {
          const pag = await web.texto(urlBoca);
          pdf = enlacesDe(pag, urlBoca).map((x) => x.href).find((h) => /\.pdf/i.test(h)) || null;
          if (!pdf && ctx.diagnostico && !ctx.diagnostico.boca) ctx.diagnostico.boca = { url: urlBoca, html: pag.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ').slice(0, 6000) };
        } catch (e) {
          if (e.robots) throw e;
        }
      }
      if (pdf) {
        boletines.set(`aragon:boca-${m[1]}`, { id: `aragon:boca-${m[1]}`, numero: m[1], fecha, titulo: `BOCA núm. ${m[1]}, de ${m[2]}`, url: urlBoca, url_pdf: pdf, expediente: num });
      }
    }

    expedientes.push({
      num_expediente: num,
      tipo: /proposici/i.test(titulo + tituloListado) ? 'Proposición de ley' : /proyecto/i.test(titulo + tituloListado) ? 'Proyecto de ley' : null,
      titulo,
      autor,
      fecha_presentacion: tramites.find((t) => t.tipo === 'admision')?.fecha || null,
      situacion,
      is_closed: !abierto,
      resultado: resultadoDe(situacion),
      url: href,
      tramites,
      // El número es provisional: lo sustituye el que imprima el BOCA.
      raw: { num_provisional: true, unid },
    });
  }
  return { expedientes, boletines: [...boletines.values()] };
}
