// =====================================================================
// CORTES DE ARAGÓN — composición
// lib/ccaa/composicion/aragon.js
//
// Todo sale de la página «Quiénes somos» (TYPO3, extensión
// t3comunicacion), que pinta tarjetas iguales para cualquier filtro:
//   foto, enlace a la ficha (uiddip) y, debajo del nombre, el cargo en
//   el órgano con la sigla del grupo («Presidenta (GPPCA)») o, si no
//   tiene cargo, el nombre del grupo («G.P. Socialista»).
//   - tipinf=3&uidcom=-2 (Pleno): los 67 vigentes, con su grupo (la Mesa
//     con la sigla tras el cargo). El listado general (2164) mezcla a los
//     que han causado baja: de él solo se toman los grupos y comisiones.
//   - tipinf=2&uidcir=N: los de cada circunscripción.
//   - tipinf=3&uidcom=N: cada órgano (0 Mesa, -3 Junta de Portavoces,
//     -4 Diputación Permanente y las comisiones del menú). Los suplentes
//     van en una segunda pestaña y su tarjeta lleva «<!-- (Suplente) -->».
//   - tipinf=1&uidgru=N: cada grupo; marca al «Portavoz titular».
// La ficha personal no trae datos del diputado y no se lee. Las Cortes
// no publican correos personales: los que hay vienen del directorio
// público (sql/116).
// El robots.txt solo prohíbe /*?id=* y las versiones de impresión.
// Se guarda con lib/ccaa/composicion/comun.js.
// =====================================================================

import { textoPlano } from '@/lib/ccaa/web';
import { apellidosNombre } from '@/lib/ccaa/composicion/comun';

export const P = 'aragon';
export const LEGISLATURA = 'XII';
export const FUENTE = 'cortesaragon.es';
const O = 'https://www.cortesaragon.es';
const Q = `${O}/Quienes-somos.2250.0.html?&no_cache=1&tx_t3comunicacion_pi3%5Bnumleg%5D=12`;
const LISTADO = `${O}/Diputados-y-diputadas.2164.0.html?&no_cache=1`;
const CIRCUNSCRIPCIONES = { 1: 'Zaragoza', 2: 'Huesca', 3: 'Teruel' };

export function siglaGrupo(nombre) {
  const t = String(nombre || '').toLowerCase();
  if (/popular/.test(t)) return 'PP';
  if (/socialista/.test(t)) return 'PSOE';
  if (/vox/.test(t)) return 'VOX';
  if (/chunta/.test(t)) return 'CHA';
  if (/mixto/.test(t)) return 'Mixto';
  return null;
}

// Siglas que la web pone tras el cargo de la Mesa («Presidenta (GPPCA)»).
const SIGLAS = {
  GPPCA: 'G.P. Popular de las Cortes de Aragón',
  GPS: 'G.P. Socialista',
  GPVOX: 'G.P. VOX',
  GPCHA: 'G.P. Chunta Aragonesista',
  GPM: 'G.P. Mixto',
  GPMIXTO: 'G.P. Mixto',
};

/** Nombre del grupo como lo escribe la propia web («G.P. Popular de las Cortes de Aragón» → «Grupo Parlamentario Popular de las Cortes de Aragón»). */
const nombreGrupo = (t) => t.replace(/^G\.\s*P\.\s*/i, 'Grupo Parlamentario ').replace(/\bVOX\b/, 'Vox');

/** Tarjetas de cualquier página «Quiénes somos»: [{ id_fuente, nombre, texto, suplente, foto }]. */
export function leerTarjetas(html) {
  const out = [];
  for (const b of String(html || '').split(/<div class="team">/i).slice(1)) {
    const a = b.match(/uiddip%5D=(\d+)"[^>]*>([^<]+)<\/a>\s*<\/h4>\s*<span>([\s\S]*?)<\/span>/i);
    if (!a) continue;
    const span = a[3];
    const img = (b.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || null;
    out.push({
      id_fuente: a[1],
      nombre: textoPlano(a[2]).replace(/\s+/g, ' ').trim(),
      texto: textoPlano(span.split(/<h6/i)[0]).replace(/\s+/g, ' ').trim(),
      suplente: /\(Suplente\)/i.test(span),
      foto: img && !/^data:/.test(img) ? new URL(img, `${O}/`).toString() : null,
    });
  }
  return out;
}

/** «Vicepresidenta Primera (GPVOX)» → «Vicepresidenta Primera»; un nombre de grupo → null (sin cargo). */
function cargoDe(texto) {
  if (/^G\.\s*P\./i.test(texto) || !texto) return null;
  return texto.replace(/\s*\([^)]*\)\s*$/, '').trim() || null;
}

/** Nombres de la web sin tildes donde las lleva («Maria Carmen», «Garcia Lopez»): se respetan tal cual. */
const limpio = (n) => n.replace(/\s+/g, ' ').trim();

export async function leerDiputados(web) {
  // El Pleno (uidcom=-2) trae solo los 67 vigentes; el listado general
  // mezcla además a los que han causado baja.
  const tarjetas = leerTarjetas(await web.texto(`${Q}&tx_t3comunicacion_pi3%5Btipinf%5D=3&tx_t3comunicacion_pi3%5Buidcom%5D=-2`));
  const porId = new Map();
  for (const t of tarjetas) {
    const previo = porId.get(t.id_fuente);
    const sigla = (t.texto.match(/\((GP\w+)\)\s*$/) || [])[1];
    const grupo = /^G\.\s*P\./i.test(t.texto) ? nombreGrupo(t.texto) : SIGLAS[sigla] ? nombreGrupo(SIGLAS[sigla]) : null;
    if (previo) {
      if (!previo.grupo && grupo) previo.grupo = grupo;
      continue;
    }
    porId.set(t.id_fuente, {
      id_fuente: t.id_fuente,
      nombre: limpio(t.nombre),
      apellidos_nombre: apellidosNombre(limpio(t.nombre)),
      grupo,
      foto_url: t.foto,
      url_ficha: `${O}/Ficha-personal.2370.0.html?&no_cache=1&tx_t3comunicacion_pi3%5Buiddip%5D=${t.id_fuente}`,
    });
  }
  // Circunscripción: una página por provincia.
  for (const [uid, prov] of Object.entries(CIRCUNSCRIPCIONES)) {
    try {
      for (const t of leerTarjetas(await web.texto(`${Q}&tx_t3comunicacion_pi3%5Btipinf%5D=2&tx_t3comunicacion_pi3%5Buidcir%5D=${uid}`))) {
        const d = porId.get(t.id_fuente);
        if (d && !d.circunscripcion) d.circunscripcion = prov;
      }
    } catch {
      // Sin circunscripción para esa provincia: no impide el resto.
    }
  }
  return [...porId.values()];
}

/** Comisiones del menú «Órganos parlamentarios»: [{ uid, nombre }]. */
function comisionesDelMenu(html) {
  const out = new Map();
  for (const m of String(html || '').matchAll(/uidcom%5D=(\d+)#verContenido"[^>]*>([^<]+)<span class="badge">/gi)) {
    const nombre = textoPlano(m[2]).replace(/\s+/g, ' ').trim();
    if (!nombre || out.has(m[1])) continue;
    out.set(m[1], nombre);
  }
  return [...out.entries()].map(([uid, nombre]) => ({ uid, nombre }));
}

/** «Sanidad» → «Comisión de Sanidad»; «Institucional y de…» → «Comisión Institucional y de…». */
function nombreComision(n) {
  if (/^comisi[oó]n/i.test(n)) return n;
  if (/^institucional\b/i.test(n)) return `Comisión ${n}`;
  return `Comisión de ${n}`;
}

const tipoDe = (nombre) => (/ponencia/i.test(nombre) ? 'otro' : /investigaci/i.test(nombre) ? 'investigacion' : /estudio/i.test(nombre) ? 'estudio' : 'permanente');

export async function leerOrganos(web) {
  const organos = [];
  const pagina = (uid) => `${Q}&tx_t3comunicacion_pi3%5Btipinf%5D=3&tx_t3comunicacion_pi3%5Buidcom%5D=${uid}`;

  // Portavoces: la página de cada grupo marca al portavoz.
  const portavoz = new Map();
  const listado = await web.texto(LISTADO);
  const grupos = [...new Set([...listado.matchAll(/uidgru%5D=(\d+)#verContenido/g)].map((m) => m[1]))];
  for (const g of grupos) {
    try {
      for (const t of leerTarjetas(await web.texto(`${Q}&tx_t3comunicacion_pi3%5Btipinf%5D=1&tx_t3comunicacion_pi3%5Buidgru%5D=${g}`))) {
        if (/portavoz/i.test(t.texto)) portavoz.set(t.id_fuente, /adjunt/i.test(t.texto) ? 'Portavoz adjunto' : 'Portavoz');
      }
    } catch {
      // Sigue con el siguiente grupo.
    }
  }

  const fijos = [
    ['0', 'Mesa de las Cortes', 'organo'],
    ['-3', 'Junta de Portavoces', 'organo'],
    ['-4', 'Diputación Permanente', 'organo'],
  ];
  const comisiones = comisionesDelMenu(listado)
    .filter((c) => !/ponencia/i.test(c.nombre))
    .map((c) => [c.uid, nombreComision(c.nombre), tipoDe(c.nombre)]);

  for (const [uid, nombre, tipo] of [...fijos, ...comisiones]) {
    let tarjetas;
    try {
      tarjetas = leerTarjetas(await web.texto(pagina(uid)));
    } catch {
      continue;
    }
    const miembros = [];
    const vistos = new Set();
    for (const t of tarjetas) {
      if (vistos.has(t.id_fuente)) continue;
      vistos.add(t.id_fuente);
      let cargo;
      if (t.suplente) cargo = 'Suplente';
      else if (uid === '-3') cargo = portavoz.get(t.id_fuente) || cargoDe(t.texto) || 'Miembro';
      else cargo = cargoDe(t.texto) || (uid === '-4' ? 'Titular' : 'Vocal');
      miembros.push({ id_fuente: t.id_fuente, nombre: t.nombre, cargo });
    }
    organos.push({ nombre, tipo, url: pagina(uid), miembros });
  }
  return organos;
}
