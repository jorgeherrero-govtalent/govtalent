// =====================================================================
// Asamblea de Madrid — composición (diputados y grupos)
// lib/ccaa/composicion/madrid.js
//
// El listado de diputados de la Asamblea, servido por el subdominio
// ctyp.asambleamadrid.es/es/web/guest/… (la web principal está detrás de
// Sucuri), como GovTalentBot y respetando su robots.txt. 135 diputados
// en 7 páginas de 20. De cada uno:
//
//   <div class="diputado">
//     <a class="link-diputado" href="/composicion/diputados/ficha-del-diputado?diputado=2026&legislatura=13…"
//        title="Ir a ver la ficha de María Acín Carrera">
//       <div class="foto"><img src="/static/img/diputados/thumbnails/2026.jpg"></div>
//       <p class="nombre"><strong>María Acín Carrera</strong></p></a>
//     <p class="grupo-parlamentario" style="color:rgb(0, 125, 125);">Grupo Parlamentario Más Madrid</p>
//     <div class="contacto"><a class="email" href="mailto:macin@asambleamadrid.es">…
//       <a class="social-link" href="https://twitter.com/…">…
//
// El correo es el que publica la propia Asamblea. La foto grande está en
// /static/img/diputados/detalles/{id}.jpg.
// =====================================================================

import { textoPlano } from '@/lib/ccaa/web';

export const ORIGEN = 'https://ctyp.asambleamadrid.es';
export const GUEST = `${ORIGEN}/es/web/guest`;
const PORTLET = '_es_satec_liferay_asamblea_ComposicionPortlet_INSTANCE_MA3PIwEgvh0w';
const MAX_PAGINAS = 12;

export const LEGISLATURA = 'XIII';
export const LEG_NUM = 13;

const fechaParam = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const madrid = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  return `${p(madrid.getDate())}-${p(madrid.getMonth() + 1)}-${madrid.getFullYear()}`;
};

export function urlPagina(n) {
  if (n === 1) return `${GUEST}/composicion/diputados`;
  const form = `paramFechaSSSSVVVVPPPP${fechaParam()}SSSSPPPPparamCondicionEstadoActivosSSSSVVVVPPPPtrue`;
  return `${GUEST}/composicion/diputados?p_p_id=${PORTLET.slice(1)}&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&${PORTLET}_paramNumeroDePagina=${n}&${PORTLET}_paramFormValues=${form}`;
}

export const urlFicha = (id) => `${GUEST}/composicion/diputados/ficha-del-diputado?diputado=${id}&legislatura=${LEG_NUM}`;
export const urlFoto = (id) => `${ORIGEN}/static/img/diputados/detalles/${id}.jpg`;

/** Siglas del grupo a partir de su nombre oficial. */
export function siglaGrupo(nombre) {
  const t = String(nombre || '').toLowerCase();
  if (/popular/.test(t)) return 'PP';
  if (/más madrid|mas madrid/.test(t)) return 'Más Madrid';
  if (/socialista/.test(t)) return 'PSOE';
  if (/vox/.test(t)) return 'VOX';
  if (/mixto/.test(t)) return 'Mixto';
  return null;
}

export const slugTexto = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Una página del listado → diputados y total anunciado («de 135 resultados»). */
export function leerPagina(html) {
  const total = parseInt((html.match(/class="total"[^>]*>\s*(\d+)/) || [])[1], 10) || null;
  const diputados = [];
  for (const bloque of html.split(/<div class="diputado">/).slice(1)) {
    const id = (bloque.match(/ficha-del-diputado\?diputado=(\d+)/) || [])[1];
    if (!id) continue;
    const nombre = textoPlano((bloque.match(/<p class="nombre">([\s\S]*?)<\/p>/) || [])[1] || '')
      || ((bloque.match(/title="Ir a ver la ficha de ([^"]+)"/) || [])[1] || '').trim();
    const grupoM = bloque.match(/<p class="grupo-parlamentario"(?:\s+style="color:\s*([^;"]+);?")?[^>]*>([\s\S]*?)<\/p>/);
    const email = ((bloque.match(/mailto:([^"'?\s]+)/) || [])[1] || '').trim().toLowerCase() || null;
    const twitter = (bloque.match(/href="(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"?]+)/i) || [])[1] || null;
    const foto = (bloque.match(/<img[^>]+src="([^"]*\/static\/img\/diputados\/[^"]+)"/) || [])[1] || null;
    diputados.push({
      id_fuente: id,
      nombre,
      grupo: grupoM ? textoPlano(grupoM[2]) : null,
      grupo_color: grupoM?.[1]?.trim() || null,
      email: email && /@/.test(email) ? email : null,
      twitter,
      foto_thumb: foto ? new URL(foto, ORIGEN).toString() : null,
    });
  }
  return { total, diputados };
}

/** Todas las páginas del listado. */
export async function leerListado(web, ctx = {}) {
  const todos = new Map();
  let total = null;
  for (let n = 1; n <= MAX_PAGINAS; n += 1) {
    const html = await web.texto(urlPagina(n));
    const r = leerPagina(html);
    total = total || r.total;
    let nuevos = 0;
    for (const d of r.diputados) if (!todos.has(d.id_fuente)) { todos.set(d.id_fuente, d); nuevos += 1; }
    if (!nuevos || (total && todos.size >= total)) break;
    if (ctx.tiempoAgotado?.()) break;
  }
  return { total, diputados: [...todos.values()] };
}
