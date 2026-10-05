// Secciones del directorio que salen de la Agenda de la Comunicación
// (tablas directorio_entidades y directorio_contactos, sql/69) y, en el
// caso de las asociaciones sectoriales, de las organizaciones ya cargadas.
//
// Una sola lista para la página de Organizaciones, los listados y la ruta
// de datos: añadir una sección es añadir una entrada aquí.
//
// `cat` es el valor de directorio_entidades.categoria. Las asociaciones
// no tienen: salen de organizations (org_type = asociacion_profesional).

export const SECCIONES_DIRECTORIO = [
  // Bloque Organizaciones
  {
    slug: 'patronales',
    bloque: 'organizaciones',
    cat: 'patronal',
    titulo: 'Patronales',
    descripcion: 'CEOE, CEPYME, AEB y el resto de organizaciones empresariales.',
    unidad: 'organizaciones',
  },
  {
    slug: 'asociaciones',
    bloque: 'organizaciones',
    cat: null,
    titulo: 'Asociaciones sectoriales',
    descripcion: 'Federaciones y asociaciones de cada sector: digital, energía, farma, alimentación…',
    unidad: 'asociaciones',
  },
  {
    slug: 'sociedades-estatales',
    bloque: 'organizaciones',
    cat: 'sociedad_estatal',
    titulo: 'Sociedades estatales',
    descripcion: 'Aena, Correos, Navantia, Tragsa, el grupo SEPI y demás sociedades mercantiles estatales.',
    unidad: 'sociedades',
  },
  // Bloque Medios y actores sociales
  {
    slug: 'prensa',
    bloque: 'medios',
    cat: 'prensa',
    titulo: 'Prensa',
    descripcion: 'Agencias, diarios, medios digitales, revistas y grupos editores.',
    unidad: 'medios',
  },
  {
    slug: 'radio-television',
    bloque: 'medios',
    cat: 'radio_tv',
    titulo: 'Radio y televisión',
    descripcion: 'RTVE, autonómicas, Atresmedia, Mediaset y cadenas de radio con sus emisoras.',
    unidad: 'cadenas y corporaciones',
  },
  {
    slug: 'partidos',
    bloque: 'medios',
    cat: 'partido',
    titulo: 'Partidos políticos',
    descripcion: 'Partidos con representación parlamentaria: dirección y comunicación.',
    unidad: 'partidos',
  },
  {
    slug: 'sindicatos',
    bloque: 'medios',
    cat: 'sindicato',
    titulo: 'Sindicatos',
    descripcion: 'CCOO, UGT, CSIF, USO, CGT, ELA y CIG.',
    unidad: 'sindicatos',
  },
  {
    slug: 'ong',
    bloque: 'medios',
    cat: 'ong',
    titulo: 'ONG',
    descripcion: 'Organizaciones no gubernamentales y del tercer sector.',
    unidad: 'ONG',
  },
  {
    slug: 'organismos-internacionales',
    bloque: 'medios',
    cat: 'organismo_internacional',
    titulo: 'Organismos internacionales',
    descripcion: 'ACNUR, OMT, OIT, SEGIB y demás organismos con sede en España.',
    unidad: 'organismos',
  },
];

// Comunidades autónomas: no está en la página de Organizaciones sino en
// Instituciones, pero sale de las mismas tablas.
export const SECCION_CCAA = {
  slug: 'comunidades',
  cat: 'ccaa',
  titulo: 'Comunidades autónomas',
  descripcion: 'Gobierno, Parlamento y Tribunal Superior de Justicia de cada comunidad, Ceuta y Melilla.',
  unidad: 'instituciones',
};

export function seccionPorSlug(slug) {
  if (slug === SECCION_CCAA.slug) return SECCION_CCAA;
  return SECCIONES_DIRECTORIO.find((s) => s.slug === slug) || null;
}

export const FUENTE_AGENDA = 'Agenda de la Comunicación 2026-2027 (Secretaría de Estado de Comunicación, julio de 2026)';
