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

/** Fechas de la zona, la primera de los últimos 30 días (no futura). */
function fechaReciente(zona) {
  const hoyIso = hoy();
  const limite = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const trozos = String(zona || '').match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2} de [a-záéíóú]+ de \d{4}|\d{4}-\d{2}-\d{2}/gi) || [];
  for (const x of trozos) {
    const f = fechaDeTexto(x);
    if (f && f >= limite && f <= hoyIso) return f;
  }
  return null;
}

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
      // La ficha lleva cabecera y menús enormes: se busca el título del
      // anuncio y se mira alrededor (la primera prueba, con la página
      // entera, tomó una fecha de 2017 del pie).
      const html = (await web.texto(a.url)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
      const t = textoPlano(html).replace(/\s+/g, ' ');
      const clave = a.titulo.replace(/\s+/g, ' ').slice(0, 40);
      const pos = t.indexOf(clave);
      const zona = pos >= 0 ? t.slice(Math.max(0, pos - 1500), pos + 2500) : '';
      if (ctx.debug && fichas.length < 2) fichas.push({ encontrado: pos >= 0, zona: zona.slice(0, 2500) });
      fecha = fechaReciente(zona);
      // Antes del título: «Boletín 08-10-2026 … Núm. 194 … Jueves 8 de
      // octubre de 2026 CONSEJERÍA DE SALUD Y POLÍTICAS SOCIALES I..83».
      const antes = pos >= 0 ? t.slice(Math.max(0, pos - 600), pos) : '';
      numero = (antes.match(/N[uú]m\.?\s*(\d+)/i) || [])[1] || null;
      // El órgano, solo antes del título (en el cuerpo puede citarse
      // cualquier ayuntamiento); va en mayúsculas.
      organo = ([...antes.matchAll(/((?:consejer[ií]a|presidencia|vicepresidencia|parlamento de la rioja|ayuntamiento|mancomunidad|junta vecinal|servicio riojano de salud|agencia de desarrollo|instituto)[^.;:]{3,120})/gi)].pop() || [])[1]
        ?.replace(/\s+[IVX]+$/, '').trim() || null;
    } catch (e) {
      if (e.robots) throw e;
    }
    entradas.push({ ...a, fecha: fecha || hoy(), numero, seccion, organo, publicado_en: null });
  }
  if (ctx.debug) ctx.diagnostico.rioja = { anuncios: anuncios.length, fichas_pedidas: pedidas, muestra: anuncios.slice(0, 8), fichas };
  return entradas;
}
