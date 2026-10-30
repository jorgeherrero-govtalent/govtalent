// =====================================================================
// CNMC — lectura y clasificación de expedientes
// lib/cnmc.js
//
// Fuente de Regulatorio aprobada el 27-10-2026 (documento del proyecto
// «cnmc-fuente.md»): entran el bloque normativo y las decisiones de
// competencia y de los sectores regulados. Criterio de siempre: que
// consuma lo menos posible y no aparezca ruido.
//
// La CNMC no tiene datos abiertos ni API. Se leen tres cosas de cnmc.es,
// siempre como GovTalentBot y respetando su robots.txt (lib/ccaa/web.js):
//   - el RSS general (/feed/all): las entradas de expedientes llevan
//     dc:creator «api» y enlace /expedientes/<slug>;
//   - el listado de Actuaciones (/somos-cnmc/transparencia/actuaciones),
//     25 por página, lo más reciente en la página 0. Ojo: no va ordenado
//     por la fecha del acto (se suben informes de 2024 en 2026);
//   - la ficha del expediente (/expedientes/<slug>): estado, sectores
//     CNAE, sujetos (empresas) y cronología.
//
// Qué entra se decide por el prefijo del expediente, sin IA.
// =====================================================================

import crypto from 'node:crypto';
import { textoPlano, elementosRss } from '@/lib/ccaa/web';

export const ORIGEN = 'https://www.cnmc.es';
export const URL_RSS = `${ORIGEN}/feed/all`;
export const URL_LISTADO = `${ORIGEN}/somos-cnmc/transparencia/actuaciones`;
export const urlFicha = (slug) => `${ORIGEN}/expedientes/${slug}`;

// ---------------------------------------------------------------------
// Clasificación por prefijo
// ---------------------------------------------------------------------

// Primer segmento del código (o primeros dos, cuando hace falta) → bloque.
// normativo, competencia, sectorial. Lo que no está, queda fuera.
const PREFIJOS = {
  // Bloque normativo
  IPN: 'normativo', // informes sobre proyectos normativos
  PRO: 'normativo', // informes de posición o propuestas de oficio
  CIR: 'normativo', // circulares
  RDC: 'normativo', // resoluciones de desarrollo de circulares
  RDN: 'normativo', // resoluciones de desarrollo normativo
  PDN: 'normativo', // propuestas de desarrollo normativo
  // Competencia
  S: 'competencia', // sancionadores de conductas (S/0017/25, S/DC/0587/16)
  C: 'competencia', // concentraciones
  UM: 'competencia', // unidad de mercado
  // Sectores regulados
  SNC: 'sectorial', // sancionadores sectoriales
  CFT: 'sectorial', // conflictos
  ANME: 'sectorial', // análisis de mercados
  RAP: 'sectorial', // retribución de actividades y peajes
};

// INF/<órgano>: solo INF/CNMC (pliegos, ayudas, informes de competencia)
// e INF/DE cuando es una inhabilitación o un traspaso de clientes de una
// comercializadora. El resto de INF/DE (solicitudes de la DGPEM sobre
// instalaciones concretas) es ruido.
const INF_DE_DENTRO = /inhabilitaci|traspaso de (los )?clientes/;

export const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** 'C/1726/26' → 'c172626'; '260008-P1' → '260008-p1'. */
export function slugDeCodigo(codigo) {
  return String(codigo || '').toLowerCase().replace(/[^a-z0-9-]+/g, '');
}

/**
 * Bloque de un expediente ('normativo' | 'competencia' | 'sectorial') o
 * null si queda fuera. Con el código si se tiene; si no, con el slug.
 */
export function bloqueDe({ codigo, slug, titulo }) {
  if (codigo) {
    const partes = String(codigo).toUpperCase().split('/').map((s) => s.trim());
    const p = partes[0];
    if (p === 'INF') {
      if (partes[1] === 'CNMC') return 'competencia';
      if (partes[1] === 'DE' && INF_DE_DENTRO.test(sinTildes(titulo))) return 'sectorial';
      return null;
    }
    return PREFIJOS[p] || null;
  }
  // Solo el slug (entradas del RSS sin código): las letras iniciales.
  const letras = (String(slug || '').match(/^[a-z]+/) || [])[0];
  if (!letras) return null; // contratación interna: códigos numéricos
  if (letras === 'infcnmc') return 'competencia';
  if (letras === 'infde') return INF_DE_DENTRO.test(sinTildes(titulo)) ? 'sectorial' : null;
  // El orden importa: los prefijos largos antes que los cortos («snc» antes que «s», «cft»/«cir» antes que «c»).
  const PORSLUG = [
    ['ipn', 'normativo'], ['pro', 'normativo'], ['cir', 'normativo'], ['rdc', 'normativo'], ['rdn', 'normativo'], ['pdn', 'normativo'],
    ['snc', 'sectorial'], ['cft', 'sectorial'], ['anme', 'sectorial'], ['rap', 'sectorial'],
    ['um', 'competencia'],
  ];
  for (const [ini, b] of PORSLUG) if (letras.startsWith(ini)) return b;
  // «s» y «c» solos: sancionador de conductas (s001725, sdc058716) y concentración (c172626).
  if (letras === 's' || letras === 'sdc') return 'competencia';
  if (letras === 'c') return 'competencia';
  return null;
}

/** Actos que no interesan aunque el expediente sí (las sentencias). */
export function actoFuera(acto) {
  return /^sentencia\b/.test(sinTildes(acto).trim());
}

// ---------------------------------------------------------------------
// Fechas: '24 Feb 2026', '31 Mayo 2018', '19 abr. 2023', '11 Sep 2025'
// ---------------------------------------------------------------------

const MES = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12, des: 12 };
const RE_FECHA = /\b(\d{1,2})\s+([a-záéíóúç]{3,})\.?\s+(\d{4})\b/i;

export function fechaCnmc(t) {
  const m = String(t || '').match(RE_FECHA);
  if (!m) return null;
  const mes = MES[sinTildes(m[2]).slice(0, 3)];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Id estable de un acto: <slug>-<aaaammdd>-<huella del tipo de acto>. */
export function idActo(slug, fecha, acto) {
  const h = crypto.createHash('sha1').update(sinTildes(acto).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 8);
  return `${slug}-${String(fecha || 'sf').replace(/-/g, '')}-${h}`;
}

// Texto por bloques: un salto de línea en cada etiqueta de bloque (y en
// span y a, que en Drupal separan etiqueta y valor). textoPlano solo
// parte en <br>.
const BLOQUE = /<\/?(?:div|p|h[1-6]|li|ul|ol|dl|dt|dd|td|th|tr|table|tbody|thead|section|article|header|aside|nav|span|a|label|time|button)\b[^>]*>/gi;
const lineas = (html) => textoPlano(String(html || '').replace(BLOQUE, '\n')).split('\n').map((l) => l.trim()).filter(Boolean);

// 'Acto | 24 Feb 2026' repetido, sobre texto plano (aguanta que vengan en la misma línea).
const RE_ACTO = /([^|]+?)\s*\|\s*(\d{1,2}\s+[A-Za-zÁÉÍÓÚáéíóúç]{3,}\.?\s+\d{4})/g;

/** 'S/0017/25 - TRANSPORTE CASTILLA LA MANCHA' → { codigo, titulo }. */
export function partirCodigo(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const i = t.indexOf(' - ');
  if (i < 0) return { codigo: null, titulo: t };
  const codigo = t.slice(0, i).trim();
  // El código no lleva espacios; si los lleva, no era un código.
  if (/\s/.test(codigo) || !/\d/.test(codigo)) return { codigo: null, titulo: t };
  return { codigo, titulo: t.slice(i + 3).trim() };
}

// ---------------------------------------------------------------------
// RSS
// ---------------------------------------------------------------------

/** Entradas de expedientes del RSS: [{ slug, titulo, publicado_en, nodo }]. */
export function leerRss(xml) {
  const out = [];
  for (const it of elementosRss(xml)) {
    const m = String(it.enlace || '').match(/\/expedientes\/([a-z0-9-]+)\/?$/i);
    if (!m) continue;
    const autor = (it.raw.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i) || [])[1];
    const nodo = (it.raw.match(/<guid[^>]*>\s*(\d+)/i) || [])[1] || null;
    const d = new Date(it.fecha);
    out.push({
      slug: m[1].toLowerCase(),
      titulo: it.titulo,
      publicado_en: Number.isNaN(d.getTime()) ? null : d.toISOString(),
      nodo,
      api: /^\s*api\s*$/i.test(textoPlano(autor || '')),
    });
  }
  return out;
}

/** Fecha más reciente del RSS (para saber si está al día). */
export function frescuraRss(xml) {
  const fechas = elementosRss(xml).map((e) => new Date(e.fecha)).filter((d) => !Number.isNaN(d.getTime()));
  if (!fechas.length) return null;
  return new Date(Math.max(...fechas.map((d) => d.getTime()))).toISOString();
}

// ---------------------------------------------------------------------
// Listado de Actuaciones
// ---------------------------------------------------------------------

/**
 * Filas del listado: [{ slug, codigo, titulo, procedimiento, ambito,
 * actos: [{ acto, fecha }] }]. Cada fila es un expediente con su acto o
 * actos más recientes.
 */
export function leerListado(html) {
  const out = [];
  const trozos = String(html || '').split(/<tr\b/i).slice(1);
  for (const trozo of trozos) {
    const fila = trozo.slice(trozo.indexOf('>') + 1).split(/<\/tr>/i)[0];
    const a = fila.match(/<a\b[^>]*href\s*=\s*["']([^"']*\/expedientes\/([a-z0-9-]+))\/?["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const slug = a[2].toLowerCase();
    const { codigo, titulo } = partirCodigo(textoPlano(a[3]));
    // Antes del enlace: procedimiento y ámbito. Después: los actos.
    const antes = lineas(fila.slice(0, a.index));
    const despues = textoPlano(fila.slice(a.index + a[0].length).replace(BLOQUE, ' '));
    const actos = [];
    for (const m of despues.matchAll(RE_ACTO)) {
      const acto = m[1].replace(/\s+/g, ' ').trim();
      const fecha = fechaCnmc(m[2]);
      if (acto && fecha) actos.push({ acto, fecha });
    }
    out.push({
      slug,
      codigo,
      titulo,
      procedimiento: antes[0] || null,
      ambito: antes.length > 1 ? antes[antes.length - 1] : null,
      actos,
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// Ficha del expediente
// ---------------------------------------------------------------------

const CAMPOS = {
  'nº expediente': 'codigo',
  'n.º expediente': 'codigo',
  'no expediente': 'codigo',
  estado: 'estado',
  'último resultado': 'ultimo_resultado',
  'última actualización': 'ultima_actualizacion',
  tipo: 'tipo',
  sector: 'sector',
  'ámbito cnmc': 'ambito',
};

// Un sujeto (empresa, asociación…) viene casi siempre en mayúsculas; su
// papel («Incoado», «Notificante»…), no.
function esPapel(l) {
  const letras = l.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  if (!letras || l.length > 60) return false;
  const mayus = letras.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '').length;
  return mayus / letras.length < 0.5;
}

/**
 * Ficha → { codigo, titulo, estado, ultimo_resultado, ultima_actualizacion,
 * tipo, sector, ambito, sectores_cnae[], sujetos[{ nombre, papel }],
 * cronologia[{ fecha, acto }], documentos[{ nombre, url }] }.
 */
export function leerFicha(html, slug) {
  const h = String(html || '');
  const tituloTag = textoPlano((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s*\|\s*CNMC\s*$/i, '');
  const h1 = textoPlano((h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  const { codigo, titulo } = partirCodigo(h1 || tituloTag);

  // Solo el contenido: del <h1> al pie (los menús repiten etiquetas).
  const desde = h.search(/<h1\b/i);
  let cuerpo = desde >= 0 ? h.slice(desde) : h;
  const pie = cuerpo.search(/NW Menu RRSS|<footer\b/i);
  if (pie > 0) cuerpo = cuerpo.slice(0, pie);
  const ls = lineas(cuerpo);

  const ficha = { slug, codigo, titulo, sectores_cnae: [], sujetos: [], cronologia: [], documentos: [] };
  let seccion = null;
  let papel = null;
  for (let i = 1; i < ls.length; i++) {
    const l = ls[i];
    const k = l.toLowerCase().replace(/\s+/g, ' ');
    if (k === 'sectores') { seccion = 'sectores'; continue; }
    if (k === 'sujetos') { seccion = 'sujetos'; continue; }
    if (k === 'cronología' || k === 'cronologia') { seccion = 'cronologia'; continue; }
    if (k === 'documentos' || k === 'documentación') { seccion = 'documentos'; continue; }
    if (!seccion && CAMPOS[k]) {
      const v = ls[i + 1];
      if (v && !CAMPOS[v.toLowerCase()]) {
        ficha[CAMPOS[k]] = CAMPOS[k] === 'codigo' ? (ficha.codigo || v) : v;
        i++;
      }
      continue;
    }
    if (seccion === 'sectores') {
      // Solo las líneas CNAE ('D.3514: comercio de energía eléctrica…'); el
      // bloque arrastra rótulos de la página («Información del expediente»).
      if (/^[A-U]\.?\d{1,4}\b/.test(l)) ficha.sectores_cnae.push(l);
    } else if (seccion === 'sujetos') {
      if (esPapel(l)) papel = l;
      else ficha.sujetos.push({ nombre: l, papel });
    } else if (seccion === 'cronologia') {
      if (/^mostrar detalle$/i.test(l)) continue;
      const f = fechaCnmc(l);
      if (f && l.replace(RE_FECHA, '').trim().length < 3) {
        const acto = ls[i + 1];
        if (acto && !fechaCnmc(acto)) {
          ficha.cronologia.push({ fecha: f, acto });
          i++;
        }
      }
    }
  }
  if (ficha.ultima_actualizacion) ficha.ultima_actualizacion = fechaCnmc(ficha.ultima_actualizacion);
  // Sin repetidos (la cronología muestra el acto dos veces: resumen y detalle).
  const vistas = new Set();
  ficha.cronologia = ficha.cronologia.filter((c) => {
    const k = `${c.fecha}|${sinTildes(c.acto)}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });

  // Documentos: los PDF enlazados en el contenido.
  const docs = new Map();
  for (const m of cuerpo.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+\.pdf)(?:\?[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try { url = new URL(m[1].replace(/&amp;/g, '&'), ORIGEN).toString(); } catch { continue; }
    if (!docs.has(url)) docs.set(url, { nombre: textoPlano(m[2]).slice(0, 200) || null, url });
  }
  ficha.documentos = [...docs.values()].slice(0, 40);
  return ficha;
}

/** Une los actos de la ficha y los del listado, sin repetir. */
export function unirActos(...listas) {
  const out = new Map();
  for (const lista of listas) {
    for (const a of lista || []) {
      if (!a?.acto || !a?.fecha) continue;
      const k = `${a.fecha}|${sinTildes(a.acto).replace(/\s+/g, ' ').trim()}`;
      if (!out.has(k)) out.set(k, a);
    }
  }
  return [...out.values()];
}
