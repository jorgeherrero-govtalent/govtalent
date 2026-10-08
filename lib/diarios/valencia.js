// =====================================================================
// Diari Oficial de la Generalitat Valenciana (DOGV) — lector
// lib/diarios/valencia.js
//
// La web del DOGV es una aplicación que pide los datos a su propio
// servicio (comprobado desde Vercel el 08-10-2026; solo exige «lang»):
//   https://dogv.gva.es/dogv-portal/dogv/latest?lang=es
// Devuelve en XML el último DOGV completo: cabecera (numeroDogv) y, por
// disposición, id, título, sección y subsección, organismo, fecha de
// publicación, código de inserción (2026/30962) y ruta del PDF.
// =====================================================================

import { textoPlano } from '@/lib/ccaa/web';

const LATEST = 'https://dogv.gva.es/dogv-portal/dogv/latest?lang=es';

const campo = (xml, n) => {
  const m = String(xml || '').match(new RegExp(`<${n}>([\\s\\S]*?)<\\/${n}>`));
  return m ? textoPlano(m[1]) : null;
};

export async function leer(web, ctx = {}) {
  const xml = await web.texto(LATEST);
  const numero = campo(xml.match(/<cabecera>[\s\S]*?<\/cabecera>/)?.[0], 'numeroDogv');
  const entradas = [];
  for (const m of xml.matchAll(/<disposiciones>(\s*<id>[\s\S]*?)<\/disposiciones>/g)) {
    const d = m[1];
    const ref = campo(d, 'codigoInsercion');
    const f = (campo(d, 'fechaPublicacion') || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!ref || !f) continue;
    const seccion = campo(d.match(/<seccion>[\s\S]*?<\/seccion>/)?.[0], 'descripcion');
    const sub = campo(d.match(/<subseccion>[\s\S]*?<\/subseccion>/)?.[0], 'descripcion');
    const pdf = campo(d, 'urlPdf');
    entradas.push({
      ref: `DOGV-${ref}`,
      fecha: `${f[3]}-${f[2]}-${f[1]}`,
      numero,
      seccion: [seccion, sub].filter(Boolean).join(' · ') || null,
      organo: campo(d, 'organismo'),
      titulo: campo(d, 'titulo'),
      url: `https://dogv.gva.es/es/resultat-dogv?signatura=${ref}`,
      url_pdf: pdf ? `https://dogv.gva.es/datos${pdf}` : null,
      publicado_en: null,
    });
  }
  if (ctx.debug) ctx.diagnostico.valencia = { numero, disposiciones: entradas.length, muestra: entradas.slice(0, 5) };
  return entradas.filter((e) => e.titulo);
}
