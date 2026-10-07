// Filtros del buscador de Contactos: constantes y normalización. Sin nada
// de servidor, para poder usarlo también en el navegador (la página de
// Contactos). La parte de IA está en lib/contactos.js.

export const TIPOS_INSTITUCION = [
  'ejecutivo', 'legislativo', 'autonómico', 'local', 'institucional', 'sector público',
  'medios', 'partidos', 'agentes sociales', 'tercer sector', 'internacional', 'diplomático', 'órganos UE',
];

export const BANDAS = {
  electo: 'Electo',
  alta_direccion: 'Alta dirección',
  direccion: 'Dirección',
  subdireccion: 'Subdirección',
  mando_intermedio: 'Mando intermedio',
  tecnico: 'Técnico',
  otro: 'Otros',
};

export const FILTROS_VACIOS = {
  terminos: [],
  cargos: [],
  instituciones: [],
  unidades: [],
  jurisdiccion: null,
  tipos: [],
  bandas: [],
  paises: [],
  solo_titulares: false,
  provincia: null,
  con_contacto: false,
};

const lista = (v, max = 12) =>
  Array.isArray(v)
    ? [...new Set(v.map((x) => String(x || '').trim().slice(0, 80)).filter(Boolean))].slice(0, max)
    : [];

/** Limpia y acota unos filtros (vengan de la IA o del navegador). */
export function normalizarFiltros(f = {}) {
  return {
    terminos: lista(f.terminos, 6),
    cargos: lista(f.cargos),
    instituciones: lista(f.instituciones),
    unidades: lista(f.unidades),
    jurisdiccion: ['España', 'UE'].includes(f.jurisdiccion) ? f.jurisdiccion : null,
    tipos: lista(f.tipos).filter((t) => TIPOS_INSTITUCION.includes(t)),
    bandas: lista(f.bandas).filter((b) => b in BANDAS),
    paises: lista(f.paises, 30).map((x) => x.toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)),
    solo_titulares: f.solo_titulares === true,
    provincia: f.provincia ? String(f.provincia).trim().slice(0, 60) || null : null,
    con_contacto: f.con_contacto === true,
  };
}

export function filtrosVacios(f) {
  const n = normalizarFiltros(f);
  return (
    !n.terminos.length && !n.cargos.length && !n.instituciones.length && !n.unidades.length &&
    !n.jurisdiccion && !n.tipos.length && !n.bandas.length && !n.paises.length && !n.solo_titulares && !n.provincia && !n.con_contacto
  );
}

/** Búsqueda de reserva cuando la IA no está: la frase como términos. */
export function filtrosDeTexto(consulta) {
  const palabras = String(consulta || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3)
    .slice(0, 4);
  return { ...FILTROS_VACIOS, terminos: palabras };
}
