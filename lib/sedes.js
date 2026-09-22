/**
 * Sedes institucionales, para precargar el lugar de una reunión.
 *
 * PARA QUÉ. El artículo que regula el acta pide el lugar de las reuniones
 * presenciales, y hasta ahora se escribía a mano en cada registro. Quien
 * ha tenido tres reuniones en Castellana 162 la ha tecleado tres veces, y
 * cada vez con una abreviatura distinta. Esto precarga la dirección de la
 * institución a la que pertenece el primer participante marcado.
 *
 * CONSTANTE Y NO TABLA, A PROPÓSITO Y DE MOMENTO. Lo correcto a medio
 * plazo es una columna `direccion_postal` en las unidades del directorio,
 * alimentada por el sync. Mientras eso no exista, un fichero permite
 * desplegar sin migración y deja la procedencia de cada dirección a la
 * vista. Cuando se migre a Supabase, este fichero es el juego de datos
 * inicial y `sedeDeActor()` se queda igual.
 *
 * DE DÓNDE SALE CADA UNA. Todas se leyeron en la web oficial del propio
 * organismo el 22-09-2026, y cada entrada lleva su `fuente`. Ninguna se
 * ha escrito de memoria ni deducido de un directorio de terceros: las que
 * no se pudieron verificar están a `null` y no precargan nada, que es
 * exactamente lo que hacía la aplicación antes. Un acta va firmada; una
 * dirección aproximada en un acta es peor que un campo vacío.
 *
 * TRES MINISTERIOS SIN DIRECCIÓN. Educación, Cultura y Juventud e
 * Infancia. No es que no publiquen la sede: sus dominios no envían el
 * certificado intermedio de la FNMT en el saludo TLS y no se pueden leer
 * desde fuera, que es el mismo fallo que ya obligó a escribir
 * `lib/fetchGob.js` y a reapuntar esas tres fuentes en `sql/47`. En
 * cuanto alguien las lea de su web oficial, se rellenan aquí.
 *
 * SEDES MÚLTIPLES. Casi todos los ministerios ocupan varios edificios.
 * Aquí va siempre la del titular y su gabinete, que es donde se celebran
 * las reuniones de asuntos públicos. Las alternativas conocidas quedan
 * anotadas junto a su entrada para quien tenga que corregirlas.
 */

/** Una dirección sin verificar no existe: se deja a null y no precarga. */
const SEDES = {
  // ---------------------------------------------------------------
  // Cortes Generales
  // ---------------------------------------------------------------
  congreso: {
    nombre: 'Congreso de los Diputados',
    direccion: 'Plaza de las Cortes, 1, 28014 Madrid',
    fuente: 'https://www.congreso.es/es/web/guest/cem/aviso-legal',
    claves: ['congreso de los diputados', 'palacio de las cortes'],
  },
  senado: {
    nombre: 'Senado',
    direccion: 'Calle de Bailén, 3, 28071 Madrid',
    fuente: 'https://www.senado.es/web/conocersenado/arteypatrimonio/edificiossenado/index.html',
    claves: ['senado'],
  },

  // ---------------------------------------------------------------
  // Unión Europea
  // ---------------------------------------------------------------
  'parlamento-europeo': {
    nombre: 'Parlamento Europeo',
    direccion: 'Rue Wiertz 60, 1047 Bruselas, Bélgica',
    fuente: 'https://www.europarl.europa.eu',
    // Tres sedes de trabajo: Bruselas, Estrasburgo y Luxemburgo. Se
    // precarga Bruselas porque es donde se despacha con los grupos de
    // interés; los plenos de Estrasburgo se corrigen a mano.
    claves: ['parlamento europeo'],
  },
  'comision-europea': {
    nombre: 'Comisión Europea',
    direccion: 'Rue de la Loi 200, 1049 Bruselas, Bélgica',
    fuente: 'https://commission.europa.eu/about/contact_en',
    claves: ['comision europea'],
  },

  // ---------------------------------------------------------------
  // Ministerios. Denominaciones de la XV Legislatura.
  // ---------------------------------------------------------------
  exteriores: {
    nombre: 'Ministerio de Asuntos Exteriores, Unión Europea y Cooperación',
    direccion: 'Plaza del Marqués de Salamanca, 8, 28006 Madrid',
    fuente: 'https://www.exteriores.gob.es/es/Paginas/AvisoLegal.aspx',
    // También Palacio de Santa Cruz (Plaza de la Provincia, 1) y Palacio
    // de Viana (Duque de Rivas). Marqués de Salamanca 8 es la dirección
    // institucional que publica el propio ministerio.
    claves: ['asuntos exteriores', 'exteriores'],
  },
  'presidencia-justicia': {
    nombre: 'Ministerio de la Presidencia, Justicia y Relaciones con las Cortes',
    // VACÍA A PROPÓSITO, y esta es la única del fichero que no lo está
    // por no haberse podido verificar.
    //
    // El departamento es bicéfalo y tiene dos sedes buenas: el titular y
    // Presidencia despachan en el Complejo de la Moncloa (Avenida Puerta
    // de Hierro, s/n, 28071 Madrid) y Justicia en su sede histórica de
    // San Bernardo, 45, 28015 Madrid. Elegir una significa acertar la
    // mitad de las veces y colar la otra mitad en un acta firmada.
    //
    // Así que no se precarga y se escribe a mano, que es lo que hacía la
    // aplicación antes. Si algún día el actor trae de qué rama cuelga,
    // esto se puede resolver bien.
    direccion: null,
    fuente: null,
    claves: ['presidencia, justicia', 'relaciones con las cortes', 'ministerio de justicia', 'ministerio de la presidencia'],
  },
  defensa: {
    nombre: 'Ministerio de Defensa',
    direccion: 'Paseo de la Castellana, 109, 28071 Madrid',
    fuente: 'https://www.defensa.gob.es/comun/avisoLegal.html',
    claves: ['defensa'],
  },
  hacienda: {
    nombre: 'Ministerio de Hacienda',
    direccion: 'Calle de Alcalá, 9, 28014 Madrid',
    fuente: 'https://www.hacienda.gob.es',
    claves: ['hacienda'],
  },
  interior: {
    nombre: 'Ministerio del Interior',
    direccion: 'Paseo de la Castellana, 5, 28046 Madrid',
    fuente: 'https://www.interior.gob.es/opencms/es/el-ministerio/directorio/servicios-centrales/ministerio/',
    claves: ['ministerio del interior'],
  },
  transportes: {
    nombre: 'Ministerio de Transportes y Movilidad Sostenible',
    direccion: 'Paseo de la Castellana, 67, 28071 Madrid',
    fuente: 'https://www.transportes.gob.es/ministerio/contacto/atencion-al-ciudadano',
    claves: ['transportes y movilidad', 'ministerio de transportes'],
  },
  economia: {
    nombre: 'Ministerio de Economía, Comercio y Empresa',
    direccion: 'Paseo de la Castellana, 162, 28071 Madrid',
    fuente: 'https://portal.mineco.gob.es/es-es/ministerio/Paginas/Contacto.aspx',
    // "economia" a secas no vale de clave: también aparece en Trabajo y
    // Economía Social.
    claves: ['economia, comercio', 'comercio y empresa'],
  },
  trabajo: {
    nombre: 'Ministerio de Trabajo y Economía Social',
    direccion: 'Paseo de la Castellana, 63, 28071 Madrid',
    fuente: 'https://prensa.mites.gob.es',
    claves: ['trabajo y economia social', 'ministerio de trabajo'],
  },
  'transicion-ecologica': {
    nombre: 'Ministerio para la Transición Ecológica y el Reto Demográfico',
    direccion: 'Plaza de San Juan de la Cruz, 10, 28071 Madrid',
    fuente: 'https://www.miteco.gob.es/es/ministerio/organizacion/sedes.html',
    claves: ['transicion ecologica', 'reto demografico', 'miteco'],
  },
  educacion: {
    nombre: 'Ministerio de Educación, Formación Profesional y Deportes',
    direccion: null,
    fuente: null,
    claves: ['educacion, formacion profesional', 'ministerio de educacion'],
  },
  industria: {
    nombre: 'Ministerio de Industria y Turismo',
    direccion: 'Paseo de la Castellana, 160, 28071 Madrid',
    fuente: 'https://www.mintur.gob.es',
    // El ministerio ocupa además Castellana 162 con parte de la
    // Subsecretaría.
    claves: ['industria y turismo', 'ministerio de industria', 'de turismo'],
  },
  agricultura: {
    nombre: 'Ministerio de Agricultura, Pesca y Alimentación',
    direccion: 'Paseo de Infanta Isabel, 1, 28014 Madrid',
    fuente: 'https://www.mapa.gob.es/es/ministerio/funciones-estructura/sedes',
    // La Secretaría General de Pesca está en Velázquez 144 y 147.
    claves: ['agricultura, pesca', 'ministerio de agricultura'],
  },
  'politica-territorial': {
    nombre: 'Ministerio de Política Territorial y Memoria Democrática',
    direccion: 'Paseo de la Castellana, 3, 28071 Madrid',
    fuente: 'https://mptmd.gob.es',
    claves: ['politica territorial', 'memoria democratica'],
  },
  vivienda: {
    nombre: 'Ministerio de Vivienda y Agenda Urbana',
    direccion: 'Paseo de la Castellana, 67, 28071 Madrid',
    fuente: 'https://www.mivau.gob.es/el-ministerio/sala-de-prensa/contactos-para-medios',
    // Comparte edificio, Nuevos Ministerios, con Transportes. El propio
    // sitio usa 28046 en la página de atención presencial y 28071 en el
    // pie; se deja el CP de distribución oficial.
    claves: ['vivienda y agenda urbana', 'ministerio de vivienda'],
  },
  cultura: {
    nombre: 'Ministerio de Cultura',
    direccion: null,
    fuente: null,
    claves: ['ministerio de cultura'],
  },
  sanidad: {
    nombre: 'Ministerio de Sanidad',
    direccion: 'Paseo del Prado, 18-20, 28071 Madrid',
    fuente: 'https://www.sanidad.gob.es/servCiudadanos/contactar/home.htm',
    claves: ['sanidad'],
  },
  'derechos-sociales': {
    nombre: 'Ministerio de Derechos Sociales, Consumo y Agenda 2030',
    direccion: 'Paseo del Prado, 18-20, 28014 Madrid',
    fuente: 'https://www.dsca.gob.es/es/ministerio/organizacion-institucional/sedes',
    // Mismo edificio que Sanidad. Consumo está en Príncipe de Vergara 54
    // y Ordenación del Juego en Atocha 3.
    claves: ['derechos sociales', 'consumo y agenda 2030'],
  },
  ciencia: {
    nombre: 'Ministerio de Ciencia, Innovación y Universidades',
    direccion: 'Paseo de la Castellana, 162, 28046 Madrid',
    fuente: 'https://www.ciencia.gob.es/Servicios/ReconocimientoFirma.html',
    claves: ['ciencia, innovacion', 'universidades'],
  },
  igualdad: {
    nombre: 'Ministerio de Igualdad',
    direccion: 'Calle de Alcalá, 37, 28014 Madrid',
    fuente: 'https://www.igualdad.gob.es/contacto/',
    claves: ['igualdad'],
  },
  inclusion: {
    nombre: 'Ministerio de Inclusión, Seguridad Social y Migraciones',
    direccion: 'Calle de José Abascal, 39, 28003 Madrid',
    fuente: 'https://www.inclusion.gob.es/web/guest/contacto',
    claves: ['inclusion, seguridad social', 'seguridad social y migraciones', 'migraciones'],
  },
  'transformacion-digital': {
    nombre: 'Ministerio para la Transformación Digital y de la Función Pública',
    direccion: 'Calle Poeta Joan Maragall, 41, 28071 Madrid',
    fuente: 'https://usuariosteleco.digital.gob.es',
    // La Secretaría de Estado de Telecomunicaciones despacha en
    // Castellana 162.
    claves: ['transformacion digital', 'funcion publica'],
  },
  juventud: {
    nombre: 'Ministerio de Juventud e Infancia',
    direccion: null,
    fuente: null,
    claves: ['juventud e infancia'],
  },

  // ---------------------------------------------------------------
  // Organismos y reguladores. Solo los que publican su sede sin
  // ambigüedad; el resto se irá añadiendo.
  // ---------------------------------------------------------------
  cnmc: {
    nombre: 'CNMC',
    direccion: 'Calle de Alcalá, 47, 28014 Madrid',
    fuente: 'https://www.cnmc.es/participa/sedes-telefonos-y-horarios',
    // También Barquillo 5 en Madrid y Bolívia 56 en Barcelona.
    claves: ['cnmc', 'comision nacional de los mercados'],
  },
  aepd: {
    nombre: 'AEPD',
    direccion: 'Paseo de la Castellana, 141, planta 9, 28046 Madrid',
    fuente: 'https://www.aepd.es/la-agencia/donde-encontrarnos',
    claves: ['aepd', 'proteccion de datos'],
  },
  cnmv: {
    nombre: 'CNMV',
    direccion: 'Calle Edison, 4, 28006 Madrid',
    fuente: 'https://www.cnmv.es/portal/Utilidades/Contacto.aspx',
    claves: ['cnmv', 'mercado de valores'],
  },
  'banco-de-espana': {
    nombre: 'Banco de España',
    direccion: 'Calle de Alcalá, 48, 28014 Madrid',
    fuente: 'https://www.bde.es/wbe/es/sobre-banco/organizacion/sucursales/madrid.html',
    claves: ['banco de espana'],
  },
  aemps: {
    nombre: 'AEMPS',
    direccion: 'Calle Campezo, 1, Edificio 8, 28022 Madrid',
    fuente: 'https://www.aemps.gob.es/la-aemps/contacto/',
    claves: ['aemps', 'medicamentos y productos sanitarios'],
  },
  aesia: {
    nombre: 'AESIA',
    // La propia agencia la publica como sede temporal.
    direccion: 'Rúa de Veeduría, 2, 15001 A Coruña',
    fuente: 'https://aesia.digital.gob.es/es/contacto',
    claves: ['aesia', 'supervision de la inteligencia artificial'],
  },
};

/**
 * La sede que le corresponde a un tipo de actor sin mirar su nombre.
 *
 * Va antes que la búsqueda por texto y no después, y esto importa: la
 * Comisión de Industria, Turismo y Comercio del Congreso lleva la palabra
 * "Industria" en el nombre, y buscando por texto acabaría precargando
 * Castellana 160 para una reunión que se celebra en la Carrera de San
 * Jerónimo. El tipo del actor es un dato seguro; su nombre, no.
 */
const SEDE_POR_KIND = {
  diputado: 'congreso',
  asesor: 'congreso',
  'asesor-parlamentario': 'congreso',
  grupo: 'congreso',
  'grupo-parlamentario': 'congreso',
  comision: 'congreso',
  eurodiputado: 'parlamento-europeo',
  'comision-eu': 'parlamento-europeo',
  'comision-ue': 'parlamento-europeo',
  comisario: 'comision-europea',
  direccion: 'comision-europea',
  'direccion-general-ue': 'comision-europea',
  'persona-comision-ue': 'comision-europea',
};

/**
 * Qué tipos de actor admiten búsqueda por texto.
 *
 * Deliberadamente corto. Una organización llamada "Asociación Española de
 * la Industria..." no se reúne en el Ministerio de Industria, y dejarla
 * entrar aquí pondría esa dirección en su acta. Solo los actores que SON
 * administración buscan por nombre.
 */
const KINDS_POR_TEXTO = new Set(['cargo', 'alto-cargo', 'miembro-gobierno', 'organismo']);

/** Minúsculas y sin tildes, igual que el resto de buscadores de la casa. */
function normalizar(t) {
  return (t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * La sede de un actor, o null si no se sabe.
 *
 * Recibe el actor tal y como lo guarda `project_actors`: con su `kind`,
 * su `nombre` y la `descripcion` que viene del directorio, que es donde
 * suele estar el ministerio del que cuelga el cargo.
 *
 * Cuando hay varias claves que encajan gana la más larga, no la primera
 * declarada: "trabajo y economia social" debe ganarle a "economia" pase
 * lo que pase con el orden del objeto.
 */
export function sedeDeActor(actor) {
  if (!actor) return null;

  const porKind = SEDE_POR_KIND[actor.kind];
  if (porKind) {
    const s = SEDES[porKind];
    return s && s.direccion ? s : null;
  }

  if (!KINDS_POR_TEXTO.has(actor.kind)) return null;

  const texto = normalizar(`${actor.nombre || ''} ${actor.descripcion || ''}`);
  if (!texto.trim()) return null;

  let mejor = null;
  let largo = 0;
  for (const sede of Object.values(SEDES)) {
    if (!sede.direccion) continue;
    for (const clave of sede.claves) {
      if (clave.length > largo && texto.includes(clave)) {
        mejor = sede;
        largo = clave.length;
      }
    }
  }
  return mejor;
}

/**
 * La dirección a precargar dada la lista de participantes de una
 * actividad, o null.
 *
 * Manda el primero que se marcó y que tenga sede conocida. En una reunión
 * con gente de dos instituciones hay que elegir una, y el orden en que se
 * marcaron es la única pista que ha dado el usuario.
 */
export function direccionDeParticipantes(participantes, actores) {
  if (!Array.isArray(participantes) || participantes.length === 0) return null;
  const porId = new Map((actores || []).map((a) => [a.id, a]));

  for (const p of participantes) {
    if (p.es_propio) continue;
    if (p.kind !== 'project_actor') continue;
    const actor = porId.get(p.ref_id);
    if (!actor) continue;
    const sede = sedeDeActor(actor);
    if (sede) return sede.direccion;
  }
  return null;
}

export { SEDES };
