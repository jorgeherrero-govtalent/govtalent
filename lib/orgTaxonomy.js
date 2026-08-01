// Listas cerradas de tipo y sector de organización — mantener sincronizado
// con el ENUM de la base de datos (org_type, org_sector).
// Usar siempre desde aquí en vez de repetir la lista en cada página.

export const ORG_TYPES = [
  ['empresa', 'Empresa'],
  ['empresa_publica', 'Empresa pública'],
  ['consultora_public_affairs', 'Consultora de Public Affairs'],
  ['asociacion_profesional', 'Asociación profesional'],
  ['sindicato', 'Sindicato'],
  ['tercer_sector_ong', 'Organización del tercer sector / ONG'],
  ['institucion_publica', 'Institución pública (AAPP, Parlamento, Institución europea)'],
  ['partido_politico', 'Partido político'],
  ['think_tank_fundacion', 'Think tank / Fundación'],
  ['universidad_centro_educativo', 'Universidad / Institución académica'],
  ['medios_comunicacion', 'Medios y comunicación'],
  ['otro', 'Otro'],
];

export const TYPE_LABELS = Object.fromEntries(ORG_TYPES);

export const SECTORS = [
  ['energia_clima', 'Energía y clima'],
  ['telecomunicaciones', 'Telecomunicaciones'],
  ['tecnologia_digital', 'Tecnología y digital'],
  ['audiovisual_medios', 'Audiovisual y medios de comunicación'],
  ['transporte_movilidad', 'Transporte y movilidad'],
  ['logistica_postal', 'Logística y sector postal'],
  ['farmaceutico_salud', 'Farmacéutico y salud'],
  ['financiero_banca_seguros', 'Financiero, banca y seguros'],
  ['alimentacion_bebidas', 'Alimentación y bebidas'],
  ['bebidas_espirituosas', 'Bebidas espirituosas'],
  ['tabaco', 'Tabaco'],
  ['juego', 'Juego'],
  ['agricultura_ganaderia_pesca', 'Agricultura, ganadería y pesca'],
  ['construccion_inmobiliario', 'Construcción e inmobiliario'],
  ['industria_manufactura', 'Industria y manufactura'],
  ['automocion', 'Automoción'],
  ['quimica_materiales', 'Química y materiales'],
  ['gran_distribucion_retail', 'Gran distribución y retail'],
  ['turismo_hosteleria', 'Turismo y hostelería'],
  ['cultura', 'Cultura'],
  ['ocio_entretenimiento', 'Ocio y entretenimiento'],
  ['medio_ambiente_sostenibilidad', 'Medio ambiente y sostenibilidad'],
  ['educacion', 'Educación'],
  ['defensa_seguridad', 'Defensa y seguridad'],
  ['servicios_profesionales_juridicos', 'Servicios profesionales y jurídicos'],
  ['deporte', 'Deporte'],
  ['tercer_sector_accion_social', 'Tercer sector y acción social'],
  ['sector_publico_administracion', 'Sector público / administración'],
  ['otro', 'Otro'],
];

export const SECTOR_LABELS = Object.fromEntries(SECTORS);
