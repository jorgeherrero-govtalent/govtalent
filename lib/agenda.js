// =====================================================================
// AGENDA DEL GOBIERNO — lectura de la agenda diaria de La Moncloa
// lib/agenda.js
//
// La Moncloa publica cada día una página con los actos del presidente,
// los vicepresidentes y los ministros:
//   https://www.lamoncloa.gob.es/gobierno/agenda/Paginas/agenda.aspx?d=AAAAMMDD
//
// Por cada miembro del Gobierno: su nombre (encabezado), su cargo y una
// lista de actos. Cada acto lleva la hora («12:30 h.»), el texto y, a
// veces, notas: la cobertura («Cobertura gráfica.») o la hora local si
// es en el extranjero («09:30 hora local.»). Un acto sin hora es una
// nota del día («Viaja a EE.UU.»).
//
// No hay API ni RSS y el marcado es de SharePoint. Igual que en el
// Consejo de Ministros (lib/consejo.js), el parser trabaja sobre una
// versión en líneas del HTML (encabezados, elementos de lista y
// párrafos) y no sobre clases CSS. Un día sin actos dice «No se han
// encontrado eventos»; si una página no dice eso y el parser no saca
// nada, es que ha cambiado el marcado y el sync lo marca como error.
//
// Lo que sale de aquí es la agenda ANUNCIADA: puede cambiar durante el
// día y no garantiza que el acto se celebre.
//
// Solo servidor.
// =====================================================================

import { createHash } from 'node:crypto';
import { decodificar, normalizar } from '@/lib/consejo';

export const BASE = 'https://www.lamoncloa.gob.es';

/** La URL de la agenda de un día (AAAA-MM-DD). */
export function urlAgenda(fecha) {
  return `${BASE}/gobierno/agenda/Paginas/agenda.aspx?d=${String(fecha).replace(/-/g, '')}`;
}

// ---------------------------------------------------------------------
// HTML → líneas
// ---------------------------------------------------------------------

const limpio = (t) => decodificar(String(t || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Marca de una línea horizontal (<hr>): separa el contenido del pie.
const HR = '\u0005HR';

/**
 * El HTML convertido en líneas con su tipo: H (encabezado, con nivel),
 * LI (elemento de lista), P (párrafo o bloque) o HR.
 *
 * Se quitan antes cabecera, pie, menús y barras laterales: también
 * tienen listas y párrafos, y el último acto del día no debe acabar con
 * la dirección de La Moncloa pegada.
 */
export function lineas(html) {
  let h = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(script|style)[\s\S]*$/i, ' ');

  const main = h.match(/<main[\s\S]*?<\/main>/i);
  if (main) h = main[0];

  h = h
    .replace(/<(header|footer|nav|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<hr[^>]*>/gi, `\n${HR}\n`)
    .replace(/<h([1-6])[^>]*>/gi, '\n\u0001H$1\u0002')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n\u0001LI\u0002')
    .replace(/<\/li>/gi, '\n')
    .replace(/<(p|div|tr|section|article|ul|ol|dl|dt|dd|table)[^>]*>/gi, '\n\u0001P\u0002')
    .replace(/<\/(p|div|tr|section|article|ul|ol|dl|dt|dd|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n\u0001P\u0002');

  const salida = [];
  for (const cruda of h.split('\n')) {
    if (cruda.trim() === HR) {
      salida.push({ tipo: 'HR', nivel: null, texto: '' });
      continue;
    }
    const m = cruda.match(/^\s*\u0001(H[1-6]|LI|P)\u0002([\s\S]*)$/);
    const tipo = m ? m[1] : 'P';
    const texto = limpio((m ? m[2] : cruda).replace(/[\u0001-\u0005]/g, ' '));
    if (!texto) continue;
    salida.push({ tipo: tipo.startsWith('H') ? 'H' : tipo, nivel: tipo.startsWith('H') ? Number(tipo[1]) : null, texto });
  }
  return salida;
}

// ---------------------------------------------------------------------
// Reconocer cada pieza
// ---------------------------------------------------------------------

// Un cargo del Gobierno. Es lo que distingue el encabezado de un
// miembro del Gobierno de cualquier otro encabezado de la página.
const CARGO = /\b(president[ae]|vicepresident[ae]|ministr[oa]|portavoz)\b/i;

// «12:30 h.», «9.30 h», «12:30 horas». La hora y lo que venga detrás.
const HORA = /^(\d{1,2})[:.](\d{2})(?!\d)\s*(?:h\b\.?|horas?\b\.?)?\s*[-–:]?\s*([\s\S]*)$/i;

// Notas de un acto: cobertura, acceso de medios y hora local.
const NOTA =
  /^(cobertura\b|sin cobertura|abierto a (los )?medios|cerrado a (los )?medios|acceso\b|sin acceso|(solo |s[oó]lo )?(toma de )?im[aá]genes|retransmisi[oó]n|se(ñ|n)al\b|declaraciones\b|\(?\d{1,2}[:.]\d{2}\s*(h\.?\s*)?hora local|hora local)/i;

// Días sin actos públicos: ni son actos ni son un fallo.
const SIN_ACTOS = /^(sin actos|no hay actos|no se han encontrado eventos|no tiene actos)/i;

// Lo que hay debajo de la agenda. Si aparece, se deja de leer al miembro
// en curso: sin esto el pie acabaría pegado al último acto.
const PIE =
  /^(la moncloa$|complejo de la moncloa|este sitio web utiliza cookies|aceptar$|rechazar$|compartir\b|volver\b|imprimir\b|ir a (la )?agenda|agenda del gobierno\b|selecciona|buscar\b)/i;

/** «Carlos Cuerpo» + cargo → el miembro del Gobierno que es. */
export function emparejarMiembro(persona, cargo, miembros) {
  const nc = normalizar(cargo);
  if (nc) {
    const porCargo = miembros.find((m) => normalizar(m.role) === nc);
    if (porCargo) return porCargo;
  }
  // Por nombre: todas las palabras del nombre corto de la agenda están
  // en el nombre completo («Carlos Cuerpo» ⊂ «Carlos Cuerpo Caballero»).
  // Con al menos dos palabras: un apellido solo empareja mal.
  const palabras = normalizar(persona)
    .split(/[\s-]+/)
    .filter((p) => p.length > 1);
  if (palabras.length < 2) return null;
  const candidatos = miembros.filter((m) => {
    const suyas = new Set(normalizar(m.full_name).split(/[\s-]+/));
    return palabras.every((p) => suyas.has(p));
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}

/** Identificador estable: el mismo acto leído dos veces es la misma fila. */
export function idActo(fecha, quien, hora, texto) {
  const h = createHash('sha1')
    .update(`${fecha}|${normalizar(quien)}|${hora || ''}|${normalizar(texto)}`)
    .digest('hex');
  return `${String(fecha).replace(/-/g, '')}-${h.slice(0, 10)}`;
}

// Diferencia entre Madrid y UTC en un instante, en minutos.
function desfaseMadrid(fechaUtc) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(fechaUtc);
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const comoUtc = Date.UTC(Number(v.year), Number(v.month) - 1, Number(v.day), Number(v.hour), Number(v.minute));
  return Math.round((comoUtc - fechaUtc.getTime()) / 60000);
}

/** «2026-09-25» y «12:30» en hora de Madrid → instante ISO. */
export function inicioMadrid(fecha, hora) {
  const m = String(hora || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [y, mes, d] = String(fecha).split('-').map(Number);
  const aproximado = new Date(Date.UTC(y, mes - 1, d, Number(m[1]), Number(m[2])));
  const desfase = desfaseMadrid(aproximado);
  return new Date(aproximado.getTime() - desfase * 60000).toISOString();
}

/**
 * «Mantiene una reunión…» → «mantiene una reunión…», para escribir
 * «Carlos Cuerpo mantiene una reunión…». Solo si la segunda letra es
 * minúscula: una sigla o un nombre propio al principio se respetan.
 */
function enMinuscula(texto) {
  const t = String(texto || '');
  if (t.length > 1 && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(t)) return t[0].toLowerCase() + t.slice(1);
  return t;
}

// Actos que la agenda escribe con un sustantivo y no con un verbo
// («Rueda de prensa en…»). Con estos no se puede escribir «Luis Planas
// rueda de prensa…»: se separan con dos puntos.
const EMPIEZA_SUSTANTIVO =
  /^(rueda|entrevista|reunion|acto|consejo|comparecencia|encuentro|viaje|pleno|declaracion|declaraciones|intervencion|sesion|visita oficial|audiencia|cumbre|conferencia|jornada|foro|almuerzo|cena|desayuno|firma de|entrega de|inauguracion|clausura|presentacion|homenaje|funeral|recepcion|comision|asamblea|mesa|toma de posesion)\b/;

/** El titular de un acto: quién y qué, en una frase. */
export function tituloActo(persona, texto) {
  const t = String(texto || '').trim();
  // Con dos puntos también lo que no empieza por una palabra corriente
  // («SM el Rey…», «AVE Madrid-Sevilla…»): pasarlo a minúscula lo rompería.
  const verbo = !EMPIEZA_SUSTANTIVO.test(normalizar(t)) && enMinuscula(t) !== t;
  const frase = verbo ? `${persona} ${enMinuscula(t)}` : `${persona}: ${t}`;
  return frase.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------
// Una página de la agenda
// ---------------------------------------------------------------------

/**
 * Los actos de la agenda de un día.
 *
 * Recorre las líneas. Un encabezado seguido de un cargo del Gobierno
 * abre un miembro; cualquier otro encabezado, una línea horizontal o el
 * pie de la página lo cierran. Dentro de un miembro:
 *   · una línea que empieza por la hora abre un acto;
 *   · un elemento de lista sin hora es un acto sin hora («Viaja a…»);
 *   · un párrafo es el texto del acto si aún no lo tiene, una nota si
 *     parece una nota, o la continuación del texto si no.
 *
 * `miembros` son las filas de government_members (slug, full_name,
 * role), para enlazar cada acto con su ficha.
 *
 * Devuelve { actos, vacio, diagnostico }. `vacio` es true cuando la
 * página dice expresamente que no hay actos.
 */
export function actosDeAgenda(html, { fecha, url }, miembros = []) {
  const ls = lineas(html);
  const vacio = ls.some((l) => /no se han encontrado eventos/i.test(l.texto));

  const actos = [];
  let persona = null; // { nombre, cargo, miembro }
  let esperandoCargo = false;
  let acto = null;

  const cerrarMiembro = () => {
    persona = null;
    esperandoCargo = false;
    acto = null;
  };

  const nuevoActo = (hora, texto) => {
    acto = { hora, texto: texto || '', notas: [] };
    actos.push({ persona, acto });
  };

  for (let k = 0; k < ls.length; k++) {
    const l = ls[k];

    if (l.tipo === 'HR') {
      cerrarMiembro();
      continue;
    }

    if (l.tipo === 'H') {
      cerrarMiembro();
      // El cargo puede ir dentro del mismo encabezado («Pedro Sánchez
      // Presidente del Gobierno») o en la línea siguiente.
      const dentro = l.texto.match(/^(.+?)\s+((?:El |La )?(?:President[ae]|Vicepresident[ae]|Ministr[oa]|Portavoz)\b.*)$/);
      if (dentro && !CARGO.test(dentro[1])) {
        persona = { nombre: dentro[1].trim(), cargo: dentro[2].trim() };
      } else if (!CARGO.test(l.texto) && l.texto.split(' ').length <= 6) {
        const sig = ls[k + 1];
        if (sig && sig.tipo !== 'H' && sig.tipo !== 'HR' && CARGO.test(sig.texto) && !HORA.test(sig.texto)) {
          persona = { nombre: l.texto.trim(), cargo: null };
          esperandoCargo = true;
        }
      }
      if (persona) persona.miembro = null;
      continue;
    }

    if (!persona) continue;
    if (PIE.test(l.texto)) {
      cerrarMiembro();
      continue;
    }

    if (esperandoCargo) {
      persona.cargo = l.texto.trim();
      esperandoCargo = false;
      continue;
    }

    const h = l.texto.match(HORA);
    if (h && Number(h[1]) < 24 && Number(h[2]) < 60 && !/hora local/i.test(l.texto)) {
      nuevoActo(`${h[1].padStart(2, '0')}:${h[2]}`, h[3].trim());
      continue;
    }

    if (SIN_ACTOS.test(l.texto)) continue;

    if (l.tipo === 'LI') {
      // Un elemento de lista sin hora: un acto sin hora, salvo que sea
      // una nota del acto anterior.
      if (acto && NOTA.test(l.texto)) acto.notas.push(l.texto);
      else nuevoActo(null, l.texto);
      continue;
    }

    // Párrafo
    if (!acto) {
      // Texto suelto antes de cualquier acto: se trata como acto sin hora.
      nuevoActo(null, l.texto);
      continue;
    }
    if (!acto.texto) acto.texto = l.texto;
    else if (NOTA.test(l.texto)) acto.notas.push(l.texto);
    else if (acto.notas.length === 0 && acto.texto.length + l.texto.length < 1200) acto.texto = `${acto.texto} ${l.texto}`;
    else acto.notas.push(l.texto);
  }

  // Filas definitivas
  const filas = [];
  const ya = new Set();
  const porPersona = new Map();
  for (const { persona: p, acto: a } of actos) {
    const texto = a.texto.replace(/\s+([.,;:])/g, '$1').trim();
    if (!texto || SIN_ACTOS.test(texto)) continue;
    if (p.miembro === null) p.miembro = emparejarMiembro(p.nombre, p.cargo, miembros) || undefined;
    const quien = p.miembro?.slug || p.nombre;
    const id = idActo(fecha, quien, a.hora, texto);
    if (ya.has(id)) continue;
    ya.add(id);
    const orden = (porPersona.get(quien) || 0) + 1;
    porPersona.set(quien, orden);
    const notas = [...new Set(a.notas.map((n) => n.trim()))].slice(0, 6);
    filas.push({
      id,
      fecha,
      hora: a.hora,
      inicio: a.hora ? inicioMadrid(fecha, a.hora) : null,
      persona: p.nombre.slice(0, 200),
      cargo: p.cargo ? p.cargo.slice(0, 300) : null,
      miembro_slug: p.miembro?.slug || null,
      texto: texto.slice(0, 2000),
      titulo: tituloActo(p.nombre, texto).slice(0, 2000),
      notas,
      cobertura: notas.find((n) => /cobertura|medios|acceso|im[aá]genes/i.test(n)) || null,
      orden,
      agenda_url: url,
    });
  }

  return {
    actos: filas,
    vacio,
    diagnostico: {
      lineas: ls.length,
      personas: new Set(actos.map((x) => x.persona.nombre)).size,
      sin_miembro: [...new Set(filas.filter((f) => !f.miembro_slug).map((f) => f.persona))],
      muestra: ls.slice(0, 60).map((l) => `${l.tipo}${l.nivel || ''}: ${l.texto.slice(0, 120)}`),
    },
  };
}

// ---------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «2026-09-25» → «jueves 25/09». */
export function diaTexto(fecha) {
  const [y, m, d] = String(fecha).split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
