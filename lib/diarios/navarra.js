// =====================================================================
// Boletín Oficial de Navarra (BON) — lector
// lib/diarios/navarra.js
//
// La portada (https://bon.navarra.es/es/) trae el sumario completo del
// último boletín (comprobado desde Vercel el 08-10-2026): «BOLETÍN Nº 200
// - 8 de octubre de 2026», secciones numeradas («1. Comunidad Foral de
// Navarra», «1.1. Disposiciones Generales», «1.1.3. Órdenes Forales»,
// «2. Administración Local»…) y un enlace por anuncio:
//   /es/anuncio/-/texto/2026/200/0
// Su robots.txt solo prohíbe las versiones con parámetros (/es/boletin?,
// /es/ultimo?…) y las rutas que empiezan por /texto/; la portada está
// permitida, y a los anuncios solo se enlaza.
// =====================================================================

import { enlacesConSeccion } from '@/lib/diarios/comun';
import { textoPlano, fechaDeTexto } from '@/lib/ccaa/web';

const PORTADA = 'https://bon.navarra.es/es/';
const ANUNCIO = /\/anuncio\/-\/texto\/(\d{4})\/(\d+)\/(\d+)/;
const SECCIONES = /^\d+(\.\d+)*\.?\s+[a-z]/;

export async function leer(web, ctx = {}) {
  const html = await web.texto(PORTADA);
  const cabecera = textoPlano(html).match(/BOLET[IÍ]N\s+N[ºo°]\s*(\d+)\s*-\s*(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4})/i);
  const fecha = cabecera ? fechaDeTexto(cabecera[2]) : null;

  const enlaces = enlacesConSeccion(html, PORTADA, { enlace: ANUNCIO, seccion: SECCIONES, jerarquia: true });
  const entradas = [];
  const vistos = new Set();
  for (const e of enlaces) {
    const m = e.href.match(ANUNCIO);
    const ref = `${m[1]}-${m[2]}-${m[3]}`;
    if (vistos.has(ref)) continue;
    vistos.add(ref);
    entradas.push({
      ref,
      fecha,
      numero: m[2],
      seccion: e.seccion,
      organo: null,
      titulo: e.texto,
      url: e.href,
      url_pdf: null,
      publicado_en: null,
    });
  }
  if (ctx.debug) ctx.diagnostico.navarra = { cabecera: cabecera?.[0] || null, enlaces: enlaces.length, muestra: enlaces.slice(0, 8) };
  if (!fecha) throw new Error('No se encontró la fecha del último BON en la portada');
  return entradas.filter((e) => e.titulo && e.titulo.length > 10);
}
