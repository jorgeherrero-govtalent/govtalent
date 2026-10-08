// =====================================================================
// Boletín Oficial de Cantabria (BOC) — lector
// lib/diarios/cantabria.js
//
// Último boletín publicado, en HTML (comprobado desde Vercel el
// 08-10-2026):
//   https://boc.cantabria.es/boces/boletines.do?boton=UltimoBOCPublicado
// Secciones numeradas sin espacio («2.Autoridades y Personal»,
// «2.1.Nombramientos, Ceses y Otras Situaciones»), el órgano como texto
// («Consejería de…», «Ayuntamiento de…»), el título en texto y un enlace
// «PDF (BOC-2026-7828 - 278 Kb)» → verAnuncioAction.do?idAnuBlob=N.
// Las correcciones llevan además «Corrige a» y el PDF del anuncio
// corregido, que no es una disposición nueva y se salta.
// Cabecera: «BOC 08/10/2026 Núm. 194».
// =====================================================================

import { textoPlano } from '@/lib/ccaa/web';
import { enlacesConSeccion } from '@/lib/diarios/comun';

const URL_ULTIMO = 'https://boc.cantabria.es/boces/boletines.do?boton=UltimoBOCPublicado';
const PDF = /verAnuncioAction\.do\?idAnuBlob=(\d+)/i;
const SECCIONES = /^\d+(\.\d+)*\.?\s*[a-z]/;
const ORGANO = /^(consejeria|presidencia|vicepresidencia|consejo de gobierno|parlamento de cantabria|universidad|ayuntamiento|junta vecinal|concejo|mancomunidad|servicio cantabro|instituto|agencia|organismo|sociedad|fundacion|consorcio|delegacion del gobierno|confederacion|ministerio|tribunal|juzgado|direccion general|secretaria general|entidad)/;

export async function leer(web, ctx = {}) {
  const html = await web.texto(URL_ULTIMO);
  const cab = textoPlano(html).match(/BOC\s+(\d{2})\/(\d{2})\/(\d{4})\s+N[uú]m\.\s*(\d+)/i);
  if (!cab) throw new Error('El BOC no trae la fecha y el número en la cabecera');
  const fecha = `${cab[3]}-${cab[2]}-${cab[1]}`;
  const numero = cab[4];

  const enlaces = enlacesConSeccion(html, URL_ULTIMO, { enlace: PDF, seccion: SECCIONES, organo: ORGANO, jerarquia: true });
  const entradas = [];
  const vistos = new Set();
  for (const e of enlaces) {
    // «Corrige a» + PDF: es el anuncio corregido, ya publicado antes.
    if (/^corrige a$/i.test(e.previo || '')) continue;
    const ref = (e.texto.match(/BOC-\d{4}-\d+/i) || [])[0];
    if (!ref || vistos.has(ref)) continue;
    vistos.add(ref);
    const titulo = e.previo && e.previo.length > 15 && !/^(subir|pdf\b)/i.test(e.previo) ? e.previo : null;
    entradas.push({
      ref,
      fecha,
      numero,
      seccion: e.seccion,
      organo: e.organo,
      titulo,
      url: e.href,
      url_pdf: e.href,
      publicado_en: null,
    });
  }
  if (ctx.debug) ctx.diagnostico.cantabria = { fecha, numero, enlaces: enlaces.length, muestra: enlaces.slice(0, 8) };
  return entradas.filter((e) => e.titulo);
}
