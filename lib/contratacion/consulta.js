/**
 * La consulta de Licitaciones, compartida por la página y por el modal
 * «Nueva búsqueda» (que cuenta y enseña ejemplos con los mismos filtros).
 * Un solo sitio para que el número del modal y el de la lista coincidan.
 */

import { ADJUDICADAS, EN_PLAZO, PROCEDIMIENTOS, TIPOS, codigos } from '@/lib/contratacion/etiquetas';

export const ANUNCIOS_PREVIOS = ['PRE', 'planning'];

export const FILTROS_VACIOS = {
  publicadas24: false,
  actualizadas24: false,
  ocultarSeguidas: false,
  previos: false,
  ambitos: [],
  sectores: [],
  territorios: [],
  organo: '',
  adjudicatario: '',
  tipos: [],
  procedimientos: [],
  importeMin: '',
  importeMax: '',
  finDesde: '',
  finHasta: '',
};

// La hora de Madrid en el formato de fin_ofertas (timestamp sin zona).
export function ahoraMadrid() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date())
    .replace(' ', 'T');
}

// Lo que se escribe va dentro de un filtro or() de PostgREST: fuera las
// comas, puntos, paréntesis y comodines.
export function limpiar(t) {
  return String(t || '')
    .replace(/[,.()*%\\:"]/g, ' ')
    .trim();
}

/**
 * Devuelve la consulta con los filtros aplicados, sin orden ni rango.
 * - columnas: lo que se selecciona.
 * - opciones de select: { count: 'exact' }, { count: 'exact', head: true }…
 * - ocultas: ids que no se enseñan (descartadas y, si se pide, seguidas).
 */
export function consultaLicitaciones(supabase, { columnas, opciones, pestana, busqueda = '', f, expediente, ocultas = [] }) {
  const conAdjudicatario = limpiar(f.adjudicatario);
  // Filtrar por quién ha ganado necesita la tabla de adjudicaciones:
  // unión interna, sin personas físicas (autónomos).
  const sel = conAdjudicatario ? `${columnas}, contratacion_adjudicaciones!inner(adjudicatario)` : columnas;
  let q = supabase.from('contratacion_expedientes').select(sel, opciones).eq('eliminado', false).eq('es_menor', expediente === 'menores');

  // Varias condiciones «o» a la vez (plazo, cada palabra, territorio)
  // tienen que cumplirse todas: se juntan en un solo or(and(...)).
  const oes = [];

  if (f.previos) {
    q = q.in('estado', ANUNCIOS_PREVIOS);
  } else if (pestana === 'plazo') {
    // fin_orden = fin_ofertas, o infinito si no tiene fecha (sql/130):
    // un rango sobre un índice parcial, en vez de un «o» que obligaba a
    // leer toda la tabla.
    q = q.in('estado', EN_PLAZO).gte('fin_orden', ahoraMadrid());
  } else if (pestana === 'adjudicaciones') {
    q = q.in('estado', ADJUDICADAS);
  }

  for (const palabra of limpiar(busqueda)
    .split(/\s+/)
    .filter((p) => p.length > 1)
    .slice(0, 6)) {
    oes.push(`titulo.ilike.*${palabra}*,organo_nombre.ilike.*${palabra}*,expediente.ilike.*${palabra}*`);
  }

  const dia = new Date(Date.now() - 864e5).toISOString();
  if (f.publicadas24) q = q.gte('detectado_en', dia);
  if (f.actualizadas24) q = q.gte('actualizado_fuente', dia);
  // Con las dos marcadas (o ninguna) no hace falta filtrar.
  if (f.ambitos?.length === 1) q = q.eq('ambito', f.ambitos[0]);
  if (f.sectores.length) q = q.overlaps('cpv_div', f.sectores);
  if (f.territorios.length) oes.push(f.territorios.map((t) => `nuts.ilike.${t}*`).join(','));
  const organo = limpiar(f.organo);
  if (organo) q = q.ilike('organo_nombre', `%${organo}%`);
  if (conAdjudicatario) {
    q = q.ilike('contratacion_adjudicaciones.adjudicatario', `%${conAdjudicatario}%`).eq('contratacion_adjudicaciones.persona_fisica', false);
  }
  if (f.tipos.length) q = q.in('tipo', codigos(TIPOS, f.tipos));
  if (f.procedimientos.length) q = q.in('procedimiento', codigos(PROCEDIMIENTOS, f.procedimientos));
  if (f.importeMin !== '' && !Number.isNaN(Number(f.importeMin))) q = q.gte('importe_sin_iva', Number(f.importeMin));
  if (f.importeMax !== '' && !Number.isNaN(Number(f.importeMax))) q = q.lte('importe_sin_iva', Number(f.importeMax));
  if (f.finDesde) q = q.gte('fin_ofertas', `${f.finDesde}T00:00:00`);
  if (f.finHasta) q = q.lte('fin_ofertas', `${f.finHasta}T23:59:59`);

  if (oes.length === 1) q = q.or(oes[0]);
  else if (oes.length > 1) q = q.or(`and(${oes.map((o) => `or(${o})`).join(',')})`);

  if (ocultas.length) q = q.not('id', 'in', `(${ocultas.map((i) => `"${i}"`).join(',')})`);
  return q;
}
