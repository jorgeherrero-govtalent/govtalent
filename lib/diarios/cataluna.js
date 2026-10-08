// =====================================================================
// Diari Oficial de la Generalitat de Catalunya (DOGC) — lector (solo normas)
// lib/diarios/cataluna.js
//
// El portal del DOGC prohíbe todo en su robots.txt (Disallow: /), así que
// no se lee. La Generalitat publica en datos abiertos la normativa de la
// sección 1 del DOGC (leyes, decretos y órdenes), actualizada a diario
// (comprobado desde Vercel el 08-10-2026):
//   https://analisi.transparenciacatalunya.cat/resource/n6hn-rmy7.json
// Campos: n_mero_de_control, rang_de_norma, t_tol_de_la_norma(_es),
// data_de_publicaci_del_diari, n_mero_de_diari, url_es_formato_html…
// No trae órgano ni nombramientos ni anuncios: solo disposiciones
// generales, enlazadas a su versión en castellano en el Portal Jurídic.
// =====================================================================

const BASE = 'https://analisi.transparenciacatalunya.cat/resource/n6hn-rmy7.json';
const DIAS = 10;

const RANGO = { Llei: 'Ley', Decret: 'Decreto', 'Decret llei': 'Decreto-ley', 'Decret legislatiu': 'Decreto legislativo', Ordre: 'Orden' };

export async function leer(web, ctx = {}) {
  const desde = new Date(Date.now() - DIAS * 86400000).toISOString().slice(0, 10);
  const url = `${BASE}?$where=${encodeURIComponent(`data_de_publicaci_del_diari >= '${desde}T00:00:00'`)}&$order=${encodeURIComponent('data_de_publicaci_del_diari DESC')}&$limit=200`;
  const filas = JSON.parse(await web.texto(url));
  const entradas = [];
  for (const f of Array.isArray(filas) ? filas : []) {
    const titulo = f.t_tol_de_la_norma_es || f.t_tol_de_la_norma;
    const enlace = f.url_es_formato_html?.url || f.format_html?.url;
    if (!f.n_mero_de_control || !titulo || !enlace) continue;
    entradas.push({
      ref: f.n_mero_de_control,
      fecha: String(f.data_de_publicaci_del_diari || '').slice(0, 10) || null,
      numero: f.n_mero_de_diari || null,
      // Todo lo de este conjunto es de la sección 1 del DOGC.
      seccion: 'Disposiciones generales',
      organo: null,
      titulo,
      url: enlace,
      url_pdf: f.url_es_formato_pdf?.url || null,
      publicado_en: null,
      rango: RANGO[f.rang_de_norma] || f.rang_de_norma || null,
    });
  }
  if (ctx.debug) ctx.diagnostico.cataluna = { consulta: url, filas: Array.isArray(filas) ? filas.length : filas };
  return entradas;
}
