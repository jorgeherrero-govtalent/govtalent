// =====================================================================
// Texto de un DOCX
// lib/textoDocx.js
//
// La Asamblea de Madrid publica en su catálogo de datos abiertos la
// versión en texto de cada BOAM (BOAM_13_00172.docx; fichero
// «BoletinesOficialesAsambleaMadrid», columna FICHERO_TEXTO). A
// diferencia del PDF, no está cifrado: es la vía para leer el BOAM.
//
// Devuelve el texto párrafo a párrafo, con una marca «[Página N]» cada
// vez que Word dejó un salto de página (manual o el último calculado al
// guardar), para que la IA pueda citar la página. Es aproximada: si el
// documento no guarda esos saltos, todo queda en la página 1.
// =====================================================================

import { unzipSync, strFromU8 } from 'fflate';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (t) => t
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => ENT[n]);

export function textoDeDocx(buf) {
  const zip = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === 'word/document.xml' });
  const xml = zip['word/document.xml'];
  if (!xml) throw new Error('DOCX sin word/document.xml');
  const doc = strFromU8(xml);
  let pagina = 1;
  const partes = ['[Página 1]'];
  for (const p of doc.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const par = p[0];
    // Saltos de página dentro del párrafo (antes del texto que les sigue).
    const saltos = (par.match(/<w:br [^>]*w:type="page"[^>]*\/>|<w:lastRenderedPageBreak\/>/g) || []).length;
    const texto = desescapar(
      [...par.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map((m) => (m[1] ?? ' ')).join('')
    ).replace(/\s+/g, ' ').trim();
    for (let k = 0; k < saltos; k += 1) {
      pagina += 1;
      partes.push(`[Página ${pagina}]`);
    }
    if (texto) partes.push(texto);
  }
  return { texto: partes.join('\n'), paginas: pagina };
}

/**
 * Del BOAM completo (puede tener más de mil páginas, casi todas textos
 * de leyes y enmiendas), lo que sirve para la tramitación: el sumario del
 * principio y los párrafos que hablan de plazos, de proyectos y
 * proposiciones de ley o de acuerdos de la Mesa, con un poco de contexto.
 * Se conservan las marcas de página.
 */
export function extractoTramitacion(texto, { max = 150000, sumario = 20000 } = {}) {
  const lineas = texto.split('\n');
  const clave = /plazo|enmienda|comparecen|ponencia|dictamen|lectura única|toma en consideración|tramitaci[oó]n|retirad|caducidad|\b(PL|PROP\.?\s?L|PROPL|ILP)\s*-?\s*\d+\s*\/\s*\d{4}/i;
  const guardar = new Set();
  let acumulado = 0;
  // Sumario: las primeras líneas hasta `sumario` caracteres.
  for (let i = 0; i < lineas.length && acumulado < sumario; i += 1) {
    guardar.add(i);
    acumulado += lineas[i].length;
  }
  for (let i = 0; i < lineas.length; i += 1) {
    if (lineas[i].length > 1500) continue; // artículos y enmiendas largas
    if (clave.test(lineas[i])) for (let j = Math.max(0, i - 2); j <= Math.min(lineas.length - 1, i + 2); j += 1) guardar.add(j);
  }
  const salida = [];
  let total = 0;
  let ultimaMarca = null;
  for (let i = 0; i < lineas.length; i += 1) {
    const l = lineas[i];
    if (/^\[Página \d+\]$/.test(l)) { ultimaMarca = l; continue; }
    if (!guardar.has(i)) continue;
    if (ultimaMarca) { salida.push(ultimaMarca); ultimaMarca = null; }
    salida.push(l);
    total += l.length + 1;
    if (total > max) break;
  }
  return salida.join('\n');
}
