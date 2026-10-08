// =====================================================================
// Boletín Oficial de la Comunidad de Madrid (BOCM) — lector
// lib/diarios/madrid.js
//
// Cómo está montado el BOCM (comprobado desde Vercel el 08-10-2026):
//   · https://www.bocm.es/sumarios.rss: los últimos 20 boletines, uno por
//     elemento. Solo trae las referencias (BOCM-20261008-1…), sin título.
//     Ojo: hay un elemento con el año mal puesto (3024); se ignoran las
//     fechas imposibles.
//   · La página del boletín completo (/boletin-completo/BOCM-…/NNN) da,
//     por disposición, la sección (I. COMUNIDAD DE MADRID, III.
//     ADMINISTRACIÓN LOCAL…), el órgano y una etiqueta corta («Puesto
//     libre designación», «Normas reguladoras subvenciones»), y enlaza el
//     JSON y el XML de cada disposición.
//   · El JSON de cada disposición (/boletin/CM_Orden_BOCM/…/BOCM-…-N.json)
//     trae el título completo. Su robots.txt lo permite (solo prohíbe
//     /boletin/CM_Boletin_BOCM/) y pide Crawl-delay: 10.
//
// Para gastar lo mínimo: solo la sección I (la Comunidad), solo las
// etiquetas que pueden ser de interés, solo lo que no se ha visto antes
// (ctx.vistos) y como mucho MAX_JSON disposiciones por ejecución; lo que
// no dé tiempo queda para la siguiente.
// =====================================================================

import { elementosRss } from '@/lib/ccaa/web';
import { enlacesConSeccion, idDiario, sinTildes } from '@/lib/diarios/comun';

const RSS = 'https://www.bocm.es/sumarios.rss';
const BOLETINES = 2;
const MAX_JSON = 15;
const JSON_DISP = /\/CM_Orden_BOCM\/.*BOCM-(\d{8})-(\d+)\.json$/i;
const SECCIONES = /^([ivx]+\.\s)/;
const ORGANO = /^(consejeria|vicepresidencia|presidencia|universidad|canal de isabel|agencia|servicio madrileno|instituto|o\. ?a\.|organismo|consorcio|empresa|ente |delegacion|asamblea|camara|tribunal|hospital|ayuntamiento|mancomunidad)/;

// Etiquetas que nunca interesan: no se pide su JSON.
const ETIQUETA_FUERA = /libre designacion|concurso|proceso selectivo|oposicion|bolsa|integracion personal|relacion (de )?puestos|plantilla|formalizacion contrato|convocatoria contrato|licitacion|contrato|extracto|premio|beca|convenio|autorizacion|emplazamiento|notificacion|tribunal|admitidos|lista|declaracion ambiental|impacto ambiental|concesion|subvenciones concedidas|delegacion|cuentas anuales|volver al sumario/;

/** Fecha del boletín a partir de 'BOCM-20261008'; null si es imposible. */
function fechaBoletin(enlace) {
  const m = String(enlace || '').match(/BOCM-(\d{4})(\d{2})(\d{2})/i);
  if (!m) return null;
  const f = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${f}T12:00:00Z`);
  const manana = Date.now() + 2 * 86400000;
  if (Number.isNaN(d.getTime()) || d.getTime() > manana || Number(m[1]) < 2020) return null;
  return f;
}

export async function leer(web, ctx = {}) {
  const xml = await web.texto(RSS);
  const boletines = elementosRss(xml)
    .map((it) => ({ ...it, fecha: fechaBoletin(it.enlace) }))
    .filter((it) => it.fecha && it.enlace)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, BOLETINES);

  const entradas = [];
  const diag = [];
  let pedidos = 0;

  for (const b of boletines) {
    const numero = (b.enlace.match(/\/(\d+)\/?$/) || [])[1] || null;
    const url = new URL(b.enlace, RSS).toString();
    const html = await web.texto(url);
    const enlaces = enlacesConSeccion(html, url, { enlace: JSON_DISP, seccion: SECCIONES, organo: ORGANO });
    const candidatos = [];
    let descartados = 0;
    for (const e of enlaces) {
      const m = e.href.match(JSON_DISP);
      const ref = `BOCM-${m[1]}-${m[2]}`;
      const etiqueta = e.siguiente || '';
      const deLaComunidad = /^i\.\s/i.test(e.seccion || '');
      if (!deLaComunidad || ETIQUETA_FUERA.test(sinTildes(etiqueta))) { descartados += 1; continue; }
      if (ctx.vistos?.has(idDiario('madrid', ref))) continue;
      candidatos.push({ ref, json: e.href, etiqueta, seccion: e.seccion, organo: e.organo });
    }

    const muestraJson = [];
    for (const c of candidatos) {
      if (pedidos >= MAX_JSON) break;
      pedidos += 1;
      let d = null;
      try {
        const t = await web.texto(c.json);
        if (ctx.debug && muestraJson.length < 2) muestraJson.push(t.slice(0, 2000));
        d = leerJson(t);
      } catch (e) {
        if (e.robots) throw e;
      }
      const titulo = d?.titulo || null;
      entradas.push({
        ref: c.ref,
        fecha: b.fecha,
        numero,
        // La subsección del JSON (A) Disposiciones generales…) si la trae;
        // si no, la sección de la página.
        seccion: d?.seccion || c.seccion,
        organo: d?.organo || c.organo,
        titulo: titulo || `${c.etiqueta}${c.organo ? ` (${c.organo})` : ''}`,
        url: `https://www.bocm.es/${c.ref.toLowerCase()}`,
        url_pdf: c.json.replace(/\.json$/i, '.PDF'),
        publicado_en: null,
        sinTitulo: !titulo,
      });
    }
    if (ctx.debug) diag.push({ boletin: b.titulo, fecha: b.fecha, enlaces: enlaces.length, descartados_por_etiqueta: descartados, candidatos: candidatos.length, candidatos_muestra: candidatos.slice(0, 15).map((c) => `${c.ref} · ${c.etiqueta} · ${c.organo || ''}`), json: muestraJson });
  }
  if (ctx.debug) ctx.diagnostico.madrid = { json_pedidos: pedidos, boletines: diag };
  return entradas;
}

/**
 * Lo que interesa del JSON de una disposición, sin depender de su forma
 * exacta: el texto más largo que esté bajo una clave de título, y la
 * sección y el órgano si los trae.
 */
function leerJson(texto) {
  let obj;
  try { obj = JSON.parse(texto); } catch { return null; }
  const encontrados = { titulo: [], seccion: [], organo: [] };
  const recorrer = (v, clave = '') => {
    if (v == null) return;
    if (typeof v === 'string') {
      const k = sinTildes(clave);
      const s = v.replace(/\s+/g, ' ').trim();
      if (!s) return;
      if (/titulo|title|sumario|texto_corto|descripcion/.test(k) && s.length >= 20 && s.length <= 1500) encontrados.titulo.push(s);
      else if (/apartado|subseccion|seccion/.test(k) && s.length <= 150) encontrados.seccion.push(s);
      else if (/organismo|organo|emisor|consejeria|departamento/.test(k) && s.length <= 200) encontrados.organo.push(s);
      return;
    }
    if (Array.isArray(v)) { v.forEach((x) => recorrer(x, clave)); return; }
    if (typeof v === 'object') for (const [k, x] of Object.entries(v)) recorrer(x, k);
  };
  recorrer(obj);
  const titulo = encontrados.titulo.sort((a, b) => b.length - a.length)[0] || null;
  // La subsección más específica: la que lleva letra («A) …»), si hay.
  const seccion = encontrados.seccion.find((s) => /^[a-e]\)/i.test(s)) || encontrados.seccion[0] || null;
  return { titulo, seccion, organo: encontrados.organo[0] || null };
}
