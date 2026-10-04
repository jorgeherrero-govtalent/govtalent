// =====================================================================
// Cortes de Aragón — lector
// lib/ccaa/aragon.js
//
// · Página «Leyes»: proyectos y proposiciones de ley en tramitación, con
//   enlace a su ficha en la base de datos de tramitación (Lotus Domino,
//   bases.cortesaragon.es/bases/tramitacion.nsf).
// · Ficha: datos y publicaciones en el BOCA.
// · Boletines a leer con IA: los BOCA enlazados desde las fichas.
// =====================================================================

import { textoPlano, fechaDeTexto, enlacesDe } from '@/lib/ccaa/web';
import { tipoTramite, cerrado, resultadoDe } from '@/lib/ccaa/comun';

const LEYES = 'https://www.cortesaragon.es/Leyes.2580.0.html?no_cache=1';

/** Pares «etiqueta: valor» de una ficha Domino (tablas de dos columnas). */
function pares(html) {
  const out = {};
  for (const m of html.matchAll(/<tr[^>]*>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/gi)) {
    const k = textoPlano(m[1]).replace(/:$/, '').toLowerCase();
    if (k && k.length < 60 && !(k in out)) out[k] = textoPlano(m[2]);
  }
  return out;
}

export async function leer(web, ctx = {}) {
  const html = await web.texto(LEYES);
  const expedientes = [];
  const boletines = new Map();
  const vistos = new Set();
  for (const a of enlacesDe(html, LEYES)) {
    // Las fichas van con barra invertida en el HTML («bases\tramitacion.nsf»).
    const href = a.href.replace(/%5C|\\/gi, '/');
    if (!/tramitacion\.nsf\/\(ID\)\//i.test(href) || vistos.has(href)) continue;
    vistos.add(href);
    if (ctx.tiempoAgotado?.()) break;
    const tituloListado = a.texto.replace(/\s+/g, ' ').trim();

    let f = '';
    try {
      f = await web.texto(href);
    } catch (e) {
      if (e.robots) throw e;
      continue;
    }
    const c = pares(f);
    const num = c['número de expediente'] || c['numero de expediente'] || c['expediente'] || c['nº expediente'] || null;
    if (!num) {
      // Diagnóstico: la ficha tal cual, para ajustar el lector.
      if (ctx.diagnostico && !ctx.diagnostico.ficha) {
        ctx.diagnostico.ficha_url = href;
        ctx.diagnostico.pares = c;
        ctx.diagnostico.ficha = f.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/\s+/g, ' ').slice(0, 12000);
      }
      continue;
    }
    if (ctx.saltar?.(num)) continue;

    const tramites = [];
    for (const e of enlacesDe(f, href)) {
      if (!/original\.nsf|BOCA/i.test(e.href) || !/\.pdf/i.test(e.href)) continue;
      const cod = (e.href.match(/\/([^/]+)\.pdf/i) || [])[1];
      if (!cod) continue;
      boletines.set(`aragon:${cod}`, { expediente: num, id: `aragon:${cod}`, numero: (e.texto.match(/n[ºo°.]?\s*(\d+)/i) || [])[1] || null, fecha: fechaDeTexto(e.texto), titulo: e.texto.slice(0, 200) || `BOCA ${cod}`, url: e.href, url_pdf: e.href });
      tramites.push({ tipo: tipoTramite(e.texto), fecha: fechaDeTexto(e.texto), descripcion: e.texto.slice(0, 300) || null, url: e.href });
    }
    const situacion = c['situación'] || c['situacion'] || c['estado'] || null;
    expedientes.push({
      num_expediente: num,
      tipo: /proposici/i.test(tituloListado) ? 'Proposición de ley' : /proyecto/i.test(tituloListado) ? 'Proyecto de ley' : null,
      titulo: c['título'] || c['titulo'] || c['extracto'] || tituloListado,
      autor: c['autor'] || c['proponente'] || null,
      comision: c['comisión'] || c['comision'] || null,
      fecha_presentacion: fechaDeTexto(c['fecha de entrada'] || c['fecha de presentación'] || c['fecha']),
      situacion,
      is_closed: situacion ? cerrado(situacion) : false,
      resultado: resultadoDe(situacion),
      url: href,
      tramites,
    });
  }
  return { expedientes, boletines: [...boletines.values()] };
}
