// =====================================================================
// CORTS VALENCIANES — composición
// lib/ccaa/composicion/valencia.js
//
//   - composicion/diputados — tabla con los 99: foto, nombre («Abad Soler,
//     Ramón»), grupo (gp=1P/1S/1O/1V) y circunscripción. La ficha no
//     publica correo personal (solo el formulario general de Les Corts),
//     así que no se lee.
//   - organos/mesa, organos/junta-sindics, organos/diputacion-permanente
//     y organos/comisiones/xi/<código>/diputados — tablas «Posición |
//     Diputado/da | Grupo»; sin posición = vocal.
// Se guarda con lib/ccaa/composicion/comun.js.
// =====================================================================

import { textoPlano } from '@/lib/ccaa/web';
import { nombreNatural } from '@/lib/ccaa/composicion/comun';

export const P = 'valencia';
export const LEGISLATURA = 'XI';
export const FUENTE = 'cortsvalencianes.es';
const O = 'https://www.cortsvalencianes.es';
const C = `${O}/es/composicion`;

const GRUPOS = { '1P': 'Grupo Parlamentario Popular', '1S': 'Grupo Parlamentario Socialista', '1O': 'Grupo Parlamentario Compromís', '1V': 'Grupo Parlamentario Vox Cortes Valencianas' };

export function siglaGrupo(nombre) {
  const t = String(nombre || '').toLowerCase();
  if (/popular/.test(t)) return 'PP';
  if (/socialista/.test(t)) return 'PSOE';
  if (/compromís|compromis/.test(t)) return 'Compromís';
  if (/vox/.test(t)) return 'VOX';
  if (/mixto/.test(t)) return 'Mixto';
  return null;
}

const FICHA = /\/composicion\/diputados\/xi\/([a-z0-9_]+)\/([0-9a-f]{20,})/;

function filas(html) {
  return html.split(/<tr[\s>]/i).slice(1).map((r) => r.split(/<\/tr>/i)[0]);
}

/** Tabla de diputados → [{ id_fuente (hash), nombre, apellidos_nombre, grupo, circunscripcion, foto_url, url_ficha }]. */
export function leerTabla(html) {
  const out = new Map();
  for (const r of filas(html)) {
    const m = r.match(FICHA);
    if (!m) continue;
    const enlaces = [...r.matchAll(/<a[^>]+href="([^"]*\/diputados\/xi\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const oficial = enlaces.map((e) => textoPlano(e[2]).trim()).find((x) => x.includes(',')) || '';
    const gp = (r.match(/gp=(\w+)/) || [])[1] || null;
    const celdas = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => textoPlano(c[1]).trim());
    out.set(m[2], {
      id_fuente: m[2],
      nombre: nombreNatural(oficial),
      apellidos_nombre: oficial,
      grupo: gp ? GRUPOS[gp] || textoPlano((r.match(/alt="Foto de ([^"]+)"/g) || []).pop()?.replace(/^alt="Foto de |"$/g, '') || '') : null,
      grupo_logo: gp ? `${O}/es/external-data/gp/image/${gp}` : null,
      circunscripcion: celdas[celdas.length - 1] || null,
      foto_url: `${O}/es/external-data/deputy/image/XI/${m[2]}`,
      url_ficha: `${O}/es/composicion/diputados/xi/${m[1]}/${m[2]}`,
    });
  }
  return [...out.values()];
}

/**
 * Tabla de un órgano → miembros. La posición va en su propia celda; si está
 * vacía es vocal. En la Diputación Permanente hay tablas aparte para la
 * Mesa, los titulares y los suplentes: el título de la tabla lo dice.
 */
export function leerMiembros(html, porDefecto = 'Vocal') {
  const out = [];
  const tablas = html.split(/<table/i).slice(1);
  let previo = html.split(/<table/i)[0];
  for (const t of tablas) {
    const cuerpo = t.split(/<\/table>/i)[0];
    const etiqueta = textoPlano(previo.slice(-400) + cuerpo.slice(0, 600)).toLowerCase();
    const seccion = /suplente/.test(etiqueta) ? 'Suplente' : /titular/.test(etiqueta) ? 'Titular' : porDefecto;
    for (const r of filas(cuerpo)) {
      const m = r.match(FICHA);
      if (!m) continue;
      const celdas = [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => textoPlano(c[1]).trim());
      const nombre = celdas.find((c) => c.includes(',')) || '';
      const pos = celdas.find((c) => c && c !== nombre && c === c.toUpperCase() && /[A-ZÁÉÍÓÚ]/.test(c)) || '';
      out.push({ id_fuente: m[2], nombre, cargo: pos.replace(/\s+COMISI[OÓ]N$/i, '') || seccion });
    }
    previo = t.split(/<\/table>/i)[1] || '';
  }
  return out;
}

export async function leerDiputados(web) {
  return leerTabla(await web.texto(`${C}/diputados`));
}

export async function leerOrganos(web) {
  const organos = [];
  for (const [nombre, ruta, porDefecto] of [
    ['Mesa de les Corts', '/organos/mesa', 'Vocal'],
    ['Junta de Síndics', '/organos/junta-sindics', 'Síndic'],
    ['Diputación Permanente', '/organos/diputacion-permanente', 'Titular'],
  ]) {
    try {
      organos.push({ nombre, tipo: 'organo', url: `${C}${ruta}`, miembros: leerMiembros(await web.texto(`${C}${ruta}`), porDefecto) });
    } catch {
      // Un órgano que no carga no tumba los demás.
    }
  }
  const indice = await web.texto(`${C}/organos/comisiones`);
  const coms = new Map();
  for (const m of indice.matchAll(/<a[^>]+href="([^"]*\/organos\/comisiones\/xi\/[^"/]+\/diputados)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const nombre = textoPlano(m[2]).trim();
    if (nombre && !coms.has(m[1])) coms.set(m[1], nombre);
  }
  for (const [href, nombre] of coms) {
    const url = href.startsWith('http') ? href : `${O}${href}`;
    try {
      organos.push({ nombre, url, miembros: leerMiembros(await web.texto(url)).filter((x) => !/letrad/i.test(x.cargo)) });
    } catch {
      // Sigue con la siguiente.
    }
  }
  return organos;
}
