// Textos del 29N que se generan a partir de los datos (lib/data/elecciones29n.json):
// preguntas frecuentes para los datos estructurados de la página y la versión
// en Markdown (/elecciones-29n.md) para asistentes de IA. Todo sale de los
// mismos datos que pinta el explorador, sin cifras escritas a mano.

import { slugProvincia } from './elecciones29nProvincias';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app').replace(/\/$/, '');
export const URL_PAGINA = `${SITE_URL}/elecciones-29n`;
export const URL_MD = `${SITE_URL}/elecciones-29n.md`;

const ORDEN = ['PSOE', 'PP', 'VOX', 'Sumar', 'ERC', 'Junts', 'Bildu', 'PNV', 'Mixto'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

const porNombre = (a, b) => a.n.localeCompare(b.n, 'es');
const porProvincia = (a, b) => a.z.localeCompare(b.z, 'es') || (a.o || 0) - (b.o || 0) || porNombre(a, b);

export function cifras(datos) {
  const D = datos.d;
  const n = (f) => D.filter(f).length;
  const grupos = ORDEN.filter((g) => D.some((d) => d.g === g)).map((g) => ({
    g,
    total: n((d) => d.g === g),
    no: n((d) => d.g === g && d.d === 'no'),
  }));
  return {
    total: D.length,
    no: n((d) => d.d === 'no'),
    repiten: n((d) => d.d === 'congreso'),
    senado: n((d) => d.d === 'senado'),
    suplentes: n((d) => d.d === 'suplente'),
    nuevos: datos.nu.length,
    grupos,
  };
}

function fuente(datos) {
  const m = datos.meta || {};
  const estado = m.estado === 'proclamadas' ? 'candidaturas proclamadas' : 'candidaturas presentadas';
  return `${estado} publicadas en el BOE (${m.boe}, ${fechaLarga(m.fecha)})`;
}

function destino(d) {
  if (d.d === 'no') return 'No se presenta';
  const x = d.x;
  if (d.d === 'senado') return `Pasa al Senado (número ${x.o} por ${x.z}, ${x.s})`;
  if (d.d === 'suplente') return `Suplente (${x.c === 'senado' ? 'Senado' : 'Congreso'} por ${x.z}, ${x.s})`;
  return `Repite (número ${x.o} por ${x.z}, ${x.s})`;
}

// Preguntas frecuentes: van en los datos estructurados de la página.
export function preguntas(datos) {
  const c = cifras(datos);
  const porGrupo = c.grupos.map((g) => `${g.g}, ${g.no} de ${g.total}`).join('; ');
  const gob = [...(datos.gob || [])].sort(porProvincia);
  const nuevosPorPartido = Object.entries(
    datos.nu.reduce((acc, x) => ({ ...acc, [x.g]: (acc[x.g] || 0) + 1 }), {})
  )
    .sort((a, b) => b[1] - a[1])
    .map(([g, k]) => `${g} ${k}`)
    .join(', ');
  return [
    {
      q: '¿Cuántos diputados no vuelven a presentarse a las elecciones generales del 29 de noviembre de 2026?',
      a: `${c.no} de los ${c.total} diputados de la XV Legislatura no figuran en ninguna candidatura. Por grupos: ${porGrupo}.`,
    },
    {
      q: '¿Cuántos diputados repiten en las listas del 29N?',
      a: `${c.repiten} diputados vuelven a presentarse al Congreso, ${c.senado} pasan a las listas del Senado y ${c.suplentes} van como suplentes.`,
    },
    {
      q: '¿Qué miembros del Gobierno van en las listas al Congreso el 29N?',
      a: `${gob.length} miembros del Gobierno van en las listas: ${gob.map((g) => `${g.n} (${g.org}), número ${g.o} por ${g.z}`).join('; ')}.`,
    },
    {
      q: '¿Quién puede llegar nuevo al Congreso el 29N?',
      a: `GovTalent identifica ${c.nuevos} candidatos que no son diputados y van en puestos con opciones según los escaños que su partido tiene hoy en cada provincia. Por partido: ${nuevosPorPartido}. Entre ellos hay ministros, delegados del Gobierno, consejeros autonómicos, senadores, alcaldes y cargos de partido.`,
    },
    {
      q: '¿De dónde salen los datos?',
      a: `Del cruce de las ${fuente(datos)} con la composición del Congreso de la XV Legislatura. Elaboración de GovTalent.`,
    },
  ];
}

// Versión en Markdown con todos los datos, para asistentes de IA.
export function markdown(datos) {
  const c = cifras(datos);
  const D = [...datos.d];
  const L = [];
  L.push('# Quién repite y quién llegará al Congreso el 29N');
  L.push('');
  L.push(`Elecciones generales del 29 de noviembre de 2026. Elaboración de GovTalent a partir de las ${fuente(datos)}, cruzadas con el Congreso de los Diputados de la XV Legislatura.`);
  L.push('');
  L.push(`Página interactiva: ${URL_PAGINA}`);
  L.push('');
  L.push('## Resumen');
  L.push('');
  L.push(`- ${c.no} de los ${c.total} diputados no vuelven a presentarse.`);
  L.push(`- ${c.repiten} repiten en las listas al Congreso.`);
  L.push(`- ${c.senado} pasan a las listas del Senado.`);
  L.push(`- ${c.suplentes} van como suplentes.`);
  L.push(`- ${c.nuevos} candidatos que no son diputados van en puestos con opciones.`);
  L.push('');
  L.push('## Por grupo parlamentario');
  L.push('');
  L.push('| Grupo | Diputados | No se presentan |');
  L.push('|---|---|---|');
  c.grupos.forEach((g) => L.push(`| ${g.g} | ${g.total} | ${g.no} |`));
  L.push('');

  const gob = [...(datos.gob || [])].sort(porProvincia);
  if (gob.length) {
    L.push('## Miembros del Gobierno en las listas');
    L.push('');
    L.push('| Nombre | Cargo | Circunscripción | Puesto | Partido |');
    L.push('|---|---|---|---|---|');
    gob.forEach((g) => L.push(`| ${g.n} | ${g.org} | ${g.z} | ${g.o} | ${g.g} |`));
    L.push('');
  }

  L.push('## Candidatos que pueden llegar nuevos al Congreso');
  L.push('');
  L.push('Candidatos que no son diputados y van en puestos con opciones según los escaños que su partido tiene hoy en la provincia.');
  L.push('');
  L.push('| Nombre | Partido | Circunscripción | Puesto | Escaños de su partido hoy | Cargo |');
  L.push('|---|---|---|---|---|---|');
  [...datos.nu].sort(porProvincia).forEach((x) => L.push(`| ${x.n} | ${x.s || x.g} | ${x.z} | ${x.o} | ${x.de} | ${x.org || ''} |`));
  L.push('');

  L.push('## Los 350 diputados de la XV Legislatura y su destino el 29N');
  L.push('');
  const provincias = [...new Set(D.map((d) => d.z))].sort((a, b) => a.localeCompare(b, 'es'));
  provincias.forEach((z) => {
    const ds = D.filter((d) => d.z === z).sort(porNombre);
    const no = ds.filter((d) => d.d === 'no').length;
    L.push(`### ${z}`);
    L.push('');
    L.push(`Listas de cada partido: ${URL_PAGINA}/${slugProvincia(z)}`);
    L.push('');
    L.push(`${no} de ${ds.length} no se presentan.`);
    L.push('');
    L.push('| Diputado | Grupo | Destino |');
    L.push('|---|---|---|');
    ds.forEach((d) => L.push(`| ${d.n} | ${d.g} | ${destino(d)} |`));
    L.push('');
  });

  L.push('---');
  L.push('');
  L.push(`Fuente: ${fuente(datos)}. Elaboración de GovTalent (govtalent.app), plataforma de vigilancia normativa y directorio del sector público.`);
  L.push('');
  return L.join('\n');
}

