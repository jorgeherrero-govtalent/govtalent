// =====================================================================
// Boletín Oficial de Castilla y León (BOCYL) — lector
// lib/diarios/castillayleon.js
//
// · RSS (comprobado desde Vercel el 08-10-2026): un elemento por boletín,
//   «Boletín del día 08/10/2026 edición 196». Da la fecha del último.
//     https://bocyl.jcyl.es/rss.do
// · Sumario del día en HTML (su robots.txt solo prohíbe unas fechas
//   antiguas concretas):
//     https://bocyl.jcyl.es/boletin.do?fechaBoletin=DD/MM/AAAA
//   Secciones como encabezados (h3 «I. COMUNIDAD DE CASTILLA Y LEÓN», h4
//   «B. AUTORIDADES Y PERSONAL», «B.1. Nombramientos…»), el órgano en un
//   h5 y, por disposición, el título en texto y dos enlaces: PDF y HTML
//   (BOCYL-D-08102026-196-3).
//
// OJO: el robots.txt prohíbe /boletines/ y /html/, que es donde están el
// PDF y el HTML de cada disposición. GovTalent no los pide: solo enlaza a
// ellos (los abre la persona, no el robot).
// =====================================================================

import { elementosRss } from '@/lib/ccaa/web';
import { enlacesConSeccion } from '@/lib/diarios/comun';

const RSS = 'https://bocyl.jcyl.es/rss.do';
const DISP = /BOCYL-D-(\d{2})(\d{2})(\d{4})-(\d+)-(\d+)\.do$/i;
const SECCIONES = /^([ivx]+\.\s|[a-f]\.(\d+\.)?\s)/;
const ORGANO = /^(consejeria|presidencia|vicepresidencia|universidad|ayuntamiento|diputacion|junta|servicio|instituto|agencia|gerencia|ente|consejo|procurador|tribunal|delegacion|mancomunidad|comunidad de regantes|confederacion|ministerio)/;

export async function leer(web, ctx = {}) {
  const rss = await web.texto(RSS);
  const it = elementosRss(rss)[0];
  const m = String(it?.titulo || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) throw new Error('El RSS del BOCYL no trae la fecha del último boletín');
  const url = `https://bocyl.jcyl.es/boletin.do?fechaBoletin=${m[1]}/${m[2]}/${m[3]}`;
  const html = await web.texto(url);

  const enlaces = enlacesConSeccion(html, url, { enlace: DISP, seccion: SECCIONES, organo: ORGANO });
  const entradas = [];
  for (const e of enlaces) {
    const d = e.href.match(DISP);
    const ref = `BOCYL-D-${d[1]}${d[2]}${d[3]}-${d[4]}-${d[5]}`;
    entradas.push({
      ref,
      fecha: `${d[3]}-${d[2]}-${d[1]}`,
      numero: d[4],
      seccion: e.seccion,
      organo: e.organo,
      titulo: e.previo,
      url: e.href,
      url_pdf: e.href.replace('/html/', '/boletines/').replace('/html/', '/pdf/').replace(/\.do$/i, '.pdf'),
      publicado_en: null,
    });
  }
  if (ctx.debug) ctx.diagnostico.castillayleon = { sumario: url, enlaces: enlaces.length, muestra: enlaces.slice(0, 8) };
  return entradas.filter((e) => e.titulo);
}
