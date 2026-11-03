// Provincias del 29N: direcciones, cifras, listas por candidatura e índice.
// Lo usan el explorador (cliente y servidor), las páginas de provincia
// (/elecciones-29n/[provincia]), su imagen para redes, el sitemap y la
// versión en Markdown. Todo sale de lib/data/elecciones29n.json.

export const COLORES = {
  Sumar: '#e0527f', Podemos: '#6b2e8c', Compromís: '#e8732a', UPN: '#1d3f7a', ERC: '#f0ad3a',
  Bildu: '#9cbf3b', PSOE: '#d4463c', PNV: '#3e8a4f', Junts: '#26b3a6', Mixto: '#9a978f', PP: '#2f6fba', VOX: '#5aa33a',
  BNG: '#76b4d8', CC: '#e5b800',
};
const ORDEN_GRUPOS = ['PSOE', 'PP', 'VOX', 'Sumar', 'Podemos', 'Compromís', 'ERC', 'Junts', 'Bildu', 'PNV', 'BNG', 'CC', 'UPN', 'Mixto'];

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const slugProvincia = (z) => sinTildes(z).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const porNombreProvincia = (a, b) => sinTildes(a).localeCompare(sinTildes(b), 'es');

export function provincias(datos) {
  return [...new Set(datos.d.map((d) => d.z))].sort(porNombreProvincia);
}

export function provinciaPorSlug(datos, slug) {
  return provincias(datos).find((z) => slugProvincia(z) === slug) || null;
}

export function cifrasProvincia(datos, z) {
  const ds = datos.d.filter((d) => d.z === z);
  return {
    total: ds.length,
    no: ds.filter((d) => d.d === 'no').length,
    nuevos: datos.nu.filter((x) => x.z === z).length,
  };
}

// Destino de un diputado actual visto desde su provincia.
export function destinoDiputado(d, z) {
  if (d.d === 'no') return { texto: 'No se presenta', clase: 'no' };
  const x = d.x;
  const fuera = x.z !== z ? ` por ${x.z}` : '';
  if (d.d === 'senado') return { texto: `Pasa al Senado${fuera}`, clase: 'sen' };
  if (d.d === 'suplente') return { texto: `Suplente${x.c === 'senado' ? ' al Senado' : ''}${fuera}`, clase: 'sen' };
  return { texto: `Repite, número ${x.o}${fuera}`, clase: 'si' };
}

// Listas al Congreso de una provincia, completas (todos los titulares que
// publica el BOE) para los partidos con representación hoy. `cand` es
// lib/data/candidatos29n.json. Cada candidato se cruza con el Congreso por
// su puesto (provincia, siglas y número), no por el nombre: «Repite» si es
// diputado hoy y «Nuevo» si no lo es. `escanos` es lo que suman hoy en la
// provincia los grupos de esa candidatura (la línea de cada lista).
export function listasProvincia(datos, cand, z, cruce = null) {
  const listas = (cand.p && cand.p[z]) || [];
  const repite = new Map();
  datos.d
    .filter((d) => d.d === 'congreso' && d.x && d.x.c === 'congreso' && !d.x.p && d.x.z === z)
    .forEach((d) => repite.set(`${d.x.s}|${d.x.o}`, d));
  const nuevo = new Map(datos.nu.filter((x) => x.z === z).map((x) => [`${x.s}|${x.o}`, x]));
  const gobierno = new Map((datos.c || []).filter((c) => c.cam === 'Congreso' && c.z === z).map((c) => [c.o, c]));
  const hoy = (g) => datos.d.filter((d) => d.z === z && d.g === g).length;
  return listas
    .map((l) => {
      const grupos = new Set([l.g]);
      let deNuevos = 0;
      const filas = l.c.map((nombre, i) => {
        const o = i + 1;
        const d = repite.get(`${l.s}|${o}`);
        const x = nuevo.get(`${l.s}|${o}`);
        const gob = gobierno.get(o);
        if (d) grupos.add(d.g);
        if (x) deNuevos = Math.max(deNuevos, x.de || 0);
        let cargo = null;
        if (gob && (gob.p === l.g || gob.p === d?.g || gob.p === x?.g)) cargo = gob.c;
        else if (x?.org) cargo = x.org;
        else if (d && d.z !== z) cargo = `Diputado por ${d.z}`;
        const c23 = cruce ? cruce[`${z}|${l.s}|${o}`] : null;
        return {
          o,
          a23: c23 ? { o: c23[0], z: c23[1], s: c23[2] } : null,
          n: d ? d.n : nombre,
          g: d ? d.g : l.g,
          f: d?.f || x?.f || null,
          cargo,
          nuevo: !d,
        };
      });
      const escanos = Math.max(deNuevos, [...grupos].reduce((s, g) => s + hoy(g), 0));
      return { siglas: l.s, grupo: l.g, color: COLORES[l.g] || '#9a978f', escanos, filas };
    })
    .sort((a, b) => b.escanos - a.escanos || ORDEN_GRUPOS.indexOf(a.grupo) - ORDEN_GRUPOS.indexOf(b.grupo));
}


// Movimiento de un candidato respecto a las listas de 2023 (cruce por nombre,
// scripts/elecciones29n-2023). tipo: sube | baja | igual | provincia | nuevo.
export const TIPOS_2023 = [
  ['sube', 'Sube en la lista'],
  ['baja', 'Baja en la lista'],
  ['igual', 'Mismo puesto'],
  ['provincia', 'Cambia de provincia'],
  ['nuevo', 'No era candidato'],
];
export function movimiento2023(o, a23) {
  if (!a23) return { tipo: 'nuevo', texto: 'No era candidato' };
  if (a23.z) return { tipo: 'provincia', texto: `Antes por ${a23.z} (nº ${a23.o})` };
  const d = a23.o - o;
  if (d > 0) return { tipo: 'sube', texto: `▲ ${d} (era nº ${a23.o})` };
  if (d < 0) return { tipo: 'baja', texto: `▼ ${-d} (era nº ${a23.o})` };
  return { tipo: 'igual', texto: 'Mismo puesto' };
}
