// =====================================================================
// Lector de las candidaturas que publica el BOE (sql/83).
//
// Un solo documento con las 52 circunscripciones (p. ej. BOE-A-2023-14733
// para el 23J): por cada una, «JUNTA ELECTORAL DE <PROVINCIA>», un
// párrafo de certificación, «CONGRESO DE LOS DIPUTADOS» y «SENADO». Cada
// candidatura va numerada con el nombre en mayúsculas y las siglas entre
// paréntesis; debajo, los titulares numerados y, tras «Suplentes:», los
// suplentes. En el Senado los suplentes van como «Suplente 1: …».
// Algunas provincias dividen el Senado por islas.
// =====================================================================

function entidades(t) {
  return String(t)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/** HTML del BOE → líneas de texto (un párrafo por línea). */
export function lineasDeHtml(html) {
  const cuerpo = String(html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  return entidades(
    cuerpo
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d|td|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const mayusculas = (t) => {
  const letras = t.replace(/[^\p{L}]/gu, '');
  if (letras.length < 3) return false;
  const may = letras.replace(/[^\p{Lu}]/gu, '').length;
  return may / letras.length > 0.8;
};

// Quita un paréntesis (o corchete) final, aunque tenga otros dentro:
// «Nombre (SDP (PSOE, IU, MS))» → «Nombre». Los apodos del medio
// («Josep Maria (Pep) Llop») se quedan.
function quitarParentesisFinal(n) {
  const t = n.trimEnd();
  if (!/[\)\]]$/.test(t)) return n;
  let prof = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] === ')' || t[i] === ']') prof += 1;
    else if (t[i] === '(' || t[i] === '[') {
      prof -= 1;
      if (prof === 0) return t.slice(0, i).trimEnd();
    }
  }
  return n;
}

function limpiarNombre(t) {
  let n = t
    .replace(/^(D\.ª|Dña\.|Dª|D\.|Don|Doña)\s+/i, '')
    .trim();
  const independiente = /\(?\bindependiente\b\)?/i.test(n);
  n = n.replace(/\s*[-–,]?\s*\(?\bindependiente\b\)?\.?/gi, '');
  // Algunas juntas repiten la candidatura detrás del nombre:
  // «José María Martín Fernández (SENADO DE PROGRESO).», «(CCa-1.ºCAN, …)»,
  // incluso «(,)». Un nombre propio no lleva paréntesis.
  n = quitarParentesisFinal(n.replace(/[\s.]+$/, ''));
  n = n.replace(/[\s.]+$/, '').trim();
  return { nombre: n, independiente };
}

function capitalizar(t) {
  // «JUNTA ELECTORAL DE A CORUÑA» → «A Coruña»
  return t
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((p, i) => (/^(de|del|la|las|los|y|i)$/.test(p) && i > 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
}

// Las islas con senadores propios. Las juntas de Baleares y Canarias las
// anuncian con «Circunscripción electoral: Mallorca».
const RE_CIRC_ISLA = /^Circunscripci[oó]n electoral:\s*(.+?)\.?$/i;

const esNumSolo = (l) => /^\d{1,3}\.?$/.test(l);

/**
 * ¿Es la cabecera de una candidatura? «3. PARTIDO POPULAR (PP)» en
 * mayúsculas, o en minúsculas si no acaba en punto (los nombres de los
 * candidatos sí): «7. Senado de Progreso/Aurrera doan Senatua [SDP (…)]».
 */
function cabecera(texto) {
  if (mayusculas(texto)) return true;
  return !/\.\s*$/.test(texto) && /[\(\[]/.test(texto);
}

function nuevaCandidatura(num, texto) {
  const t = texto.replace(/\.$/, '').trim();
  const sig = t.match(/\(([^()]+)\)\s*\]?\s*$/) || t.match(/\[([^\[\]]+)\]\s*$/);
  return { num, candidatura: t, siglas: sig ? sig[1].trim() : null, inadmitida: false };
}

/**
 * Líneas → candidatos.
 * Devuelve { filas: [...], circunscripciones: [...], avisos: [...] }.
 *
 * Formatos vistos (29N, BOE-A-2026-22607):
 *   Congreso  «1. PARTIDO (SIGLAS)» · «1. Nombre.» · «Suplentes:» · «1. Nombre.»
 *             Badajoz no pone «Suplentes:»: los suplentes siguen la
 *             numeración de los titulares (se separan al final).
 *   Senado    «1. PARTIDO (SIGLAS)» · «1.» · «Nombre.» · «Suplente 1: Nombre.»
 *             (o «Suplente 1. Nombre.», o «1. Nombre.» en una línea). Cada
 *             candidato al Senado tiene sus propios suplentes: se guardan con
 *             suplente_de = número del titular.
 */
export function leerCandidaturas(lineas) {
  const filas = [];
  const avisos = [];
  const circs = new Set();
  let circ = null;
  let isla = null;
  let camara = null;
  let cand = null;
  let suplentes = false;
  let titularSenado = 0; // número del titular del Senado en curso
  let pendiente = null; // «1.» suelto: el número del siguiente nombre

  const empezarCandidatura = (num, texto) => {
    cand = nuevaCandidatura(num, texto);
    suplentes = false;
    titularSenado = 0;
    pendiente = null;
  };

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    // Fin del texto: a partir de aquí viene el pie de la web del BOE.
    if (/^subir$/i.test(l)) break;
    const siguiente = lineas[i + 1] || '';

    const junta = l.match(/^JUNTA ELECTORAL (?:PROVINCIAL |DE ZONA |CENTRAL )?DE (.+)$/i);
    if (junta && mayusculas(l)) {
      circ = capitalizar(junta[1].trim());
      circs.add(circ);
      camara = null;
      cand = null;
      isla = null;
      suplentes = false;
      pendiente = null;
      continue;
    }
    if (!circ) continue;
    if (/^CONGRESO DE LOS DIPUTADOS$/i.test(l)) {
      camara = 'congreso';
      cand = null;
      isla = null;
      suplentes = false;
      pendiente = null;
      continue;
    }
    if (/^SENADO$/i.test(l)) {
      camara = 'senado';
      cand = null;
      isla = null;
      suplentes = false;
      pendiente = null;
      continue;
    }
    if (!camara) continue;

    const ci = l.match(RE_CIRC_ISLA);
    if (ci) {
      if (camara === 'senado') {
        const nombre = ci[1].trim();
        isla = nombre.toLowerCase() === circ.toLowerCase() ? null : nombre;
        cand = null;
      }
      continue;
    }

    if (/inadmitida/i.test(l)) {
      if (cand) cand.inadmitida = true;
      avisos.push(`${circ} · ${camara} · ${cand ? cand.candidatura : '?'}: ${l.slice(0, 80)}`);
      continue;
    }

    // «1. PARTIDO POPULAR (PP)»
    const num = l.match(/^(\d{1,3})\.\s+(.+)$/);
    if (num && cabecera(num[2])) {
      empezarCandidatura(Number(num[1]), num[2]);
      continue;
    }
    // «2.» suelto y la candidatura en la línea siguiente, en mayúsculas.
    if (esNumSolo(l) && siguiente && !/^\d/.test(siguiente) && mayusculas(siguiente) && !RE_CIRC_ISLA.test(siguiente)) {
      empezarCandidatura(Number(l.replace('.', '')), siguiente);
      i += 1;
      continue;
    }
    // Candidatura en mayúsculas sin número (el número se perdió en el
    // salto de página): va seguida de su primer candidato.
    if (!num && !esNumSolo(l) && mayusculas(l) && /^1\.?(\s|$)/.test(siguiente)) {
      empezarCandidatura(cand ? cand.num + 1 : 1, l);
      continue;
    }

    if (/^Suplentes?:?$/i.test(l)) {
      suplentes = true;
      continue;
    }
    if (!cand || cand.inadmitida) continue;

    const circFinal = camara === 'senado' && isla ? `${circ} · ${isla}` : circ;
    const fila = (orden, suplente, texto, suplenteDe = 0) => {
      const { nombre, independiente } = limpiarNombre(texto);
      if (!nombre || nombre.length > 120) {
        avisos.push(l.slice(0, 120));
        return;
      }
      filas.push({
        camara,
        circunscripcion: circFinal,
        ...cand,
        orden,
        suplente,
        suplente_de: suplenteDe,
        nombre,
        independiente,
      });
    };

    if (camara === 'senado') {
      const supl = l.match(/^Suplente\s*(\d+)?\s*[:.]\s*(.+)$/i);
      if (supl) {
        fila(Number(supl[1] || 1), true, supl[2], titularSenado || 1);
        continue;
      }
      if (esNumSolo(l)) {
        pendiente = Number(l.replace('.', ''));
        continue;
      }
      if (num) {
        titularSenado = Number(num[1]);
        pendiente = null;
        fila(titularSenado, false, num[2]);
        continue;
      }
      // Nombre suelto: el número es el «1.» anterior, o el siguiente.
      titularSenado = pendiente || titularSenado + 1;
      pendiente = null;
      fila(titularSenado, false, l);
      continue;
    }

    // Congreso
    const supl = l.match(/^Suplente\s*(\d+)?\s*[:.]\s*(.+)$/i);
    if (supl) {
      fila(Number(supl[1] || 1), true, supl[2]);
      continue;
    }
    if (num) fila(Number(num[1]), suplentes, num[2]);
  }

  // Badajoz: listas del Congreso sin «Suplentes:», con más titulares que
  // escaños. Los escaños de la circunscripción son el número de titulares
  // más repetido entre sus listas; lo que sobra son suplentes.
  const titulares = new Map();
  for (const f of filas) {
    if (f.camara !== 'congreso' || f.suplente) continue;
    const k = `${f.circunscripcion}|${f.candidatura}`;
    titulares.set(k, (titulares.get(k) || 0) + 1);
  }
  const escanos = new Map();
  for (const c of new Set(filas.filter((f) => f.camara === 'congreso').map((f) => f.circunscripcion))) {
    const frec = new Map();
    for (const [k, n] of titulares) if (k.startsWith(`${c}|`)) frec.set(n, (frec.get(n) || 0) + 1);
    const moda = [...frec.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    if (moda) escanos.set(c, moda[0]);
  }
  for (const [k, n] of titulares) {
    const [c] = k.split('|');
    const e = escanos.get(c);
    if (!e || n <= e) continue;
    const conSuplentes = filas.some((f) => f.camara === 'congreso' && f.suplente && `${f.circunscripcion}|${f.candidatura}` === k);
    if (conSuplentes) {
      avisos.push(`${k}: ${n} titulares para ${e} escaños`);
      continue;
    }
    for (const f of filas) {
      if (f.camara === 'congreso' && !f.suplente && `${f.circunscripcion}|${f.candidatura}` === k && f.orden > e) {
        f.suplente = true;
        f.orden -= e;
      }
    }
    avisos.push(`${k}: ${n - e} suplentes sin «Suplentes:», separados por escaños (${e})`);
  }

  return {
    filas: filas.map((f) => ({
      camara: f.camara,
      circunscripcion: f.circunscripcion,
      candidatura: f.candidatura,
      siglas: f.siglas,
      num_candidatura: f.num,
      orden: f.orden,
      suplente: f.suplente,
      suplente_de: f.suplente_de || 0,
      nombre: f.nombre,
      independiente: f.independiente,
    })),
    circunscripciones: [...circs],
    escanos: Object.fromEntries(escanos),
    avisos: avisos.slice(0, 60),
  };
}
