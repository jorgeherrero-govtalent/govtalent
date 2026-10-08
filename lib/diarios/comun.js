// =====================================================================
// DIARIOS OFICIALES AUTONÓMICOS — catálogo y clasificación
// lib/diarios/comun.js
//
// Las claves (galicia, madrid…) son las que se guardan en
// diarios_ccaa.ccaa (sql/84). Piloto del 08-10-2026: los cinco que se
// leen desde Vercel respetando su robots.txt (documento del proyecto
// «diarios-oficiales-ccaa-fuentes.md»).
//
// Cada lector (lib/diarios/<ccaa>.js) devuelve las entradas del diario
// tal como vienen; aquí se decide cuáles entran y con qué tipo. Alcance
// aprobado el 08-10-2026:
//   · disposiciones generales
//   · nombramientos y ceses de altos cargos (los que van por decreto;
//     los de personal de la administración por resolución quedan fuera)
//   · otras disposiciones de la comunidad
//   · información pública o audiencia de proyectos normativos (dentro de
//     los anuncios)
// Fuera: administración local, justicia, contratación y oposiciones.
// =====================================================================

export const DIARIOS = {
  galicia: { diario: 'DOG', comunidad: 'Galicia', hosts: ['www.xunta.gal'] },
  madrid: { diario: 'BOCM', comunidad: 'Comunidad de Madrid', hosts: ['www.bocm.es'] },
  murcia: { diario: 'BORM', comunidad: 'Región de Murcia', hosts: ['www.borm.es'] },
  paisvasco: { diario: 'BOPV', comunidad: 'País Vasco', hosts: ['www.euskadi.eus'] },
  extremadura: { diario: 'DOE', comunidad: 'Extremadura', hosts: ['doe.juntaex.es'] },
};

export const PILOTO = Object.keys(DIARIOS);

export const sinTildes = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Id estable: '<ccaa>-<referencia>' solo con letras, números y guiones. */
export function idDiario(ccaa, ref) {
  const r = String(ref || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return r ? `${ccaa}-${r}` : null;
}

/**
 * Rango de la disposición, por cómo empieza el título (en castellano y
 * gallego; el catalán y el euskera, cuando entren esos diarios).
 */
export function rangoDe(titulo) {
  const t = sinTildes(titulo).replace(/^[\s\-–—.]+/, '');
  const reglas = [
    [/^ley\b|^lei\b/, 'Ley'],
    [/^decreto[ -]ley\b|^decreto-lei\b/, 'Decreto-ley'],
    [/^decreto legislativo\b/, 'Decreto legislativo'],
    [/^decreto\b/, 'Decreto'],
    [/^orden\b|^orde\b/, 'Orden'],
    [/^resolucion\b/, 'Resolución'],
    [/^acuerdo\b|^acordo\b/, 'Acuerdo'],
    [/^anuncio\b/, 'Anuncio'],
    [/^correccion\b|^correccion de (errores|erros)/, 'Corrección de errores'],
    [/^instruccion\b|^instrucion\b/, 'Instrucción'],
    [/^circular\b/, 'Circular'],
    [/^extracto\b/, 'Extracto'],
    [/^edicto\b/, 'Edicto'],
  ];
  for (const [re, r] of reglas) if (re.test(t)) return r;
  return null;
}

// Señales en el título de que es información pública o audiencia de un
// proyecto normativo (y no, por ejemplo, de una autorización ambiental).
const INFO_PUBLICA = /informacion publica|audiencia|exposicion publica|participacion publica|consulta publica/;
const PROYECTO_NORMATIVO = /(ante)?pro[yx]ecto de (decreto|orden|orde|ley|lei)|proyecto normativo|disposicion(es)? de caracter general|proyecto de reglamento|pro[yx]ecto de disposicion/;

// Nombramientos de altos cargos: van por decreto y lo dicen en el título.
const NOMBRA = /\bnombra|\bnomea|\bcese|\bcesa\b|\bcesamento|\bdispon el cesamento|\bdispon o nomeamento|nombramiento/;

// Secciones que nunca entran.
const FUERA = /administracion local|administracion del estado|administracion general del estado|otras administraciones|administracion de justicia|xustiza|justicia|oposicion|concurso|contratacion|licitacion|oposicions e concursos|estado y otras|otras comunidades|otros anuncios particulares|anuncios particulares/;

/**
 * Tipo de la entrada según su sección y su título, o null si queda fuera
 * del alcance.
 *
 * `seccion` es el texto con que el diario nombra la sección (o la
 * subsección); puede venir vacío (el BOPV no la da en su RSS), y entonces
 * se decide solo por el título.
 */
export function clasificar({ seccion, titulo }) {
  const s = sinTildes(seccion);
  const t = sinTildes(titulo);
  const rango = rangoDe(titulo);

  const esInfoPublica = INFO_PUBLICA.test(t) && PROYECTO_NORMATIVO.test(t);
  const esNombramientoAlto = rango === 'Decreto' && NOMBRA.test(t);

  if (s) {
    if (/disposiciones generales|disposicions xerais|xedapen orokorrak/.test(s)) return 'disposicion_general';
    if (/autoridades y personal|autoridades e persoal|nombramientos|nomeamentos|cesamentos|ceses|substitucions|situaciones e incidencias|agintariak/.test(s)) {
      return esNombramientoAlto ? 'nombramiento' : null;
    }
    if (FUERA.test(s)) return esInfoPublica ? 'informacion_publica' : null;
    if (/otras disposiciones|outras disposicions|otras resoluciones|bestelako xedapenak/.test(s)) {
      return esInfoPublica ? 'informacion_publica' : 'otra_disposicion';
    }
    if (/anuncio|administracion autonomica|outros anuncios|iragarki/.test(s)) return esInfoPublica ? 'informacion_publica' : null;
  }

  // Sin sección reconocible: por el título.
  if (esInfoPublica) return 'informacion_publica';
  if (esNombramientoAlto) return 'nombramiento';
  if (['Ley', 'Decreto-ley', 'Decreto legislativo'].includes(rango)) return 'disposicion_general';
  if (rango === 'Decreto') return 'disposicion_general';
  if (rango === 'Orden') return 'otra_disposicion';
  if (rango === 'Corrección de errores' && /decreto|orden|orde|ley|lei/.test(t)) return 'otra_disposicion';
  // Resoluciones y anuncios sin sección: solo si no son de personal ni
  // de selección. Son muchas; mejor fuera que llenar las alarmas de ruido.
  return null;
}

/**
 * Recorre una página de sumario en orden y devuelve sus enlaces con la
 * sección y el órgano bajo los que aparecen. Sirve para los sumarios en
 * HTML (BOPV, BOCM), donde la sección es un encabezado y no un dato de
 * cada disposición.
 *
 *   enlace   expresión que deben cumplir los href que interesan
 *   seccion  expresión de los textos que son encabezados de sección
 *   organo   expresión de los textos que son encabezados de órgano
 *
 * Devuelve [{ href, texto, previo, seccion, organo }]: `previo` es el
 * último texto suelto antes del enlace (por si el enlace solo dice «PDF»).
 */
export function enlacesConSeccion(html, base, { enlace, seccion, organo }) {
  const out = [];
  let sec = null;
  let org = null;
  let previo = null;
  const token = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>|>([^<>]+)</gi;
  const limpio = String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  for (const m of limpio.matchAll(token)) {
    if (m[1]) {
      let href = m[1].replace(/&amp;/g, '&');
      try { href = new URL(href, base).toString(); } catch { continue; }
      const texto = decodificar(m[2]);
      if (enlace.test(href)) out.push({ href, texto, previo, seccion: sec, organo: org });
      continue;
    }
    const t = decodificar(m[3]);
    if (!t || t.length < 3) continue;
    if (t.length < 140 && seccion.test(sinTildes(t))) { sec = t; org = null; continue; }
    if (organo && t.length < 200 && organo.test(sinTildes(t))) { org = t; continue; }
    previo = t;
  }
  return out;
}

function decodificar(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&([a-z])(acute|grave|tilde|uml|circ|cedil);/gi, (_, l, d) => (l + { acute: '́', grave: '̀', tilde: '̃', uml: '̈', circ: '̂', cedil: '̧' }[d.toLowerCase()]).normalize('NFC'))
    .replace(/&ordm;/g, 'º').replace(/&ordf;/g, 'ª')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 'Thu, 08 Oct 2026 00:00:00 +0200' o ISO → ISO, o null. */
export function instante(v) {
  if (!v) return null;
  const s = String(v).trim();
  // Solo fecha (sin hora): no es una hora de publicación, no se guarda.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
