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

function limpiarNombre(t) {
  let n = t
    .replace(/\.$/, '')
    .replace(/^(D\.ª|Dña\.|Dª|D\.|Don|Doña)\s+/i, '')
    .trim();
  const independiente = /\(?\bindependiente\b\)?/i.test(n);
  n = n.replace(/\s*[-–,]?\s*\(?\bindependiente\b\)?\.?/gi, '').trim();
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

/**
 * Líneas → candidatos.
 * Devuelve { filas: [...], circunscripciones: [...], avisos: [...] }.
 */
export function leerCandidaturas(lineas) {
  const filas = [];
  const avisos = [];
  const circs = new Set();
  let circ = null;
  let isla = null;
  let camara = null;
  let cand = null; // { candidatura, siglas, num }
  let suplentes = false;

  for (const l of lineas) {
    const junta = l.match(/^JUNTA ELECTORAL (?:PROVINCIAL |DE ZONA |CENTRAL )?DE (.+)$/i);
    if (junta && mayusculas(l)) {
      circ = capitalizar(junta[1].trim());
      circs.add(circ);
      camara = null;
      cand = null;
      isla = null;
      suplentes = false;
      continue;
    }
    if (!circ) continue;
    if (/^CONGRESO DE LOS DIPUTADOS$/i.test(l)) {
      camara = 'congreso';
      cand = null;
      isla = null;
      suplentes = false;
      continue;
    }
    if (/^SENADO$/i.test(l)) {
      camara = 'senado';
      cand = null;
      isla = null;
      suplentes = false;
      continue;
    }
    if (!camara) continue;

    // Cabecera de candidatura: «3. PARTIDO POPULAR (PP)».
    const num = l.match(/^(\d{1,3})\.\s+(.+)$/);
    if (num && mayusculas(num[2])) {
      const texto = num[2].replace(/\.$/, '').trim();
      const sig = texto.match(/\(([^()]+)\)\s*$/);
      cand = { num: Number(num[1]), candidatura: texto, siglas: sig ? sig[1].trim() : null };
      suplentes = false;
      continue;
    }
    // Islas del Senado: una línea en mayúsculas suelta.
    if (camara === 'senado' && !num && mayusculas(l) && l.length < 60 && !/:/.test(l)) {
      isla = capitalizar(l);
      cand = null;
      continue;
    }
    if (/^Suplentes?:?$/i.test(l)) {
      suplentes = true;
      continue;
    }
    if (!cand) continue;

    const circFinal = camara === 'senado' && isla ? `${circ} · ${isla}` : circ;
    const supl = l.match(/^Suplente\s*(\d+)?\s*:\s*(.+)$/i);
    if (supl) {
      const { nombre, independiente } = limpiarNombre(supl[2]);
      if (nombre) {
        filas.push({ camara, circunscripcion: circFinal, ...cand, orden: Number(supl[1] || 1), suplente: true, nombre, independiente });
      }
      continue;
    }
    if (num) {
      const { nombre, independiente } = limpiarNombre(num[2]);
      if (nombre && nombre.length < 120) {
        filas.push({ camara, circunscripcion: circFinal, ...cand, orden: Number(num[1]), suplente: suplentes, nombre, independiente });
      } else {
        avisos.push(l.slice(0, 120));
      }
    }
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
      nombre: f.nombre,
      independiente: f.independiente,
    })),
    circunscripciones: [...circs],
    avisos: avisos.slice(0, 30),
  };
}
