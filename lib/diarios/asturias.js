// =====================================================================
// Boletín Oficial del Principado de Asturias (BOPA) — lector
// lib/diarios/asturias.js
//
// Sumario del día en la sede miPrincipado (Liferay), comprobado desde
// Vercel el 08-10-2026:
//   https://miprincipado.asturias.es/bopa-sumario?p_p_id=pa_sede_bopa_web_
//     portlet_SedeBopaSummaryWeb&…&p_r_p_summaryDate=DD%2FMM%2FAAAA
// Por disposición: el título en texto y dos enlaces, «Texto de la
// disposición» (…p_r_p_dispositionReference=2026-08238…) y «PDF de la
// disposición» (/bopa/2026/10/08/2026-08238.pdf). Las secciones van como
// encabezados («I. Principado de Asturias», «Disposiciones generales»…).
//
// El BOPA de cada día está disponible desde la víspera a mediodía: se
// pide el de hoy y, por la tarde, también el de mañana.
// =====================================================================

import { enlacesConSeccion } from '@/lib/diarios/comun';

const PDF = /\/bopa\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{4}-\d{5})\.pdf$/i;
const SECCIONES = /^([ivx]+\.\s|disposiciones generales|autoridades y personal|otras disposiciones|anuncios|nombramientos|oposiciones y concursos)/;
const ORGANO = /^(consejeria|presidencia|vicepresidencia|universidad|ayuntamiento|servicio|instituto|agencia|ente|consorcio|organismo|junta|tribunal|juzgado|ministerio|delegacion|confederacion|mancomunidad)/;

function dia(desfase = 0) {
  const d = new Date(Date.now() + desfase * 86400000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return p;
}

const urlSumario = (p) =>
  `https://miprincipado.asturias.es/bopa-sumario?p_p_id=pa_sede_bopa_web_portlet_SedeBopaSummaryWeb&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&p_r_p_summaryDate=${p.day}%2F${p.month}%2F${p.year}&p_r_p_summaryIsSearch=false`;

export async function leer(web, ctx = {}) {
  const hoy = dia(0);
  const dias = [hoy];
  if (Number(hoy.hour) >= 14) dias.push(dia(1));

  const entradas = [];
  const diag = [];
  for (const p of dias) {
    const url = urlSumario(p);
    const html = await web.texto(url);
    const enlaces = enlacesConSeccion(html, url, { enlace: PDF, seccion: SECCIONES, organo: ORGANO });
    diag.push({ sumario: `${p.day}/${p.month}/${p.year}`, enlaces: enlaces.length, muestra: enlaces.slice(0, 6) });
    for (const e of enlaces) {
      const m = e.href.match(PDF);
      // Orden del sumario (dry run del 08-10-2026): «[Cód. 2026-08238]»,
      // el enlace al PDF y después el título. Se toma el texto que no sea
      // ni el código ni el rótulo de un enlace.
      const util = (t) => t && t.length > 15 && !/^\[c[oó]d\.|^(texto|pdf) de la disposici/i.test(t);
      const titulo = util(e.siguiente) ? e.siguiente : util(e.previo) ? e.previo : null;
      entradas.push({
        ref: m[4],
        fecha: `${m[1]}-${m[2]}-${m[3]}`,
        numero: null,
        seccion: e.seccion,
        organo: e.organo,
        titulo,
        url: `https://miprincipado.asturias.es/bopa/disposiciones?p_p_id=pa_sede_bopa_web_portlet_SedeBopaDispositionWeb&p_p_lifecycle=0&_pa_sede_bopa_web_portlet_SedeBopaDispositionWeb_mvcRenderCommandName=%2Fdisposition%2Fdetail&p_r_p_dispositionText=${m[4]}&p_r_p_dispositionReference=${m[4]}&p_r_p_dispositionDate=${m[3]}%2F${m[2]}%2F${m[1]}`,
        url_pdf: e.href,
        publicado_en: null,
      });
    }
  }
  if (ctx.debug) ctx.diagnostico.asturias = diag;
  return entradas.filter((e) => e.titulo);
}
