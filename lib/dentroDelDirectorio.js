// Antes de buscar fuera, mirar dentro (17-11-2026, decisión de Jorge).
//
// «El correo de una persona concreta» recibe un nombre y una organización
// escritos a mano. Antes de gastar créditos se comprueba si esa persona ya
// está en el directorio, aunque el nombre venga incompleto («Emilia
// Sánchez» por «Emilia Sánchez Prieto») o la organización con otro nombre
// («Asamblea de Madrid» por «Asamblea de la Comunidad de Madrid»).
//
// El caso que lo motivó: «Emilia Sánchez, Asamblea de Madrid» cobró 6
// créditos por un correo deducido y equivocado cuando en el directorio
// había dos diputadas con ese nombre y su correo oficial.
//
// Solo servidor.

import { limpiar } from '@/lib/patronesCorreo';
import { correosProbables, puedeVerProbables } from '@/lib/correosProbables';

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'i', 'da', 'das', 'do', 'dos', 'di', 'van', 'von', 'der', 'le']);

// Como mucho, las que caben en el modal. Con más coincidencias el nombre es
// demasiado común para elegir: se enseñan las primeras.
export const MAX_DENTRO = 5;

/** Palabras con significado, sin tildes ni partículas («Sánchez-Pantoja» son dos). */
export function palabras(texto) {
  return limpiar(texto)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !PARTICULAS.has(w));
}

const siglas = (ps) => ps.map((w) => w[0]).join('');

/** ¿Todas las palabras del nombre escrito están en el nombre de la fila? */
export function mismoNombre(escrito, nombreFila) {
  const fila = new Set(palabras(nombreFila));
  return escrito.length >= 2 && escrito.every((w) => fila.has(w));
}

/**
 * ¿La organización escrita es la de la fila? Vale que una contenga a la
 * otra («Asamblea de Madrid» dentro de «Asamblea de la Comunidad de
 * Madrid»), que aparezca en su unidad o su cargo («Más Madrid»), o que sean
 * sus siglas («CNMC»).
 */
export function mismaOrganizacion(escrita, fila) {
  if (!escrita.length) return false;
  const inst = palabras(fila.institucion);
  const todo = new Set([...inst, ...palabras(fila.unidad), ...palabras(fila.cargo)]);
  if (escrita.every((w) => todo.has(w))) return true;
  const set = new Set(escrita);
  if (inst.length && inst.every((w) => set.has(w))) return true;
  if (escrita.length === 1 && inst.length >= 2 && escrita[0] === siglas(inst)) return true;
  return false;
}

const primerCorreo = (v) =>
  String(v || '')
    .split(/[,;\s]+/)
    .map((x) => x.replace(/^mailto:/i, '').trim().toLowerCase())
    .find((x) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(x)) || null;

/**
 * Personas del directorio que coinciden con un nombre y una organización
 * escritos a mano. [] si no hay ninguna.
 * Cada una: { id, nombre, cargo, institucion, unidad, email, probable }.
 */
export async function buscarDentro(admin, nombre, institucion) {
  const escrito = [...new Set(palabras(nombre))];
  if (escrito.length < 2) return [];
  const org = [...new Set(palabras(institucion))];

  // Mismo filtro que el Buscador (sql/129): todas las palabras en la fila.
  const { data, error } = await admin.rpc('contactos_filtrados', { p_filtros: { terminos: escrito } }).limit(400);
  if (error) throw new Error(error.message);

  const conNombre = (data || []).filter((f) => mismoNombre(escrito, f.nombre));
  let filas = conNombre.filter((f) => mismaOrganizacion(org, f));
  // Sin coincidencia de organización (la habrá escrito de otra forma): si
  // el nombre es de muy pocas personas, se enseñan igualmente.
  if (!filas.length && conNombre.length <= 3) filas = conNombre;
  if (!filas.length) return [];

  // Una persona sale en varias fuentes: una sola vez, y mejor la fila que
  // trae correo. Primero las que más se parecen al nombre escrito.
  const sobran = (f) => palabras(f.nombre).length - escrito.length;
  filas.sort((a, b) => sobran(a) - sobran(b) || (a.email ? 0 : 1) - (b.email ? 0 : 1) || (a.orden ?? 1e9) - (b.orden ?? 1e9));
  const vistos = new Set();
  const unicas = [];
  for (const f of filas) {
    const correo = primerCorreo(f.email);
    const persona = `${[...new Set(palabras(f.nombre))].sort().join(' ')}|${palabras(f.institucion).join(' ')}`;
    if (vistos.has(persona) || (correo && vistos.has(correo))) continue;
    vistos.add(persona);
    if (correo) vistos.add(correo);
    unicas.push(f);
    if (unicas.length >= MAX_DENTRO) break;
  }

  // A quien no tiene correo publicado, el probable que enseña su ficha.
  const sinCorreo = unicas.filter((f) => !primerCorreo(f.email));
  const probables = sinCorreo.length && puedeVerProbables() ? await correosProbables(admin, sinCorreo).catch(() => ({})) : {};

  return unicas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    cargo: f.cargo || null,
    institucion: f.institucion || null,
    unidad: f.unidad || null,
    email: primerCorreo(f.email),
    probable: probables[f.id] || null,
  }));
}
