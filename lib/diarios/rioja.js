// =====================================================================
// Boletín Oficial de La Rioja (BOR) — lector
// lib/diarios/rioja.js
//
// La portada del BOR lista los últimos anuncios (comprobado desde Vercel
// el 08-10-2026):
//   https://web.larioja.org/bor-portada/bor
// Por anuncio, un enlace con el título al visor del PDF
// (ias1.larioja.org/boletin/Bor_Boletin_visor_Servlet?referencia=…-PDF-580100-X)
// y otro «html» a la ficha (/bor-portada/boranuncio?n=anu-580100).
// No trae ni fecha ni sección: muchos títulos llevan delante la materia
// («CONVENIO:», «SUBVENCIONES:») y las disposiciones empiezan por su rango
// («Decreto 22/2026, de 6 de octubre…»).
//
// Se clasifica por el título y solo de lo que entra se pide la ficha,
// para sacar la fecha y el órgano (como mucho MAX_FICHAS por ejecución y
// nunca lo ya visto).
// =====================================================================

import { enlacesDe, fechaDeTexto, textoPlano } from '@/lib/ccaa/web';
import { clasificar, idDiario } from '@/lib/diarios/comun';

const PORTADA = 'https://web.larioja.org/bor-portada/bor';
const VISOR = /Bor_Boletin_visor_Servlet\?referencia=/i;
const FICHA = /\/bor-portada\/boranuncio\?n=anu-(\d+)/i;
const MAX_FICHAS = 10;
// Lo municipal sale en el mismo listado y sin sección: fuera por el título.
const LOCAL = /alcald[ií]a|ayuntamiento|municipal|del pleno|junta de gobierno local|mancomunidad|junta vecinal|padr[oó]n|cuenta general/i;

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

export async function leer(web, ctx = {}) {
  const html = await web.texto(PORTADA);
  const anuncios = [];
  let titulo = null;
  let pdf = null;
  for (const e of enlacesDe(html, PORTADA)) {
    if (VISOR.test(e.href)) { titulo = e.texto; pdf = e.href; continue; }
    const m = e.href.match(FICHA);
    if (m && titulo) {
      anuncios.push({ ref: `anu-${m[1]}`, titulo, url: e.href, url_pdf: pdf });
      titulo = null;
      pdf = null;
    }
  }

  const entradas = [];
  const fichas = [];
  let pedidas = 0;
  for (const a of anuncios) {
    if (ctx.vistos?.has(idDiario('rioja', a.ref))) continue;
    const candidato = !LOCAL.test(a.titulo) && clasificar({ seccion: '', titulo: a.titulo });
    if (!candidato) {
      // Fuera sin pedir la ficha (queda como vista).
      entradas.push({ ...a, fecha: null, seccion: null, organo: null, numero: null, publicado_en: null });
      continue;
    }
    if (pedidas >= MAX_FICHAS) continue; // en la siguiente ejecución
    pedidas += 1;
    let fecha = null;
    let organo = null;
    let seccion = null;
    let numero = null;
    try {
      const t = textoPlano(await web.texto(a.url));
      if (ctx.debug && fichas.length < 2) fichas.push(t.replace(/\s+/g, ' ').slice(0, 1500));
      const b = t.match(/BOR\s+n[uú]m(?:ero|\.)?\s*(\d+)[^\n]{0,40}?(\d{1,2}\s+de\s+[a-z]+\s+de\s+\d{4}|\d{2}\/\d{2}\/\d{4})/i);
      if (b) { numero = b[1]; fecha = fechaDeTexto(b[2]); }
      if (!fecha) fecha = fechaDeTexto((t.match(/(?:fecha(?: de publicaci[oó]n)?|publicado(?: el)?)\s*:?\s*([^\n]{6,40})/i) || [])[1]);
      organo = (t.match(/\n((?:Consejer[ií]a|Presidencia|Vicepresidencia|Parlamento|Ayuntamiento|Mancomunidad|Junta Vecinal|Servicio Riojano|Agencia|Instituto|Universidad)[^\n]{3,150})\n/) || [])[1] || null;
      seccion = (t.match(/\n((?:I{1,3}|IV|V)\.\s[^\n]{3,80}|Disposiciones generales|Autoridades y personal|Otras disposiciones|Anuncios)\n/i) || [])[1] || null;
    } catch (e) {
      if (e.robots) throw e;
    }
    entradas.push({ ...a, fecha: fecha || hoy(), numero, seccion, organo, publicado_en: null });
  }
  if (ctx.debug) ctx.diagnostico.rioja = { anuncios: anuncios.length, fichas_pedidas: pedidas, muestra: anuncios.slice(0, 8), fichas };
  return entradas;
}
