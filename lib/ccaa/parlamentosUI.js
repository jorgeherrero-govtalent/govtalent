// =====================================================================
// Parlamentos autonómicos con composición cargada (sql/91): nombre, alias
// y enlaces. Sin dependencias de cliente, para usarlo también en las rutas
// del servidor (el listado de Comunidades autónomas).
// =====================================================================

export const PARLAMENTOS_UI = {
  // El Senado (sql/118) usa las mismas tablas y pantallas que los
  // parlamentos autonómicos, con su ruta (/institutions/senado), sus
  // etiquetas («Senador», «Senadora») y sin Comisiones ni Órganos: el
  // Senado no publica sus miembros en datos abiertos y la Cámara está
  // disuelta. `camara` lo distingue de los autonómicos.
  senado: {
    nombre: 'Senado',
    alias: [],
    camara: true,
    ruta: '/institutions/senado',
    seg: 'senadores',
    pestanas: ['miembros', 'grupos'],
    miembro: { H: 'Senador', M: 'Senadora', N: 'Senador', plural: 'Senadores', min: 'senador', minPlural: 'senadores' },
    filtroLugar: 'Circunscripción o comunidad',
    aviso: 'Cámara disuelta el 06/10/2026. Figuran los senadores que siguen en activo según el Senado; la XVI Legislatura se constituye el 23/12/2026.',
    fichaComunidad: null,
    ccaa: null,
    legislatura: 'XV',
    dominio: '@senado.es',
    deNombre: 'del Senado',
    elNombre: 'el Senado',
    deCcaa: null,
    web: 'https://www.senado.es/web/composicionorganizacion/senadores/composicionsenado/consultaordenalfabetico/index.html',
    fichaGrupo: () => 'https://www.senado.es/web/composicionorganizacion/gruposparlamentarios/composiciongruposparlamentarios/index.html',
  },
  madrid: {
    nombre: 'Asamblea de Madrid',
    // Como la llama el directorio de Comunidades autónomas (Agenda de la Comunicación).
    alias: ['Asamblea de la Comunidad de Madrid'],
    // Su ficha en Comunidades autónomas (directorio_entidades.id): gabinete,
    // prensa y contacto institucional.
    fichaComunidad: 297,
    ccaa: 'Comunidad de Madrid',
    legislatura: 'XIII',
    dominio: '@asambleamadrid.es',
    deNombre: 'de la Asamblea de Madrid',
    elNombre: 'la Asamblea de Madrid',
    deCcaa: 'de la Comunidad de Madrid',
    web: 'https://www.asambleamadrid.es/composicion/diputados',
    fichaGrupo: (id) => `https://www.asambleamadrid.es/composicion/grupos-parlamentarios/ficha-del-grupo?grupoParlamentario=${id}`,
  },
  cataluna: {
    nombre: 'Parlament de Catalunya',
    alias: ['Parlamento de Cataluña'],
    fichaComunidad: 285,
    ccaa: 'Cataluña',
    legislatura: 'XV',
    dominio: '@parlament.cat',
    deNombre: 'del Parlament de Catalunya',
    elNombre: 'el Parlament de Catalunya',
    deCcaa: 'de Cataluña',
    web: 'https://www.parlament.cat/web/composicio/ple-parlament/index.html',
    fichaGrupo: (id) => `https://www.parlament.cat/web/composicio/grups-parlamentaris/grup-parlamentari/index.html?p_codi=${id}&p_legislatura=15`,
  },
  valencia: {
    nombre: 'Corts Valencianes',
    alias: ['Les Corts Valencianes', 'Cortes Valencianas'],
    fichaComunidad: 306,
    ccaa: 'Comunitat Valenciana',
    legislatura: 'XI',
    dominio: '@corts.gva.es',
    deNombre: 'de les Corts Valencianes',
    elNombre: 'les Corts Valencianes',
    deCcaa: 'de la Comunitat Valenciana',
    web: 'https://www.cortsvalencianes.es/es/composicion/diputados',
    fichaGrupo: () => 'https://www.cortsvalencianes.es/es/composicion/grupos-parlamentarios',
  },
  rioja: {
    nombre: 'Parlamento de La Rioja',
    alias: [],
    fichaComunidad: 303,
    ccaa: 'La Rioja',
    legislatura: 'XI',
    dominio: '@parlamento-larioja.org',
    deNombre: 'del Parlamento de La Rioja',
    elNombre: 'el Parlamento de La Rioja',
    deCcaa: 'de La Rioja',
    web: 'https://www.parlamento-larioja.org/composicion-y-organos/diputados',
    fichaGrupo: () => 'https://www.parlamento-larioja.org/composicion-y-organos/grupos-parlamentarios-link',
  },
  andalucia: {
    nombre: 'Parlamento de Andalucía',
    alias: [],
    fichaComunidad: 267,
    ccaa: 'Andalucía',
    legislatura: 'XIII',
    dominio: '@parlamentodeandalucia.es',
    deNombre: 'del Parlamento de Andalucía',
    elNombre: 'el Parlamento de Andalucía',
    deCcaa: 'de Andalucía',
    web: 'https://www.parlamentodeandalucia.es/webdinamica/portal-web-parlamento/composicionyfuncionamiento/diputadosysenadores.do',
    fichaGrupo: () => 'https://www.parlamentodeandalucia.es/webdinamica/portal-web-parlamento/composicionyfuncionamiento/gruposparlamentarios.do',
  },
  aragon: {
    nombre: 'Cortes de Aragón',
    alias: [],
    fichaComunidad: 270,
    ccaa: 'Aragón',
    legislatura: 'XII',
    dominio: '@cortesaragon.es',
    deNombre: 'de las Cortes de Aragón',
    elNombre: 'las Cortes de Aragón',
    deCcaa: 'de Aragón',
    web: 'https://www.cortesaragon.es/Diputados-y-diputadas.2164.0.html',
    fichaGrupo: () => 'https://www.cortesaragon.es/Grupos-parlamentarios.2369.0.html',
  },
  canarias: {
    nombre: 'Parlamento de Canarias',
    alias: [],
    fichaComunidad: 273,
    ccaa: 'Canarias',
    legislatura: 'XI',
    dominio: '@parcan.es',
    deNombre: 'del Parlamento de Canarias',
    elNombre: 'el Parlamento de Canarias',
    deCcaa: 'de Canarias',
    web: 'https://www.parcan.es/composicion/diputados/11/',
    fichaGrupo: () => 'https://www.parcan.es/composicion/grupos.py?legis=11',
  },
  castillayleon: {
    nombre: 'Cortes de Castilla y León',
    alias: [],
    fichaComunidad: 282,
    ccaa: 'Castilla y León',
    legislatura: 'XII',
    dominio: '@ccyl.es',
    deNombre: 'de las Cortes de Castilla y León',
    elNombre: 'las Cortes de Castilla y León',
    deCcaa: 'de Castilla y León',
    web: 'https://www.ccyl.es/Parlamento/Procuradores',
    fichaGrupo: () => 'https://www.ccyl.es/Parlamento/GruposParlamentarios',
  },
  castillalamancha: {
    nombre: 'Cortes de Castilla-La Mancha',
    alias: [],
    fichaComunidad: 279,
    ccaa: 'Castilla-La Mancha',
    legislatura: 'XI',
    dominio: '@cortesclm.es',
    deNombre: 'de las Cortes de Castilla-La Mancha',
    elNombre: 'las Cortes de Castilla-La Mancha',
    deCcaa: 'de Castilla-La Mancha',
    web: 'https://www.cortesclm.es/index.php/composicion',
    fichaGrupo: () => 'https://www.cortesclm.es/index.php/grupos',
  },
};

const MIEMBRO_DIPUTADO = { H: 'Diputado', M: 'Diputada', N: 'Diputado/a', plural: 'Diputados', min: 'diputado', minPlural: 'diputados' };

/** Cómo se llama a quien se sienta en la cámara: Diputado/a o Senador/a. */
export function miembro(p) {
  return PARLAMENTOS_UI[p]?.miembro || MIEMBRO_DIPUTADO;
}

/** Clave del parlamento por su nombre o alias ('Asamblea de la Comunidad de Madrid' → 'madrid'). */
export function parlamentoPorNombre(nombre) {
  const n = String(nombre || '').trim().toLowerCase();
  return Object.entries(PARLAMENTOS_UI).find(([, c]) => [c.nombre, ...(c.alias || [])].some((x) => x.toLowerCase() === n))?.[0] || null;
}
