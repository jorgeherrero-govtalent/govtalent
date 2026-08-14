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
