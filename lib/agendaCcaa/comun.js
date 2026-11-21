// =====================================================================
// AGENDAS DE LOS GOBIERNOS AUTONÓMICOS: piezas comunes
// lib/agendaCcaa/comun.js
//
// Cada comunidad publica su agenda a su manera (una página del día, una
// API, una lista con fichas…). Cada lector (madrid.js, cataluna.js,
// andalucia.js, valencia.js) devuelve los actos con la misma forma, la
// de la tabla agenda_ccaa_actos (sql/141):
//
//   { id, ccaa, fecha, hora, inicio, nivel, organo, persona, cargo,
//     titulo, texto, lugar, url, agenda_url, source_id }
//
// `nivel` dice quién protagoniza el acto:
//   presidente  el presidente de la comunidad
//   consejero   un consejero (y su equipo cuando la agenda no distingue)
//   alto_cargo  secretarios, directores generales y otros altos cargos
//   delegacion  delegaciones territoriales del gobierno en la provincia
// Las delegaciones se guardan, pero no entran en las alarmas (sql/141):
// son actos locales y metían ruido.
//
// Lo que sale de aquí es la agenda ANUNCIADA: puede cambiar durante el
// día y no garantiza que el acto se celebre.
//
// Solo servidor.
// =====================================================================

import { createHash } from 'node:crypto';
import { decodificar, normalizar } from '@/lib/consejo';
import { inicioMadrid } from '@/lib/agenda';

export { normalizar, inicioMadrid };

export const CCAA = {
  madrid: { nombre: 'Comunidad de Madrid', fuente: 'Agenda de la Comunidad de Madrid' },
  cataluna: { nombre: 'Cataluña', fuente: 'Agenda del Govern de Catalunya' },
  andalucia: { nombre: 'Andalucía', fuente: 'Agenda de la Junta de Andalucía' },
  valenciana: { nombre: 'Comunitat Valenciana', fuente: 'Agenda de la Generalitat Valenciana' },
};

export const NIVELES = ['presidente', 'consejero', 'alto_cargo', 'delegacion'];

/** Texto de un trozo de HTML: sin etiquetas, sin entidades y con los espacios juntos. */
export function textoPlano(html) {
  return decodificar(
    String(html || '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h\d)>/gi, ' ')
      // Las etiquetas de dentro de una frase (cursiva, negrita)
      // se quitan sin dejar hueco: «la jornada <em>X</em>.» no debe
      // quedar «la jornada X .».
      .replace(/<\/?(em|strong|b|i|u|sup|sub)\b[^>]*>/gi, '')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

/** Un id corto y estable a partir de un texto. */
export function huella(texto, n = 12) {
  return createHash('sha1').update(String(texto || '')).digest('hex').slice(0, n);
}

/**
 * La hora en «HH:MM». Acepta «10:30», «10.30», «10.30h», «10,30 horas»
 * y «9 h». Devuelve null si no hay hora o no es válida.
 */
export function horaNormal(t) {
  const m = String(t || '').match(/(\d{1,2})\s*(?:[:.,h]\s*(\d{2}))?\s*(?:h\b|horas?\b)?/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  // Un número suelto sin «h» ni minutos no es una hora («2026», «3»).
  if (!m[2] && !/h/i.test(m[0])) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Un titular en mayúsculas («EL VICECONSEJERO DE PRESIDENCIA INAUGURA…»)
 * se pasa a frase normal. Se pierden las mayúsculas de los nombres
 * propios, pero se lee mucho mejor y la IA lo entiende igual.
 */
export function sinMayusculas(t) {
  const s = String(t || '').trim();
  if (!s || /[a-záéíóúñüç]/.test(s)) return s;
  const bajo = s.toLowerCase();
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** «Sábado, 21 de noviembre de 2026» o «22 de noviembre de 2026» → «2026-11-21». */
export function fechaDeTexto(t) {
  const m = normalizar(t).match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (!m || !MESES[m[2]]) return null;
  return `${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** «21/11/2026» o «21.11.2026» → «2026-11-21». */
export function fechaDeNumeros(t) {
  const m = String(t || '').match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/**
 * Quién protagoniza el acto, sacado del arranque del texto: «La consejera
 * de Servicios Sociales, Familias e Igualdad, Loles López, asiste…» →
 * { cargo: 'Consejera de Servicios Sociales, Familias e Igualdad',
 *   persona: 'Loles López' }. Vale para castellano, catalán y valenciano.
 * Si el texto no empieza así, devuelve nulls.
 *
 * El cargo puede llevar comas dentro, así que se trocea por comas y la
 * persona es el primer tramo que parece un nombre (mayúsculas, de dos a
 * seis palabras) y va seguido de un tramo en minúscula, que es el verbo
 * («asiste», «participa», «clou»).
 */
export function personaDeTexto(texto) {
  const nada = { cargo: null, persona: null };
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const arranque = t.match(/^(?:El|La|L'|Els|Les)\s*/);
  if (!arranque) return nada;
  const tramos = t.slice(arranque[0].length).split(', ');
  // Sin «y» ni «e»: «Empresa y Trabajo Autónomo» es parte de un cargo, no
  // un nombre. La «i» sí: «Òscar Ordeig i Molist».
  const conector = /^(de|del|la|las|los|el|i|da|das|do|dos|van|von)$/i;
  const pareceNombre = (p) => {
    const palabras = p.trim().split(' ');
    if (palabras.length < 2 || palabras.length > 6) return false;
    return palabras.every((w) => conector.test(w) || /^[A-ZÁÉÍÓÚÑÇÀÈÒÜ][\p{L}'.-]*$/u.test(w)) && /^[A-ZÁÉÍÓÚÑÇÀÈÒ]/.test(p);
  };
  for (let k = 1; k < Math.min(tramos.length - 1, 6); k++) {
    const persona = tramos[k].trim();
    const sigue = tramos[k + 1] || '';
    if (!pareceNombre(persona) || !/^[a-zà-ÿ]/.test(sigue)) continue;
    const cargo = tramos.slice(0, k).join(', ').trim();
    if (!/(president|consejer|conseller|vicepresident|viceconsejer|secretari|director|delegad|portavoz|portaveu|comisionad)/i.test(cargo)) return nada;
    return { cargo: cargo.charAt(0).toUpperCase() + cargo.slice(1), persona };
  }
  return nada;
}

/** El nivel a partir del cargo, cuando la fuente no lo da. */
export function nivelDeCargo(cargo, porDefecto = 'consejero') {
  const c = normalizar(cargo);
  if (!c) return porDefecto;
  if (/^(delegad[oa]|delegat|delegada) (del gobierno|del govern|territorial|de la junta|provincial)/.test(c)) return 'delegacion';
  if (/^president[ae]? (de la|del|de la junta|de la generalitat|de la comunidad)/.test(c)) return 'presidente';
  if (/^(vicepresident|consejer|conseller|consellera)/.test(c)) return 'consejero';
  if (/^(viceconsejer|secretari|director|directora|comisionad|portavoz|portaveu)/.test(c)) return 'alto_cargo';
  return porDefecto;
}

/** Recorta y limpia una fila antes de guardarla. */
export function fila(ccaa, a) {
  const hora = a.hora || null;
  return {
    id: a.id,
    ccaa,
    fecha: a.fecha,
    hora,
    inicio: hora ? inicioMadrid(a.fecha, hora) : null,
    nivel: NIVELES.includes(a.nivel) ? a.nivel : 'consejero',
    // Sin órgano, el cargo («Consejera de Cultura, Patrimonio…») dice lo mismo.
    organo: a.organo || a.cargo ? String(a.organo || a.cargo).slice(0, 300) : null,
    persona: a.persona ? String(a.persona).slice(0, 200) : null,
    cargo: a.cargo ? String(a.cargo).slice(0, 300) : null,
    titulo: String(a.titulo || a.texto || '').slice(0, 1000),
    texto: a.texto ? String(a.texto).slice(0, 3000) : null,
    lugar: a.lugar ? String(a.lugar).slice(0, 500) : null,
    url: a.url || null,
    agenda_url: a.agenda_url,
    source_id: a.source_id ? String(a.source_id) : null,
  };
}
