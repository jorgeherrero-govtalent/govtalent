// =====================================================================
// PARLAMENTO DE CANARIAS — composición
// lib/ccaa/composicion/canarias.js
//
// Páginas de www.parcan.es/composicion (el robots.txt prohíbe /api/,
// /api2/ y el personal eventual; nada de eso se usa):
//   - diputados/busqueda_por_grupo_parlamentario_foto/11/ — los 70,
//     agrupados por grupo, con foto («Apellidos,<br> Nombre»).
//   - diputados/diputado/<id>/ — circunscripción, fecha de alta y
//     tratamiento (Diputada/Diputado). El correo no se publica: solo un
//     formulario («Escribir a este diputado»).
//   - mesa.py, junta.py (portavocías y portavocías adjuntas) y
//     diputacion.py: tablas con el enlace al diputado y el cargo.
//   - comisiones.py: índice por bloques (Permanentes, De investigación,
//     De estudio, Ponencias, Subcomisiones, Juntas de Control). Se leen los
//     tres primeros; cada organo.py?ID_ORGANO=N trae «Miembros del órgano»
//     con el cargo y la fecha («Presidente Comisión (27/7/2023)»).
// Crawl-delay: 3 s.
// Se guarda con lib/ccaa/composicion/comun.js.
// =====================================================================

import { textoPlano, fechaDeTexto } from '@/lib/ccaa/web';
import { nombreNatural } from '@/lib/ccaa/composicion/comun';

export const P = 'canarias';
export const LEGISLATURA = 'XI';
export const FUENTE = 'parcan.es';
const O = 'https://www.parcan.es';
const C = `${O}/composicion`;

export function siglaGrupo(nombre) {
  const t = String(nombre || '').toLowerCase();
  if (/nacionalista/.test(t)) return 'CC';
  if (/gomera/.test(t)) return 'ASG';
  if (/nueva canarias/.test(t)) return 'NC-BC';
  if (/socialista/.test(t)) return 'PSOE';
  if (/popular/.test(t)) return 'PP';
  if (/vox/.test(t)) return 'VOX';
  if (/mixto/.test(t)) return 'Mixto';
  return null;
}

const limpiar = (t) => textoPlano(t).replace(/\s+/g, ' ').trim();
const filas = (html) => String(html || '').split(/<tr[\s>]/i).slice(1).map((r) => r.split(/<\/tr>/i)[0]);
const celdas = (r) => [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
const ID = /\/composicion\/diputados\/diputado\/(\d+)\//;

export async function leerDiputados(web) {
  const html = await web.texto(`${C}/diputados/busqueda_por_grupo_parlamentario_foto/11/`);
  const out = new Map();
  for (const bloque of html.split(/<div class="panel-heading h4">/i).slice(1)) {
    const grupo = limpiar(bloque.split(/<\/div>/i)[0]);
    for (const m of bloque.matchAll(/<a href="(\/composicion\/diputados\/diputado\/(\d+)\/)">\s*<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<img[^>]+src="([^"]+)"/gi)) {
      if (out.has(m[2])) continue;
      const oficial = limpiar(m[3].replace(/<br\s*\/?>/gi, ' '));
      out.set(m[2], {
        id_fuente: m[2],
        nombre: nombreNatural(oficial),
        apellidos_nombre: oficial,
        // «Diputada no adscrita» no es un grupo.
        grupo: /no adscrit/i.test(grupo) ? null : /^GP\b/.test(grupo) ? grupo.replace(/^GP\s+/, 'Grupo Parlamentario ') : grupo,
        foto_url: new URL(m[4], O).toString(),
        url_ficha: new URL(m[1], O).toString(),
      });
    }
  }
  return [...out.values()];
}

export async function leerFicha(web, d) {
  const h = await web.texto(d.url_ficha || `${C}/diputados/diputado/${d.id_fuente}/`);
  const circ = (h.match(/Circunscripci[oó]n de:\s*<a[^>]*>\s*<b>([^<]+)<\/b>/i) || [])[1];
  const alta = (h.match(/Alta en el cargo:\s*<b>([^<]+)<\/b>/i) || [])[1];
  const trato = (h.match(/<h2[^>]*>\s*(Diputad[ao])\s*<\/h2>/i) || [])[1];
  return {
    circunscripcion: circ ? limpiar(circ) : null,
    fecha_alta: alta ? fechaDeTexto(alta) : null,
    sexo: trato ? (/a$/i.test(trato) ? 'M' : 'H') : null,
  };
}

/** Filas de una tabla con enlace al diputado: [{ id_fuente, nombre, textos: [celdas en texto] }]. */
function filasConDiputado(html) {
  const out = [];
  for (const r of filas(html)) {
    const id = (r.match(ID) || [])[1];
    if (!id) continue;
    const cs = celdas(r);
    const nombre = limpiar((r.match(/<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || '');
    out.push({ id_fuente: id, nombre, textos: cs.map((c) => limpiar(c.replace(/<br\s*\/?>/gi, ' '))), crudo: cs });
  }
  return out;
}

/** «La Presidenta» → «Presidenta»; «Presidente Comisión» → «Presidente»; «Diputado/a» → vocal. */
function cargoDe(t) {
  const c = String(t || '').replace(/^(La|El)\s+/, '').replace(/\s+Comisi[oó]n$/i, '').trim();
  if (!c || /^diputad[ao]s?$/i.test(c)) return null;
  return c;
}

const BLOQUES = [
  [/^permanentes/i, 'permanente'],
  [/investigaci/i, 'investigacion'],
  [/estudio/i, 'estudio'],
];

/** Nombre de la comisión con «Comisión» delante, como en el resto de parlamentos. */
function nombreComision(nombre, tipo) {
  const n = nombre.replace(/\s+/g, ' ').trim();
  if (/^comisi[oó]n/i.test(n)) return n.replace(/\.$/, '');
  if (tipo === 'estudio') return `Comisión de estudio ${n.charAt(0).toLowerCase()}${n.slice(1)}`;
  if (tipo === 'investigacion') return `Comisión de investigación ${n.replace(/^investigaci[oó]n\s*/i, '').replace(/^\.+\s*/, '')}`.replace(/\s+/g, ' ').replace(/\.$/, '');
  if (/^de\s/i.test(n)) return `Comisión ${n.charAt(0).toLowerCase()}${n.slice(1)}`;
  return `Comisión de ${n}`;
}

export async function leerOrganos(web) {
  const organos = [];

  try {
    const url = `${C}/mesa.py?legis=11`;
    const miembros = filasConDiputado(await web.texto(url)).map((f) => ({ id_fuente: f.id_fuente, nombre: f.nombre, cargo: cargoDe(f.textos[1]) || 'Miembro' }));
    organos.push({ nombre: 'Mesa del Parlamento', tipo: 'organo', url, miembros });
  } catch {
    // Sigue con el resto.
  }

  try {
    const url = `${C}/junta.py?legis=11`;
    const html = await web.texto(url);
    const partes = html.split(/<h3[^>]*>\s*Portavoc[ií]as adjuntas\s*<\/h3>/i);
    const miembros = [
      ...filasConDiputado(partes[0]).map((f) => ({ id_fuente: f.id_fuente, nombre: f.nombre, cargo: 'Portavoz' })),
      ...filasConDiputado(partes[1] || '').map((f) => ({ id_fuente: f.id_fuente, nombre: f.nombre, cargo: 'Portavoz adjunto' })),
    ];
    organos.push({ nombre: 'Junta de Portavoces', tipo: 'organo', url, miembros });
  } catch {
    // Sigue con el resto.
  }

  try {
    const url = `${C}/diputacion.py?legis=11`;
    const html = await web.texto(url);
    // «Composición», «Suplentes» y «Modificaciones» (historial, no se lee).
    const vigente = html.split(/>\s*Modificaciones\s*</i)[0];
    const [titulares, suplentes = ''] = vigente.split(/>\s*Suplentes?\s*</i);
    const miembros = [
      ...filasConDiputado(titulares).map((f) => ({ id_fuente: f.id_fuente, nombre: f.nombre, cargo: cargoDe(f.textos[1]) || 'Titular' })),
      ...filasConDiputado(suplentes).map((f) => ({ id_fuente: f.id_fuente, nombre: f.nombre, cargo: 'Suplente' })),
    ];
    organos.push({ nombre: 'Diputación Permanente', tipo: 'organo', url, miembros });
  } catch {
    // Sigue con el resto.
  }

  const indice = await web.texto(`${C}/comisiones.py?legis=11`);
  for (const b of indice.split(/<p class="h3">/i).slice(1)) {
    const titulo = limpiar(b.split(/<\/p>/i)[0]);
    const tipo = (BLOQUES.find(([re]) => re.test(titulo)) || [])[1];
    if (!tipo) continue; // Ponencias, subcomisiones y juntas de control: no.
    const lista = b.split(/<\/ul>/i)[0];
    for (const m of lista.matchAll(/<a href="([^"]*organo\.py\?ID_ORGANO=(\d+))"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = new URL(m[1].replace(/&amp;/g, '&'), O).toString();
      let html;
      try {
        html = await web.texto(url);
      } catch {
        continue;
      }
      // El título de la página trae el nombre completo («Comisiones - X - Parlamento de Canarias»).
      const titulo2 = limpiar((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s*-\s*Parlamento de Canarias\s*$/i, '').replace(/^Comisiones\s*-\s*/i, '');
      const nombre = nombreComision(titulo2 && !/\.\.\./.test(titulo2) ? titulo2 : limpiar(m[3]), tipo);
      const vigentes = html.split(/Modificaciones\s*<\/h3>/i)[0];
      const miembros = filasConDiputado(vigentes).map((f) => {
        const [cargoTxt, fecha] = [f.textos[1].replace(/\(.*\)/, '').trim(), (f.textos[1].match(/\(([^)]+)\)/) || [])[1]];
        return { id_fuente: f.id_fuente, nombre: f.nombre, cargo: cargoDe(cargoTxt) || 'Vocal', fecha_inicio: fecha ? fechaDeTexto(fecha) : null };
      });
      organos.push({ nombre, tipo, url, miembros });
    }
  }
  return organos;
}
