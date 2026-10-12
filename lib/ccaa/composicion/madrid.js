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

// ---------------------------------------------------------------------
// Ficha del diputado
//
// El texto útil empieza en «Contenido ofrecido por el portal web…» y trae,
// por legislatura, el grupo y los cargos con sus fechas:
//
//   Legislatura XIII Grupos Parlamentarios 13 jun 2023 - ... Grupo Parlamentario Más Madrid
//   Cargos en la Asamblea 13 jun 2023 - ... Diputada (Asamblea de Madrid)
//   10 jul 2023 - ... Portavoz (Comisión de Vivienda, Transportes e Infraestructuras)
//   13 jul 2023 - 03 abr 2025 Vicepresidenta Segunda (Diputación Permanente) …
//   Actividad parlamentaria 807 Iniciativas totales 80 Comparecencias (C) …
//
// «- ...» es «hasta hoy»: esos son los cargos vigentes.
// ---------------------------------------------------------------------

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const FECHA = '(\\d{1,2}) (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\\w* (\\d{4})';
const iso = (d, m, a) => `${a}-${String(MESES[m]).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** El tramo de texto de una legislatura («Legislatura XIII …» hasta la siguiente). */
function tramoLegislatura(t, leg) {
  const i = t.search(new RegExp(`Legislatura ${leg}\\b(?! \\()`));
  if (i < 0) return '';
  const resto = t.slice(i + `Legislatura ${leg}`.length);
  const j = resto.search(/Legislatura [IVXL]+\b(?! \()/);
  return j < 0 ? resto : resto.slice(0, j);
}

/** «Cargo (Órgano (con paréntesis))» desde una posición: devuelve [cargo, órgano, fin]. */
function cargoYOrgano(t, desde) {
  const abre = t.indexOf('(', desde);
  if (abre < 0) return null;
  const cargo = t.slice(desde, abre).trim();
  let prof = 0;
  for (let k = abre; k < t.length; k += 1) {
    if (t[k] === '(') prof += 1;
    else if (t[k] === ')') { prof -= 1; if (prof === 0) return [cargo, t.slice(abre + 1, k).trim(), k + 1]; }
  }
  return null;
}

export function normCargo(cargo) {
  const c = String(cargo || '').toLowerCase().replace(/\.$/, '');
  if (/^presiden/.test(c)) return 'presidencia';
  if (/^vicepresiden/.test(c)) return 'vicepresidencia';
  if (/^secretari/.test(c)) return 'secretaria';
  if (/^portavoz adjunt/.test(c)) return 'portavoz_adjunto';
  if (/^portavoz/.test(c)) return 'portavoz';
  if (/^vocal/.test(c)) return 'vocal';
  if (/titular/.test(c)) return 'titular';
  if (/suplente/.test(c)) return 'suplente';
  if (/^diputad/.test(c)) return 'diputado';
  return 'otro';
}

export function tipoOrgano(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (/^asamblea de madrid$/.test(n)) return null;
  if (/mesa de la asamblea|^mesa$|junta de portavoces|diputaci[oó]n permanente|mesa de edad/.test(n)) return 'organo';
  if (/estudio/.test(n)) return 'estudio';
  if (/investigaci[oó]n/.test(n)) return 'investigacion';
  if (/^comisi/.test(n)) return 'permanente';
  return 'otro';
}

/** Ficha → { grupo, cargos vigentes, actividad, legislaturas, foto, correo }. */
export function leerFicha(htmlOTexto, leg = LEGISLATURA) {
  const esHtml = /<html|<div|<body/i.test(htmlOTexto.slice(0, 5000));
  let t = esHtml ? textoPlano(htmlOTexto.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')) : htmlOTexto;
  const k = t.indexOf('Contenido ofrecido por el portal');
  if (k >= 0) t = t.slice(k);
  t = t.replace(/\s+/g, ' ');
  const tramo = tramoLegislatura(t, leg);

  const grupo = (tramo.match(new RegExp(`Grupos Parlamentarios ${FECHA} - \\.\\.\\. (Grupo Parlamentario[^]*?)(?= Cargos en la Asamblea| ${FECHA} -)`)) || [])[4]?.trim() || null;

  const cargos = [];
  const zona = tramo.split('Cargos en la Asamblea')[1]?.split('Actividad parlamentaria')[0] || '';
  const re = new RegExp(`${FECHA} - (\\.\\.\\.|${FECHA}) `, 'g');
  let m;
  while ((m = re.exec(zona))) {
    const r = cargoYOrgano(zona, re.lastIndex);
    if (!r) break;
    const [cargo, organo, fin] = r;
    re.lastIndex = fin;
    const vigente = m[4] === '...';
    cargos.push({
      cargo,
      cargo_norm: normCargo(cargo),
      organo,
      fecha_inicio: iso(m[1], m[2], m[3]),
      fecha_fin: vigente ? null : iso(m[5], m[6], m[7]),
      vigente,
    });
  }

  const actividad = {};
  const act = tramo.split('Actividad parlamentaria')[1] || '';
  for (const a of act.matchAll(/(\d+) ([A-ZÁÉÍÓÚa-záéíóúñ ]+?)(?: \(([A-Z]+)\))?(?= \d| ?$)/g)) {
    actividad[a[3] || (/totales/i.test(a[2]) ? 'total' : a[2].trim())] = Number(a[1]);
  }
  const legislaturas = (t.match(/Legislaturas ((?:[IVXL]+)(?:\s*,\s*[IVXL]+)*)/) || [])[1]?.split(',').map((s) => s.trim()).filter(Boolean) || [];
  const email = (t.match(/[\w.+-]+@asambleamadrid\.es/gi) || []).find((e) => !/^info@/i.test(e))?.toLowerCase() || null;
  return { grupo, cargos, vigentes: cargos.filter((c) => c.vigente), actividad, legislaturas, email };
}

// ---------------------------------------------------------------------
// Página de grupos: portavoces, escaños, fecha de constitución y logo.
// ---------------------------------------------------------------------
export function leerGrupos(html) {
  const salida = [];
  // Cada grupo enlaza su ficha varias veces (logo, título, «más
  // información»): se juntan los trozos del mismo id y a cada uno se le
  // quita el resto de la etiqueta en que empieza (`30" title="…">`), que
  // si no se colaba como nombre.
  const porId = new Map();
  for (const p of html.split(/ficha-del-grupo\?grupoParlamentario=/).slice(1)) {
    const id = (p.match(/^(\d+)/) || [])[1];
    if (!id) continue;
    // …y la etiqueta sin cerrar en que acaba (el enlace siguiente).
    const limpio = p.slice(Math.max(0, p.indexOf('>') + 1), 20000).replace(/<[^>]*$/, '');
    porId.set(id, (porId.get(id) || '') + ' ' + limpio);
  }
  for (const [id, trozo] of porId) {
    const texto = textoPlano(trozo).replace(/\s+/g, ' ');
    const nombre = (texto.match(/(Grupo Parlamentario [^"<>]+?)(?= Fecha constituci| Portavoz| N° esca|$)/) || [])[1]?.trim() || null;
    if (!nombre) continue;
    salida.push({
      id_fuente: id,
      nombre,
      fecha_constitucion: (texto.match(/Fecha constituci[oó]n: (\d{2})\/(\d{2})\/(\d{4})/) || []).slice(1, 4).reverse().join('-') || null,
      escanos: parseInt((texto.match(/N° escaños (\d+)/) || [])[1], 10) || null,
    });
  }
  // Logos: /static/img/grupos_parlamentarios/thumbnails/{n}.jpg, en el orden de la página.
  const logos = [...new Set([...html.matchAll(/\/static\/img\/grupos_parlamentarios\/thumbnails\/\d+\.\w+/g)].map((x) => x[0]))];
  salida.forEach((g, i) => { g.logo_url = logos[i] ? `${ORIGEN}${logos[i]}` : null; });
  return salida;
}
