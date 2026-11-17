// =====================================================================
// Actores del directorio — enlazar un nombre con su ficha
// lib/actoresDirectorio.js
//
// Un actor de un proyecto puede ser propio (nombre escrito a mano) o
// del directorio (kind + ref_id). Solo el del directorio trae su foto o
// su logotipo, su ficha y sus avisos. Cuando quien añade al actor no es
// la pantalla, que elige una fila de `actor_search`, sino un asistente,
// que solo sabe cómo se llama, aquí se busca a quién corresponde.
//
// LA REGLA: se enlaza solo si el nombre es el mismo, palabra por
// palabra, sin importar el orden ni las tildes («Sayas López, Sergio»
// y «Sergio Sayas López»). Es la misma comparación que clave_persona()
// en la base. Un apellido suelto o un nombre parecido NO enlazan: un
// enlace mal puesto le pone a un actor la cara de otro.
// =====================================================================

const sinTildes = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const palabrasDe = (t) => sinTildes(t).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/** Las palabras del nombre, sin tildes y en orden alfabético. */
export function clavePersona(nombre) {
  return palabrasDe(nombre).sort().join(' ');
}

// Para el ilike: cada letra que puede llevar tilde (o ser ñ, ç) se
// cambia por «_», que vale por un carácter cualquiera. Así «Ines»
// encuentra «Inés» sin depender de una extensión de la base.
function patron(palabra) {
  return `%${palabra.replace(/[aeioucn]/g, '_')}%`;
}

// Cuántas palabras con significado comparten dos textos: sirve para
// elegir entre dos fichas de la misma persona (ministro y, a la vez,
// encargado de otro ministerio) la que cuadra con el cargo indicado.
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'para', 'por', 'a']);
function parecido(a, b) {
  const pa = new Set(palabrasDe(a).filter((p) => !VACIAS.has(p)));
  let n = 0;
  for (const p of new Set(palabrasDe(b))) if (pa.has(p)) n += 1;
  return n;
}

const COLUMNAS = 'kind, ref_id, nombre, detalle, imagen, familia, orden_tipo';

/**
 * La ficha del directorio que corresponde a un nombre, o null.
 *
 * `pista` es el cargo o la institución que se conoce del actor: solo se
 * usa para desempatar entre varias fichas con el mismo nombre. A
 * igualdad, gana la que tiene foto.
 */
export async function actorDelDirectorio(cliente, nombre, pista) {
  const clave = clavePersona(nombre);
  const palabras = palabrasDe(nombre);
  if (!clave || !palabras.length) return null;

  // Se filtra en la base por las dos palabras más largas (las que más
  // distinguen) y la igualdad exacta se comprueba aquí.
  const largas = [...new Set(palabras)].sort((a, b) => b.length - a.length).slice(0, 2);
  let q = cliente.from('actor_search').select(COLUMNAS).order('orden_tipo').limit(60);
  for (const p of largas) q = q.ilike('nombre', patron(p));
  const { data, error } = await q;
  if (error || !data?.length) return null;

  const iguales = data.filter((f) => f.kind && f.ref_id && clavePersona(f.nombre) === clave);
  if (!iguales.length) return null;

  iguales.sort((a, b) => {
    const porPista = pista ? parecido(b.detalle, pista) - parecido(a.detalle, pista) : 0;
    if (porPista) return porPista;
    const porFoto = (b.imagen ? 1 : 0) - (a.imagen ? 1 : 0);
    if (porFoto) return porFoto;
    return (a.orden_tipo || 99) - (b.orden_tipo || 99);
  });

  const elegida = iguales[0];
  // La foto no cuelga siempre de la ficha elegida: un ministro tiene
  // foto en la del Gobierno y no en la del organismo que preside. Si es
  // la misma persona (mismo nombre, familia «persona»), se aprovecha.
  const foto =
    elegida.imagen ||
    (elegida.familia === 'persona' ? iguales.find((f) => f.familia === 'persona' && f.imagen)?.imagen : null) ||
    null;
  return { ...elegida, imagen: foto };
}

// Los tipos que no son personas, como los nombra el asistente.
export const TIPOS_ORGANIZACION = {
  organizacion: 'Organización',
  grupo: 'Grupo parlamentario',
  comision: 'Comisión del Congreso',
  'comision-eu': 'Comisión del Parlamento Europeo',
  direccion: 'Dirección general de la Comisión Europea',
  'unidad-age': 'Ministerio, organismo o unidad de la Administración General del Estado',
};

/**
 * Organizaciones y órganos por nombre: patronales, empresas,
 * asociaciones, grupos parlamentarios, comisiones y ministerios. Lo
 * mismo que ofrece el buscador de actores de la pantalla del proyecto.
 */
export async function buscarOrganizacionesPorNombre(cliente, consulta, max = 10) {
  const palabras = palabrasDe(consulta).filter((p) => p.length > 1 && !VACIAS.has(p)).slice(0, 5);
  if (!palabras.length) return [];
  let q = cliente
    .from('actor_search')
    .select(COLUMNAS)
    .in('kind', Object.keys(TIPOS_ORGANIZACION))
    .order('orden_tipo')
    .limit(max);
  for (const p of palabras) q = q.ilike('nombre', patron(p));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}
