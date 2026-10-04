// =====================================================================
// Parlamento de Cantabria — lector
// lib/ccaa/cantabria.js
//
// · Buscador de tramitación (Drupal) filtrado por tipo de expediente y
//   legislatura XI: proyectos de ley, proposiciones de ley, ILP y
//   presupuestos.
// · Ficha de cada expediente: datos y tabla de trámites, con el BOPCA y
//   la página de cada publicación.
// · Boletines a leer con IA: no el BOPCA entero, sino el capítulo en PDF
//   de ese expediente (el BOPCA publica cada expediente en un PDF
//   aparte, enlazado desde la página del boletín).
// =====================================================================

import { textoPlano, fechaDeTexto, enlacesDe } from '@/lib/ccaa/web';
import { tipoTramite, cerrado, resultadoDe } from '@/lib/ccaa/comun';

const BASE = 'https://parlamento-cantabria.es';
const LEGISLATURA_XI = '87072';
const TIPOS = {
  85130: 'Proyectos de Ley',
  85131: 'Proposiciones de Ley',
  85147: 'Proposiciones de ley de iniciativa legislativa popular',
  85175: 'Proyecto de Ley de Presupuestos Generales de la Comunidad Autónoma',
};
const MAX_FICHAS = 60;
// Solo se releen las fichas con actividad reciente; las demás, una vez.
const DIAS_RECIENTES = 120;

const listado = (tipo, pagina = 0) =>
  `${BASE}/actividad/tramitacion-parlamentaria?field_tipo_expediente_target_id=${tipo}&field_legislatura_agora_target_id=${LEGISLATURA_XI}${pagina ? `&page=${pagina}` : ''}`;

function campo(html, nombre) {
  const m = html.match(new RegExp(`<div class="([^"]*field--name-field-${nombre}[^"]*)"[^>]*>([\\s\\S]*?)<\\/div>`, 'i'));
  if (!m) return null;
  // El propio elemento puede ser el valor (field--label-hidden field__item)…
  if (/\bfield__item\b/.test(m[1])) return textoPlano(m[2]) || null;
  // …o el valor va en un field__item interior.
  const resto = html.slice(html.indexOf(m[0]));
  const v = resto.match(/<div class="field__item">([\s\S]*?)<\/div>/i);
  return v ? textoPlano(v[1]) : null;
}

function celdas(fila) {
  return [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
}

export async function leer(web, ctx = {}) {
  const filas = [];
  const limite = new Date(Date.now() - DIAS_RECIENTES * 86400000).toISOString().slice(0, 10);
  for (const tipo of Object.keys(TIPOS)) {
    for (let p = 0; p < 3; p++) {
      const html = await web.texto(listado(tipo, p));
      const cuerpo = (html.split(/<tbody>/i)[1] || '').split(/<\/tbody>/i)[0];
      const trs = cuerpo.split(/<tr[\s>]/i).slice(1);
      for (const tr of trs) {
        const c = celdas(tr);
        const href = (c[0]?.match(/href="([^"]+)"/i) || [])[1];
        if (!href) continue;
        filas.push({ url: new URL(href, BASE).toString(), num: textoPlano(c[0]), tipo: textoPlano(c[1]) || TIPOS[tipo], fecha: fechaDeTexto(textoPlano(c[2])), titulo: textoPlano(c[4]) });
      }
      if (!/pager__item--next/i.test(html)) break;
    }
  }

  const expedientes = [];
  const boletines = new Map();
  const paginasBoletin = new Map();
  const vistos = new Set();
  for (const f of filas) {
    if (vistos.has(f.url) || expedientes.length >= MAX_FICHAS || ctx.tiempoAgotado?.()) continue;
    vistos.add(f.url);
    if (ctx.saltar?.(f.num)) continue;
    const html = await web.texto(f.url);
    const num = campo(html, 'numexp') || f.num;
    const situacion = textoPlano((html.match(/class="situacion-expediente[^"]*">([\s\S]*?)<\/span>/i) || [])[1]) || null;
    const autor = textoPlano((html.match(/expediente-proponente[^>]*>([\s\S]*?)<\/div>/i) || [])[1]) || null;

    const tramites = [];
    const tabla = (html.split(/<h2 class="title">Tr[aá]mites<\/h2>/i)[1] || '').split(/<\/table>/i)[0];
    for (const tr of (tabla.split(/<tbody>/i)[1] || '').split(/<tr[\s>]/i).slice(1)) {
      const c = celdas(tr);
      const fecha = fechaDeTexto(textoPlano(c[0]));
      const desc = textoPlano(c[1]);
      const info = c[2] || '';
      const bop = info.match(/href="([^"]*bopca-no-[^"#]+)(?:#(\d+))?"[^>]*>([\s\S]*?)<\/a>/i);
      const organo = /[ÓO]rgano:/i.test(textoPlano(info)) ? textoPlano(info).replace(/^[ÓO]rgano:\s*/i, '') : null;
      let url = null;
      if (bop) {
        url = new URL(bop[1], BASE).toString();
        // El capítulo en PDF de este expediente, desde la página del boletín.
        if (!paginasBoletin.has(url)) {
          try {
            paginasBoletin.set(url, await web.texto(url));
          } catch {
            paginasBoletin.set(url, '');
          }
        }
        const clave = num.replace(/\//g, '').toUpperCase();
        for (const a of enlacesDe(paginasBoletin.get(url), url)) {
          const archivo = a.href.split('/').pop();
          if (/bop-capitulos\/.+\.pdf$/i.test(a.href) && archivo.toUpperCase().startsWith(clave)) {
            const id = `cantabria:${archivo.replace(/\.pdf$/i, '')}`;
            boletines.set(id, {
              id,
              numero: (textoPlano(bop[3]).match(/n[ºo°]\s*([\d/]+)/i) || [])[1] || null,
              fecha,
              titulo: `${textoPlano(bop[3])} · ${num}`,
              url: bop[2] ? `${url}#${bop[2]}` : url,
              url_pdf: a.href,
            });
          }
        }
      }
      if (desc || fecha) tramites.push({ tipo: tipoTramite(desc), fecha, descripcion: desc || null, organo, url: url && bop[2] ? `${url}#${bop[2]}` : url });
    }

    // Expedientes cerrados y sin movimiento reciente: se guardan, pero sus
    // boletines no se mandan a la IA.
    const ultimo = tramites.map((t) => t.fecha).filter(Boolean).sort().pop();
    if (cerrado(situacion) && ultimo && ultimo < limite) {
      for (const k of [...boletines.keys()]) if (k.includes(num.replace(/\//g, ''))) boletines.delete(k);
    }

    expedientes.push({
      num_expediente: num,
      tipo: campo(html, 'tipo-expediente') || f.tipo,
      titulo: campo(html, 'extracto') || f.titulo,
      autor,
      comision: null,
      fecha_presentacion: f.fecha || tramites[0]?.fecha || null,
      situacion,
      is_closed: cerrado(situacion),
      resultado: resultadoDe(situacion),
      url: f.url,
      tramites,
    });
  }
  return { expedientes, boletines: [...boletines.values()] };
}
