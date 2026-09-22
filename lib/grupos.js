/**
 * Grupos parlamentarios españoles: colores y nombres.
 *
 * Vive aparte porque lo usan tres sitios —el directorio de iniciativas,
 * la ficha y la página de comisiones— y antes se importaba desde una
 * página, lo que obligaba a cargarla entera para usar dos funciones y se
 * rompería si esa página cambiara de ruta.
 */

// Se busca por fragmento porque la denominación oficial varía: "Grupo
// Parlamentario Popular en el Congreso", "Grupo Parlamentario
// Plurinacional SUMAR"...
const GROUP_COLORS = [
  [/popular/i, '#1D6FB8'],
  [/socialista/i, '#D4373F'],
  [/vox/i, '#5B9E28'],
  [/sumar/i, '#D6318C'],
  [/republicano|esquerra/i, '#E0A32E'],
  [/junts/i, '#12A89D'],
  [/bildu|euskal herria/i, '#9DB81A'],
  [/vasco|nacionalista vasco|eaj|pnv/i, '#3F9E52'],
  [/mixto/i, '#888780'],
];

export function groupColor(name) {
  if (!name) return '#b0aea6';
  const hit = GROUP_COLORS.find(([re]) => re.test(name));
  return hit ? hit[1] : '#b0aea6';
}

// "Grupo Parlamentario Plurinacional SUMAR" -> "GP SUMAR"
export function grupoCorto(name) {
  if (!name) return '';
  // Los parlamentos autonómicos vienen con el nombre completo
  // ("Comunidad Autónoma de Cataluña - Parlamento"), demasiado largo
  // para una etiqueta. Se deja solo el territorio.
  const auto = name.match(/^Comunidad(?:\s+Autónoma)?\s+(?:de\s+|del\s+)?(?:las\s+)?(.+?)\s*[-–]/i);
  if (auto) return `Parlamento de ${auto[1].trim()}`;

  return name
    .replace(/^Grupo Parlamentario\s*/i, 'GP ')
    .replace(/\s+en el Congreso$/i, '')
    .replace(/Plurinacional\s+/i, '')
    .trim();
}

/**
 * Las comisiones devuelven el grupo en código corto ("GS", "GP",
 * "GSUMAR"), distinto del nombre completo que usa el resto de la
 * aplicación. Los que empiezan por S son del Senado.
 */
const SIGLAS = {
  GP: 'Popular',
  GS: 'Socialista',
  GSUMAR: 'SUMAR',
  GVOX: 'VOX',
  GR: 'Republicano',
  GJxCAT: 'Junts',
  'GEH Bildu': 'EH Bildu',
  'GV (EAJ-PNV)': 'Vasco (EAJ-PNV)',
  GMx: 'Mixto',
};

export function nombreSigla(sigla) {
  return SIGLAS[sigla] || sigla || '';
}

// Resuelve la sigla a su nombre antes de buscar el color.
export function colorSigla(sigla) {
  return groupColor(nombreSigla(sigla));
}

// Los grupos del Senado llevan el prefijo SGP.
export function esGrupoSenado(sigla) {
  return /^SGP/i.test(sigla || '');
}

// =====================================================================
// La marca del grupo: sigla siempre, logo cuando lo haya
// =====================================================================

/**
 * La sigla corta con la que se reconoce un grupo.
 *
 * No sale de `grupoCorto()` porque aquello es para una etiqueta de texto
 * ("GP Popular") y esto tiene que caber en un cuadrado de 38 px. Van a
 * mano y no deducidas del nombre: "Plurinacional SUMAR" daría "PS", que
 * no es como se llama a nadie.
 */
const SIGLA_CORTA = [
  [/popular en el congreso|^grupo parlamentario popular/i, 'PP'],
  [/socialista/i, 'PSOE'],
  [/vox/i, 'VOX'],
  [/sumar/i, 'SMR'],
  [/republicano|esquerra/i, 'ERC'],
  [/junts/i, 'JxC'],
  [/bildu|euskal herria/i, 'EHB'],
  [/vasco|nacionalista vasco|eaj|pnv/i, 'PNV'],
  [/mixto/i, 'MX'],
];

export function siglaGrupo(nombre) {
  if (!nombre) return '··';
  const hit = SIGLA_CORTA.find(([re]) => re.test(nombre));
  if (hit) return hit[1];
  // Un grupo que no esté en la lista —una legislatura nueva, un grupo
  // autonómico— saca sus iniciales en vez de quedarse en blanco.
  const limpio = nombre.replace(/^Grupo\s+Parlamentario\s*/i, '').replace(/Plurinacional\s+/i, '');
  const palabras = limpio.split(/[\s(]+/).filter((p) => p.length > 2);
  return palabras.slice(0, 3).map((p) => p[0].toUpperCase()).join('') || '··';
}

/**
 * El color del grupo oscurecido hasta que se lea sobre su propio tinte.
 *
 * La casilla va rellena con el color al 12 % sobre blanco y la sigla
 * encima. En blanco no se puede poner: sobre el rojo del PSOE o el
 * amarillo de ERC, a 11 px, no llega ni de lejos al contraste mínimo.
 *
 * NO SE BAJA A UNA LUMINOSIDAD FIJA. Se probó con un tope del 32 % y
 * cuatro colores seguían por debajo de 4,5:1 —VOX, Junts, Bildu y los
 * Verdes del PE—, porque un verde o un turquesa saturados siguen siendo
 * luminosos a esa altura mientras que un azul ya está muy oscuro. Así
 * que se calcula el contraste de verdad y se baja hasta cumplirlo, que
 * además vale para cualquier color que se añada mañana sin que nadie
 * tenga que acordarse de comprobarlo.
 */

/** Luminancia relativa de un [r,g,b] 0-255, según WCAG. */
function luminancia([r, g, b]) {
  const canal = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** hsl -> [r,g,b] 0-255. */
function hslARgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

/** La opacidad con la que se tiñe la casilla. Si cambia aquí, cambia el cálculo. */
export const TINTE_CASILLA = 0.12;

export function tintaGrupo(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#57534e';
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];

  // El fondo real contra el que se lee: el color al 12 % sobre blanco.
  const fondo = rgb.map((c) => Math.round(c * TINTE_CASILLA + 255 * (1 - TINTE_CASILLA)));

  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + 360) % 360;

  // Se baja de dos en dos centésimas hasta pasar 4,5:1. Si ni el negro
  // del todo lo consigue —no pasa con ningún color real—, se devuelve lo
  // más oscuro probado, que siempre es mejor que el color de partida.
  let candidato = hslARgb(h, s, Math.min(l, 0.34));
  for (let objetivo = Math.min(l, 0.34); objetivo >= 0.04; objetivo -= 0.02) {
    candidato = hslARgb(h, s, objetivo);
    if (contraste(fondo, candidato) >= 4.5) break;
  }
  return `#${candidato.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * El nombre de archivo del logo a partir de cualquier identificador.
 *
 * Los grupos del Congreso se identifican por su `slug` y los del
 * Parlamento Europeo por su código ("S&D", "Verts/ALE"), que lleva
 * caracteres que no valen en una ruta. Se normaliza igual en los dos
 * sitios para que subir el archivo sea siempre la misma operación.
 */
export function claveLogo(id) {
  return String(id || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * La clave con la que se nombra el archivo del logo de un grupo.
 *
 * SALE DEL NOMBRE Y NO DEL `slug`. El slug lo genera la base de datos y
 * puede cambiar —o ser distinto entre legislaturas— y entonces el logo
 * desaparecería sin que nadie se entere de por qué. El nombre del grupo
 * ya es lo que decide su color y su sigla en este mismo fichero, así que
 * las tres cosas se resuelven igual y con la misma tabla mental.
 *
 * Devuelve null para el Mixto y para cualquiera que no esté en la lista:
 * ahí no se intenta cargar nada y se queda la sigla, que es lo correcto
 * —el Grupo Mixto no tiene emblema.
 */
const CLAVE_LOGO = [
  [/popular en el congreso|^grupo parlamentario popular/i, 'pp'],
  [/socialista/i, 'psoe'],
  [/vox/i, 'vox'],
  [/sumar/i, 'sumar'],
  [/republicano|esquerra/i, 'erc'],
  [/junts/i, 'junts'],
  [/bildu|euskal herria/i, 'ehbildu'],
  [/vasco|nacionalista vasco|eaj|pnv/i, 'pnv'],
];

export function claveGrupo(nombre) {
  if (!nombre) return null;
  const hit = CLAVE_LOGO.find(([re]) => re.test(nombre));
  return hit ? hit[1] : null;
}
