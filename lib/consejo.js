// =====================================================================
// CONSEJO DE MINISTROS — lectura de las Referencias
// lib/consejo.js
//
// La Moncloa publica cada Consejo una «Referencia»: un SUMARIO con los
// acuerdos agrupados por ministerio y, debajo, la «AMPLIACIÓN DE
// CONTENIDOS» con la explicación de algunos. Aquí se lee solo el
// sumario: es la lista completa y cada línea es un acuerdo.
//
// Lo que sale de aquí es un RESUMEN oficial, no el texto de la norma. La
// norma vale cuando se publica en el BOE; hasta entonces el acuerdo
// queda «pendiente de BOE» y así se muestra.
//
// El marcado es de SharePoint y no hay API. El parser trabaja sobre una
// versión en líneas del HTML (encabezados, elementos de lista y
// párrafos) y no sobre clases CSS, que es lo primero que cambia en un
// rediseño. Si un día no saca nada de una Referencia que existe, el sync
// lo marca como error en vez de darla por leída.
//
// Solo servidor.
// =====================================================================

import { createHash } from 'node:crypto';

export const BASE = 'https://www.lamoncloa.gob.es';
export const INDICE = `${BASE}/consejodeministros/referencias/paginas/index.aspx`;

// ---------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------

const ENTIDADES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  laquo: '«',
  raquo: '»',
  ordm: 'º',
  ordf: 'ª',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  iexcl: '¡',
  iquest: '¿',
  euro: '€',
  ccedil: 'ç',
  Ccedil: 'Ç',
  agrave: 'à',
  egrave: 'è',
  ograve: 'ò',
  Agrave: 'À',
  Egrave: 'È',
  Ograve: 'Ò',
  iuml: 'ï',
  acute: '´',
  middot: '·',
  deg: '°',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodificarUnaVez(t) {
  return t
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTIDADES ? ENTIDADES[n] : m));
}

// Dos pasadas: La Moncloa codifica a veces dos veces («&amp;ccedil;»),
// y tras la primera queda «&ccedil;» a la vista.
export function decodificar(t) {
  return decodificarUnaVez(decodificarUnaVez(String(t || '')));
}

/** Minúsculas, sin tildes y con los espacios juntos. Para comparar. */
export function normalizar(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const limpio = (t) => decodificar(String(t || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------
// Índice de Referencias
// ---------------------------------------------------------------------

/**
 * La fecha de una Referencia sale del nombre del fichero:
 *   .../Paginas/2026/20260922-referencia-rueda-de-prensa-ministros.aspx
 *   .../Paginas/2025/250408-referencia-rueda-de-prensa-ministros.aspx
 */
export function fechaDeUrl(url) {
  const m = String(url).match(/\/(\d{4})\/(\d{6,8})[-_]/);
  if (!m) return null;
  const d = m[2];
  const [y, mes, dia] = d.length === 8 ? [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)] : [`20${d.slice(0, 2)}`, d.slice(2, 4), d.slice(4, 6)];
  const iso = `${y}-${mes}-${dia}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * Una misma Referencia se enlaza a veces con /Paginas/ y a veces con
 * /paginas/ (SharePoint no distingue). Se guarda siempre en minúsculas y
 * con https, para que sea una sola fila.
 */
export function urlCanonica(url) {
  return String(url || '').trim().replace(/^http:\/\//i, 'https://').toLowerCase();
}

/**
 * Los enlaces a Referencias que aparecen en el índice. El índice solo
 * enseña el mes en curso, que es lo que hace falta para detectar la
 * nueva.
 */
export function referenciasDelIndice(html) {
  const vistas = new Map();
  const re = /href\s*=\s*["']([^"'#?]*\/consejodeministros\/referencias\/paginas\/\d{4}\/[^"'#?]+\.aspx)["']/gi;
  for (const m of String(html || '').matchAll(re)) {
    let url = decodificar(m[1]);
    if (url.startsWith('/')) url = `${BASE}${url}`;
    if (!/^https?:\/\//i.test(url)) continue;
    url = urlCanonica(url);
    if (vistas.has(url)) continue;
    const fecha = fechaDeUrl(url);
    if (!fecha) continue;
    vistas.set(url, { url, fecha });
  }
  return [...vistas.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ---------------------------------------------------------------------
// Una Referencia
// ---------------------------------------------------------------------

/**
 * El HTML convertido en líneas con su tipo: H (encabezado, con nivel),
 * LI (elemento de lista) o P (párrafo). Cada línea guarda la primera
 * ancla interna (#algo) que contenga, que es el enlace a su ampliación.
 */
export function lineas(html) {
  let h = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(script|style)[\s\S]*$/i, ' ');

  // Si hay un <main> o un bloque de contenido de SharePoint, se usa solo
  // eso: fuera quedan menús y pie, que también tienen listas.
  const main = h.match(/<main[\s\S]*?<\/main>/i);
  if (main) h = main[0];

  h = h
    .replace(/<h([1-6])[^>]*>/gi, '\n\u0001H$1\u0002')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n\u0001LI\u0002')
    .replace(/<\/li>/gi, '\n')
    .replace(/<(p|div|tr|section|article|ul|ol)[^>]*>/gi, '\n\u0001P\u0002')
    .replace(/<\/(p|div|tr|section|article|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, ' ')
    // Las anclas internas se conservan como marca antes de quitar etiquetas
    .replace(/<a[^>]+href\s*=\s*["']#([^"']+)["'][^>]*>/gi, '\u0003$1\u0004');

  const salida = [];
  for (const cruda of h.split('\n')) {
    const m = cruda.match(/^\s*\u0001(H[1-6]|LI|P)\u0002([\s\S]*)$/);
    const tipo = m ? m[1] : 'P';
    const cuerpo = m ? m[2] : cruda;
    const ancla = (cuerpo.match(/\u0003([^\u0004]+)\u0004/) || [])[1] || null;
    const texto = limpio(cuerpo.replace(/\u0003[^\u0004]*\u0004/g, ' ').replace(/[\u0001-\u0004]/g, ' '));
    if (!texto) continue;
    salida.push({ tipo: tipo.startsWith('H') ? 'H' : tipo, nivel: tipo.startsWith('H') ? Number(tipo[1]) : null, texto, ancla });
  }
  return salida;
}

// Cómo empieza un acuerdo en el sumario. Siempre en mayúsculas: es la
// forma en que la Referencia los escribe y lo que los distingue de un
// párrafo de explicación.
const INICIO_ACUERDO =
  /^(REAL DECRETO(?:[- ]LEY| LEGISLATIVO)?|ACUERDOS?|INFORMES?|ORDEN(?:ES)?|DECLARACI[OÓ]N(?: INSTITUCIONAL)?|PROYECTO DE LEY(?: ORG[AÁ]NICA)?|ANTEPROYECTO DE LEY(?: ORG[AÁ]NICA)?|RESOLUCI[OÓ]N|DECRETO|INSTRUCCI[OÓ]N|PLAN|ESTRATEGIA)\b/;

// Encabezados del sumario que no son un ministerio sino un bloque.
const BLOQUES = /^(ASUNTOS GENERALES|NOMBRAMIENTOS|CESES|ACUERDOS DE PERSONAL|CONDECORACIONES|OTROS ACUERDOS|DISPOSICIONES|ACUERDOS INTERNACIONALES)\b/i;

// El sumario termina donde empieza la explicación.
const FIN_SUMARIO = /^(AMPLIACI[OÓ]N DE CONTENIDOS?|AMPLIACI[OÓ]N DE LA INFORMACI[OÓ]N)\b/i;

/**
 * El tipo de un acuerdo, por el objeto principal y no solo por la
 * primera palabra: «ACUERDO por el que se aprueba y se remite a las
 * Cortes el Proyecto de Ley…» es un proyecto de ley.
 */
export function tipoDe(titulo) {
  const t = normalizar(titulo);
  if (/^real decreto[- ]ley\b/.test(t)) return 'real_decreto_ley';
  if (/^real decreto legislativo\b/.test(t)) return 'real_decreto_legislativo';
  if (/^real decreto\b/.test(t)) {
    if (/\bse nombra\b|\bse dispone el cese\b|\bcese como\b|\bse promueve\b|\bse concede la gran cruz\b/.test(t)) return 'nombramiento';
    return 'real_decreto';
  }
  if (/\banteproyecto de ley\b/.test(t)) return 'anteproyecto';
  // Proyecto de ley NUEVO: el que se aprueba o se remite a las Cortes. Un
  // acuerdo que pide la tramitación por urgencia de un proyecto que ya
  // está en el Congreso es un acuerdo más: no tiene entrada que esperar.
  if (/^proyecto de ley\b/.test(t)) return 'proyecto_ley';
  if (/\bproyecto de ley\b/.test(t) && /\b(se aprueba|se remite|remision)\b/.test(t) && !/\burgencia\b/.test(t)) return 'proyecto_ley';
  if (/^acuerdos? .*\bse nombra\b/.test(t)) return 'nombramiento';
  if (/^(orden|ordenes)\b/.test(t)) return 'orden';
  if (/^informes?\b/.test(t)) return 'informe';
  if (/^declaracion\b/.test(t)) return 'declaracion';
  if (/^acuerdos?\b/.test(t)) return 'acuerdo';
  return 'otro';
}

/**
 * Normas citadas en un texto, como claves comparables:
 *   «Ley 24/2013, de 26 de diciembre» → «ley 24/2013»
 *   «Directiva (UE) 2024/1275»        → «directiva 2024/1275»
 * Sirve para cruzar un acuerdo con la normativa que alguien sigue sin
 * pasar por la IA.
 */
export function citas(texto) {
  const t = normalizar(texto).replace(/\((ue|ce|cee)\)/g, ' ').replace(/\s+/g, ' ');
  const re =
    /\b(ley organica|ley|real decreto[- ]ley|real decreto legislativo|real decreto|directiva(?: delegada| de ejecucion)?|reglamento(?: delegado| de ejecucion)?)\s+(?:n\.?º\s*)?(\d{1,4}\/\d{2,4})/g;
  const out = new Set();
  for (const m of t.matchAll(re)) {
    const tipo = m[1].replace('real decreto ley', 'real decreto-ley').replace(/ (delegad[ao]|de ejecucion)$/, '');
    out.add(`${tipo} ${m[2]}`);
  }
  return [...out];
}

/** «real decreto-ley 8/2024» → «Real Decreto-ley 8/2024», para mostrarla. */
export function nombreCita(c) {
  return String(c || '')
    .replace(/^ley organica\b/, 'Ley Orgánica')
    .replace(/^ley\b/, 'Ley')
    .replace(/^real decreto-ley\b/, 'Real Decreto-ley')
    .replace(/^real decreto legislativo\b/, 'Real Decreto Legislativo')
    .replace(/^real decreto\b/, 'Real Decreto')
    .replace(/^directiva\b/, 'Directiva (UE)')
    .replace(/^reglamento\b/, 'Reglamento (UE)');
}

/** Identificador estable: el mismo acuerdo leído dos veces es la misma fila. */
export function idAcuerdo(fecha, ministerio, titulo) {
  const h = createHash('sha1').update(`${fecha}|${normalizar(ministerio)}|${normalizar(titulo)}`).digest('hex');
  return `${String(fecha).replace(/-/g, '')}-${h.slice(0, 10)}`;
}

/**
 * Los acuerdos del sumario de una Referencia.
 *
 * Recorre las líneas desde «SUMARIO» hasta «AMPLIACIÓN DE CONTENIDOS».
 * Un encabezado cambia de ministerio (o de bloque, como NOMBRAMIENTOS);
 * una línea que empieza como un acuerdo es un acuerdo. Si una línea de
 * lista sigue a un acuerdo sin empezar como tal, es su continuación.
 *
 * Devuelve también un diagnóstico para el modo de depuración.
 */
export function acuerdosDeReferencia(html, { url, fecha }) {
  const ls = lineas(html);
  let i0 = ls.findIndex((l) => /^SUMARIO$/i.test(l.texto));
  const sinMarca = i0 < 0;
  if (sinMarca) i0 = 0;
  let i1 = ls.findIndex((l, k) => k > i0 && FIN_SUMARIO.test(l.texto));
  if (i1 < 0) i1 = ls.length;

  const acuerdos = [];
  let ministerio = null;
  let bloque = null;
  let bloqueNivel = 0;
  let ultimo = null;

  for (let k = i0 + 1; k < i1; k++) {
    const l = ls[k];
    if (l.tipo === 'H') {
      // Un bloque (NOMBRAMIENTOS…) puede llevar ministerios debajo con un
      // encabezado de nivel inferior: esos siguen dentro del bloque.
      if (BLOQUES.test(l.texto)) {
        bloque = l.texto;
        bloqueNivel = l.nivel;
        ministerio = null;
      } else {
        ministerio = l.texto;
        if (!(bloque && l.nivel > bloqueNivel)) bloque = null;
      }
      ultimo = null;
      continue;
    }
    if (INICIO_ACUERDO.test(l.texto)) {
      const titulo = l.texto.replace(/\s+([.,;:])/g, '$1').replace(/\s*\.$/, '');
      ultimo = {
        id: idAcuerdo(fecha, ministerio || bloque || '', titulo),
        fecha_consejo: fecha,
        referencia_url: url,
        ministerio: ministerio ? ministerio.replace(/^Ministerio de(l)?\s+/i, '') : null,
        seccion: bloque,
        tipo: tipoDe(titulo),
        titulo: titulo.slice(0, 2000),
        ancla: l.ancla,
        orden: acuerdos.length + 1,
        citas: citas(titulo),
      };
      acuerdos.push(ultimo);
      continue;
    }
    // Continuación de un acuerdo partido en dos elementos
    if (ultimo && l.tipo === 'LI' && /^[a-záéíóúñ(«"]/.test(l.texto)) {
      ultimo.titulo = `${ultimo.titulo} ${l.texto}`.slice(0, 2000);
      ultimo.citas = citas(ultimo.titulo);
    }
  }

  // Un mismo acuerdo puede repetirse (p. ej. en dos ministerios
  // proponentes): se queda el primero.
  const unicos = [];
  const ya = new Set();
  for (const a of acuerdos) {
    if (ya.has(a.id)) continue;
    ya.add(a.id);
    unicos.push(a);
  }

  const titulo = (ls.find((l) => l.tipo === 'H' && /referencia/i.test(l.texto)) || {}).texto || null;

  return {
    acuerdos: unicos,
    titulo,
    diagnostico: {
      lineas: ls.length,
      sumario_desde: sinMarca ? null : i0,
      sumario_hasta: i1 < ls.length ? i1 : null,
      muestra: ls.slice(i0, Math.min(i0 + 25, ls.length)).map((l) => `${l.tipo}${l.nivel || ''}: ${l.texto.slice(0, 120)}`),
    },
  };
}

// ---------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------

export const TIPOS = {
  real_decreto_ley: 'Real decreto-ley',
  real_decreto_legislativo: 'Real decreto legislativo',
  real_decreto: 'Real decreto',
  proyecto_ley: 'Proyecto de ley',
  anteproyecto: 'Anteproyecto de ley',
  acuerdo: 'Acuerdo',
  informe: 'Informe',
  orden: 'Orden',
  declaracion: 'Declaración institucional',
  nombramiento: 'Nombramiento',
  otro: 'Otro',
};

// Lo que acabará en el BOE y por tanto se enlaza con él.
export const VAN_AL_BOE = new Set(['real_decreto_ley', 'real_decreto_legislativo', 'real_decreto', 'orden']);
