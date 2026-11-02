// Provincias del 29N: direcciones, cifras, listas por candidatura e índice.
// Lo usan el explorador (cliente y servidor), las páginas de provincia
// (/elecciones-29n/[provincia]), su imagen para redes, el sitemap y la
// versión en Markdown. Todo sale de lib/data/elecciones29n.json.

export const COLORES = {
  Sumar: '#e0527f', Podemos: '#6b2e8c', Compromís: '#e8732a', UPN: '#1d3f7a', ERC: '#f0ad3a',
  Bildu: '#9cbf3b', PSOE: '#d4463c', PNV: '#3e8a4f', Junts: '#26b3a6', Mixto: '#9a978f', PP: '#2f6fba', VOX: '#5aa33a',
};
const ORDEN_GRUPOS = ['PSOE', 'PP', 'VOX', 'Sumar', 'Podemos', 'Compromís', 'ERC', 'Junts', 'Bildu', 'PNV', 'UPN', 'Mixto'];

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

// Listas al Congreso de una provincia: diputados actuales que repiten en ella
// y candidatos nuevos en puestos con opciones, agrupados por candidatura.
// `escanos` es lo que suman hoy en la provincia los grupos de esa candidatura.
export function listasProvincia(datos, z) {
  const listas = new Map();
  const meter = (siglas, g, fila) => {
    if (!listas.has(siglas)) listas.set(siglas, { siglas, grupos: new Set(), filas: [], deNuevos: 0 });
    const l = listas.get(siglas);
    l.grupos.add(g);
    l.filas.push(fila);
  };
  datos.d
    .filter((d) => d.d === 'congreso' && d.x && d.x.c === 'congreso' && d.x.z === z && !d.x.p)
    .forEach((d) => meter(d.x.s, d.g, { o: d.x.o, n: d.n, g: d.g, f: d.f, slug: d.slug, cargo: null, nuevo: false, vieneDe: d.z !== z ? d.z : null }));
  datos.nu
    .filter((x) => x.z === z)
    .forEach((x) => {
      meter(x.s || x.g, x.g, { o: x.o, n: x.n, g: x.g, f: x.f || null, cargo: x.org || null, nuevo: true });
      const l = listas.get(x.s || x.g);
      l.deNuevos = Math.max(l.deNuevos, x.de || 0);
    });
  const hoy = (g) => datos.d.filter((d) => d.z === z && d.g === g).length;
  return [...listas.values()]
    .map((l) => {
      const grupos = [...l.grupos];
      const escanos = Math.max(l.deNuevos, grupos.reduce((s, g) => s + hoy(g), 0));
      const principal = grupos.sort((a, b) => ORDEN_GRUPOS.indexOf(a) - ORDEN_GRUPOS.indexOf(b))[0];
      return { siglas: l.siglas, grupo: principal, color: COLORES[principal] || '#9a978f', escanos, filas: l.filas.sort((a, b) => a.o - b.o) };
    })
    .sort((a, b) => b.escanos - a.escanos || ORDEN_GRUPOS.indexOf(a.grupo) - ORDEN_GRUPOS.indexOf(b.grupo));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Índice de provincias del final de /elecciones-29n (HTML del explorador).
export function indiceHtml(datos) {
  const filas = provincias(datos)
    .map((z) => {
      const c = cifrasProvincia(datos, z);
      return `<a href="/elecciones-29n/${slugProvincia(z)}">${esc(z)}<span>${c.no} de ${c.total}</span></a>`;
    })
    .join('');
  return `<section class="blk"><div class="ante">Todos los datos</div><h2>Índice por provincia</h2><p class="lead">Cada provincia tiene su página con las listas de cada partido, quién repite y quién entra.</p><div class="idx">${filas}</div><p class="idx-nota">Cifra: diputados que no se presentan de los que tiene hoy la provincia.</p></section>`;
}
