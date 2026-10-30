// =====================================================================
// PARLAMENTO DE ANDALUCÍA — composición
// lib/ccaa/composicion/andalucia.js
//
// Todo sale de las páginas de órganos de webdinamica, que comparten la
// misma tarjeta: cargo, enlace con el código del diputado (codmie), y su
// grupo entre paréntesis.
//   - organosparlamentarios/pleno.do?modo=confoto — los 109 con foto y grupo.
//   - mesa.do, juntadeportavoces.do, diputacionpermanente.do y cada
//     comisiones.do?codorg=N (índice en comisiones.do, agrupado por tipo).
//   - la ficha (diputadosysenadores.do?codmie=N) solo aporta la
//     circunscripción: el Parlamento no publica correo personal (solo un
//     formulario «Contactar»).
// Se guarda con lib/ccaa/composicion/comun.js.
// =====================================================================

import { textoPlano } from '@/lib/ccaa/web';
import { nombreNatural } from '@/lib/ccaa/composicion/comun';

export const P = 'andalucia';
export const LEGISLATURA = 'XIII';
export const FUENTE = 'parlamentodeandalucia.es';
const O = 'https://www.parlamentodeandalucia.es';
const W = `${O}/webdinamica/portal-web-parlamento/composicionyfuncionamiento`;

const GRUPOS = {
  GPP: 'G.P. Popular de Andalucía',
  GPS: 'G.P. Socialista',
  GPVA: 'G.P. Vox en Andalucía',
  GPAA: 'G.P. Adelante Andalucía',
  GPPorA: 'G.P. Por Andalucía',
};

export function siglaGrupo(nombre) {
  const t = String(nombre || '').toLowerCase();
  if (/popular/.test(t)) return 'PP';
  if (/socialista/.test(t)) return 'PSOE';
  if (/vox/.test(t)) return 'VOX';
  if (/adelante/.test(t)) return 'Adelante';
  if (/por andaluc/.test(t)) return 'Por Andalucía';
  if (/mixto/.test(t)) return 'Mixto';
  return null;
}

const limpiar = (t) => textoPlano(String(t || '').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim();

/** Tarjetas «cargo, nombre (con codmie), (GRUPO)» de cualquier página de órgano. */
export function leerTarjetas(html) {
  const out = [];
  for (const parte of html.split(/<p class="card-text">/i).slice(1)) {
    const p = parte.split(/<\/p>/i)[0].replace(/<!--[\s\S]*?-->/g, ' ');
    const a = p.match(/<a[^>]+href="[^"]*codmie=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const cargo = limpiar(p.slice(0, a.index));
    const gp = (p.slice(a.index + a[0].length).match(/\((GP\w+)\)/) || [])[1] || null;
    out.push({ id_fuente: a[1], nombre: limpiar(a[2]), cargo, gp });
  }
  return out;
}

export async function leerDiputados(web) {
  const pleno = leerTarjetas(await web.texto(`${W}/organosparlamentarios/pleno.do?modo=confoto`));
  const vistos = new Map();
  for (const d of pleno) {
    if (vistos.has(d.id_fuente)) continue;
    vistos.set(d.id_fuente, {
      id_fuente: d.id_fuente,
      nombre: nombreNatural(d.nombre),
      apellidos_nombre: d.nombre,
      grupo: GRUPOS[d.gp] || d.gp,
      foto_url: `${W.replace('/composicionyfuncionamiento', '')}/fotografia.do?codmie=${d.id_fuente}&nlegis=13`,
      url_ficha: `${W}/diputadosysenadores.do?codmie=${d.id_fuente}&nlegis=13&codorg=3&cirele=0&accion=Ver%20Diputados`,
    });
  }
  return [...vistos.values()];
}

export async function leerFicha(web, d) {
  const h = await web.texto(d.url_ficha || `${W}/diputadosysenadores.do?codmie=${d.id_fuente}&nlegis=13&codorg=3&cirele=0&accion=Ver%20Diputados`);
  const t = limpiar(h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' '));
  const circ = (t.match(/Circunscripci[oó]n: ([A-ZÁÉÍÓÚ][a-záéíóúñ]+)/) || [])[1] || null;
  return { circunscripcion: circ };
}

const TIPOS = [
  [/permanente legislativa/i, 'permanente'],
  [/permanente no legislativa/i, 'permanente'],
  [/permanente de legislatura/i, 'permanente'],
  [/investigaci/i, 'investigacion'],
  [/estudio/i, 'estudio'],
];

export async function leerOrganos(web) {
  const organos = [];
  for (const [nombre, ruta] of [
    ['Mesa del Parlamento', '/organosparlamentarios/mesa.do?modo=confoto'],
    ['Junta de Portavoces', '/organosparlamentarios/juntadeportavoces.do?modo=confoto'],
    ['Diputación Permanente', '/organosparlamentarios/diputacionpermanente.do?modo=confoto'],
  ]) {
    try {
      const miembros = leerTarjetas(await web.texto(`${W}${ruta}`)).map((m) => ({ id_fuente: m.id_fuente, nombre: m.nombre, cargo: m.cargo || 'Miembro' }));
      organos.push({ nombre, tipo: 'organo', url: `${W}${ruta}`, miembros });
    } catch {
      // Sigue con el resto.
    }
  }
  const indice = await web.texto(`${W}/organosparlamentarios/comisiones.do`);
  // El índice va por bloques con su <h3> (Permanente Legislativa, De Investigación…).
  const bloques = indice.split(/<h3[^>]*>/i).slice(1);
  for (const b of bloques) {
    const titulo = limpiar(b.split(/<\/h3>/i)[0]);
    const tipo = (TIPOS.find(([re]) => re.test(titulo)) || [])[1] || 'permanente';
    for (const m of b.matchAll(/<a[^>]+href="([^"]*comisiones\.do\?codorg=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const nombre = limpiar(m[3]);
      if (!nombre || organos.some((o) => o.nombre === nombre)) continue;
      const url = `${W}/organosparlamentarios/comisiones.do?codorg=${m[2]}&nlegis=13&modo=confoto`;
      try {
        const miembros = leerTarjetas(await web.texto(url))
          .filter((x) => !/letrad/i.test(x.cargo))
          .map((x) => ({ id_fuente: x.id_fuente, nombre: x.nombre, cargo: (x.cargo || 'Vocal').replace(/ de la Comisi[oó]n/i, '').replace(/^Portavoz en la Comisi[oó]n$/i, 'Portavoz') }));
        organos.push({ nombre, tipo, url, miembros });
      } catch {
        // Sigue con la siguiente.
      }
    }
  }
  return organos;
}
