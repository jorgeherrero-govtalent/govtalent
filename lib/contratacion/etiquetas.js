/**
 * Etiquetas de contratación pública: los códigos de PLACSP (CODICE) y
 * de TED pasados a lo que entiende cualquiera, y los grupos que usan los
 * filtros de /licitaciones.
 *
 * PLACSP y TED codifican distinto (tipo «2» frente a «services»,
 * estado «PUB» frente a «competition»), así que cada opción de filtro
 * lleva todos los códigos que le corresponden.
 */

export const ESTADOS = {
  PRE: 'Anuncio previo',
  planning: 'Anuncio previo',
  PUB: 'En plazo',
  competition: 'En plazo',
  EV: 'Pendiente de adjudicación',
  ADJ: 'Adjudicada',
  result: 'Adjudicada',
  RES: 'Resuelta',
  'cont-modif': 'Modificación',
  'dir-awa-pre': 'Adjudicación directa',
  ANUL: 'Anulada',
};

export const EN_PLAZO = ['PUB', 'competition'];
export const ADJUDICADAS = ['ADJ', 'RES', 'result'];

// De quién es la licitación (sql/126): organismos españoles o
// instituciones, órganos y agencias de la UE (de TED).
export const AMBITOS = [
  { v: 'espana', label: 'España' },
  { v: 'ue', label: 'Instituciones de la UE' },
];

export const TIPOS = [
  { v: 'suministros', label: 'Suministros', codigos: ['1', 'supplies'] },
  { v: 'servicios', label: 'Servicios', codigos: ['2', 'services'] },
  { v: 'obras', label: 'Obras', codigos: ['3', 'works'] },
  { v: 'concesion-servicios', label: 'Concesión de servicios', codigos: ['22', '21'] },
  { v: 'concesion-obras', label: 'Concesión de obras', codigos: ['32', '31'] },
  { v: 'administrativo-especial', label: 'Administrativo especial', codigos: ['7'] },
  { v: 'privado', label: 'Privado', codigos: ['8'] },
  { v: 'patrimonial', label: 'Patrimonial', codigos: ['50'] },
];

export const PROCEDIMIENTOS = [
  { v: 'abierto', label: 'Abierto', codigos: ['1', 'open'] },
  { v: 'simplificado', label: 'Abierto simplificado', codigos: ['9'] },
  { v: 'restringido', label: 'Restringido', codigos: ['2', 'restricted'] },
  { v: 'negociado-con', label: 'Negociado con publicidad', codigos: ['4', 'neg-w-call'] },
  { v: 'negociado-sin', label: 'Negociado sin publicidad', codigos: ['3', 'neg-wo-call'] },
  { v: 'negociacion', label: 'Licitación con negociación', codigos: ['13'] },
  { v: 'menor', label: 'Contrato menor', codigos: ['6'] },
  { v: 'acuerdo-marco', label: 'Basado en acuerdo marco', codigos: ['7'] },
  { v: 'normas-internas', label: 'Normas internas', codigos: ['100'] },
];

// NUTS 2 de España: comunidades y ciudades autónomas.
export const TERRITORIOS = [
  { v: 'ES61', label: 'Andalucía' },
  { v: 'ES24', label: 'Aragón' },
  { v: 'ES12', label: 'Asturias' },
  { v: 'ES53', label: 'Illes Balears' },
  { v: 'ES70', label: 'Canarias' },
  { v: 'ES13', label: 'Cantabria' },
  { v: 'ES41', label: 'Castilla y León' },
  { v: 'ES42', label: 'Castilla-La Mancha' },
  { v: 'ES51', label: 'Cataluña' },
  { v: 'ES52', label: 'Comunitat Valenciana' },
  { v: 'ES43', label: 'Extremadura' },
  { v: 'ES11', label: 'Galicia' },
  { v: 'ES30', label: 'Comunidad de Madrid' },
  { v: 'ES62', label: 'Región de Murcia' },
  { v: 'ES22', label: 'Navarra' },
  { v: 'ES21', label: 'País Vasco' },
  { v: 'ES23', label: 'La Rioja' },
  { v: 'ES63', label: 'Ceuta' },
  { v: 'ES64', label: 'Melilla' },
];

const NOMBRE_TERRITORIO = Object.fromEntries(TERRITORIOS.map((t) => [t.v, t.label]));

export function territorio(nuts) {
  if (!nuts) return null;
  return NOMBRE_TERRITORIO[String(nuts).slice(0, 4).toUpperCase()] || null;
}

// Divisiones CPV (dos primeros dígitos), con nombres cortos.
export const SECTORES = [
  { v: '03', label: 'Agricultura, ganadería y pesca' },
  { v: '09', label: 'Combustibles y energía' },
  { v: '14', label: 'Minería' },
  { v: '15', label: 'Alimentación y bebidas' },
  { v: '16', label: 'Maquinaria agrícola' },
  { v: '18', label: 'Ropa y calzado' },
  { v: '19', label: 'Cuero y textiles' },
  { v: '22', label: 'Impresos y publicaciones' },
  { v: '24', label: 'Productos químicos' },
  { v: '30', label: 'Equipos de oficina e informáticos' },
  { v: '31', label: 'Equipos eléctricos' },
  { v: '32', label: 'Telecomunicaciones y audiovisual' },
  { v: '33', label: 'Equipamiento médico y farmacia' },
  { v: '34', label: 'Vehículos y transporte' },
  { v: '35', label: 'Seguridad y defensa' },
  { v: '37', label: 'Deporte, ocio e instrumentos' },
  { v: '38', label: 'Laboratorio y precisión' },
  { v: '39', label: 'Mobiliario y limpieza' },
  { v: '41', label: 'Agua' },
  { v: '42', label: 'Maquinaria industrial' },
  { v: '43', label: 'Maquinaria de construcción' },
  { v: '44', label: 'Materiales de construcción' },
  { v: '45', label: 'Obras de construcción' },
  { v: '48', label: 'Software' },
  { v: '50', label: 'Reparación y mantenimiento' },
  { v: '51', label: 'Instalación' },
  { v: '55', label: 'Hostelería y restauración' },
  { v: '60', label: 'Transporte' },
  { v: '63', label: 'Logística y viajes' },
  { v: '64', label: 'Correos y telecomunicaciones' },
  { v: '65', label: 'Suministros públicos' },
  { v: '66', label: 'Finanzas y seguros' },
  { v: '70', label: 'Inmobiliario' },
  { v: '71', label: 'Arquitectura e ingeniería' },
  { v: '72', label: 'Servicios informáticos' },
  { v: '73', label: 'Investigación y desarrollo' },
  { v: '75', label: 'Administración pública' },
  { v: '76', label: 'Petróleo y gas' },
  { v: '77', label: 'Jardinería y forestal' },
  { v: '79', label: 'Consultoría, jurídico y comunicación' },
  { v: '80', label: 'Educación y formación' },
  { v: '85', label: 'Salud y servicios sociales' },
  { v: '90', label: 'Residuos, limpieza y medio ambiente' },
  { v: '92', label: 'Cultura, deporte y ocio' },
  { v: '98', label: 'Otros servicios' },
];

export function codigos(lista, elegidos) {
  return lista.filter((o) => elegidos.includes(o.v)).flatMap((o) => o.codigos);
}
