// =====================================================================
// FOTOS OFICIALES DE LOS GOBIERNOS AUTONÓMICOS
// lib/ccaa/fotosGobierno.js
//
// Jorge (21-11-2026): «mete las fotos oficiales» en la ficha de cada
// gobierno (Instituciones › Comunidades autónomas › Gobiernos).
//
// Cómo funciona:
//   1. /api/sync/fotos-gobiernos-ccaa lee la página oficial del Consejo de
//      Gobierno de cada comunidad (FUENTES_FOTOS) y guarda sus imágenes con
//      el texto que las acompaña: el alt y el texto de antes y de después
//      (tabla ccaa_gobierno_fotos, sql/142).
//   2. La ficha (/api/instituciones/gobiernos-ccaa) empareja esas imágenes
//      con el presidente, los vicepresidentes y los consejeros que ya
//      conocemos (emparejarFotos). La foto oficial va primero; si no hay,
//      la del parlamento; si tampoco, las iniciales.
//
// Se guarda la imagen tal cual la publica cada gobierno (su URL), sin
// copiarla. Una imagen solo se asigna si nombra a un miembro sin dudas:
// por su alt o, si el alt no dice nada, por el nombre más cercano en el
// texto de alrededor. Si el alt nombra a uno y el texto a otro (la Xunta
// tiene algún alt equivocado), no se usa.
//
// Las URL marcadas «sin verificar» no se han podido abrir desde aquí: si
// la página no tiene fotos de los consejeros, el sync lo dice (?debug=1)
// y esa comunidad sigue con las del parlamento.
// =====================================================================

import { norm } from '@/lib/ccaa/gobiernos';

/**
 * La página oficial con la composición del gobierno, por slug de
 * lib/ccaa/gobiernos.js. `navegador`: la web rechaza a GovTalentBot y se
 * lee como un navegador (Madrid, igual que su agenda y Moncloa).
 * `seguir`: la página es un índice; se lee también el primer enlace cuyo
 * texto case (Navarra: «El equipo de Gobierno»).
 */
export const FUENTES_FOTOS = {
  madrid: { urls: ['https://www.comunidad.madrid/gobierno/equipo-gobierno'], navegador: true },
  andalucia: { urls: ['https://www.juntadeandalucia.es/presidencia/portavoz/XIIILEGISLATURA'] },
  galicia: { urls: ['https://www.xunta.gal/es/conselleiros-do-goberno-galego'] },
  'pais-vasco': { urls: ['https://www.euskadi.eus/miembros-del-consejo-de-gobierno/web01-s1ezaleh/es/'] },
  valencia: { urls: ['https://www.gva.es/es/web/generalitat/el-consell'] },
  navarra: { urls: ['https://www.navarra.es/es/gobierno-de-navarra'], seguir: /equipo (de )?gobierno|qui[eé]n es qui[eé]n/i },
  // Sin verificar:
  aragon: { urls: ['https://www.aragon.es/transparencia/gobierno'] },
  'castilla-la-mancha': { urls: ['https://www.castillalamancha.es/gobierno'], navegador: true },
};

const PALABRAS_FUERA = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'i', 'y', 'e', 'da', 'do', 'dos', 'das']);
const palabras = (t) =>
  norm(t)
    .replace(/[^a-z0-9 -]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !PALABRAS_FUERA.has(w));

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', acute: "'", ordf: 'ª', ordm: 'º', middot: ' ' };
// Tildes escritas como entidades (&iacute;, &ntilde;, &uuml;…): las usa
// euskadi.eus. Letra + marca combinada, y luego NFC.
const MARCAS = { acute: '\u0301', grave: '\u0300', tilde: '\u0303', uml: '\u0308', circ: '\u0302', cedil: '\u0327' };
export function desescapar(t) {
  return String(t || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z])(acute|grave|tilde|uml|circ|cedil);/g, (_, l, m) => l + MARCAS[m])
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
    .normalize('NFC');
}
const plano = (html) =>
  desescapar(
    String(html || '')
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();

const atributo = (tag, nombre) => {
  const m = tag.match(new RegExp(`\\s${nombre}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? desescapar(m[2] ?? m[3] ?? '').trim() : '';
};

// Logotipos, iconos, banderas y fondos: no son retratos.
const NO_RETRATO = /(logo|escudo|icon|icono|sprite|banner|footer|header|hero|solapa|bandera|flag|distintivo|placeholder|blank|pixel)/i;

/**
 * Las imágenes de una página con el texto que las rodea. Devuelve
 * [{ foto_url, alt, antes, despues, orden }] sin logotipos ni repetidas.
 */
export function extraerImagenes(html, base) {
  const h = String(html || '');
  const tags = [...h.matchAll(/<img\b[^>]*>/gi)];
  const vistas = new Set();
  const out = [];
  tags.forEach((m, k) => {
    const tag = m[0];
    let src = atributo(tag, 'src');
    if (!src || src.startsWith('data:')) src = atributo(tag, 'data-src') || (atributo(tag, 'srcset').split(/\s+/)[0] || '');
    if (!src || src.startsWith('data:')) return;
    let url;
    try {
      url = new URL(src, base).toString();
    } catch {
      return;
    }
    if (/\.svg(\?|$)/i.test(url) || NO_RETRATO.test(url)) return;
    if (vistas.has(url)) return;
    vistas.add(url);
    const desde = k > 0 ? tags[k - 1].index + tags[k - 1][0].length : 0;
    const hasta = k + 1 < tags.length ? tags[k + 1].index : h.length;
    const antes = plano(h.slice(Math.max(desde, m.index - 2500), m.index)).slice(-300);
    const despues = plano(h.slice(m.index + tag.length, Math.min(hasta, m.index + tag.length + 2500))).slice(0, 300);
    out.push({ foto_url: url, alt: (atributo(tag, 'alt') || atributo(tag, 'title')).slice(0, 300), antes, despues, orden: out.length });
  });
  return out;
}

/**
 * Dónde nombra un texto a una persona: el índice (en palabras) de la
 * primera coincidencia, o -1. Vale si aparecen todas sus palabras o todas
 * menos una (el segundo nombre: «Isabel Díaz Ayuso» por «Isabel Natividad
 * Díaz Ayuso»), con dos como mínimo y algún apellido entre ellas.
 */
function nombrada(texto, nombre) {
  const mias = palabras(nombre);
  if (mias.length < 2) return -1;
  const suyas = palabras(texto);
  const pos = new Map();
  suyas.forEach((w, i) => {
    if (!pos.has(w)) pos.set(w, i);
  });
  const estan = mias.filter((w) => pos.has(w));
  const necesarias = Math.max(2, mias.length - 1);
  // Los dos apellidos seguidos también valen («Juanfran Pérez Llorca» por
  // «Juan Francisco Pérez Llorca»).
  const [ap1, ap2] = mias.slice(-2);
  const apellidos = mias.length >= 3 && pos.has(ap1) && suyas[pos.get(ap1) + 1] === ap2;
  if (estan.length < Math.min(necesarias, mias.length) && !apellidos) return -1;
  if (!mias.slice(1).some((w) => pos.has(w))) return -1;
  // Que estén juntas: si están repartidas por todo el texto, no es un nombre.
  const indices = estan.map((w) => pos.get(w));
  if (Math.max(...indices) - Math.min(...indices) > mias.length + 3) return -1;
  return Math.min(...indices);
}

const apaisada = (url) => /16[-_x]9|apaisad|wide|panoram/i.test(url);

/**
 * Empareja las imágenes de una página con los miembros del gobierno.
 * `miembros`: [{ clave, nombre }]. Devuelve Map clave → foto_url.
 */
export function emparejarFotos(miembros, imagenes) {
  const gente = (miembros || []).filter((m) => m && m.nombre);
  const fotos = new Map();
  if (!gente.length || !imagenes?.length) return fotos;

  // A quién nombra cada imagen por su alt y por el texto de alrededor.
  const lecturas = imagenes.map((i) => {
    const img = { ...i, alt: desescapar(i.alt), antes: desescapar(i.antes), despues: desescapar(i.despues) };
    const porAlt = gente.filter((m) => nombrada(img.alt, m.nombre) >= 0);
    let porTexto = null;
    let mejor = Infinity;
    for (const m of gente) {
      const d = nombrada(img.despues, m.nombre);
      if (d >= 0 && d < mejor) {
        mejor = d;
        porTexto = m;
      }
      const a = nombrada(img.antes, m.nombre);
      if (a >= 0) {
        const dist = palabras(img.antes).length - a;
        if (dist < mejor) {
          mejor = dist;
          porTexto = m;
        }
      }
    }
    return { img, porAlt, porTexto, distancia: mejor };
  });

  // 1. Por el alt, si nombra a una sola persona y el texto no lo contradice.
  //    Entre varias imágenes de la misma persona, la de alt más corto (el
  //    retrato, no la noticia) y mejor vertical que apaisada.
  const porAlt = new Map();
  for (const l of lecturas) {
    if (l.porAlt.length !== 1) continue;
    const m = l.porAlt[0];
    if (l.porTexto && l.porTexto.clave !== m.clave && l.distancia <= 12) continue;
    const ya = porAlt.get(m.clave);
    const peso = (x) => (apaisada(x.img.foto_url) ? 1000 : 0) + x.img.alt.length;
    if (!ya || peso(l) < peso(ya)) porAlt.set(m.clave, l);
  }
  const usadas = new Set();
  for (const [clave, l] of porAlt) {
    fotos.set(clave, l.img.foto_url);
    usadas.add(l.img.foto_url);
  }

  // 2. Sin alt útil: el nombre más cercano en el texto, si está a pocas
  //    palabras y nadie más se lo disputa.
  const porTexto = new Map();
  for (const l of lecturas) {
    if (usadas.has(l.img.foto_url) || l.porAlt.length || !l.porTexto || l.distancia > 40) continue;
    const m = l.porTexto;
    if (fotos.has(m.clave)) continue;
    const ya = porTexto.get(m.clave);
    if (!ya || l.distancia < ya.distancia || (l.distancia === ya.distancia && apaisada(ya.img.foto_url))) porTexto.set(m.clave, l);
  }
  for (const [clave, l] of porTexto) fotos.set(clave, l.img.foto_url);
  return fotos;
}

/**
 * Los enlaces de la página que casan con `patron` por su texto, por el
 * título que llevan justo delante (enlaces que son solo una flecha) o por
 * la propia dirección. Sin anclas (#), sin javascript: y sin la página
 * misma. Por orden de aparición.
 */
export function enlacesQueDicen(html, base, patron) {
  const h = String(html || '');
  const propia = String(base || '').replace(/[#?].*$/, '').replace(/\/$/, '');
  const out = [];
  for (const m of h.matchAll(/<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = desescapar(m[2] ?? m[3]).trim();
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) continue;
    let url;
    try {
      url = new URL(href, base).toString();
    } catch {
      continue;
    }
    if (url.replace(/[#?].*$/, '').replace(/\/$/, '') === propia || out.includes(url)) continue;
    const texto = plano(m[4]);
    const delante = plano(h.slice(Math.max(0, m.index - 400), m.index)).slice(-60);
    const ruta = decodeURIComponent(new URL(url).pathname).replace(/[-_/]+/g, ' ');
    if (patron.test(texto) || (texto.length < 30 && patron.test(delante)) || patron.test(ruta)) out.push(url);
  }
  return out;
}

/** El primero de enlacesQueDicen, o null. */
export function enlaceQueDice(html, base, patron) {
  return enlacesQueDicen(html, base, patron)[0] || null;
}
