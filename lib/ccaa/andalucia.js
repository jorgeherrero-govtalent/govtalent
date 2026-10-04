// =====================================================================
// Parlamento de Andalucía — lector
// lib/ccaa/andalucia.js
//
// · Listado de iniciativas legislativas en tramitación (HTML).
// · Ficha de cada expediente: datos y lista de trámites, con el enlace al
//   BOPA en que se publica cada uno.
// · Boletines a leer con IA: los BOPA enlazados desde los trámites de
//   las iniciativas legislativas (no todos los BOPA: la mayoría son de
//   control e impulso).
// Sirve en ISO-8859-1: lo decodifica lib/ccaa/web.js.
// =====================================================================

import { textoPlano, fechaDeTexto } from '@/lib/ccaa/web';
import { tipoTramite, cerrado, resultadoDe } from '@/lib/ccaa/comun';

const BASE = 'https://www.parlamentodeandalucia.es/webdinamica/portal-web-parlamento';
const LISTADO = `${BASE}/actividadparlamentaria/tramitacionencurso/legislativas.do`;
const ficha = (num) => `${BASE}/actividadparlamentaria/todaslasiniciativas/portipo.do?numexp=${encodeURIComponent(num).replace(/%2F/g, '/')}`;

/** Pares etiqueta → valor de las <dt>/<dd> de un bloque. */
function campos(html) {
  const out = {};
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/(?:dt|span)>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const k = textoPlano(m[1]).replace(/:$/, '').toLowerCase();
    if (!(k in out)) out[k] = textoPlano(m[2]);
  }
  return out;
}

export async function leer(web, ctx = {}) {
  const html = await web.texto(LISTADO);
  const nums = [];
  for (const bloque of html.split(/<dl class="row mt-3">/i).slice(1)) {
    const c = campos(bloque.split('</dl>')[0]);
    const num = c['número expediente'] || c['numero expediente'];
    if (num) nums.push({ num, autor: c.proponente || null, titulo: c.extracto || null, fecha: fechaDeTexto(c['fecha creación'] || c['fecha creaci&oacute;n']) });
  }

  const expedientes = [];
  const boletines = new Map();
  for (const n of nums) {
    if (ctx.saltar?.(n.num) || ctx.tiempoAgotado?.()) continue;
    const url = ficha(n.num);
    const f = await web.texto(url);
    const cab = campos((f.split(/Listas de tr[aá]mites/i)[0] || ''));
    const tramites = [];
    const listaTram = f.split(/Listas de tr[aá]mites/i)[1]?.split(/<\/dl>\s*<\/div>/)[0] || '';
    for (const trozo of listaTram.split(/class="sep"/i)) {
      const c = campos(trozo);
      const fecha = fechaDeTexto(c.fecha);
      const desc = c['descripción'] || c['descripci&oacute;n'] || c.descripcion;
      if (!fecha && !desc) continue;
      const bopa = trozo.match(/href="([^"]*pdf\.do\?tipodoc=bopa&(?:amp;)?id=(\d+))"[^>]*>([\s\S]*?)<\/a>/i);
      let urlBopa = null;
      if (bopa) {
        urlBopa = new URL(bopa[1].replace(/&amp;/g, '&'), BASE + '/').toString();
        const texto = textoPlano(bopa[3]);
        boletines.set(`andalucia:bopa-${bopa[2]}`, {
          id: `andalucia:bopa-${bopa[2]}`,
          numero: (texto.match(/n[ºo°]\s*([\d.]+)/i) || [])[1] || null,
          fecha: fechaDeTexto(texto),
          titulo: texto.replace(/\(PDF.*$/, '').trim(),
          url: urlBopa,
          url_pdf: urlBopa,
        });
      }
      tramites.push({ tipo: tipoTramite(desc), fecha, descripcion: desc || null, url: urlBopa });
    }
    const situacion = cab.estado || null;
    expedientes.push({
      num_expediente: n.num,
      tipo: cab.tipo || null,
      titulo: cab.extracto || n.titulo,
      autor: cab.proponente || n.autor,
      comision: cab['comisión dictaminante'] || cab['comisi&oacute;n dictaminante'] || null,
      fecha_presentacion: fechaDeTexto(cab['fecha creación'] || cab['fecha creaci&oacute;n']) || n.fecha,
      situacion,
      is_closed: cerrado(situacion),
      resultado: resultadoDe(situacion),
      url,
      tramites,
      raw: { procedimiento: cab.procedimiento || null },
    });
  }
  return { expedientes, boletines: [...boletines.values()] };
}
