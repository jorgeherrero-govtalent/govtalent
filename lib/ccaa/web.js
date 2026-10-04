// =====================================================================
// Lectura de las webs de los parlamentos autonómicos
// lib/ccaa/web.js
//
// Todo lo que GovTalent pide a un parlamento pasa por aquí:
//   · se identifica como GovTalentBot (lib/govtalentBot.js);
//   · lee el robots.txt de cada sitio una vez por ejecución y no pide lo
//     que prohíbe (lanza un error «robots.txt» en vez de pedirlo);
//   · respeta su Crawl-delay (mínimo 1 s entre peticiones al mismo sitio);
//   · decodifica el texto con el juego de caracteres que declara el
//     servidor (Andalucía sirve ISO-8859-1);
//   · resuelve certificados incompletos (lib/fetchGob.js).
//
// Uso: const web = crearWeb(); const html = await web.texto(url);
// =====================================================================

import { fetchGob } from '@/lib/fetchGob';
import { HEADERS_BOT, leerRobots, permitidoPorRobots } from '@/lib/govtalentBot';

const TIMEOUT_MS = 30000;
const PAUSA_MIN_MS = 1000;
const PAUSA_MAX_MS = 10000;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function crearWeb() {
  const robots = new Map(); // origen → reglas
  const ultima = new Map(); // origen → marca de tiempo de la última petición
  const colas = new Map(); // origen → promesa (una petición cada vez por sitio)

  async function bruto(url) {
    const res = await fetchGob(url, { headers: HEADERS_BOT, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const tipo = res.headers?.get?.('content-type') || '';
    const buf = res.arrayBuffer ? Buffer.from(await res.arrayBuffer()) : Buffer.from(await res.text(), 'utf8');
    return { status: res.status, tipo, buf, url: res.url || url };
  }

  async function reglasDe(origen) {
    if (robots.has(origen)) return robots.get(origen);
    let reglas = { disallow: [], allow: [], crawlDelay: null };
    try {
      const r = await bruto(`${origen}/robots.txt`);
      const t = r.buf.toString('utf8');
      if (r.status === 200 && !/<html/i.test(t.slice(0, 500))) reglas = leerRobots(t).reglas;
    } catch {
      // Sin robots.txt legible: se aplica la pausa mínima y nada más.
    }
    robots.set(origen, reglas);
    return reglas;
  }

  async function pedir(url) {
    const u = new URL(url);
    const reglas = await reglasDe(u.origin);
    if (!permitidoPorRobots(reglas, u.pathname + u.search)) {
      const e = new Error(`robots.txt no permite ${u.pathname}`);
      e.robots = true;
      throw e;
    }
    const pausa = Math.max(PAUSA_MIN_MS, Math.min(PAUSA_MAX_MS, (reglas.crawlDelay || 0) * 1000));
    const anterior = colas.get(u.origin) || Promise.resolve();
    const turno = anterior.catch(() => {}).then(async () => {
      const desde = Date.now() - (ultima.get(u.origin) || 0);
      if (desde < pausa) await espera(pausa - desde);
      try {
        return await bruto(url);
      } finally {
        ultima.set(u.origin, Date.now());
      }
    });
    colas.set(u.origin, turno);
    const r = await turno;
    if (r.status < 200 || r.status >= 300) {
      const e = new Error(`HTTP ${r.status} en ${url}`);
      e.status = r.status;
      throw e;
    }
    return r;
  }

  return {
    /** Texto (HTML, RSS, XML) decodificado. */
    async texto(url) {
      const r = await pedir(url);
      const cs = (r.tipo.match(/charset=([\w-]+)/i) || [])[1]?.toLowerCase()
        || (r.buf.subarray(0, 300).toString('latin1').match(/encoding=["']([\w-]+)/i) || [])[1]?.toLowerCase();
      const latin = cs && /iso-8859-1|latin1|windows-1252/.test(cs);
      return new TextDecoder(latin ? 'latin1' : 'utf-8').decode(r.buf);
    },
    /** Binario (PDF). Devuelve { buf, tipo, url }. */
    async binario(url) {
      return pedir(url);
    },
  };
}

// ---------------------------------------------------------------------
// Utilidades de lectura de HTML y RSS, sin dependencias.
// ---------------------------------------------------------------------

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', laquo: '«', raquo: '»', ordm: 'º', ordf: 'ª', euro: '€' };

export function textoPlano(html) {
  return String(html || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z])(acute|grave|tilde|uml|circ|cedil);/gi, (_, l, d) => (l + { acute: '\u0301', grave: '\u0300', tilde: '\u0303', uml: '\u0308', circ: '\u0302', cedil: '\u0327' }[d.toLowerCase()]).normalize('NFC'))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Elementos de un RSS o Atom: [{ titulo, enlace, descripcion, fecha, raw }]. */
export function elementosRss(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const it = m[0];
    const campo = (n) => {
      const x = it.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`, 'i'));
      return x ? textoPlano(x[1]) : null;
    };
    const enlace = campo('link') || (it.match(/<link[^>]*href=["']([^"']+)/i) || [])[1] || campo('guid');
    out.push({
      titulo: campo('title'),
      enlace: enlace ? enlace.trim() : null,
      descripcion: campo('description') || campo('summary') || campo('content'),
      fecha: campo('pubDate') || campo('dc:date') || campo('updated') || campo('published'),
      raw: it,
    });
  }
  return out;
}

/** Enlaces de una página: [{ texto, href }] con href absoluto. */
export function enlacesDe(html, base) {
  const out = [];
  for (const m of String(html || '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = m[1].replace(/&amp;/g, '&');
    try { href = new URL(href, base).toString(); } catch { continue; }
    out.push({ texto: textoPlano(m[2]), href });
  }
  return out;
}

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  gener: 1, febrer: 2, març: 3, abril_: 4, maig: 5, juny: 6, juliol: 7, agost: 8, setembre: 9, octubre_: 10, novembre: 11, desembre: 12 };

/** '02/10/2026', '2 de octubre de 2026', RFC 822 o ISO → 'YYYY-MM-DD' o null. */
export function fechaDeTexto(t) {
  const s = String(t || '').toLowerCase();
  let m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})\s+(?:de\s+|d')?([a-zç]+)\s+(?:de\s+)?(\d{4})/);
  if (m && (MESES[m[2]] || MESES[`${m[2]}_`])) return `${m[3]}-${String(MESES[m[2]] || MESES[`${m[2]}_`]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
