// =====================================================================
// AGENDA DE GOBIERNO DE LA COMUNIDAD DE MADRID
// lib/agendaCcaa/madrid.js
//
// https://www.comunidad.madrid/agenda-gobierno es una página de Drupal
// con la agenda de HOY: primero «La Presidenta» y después «Consejerías»,
// con un subtítulo por consejería. Cada acto es un `views-row` con la
// hora, el titular (enlazado a su ficha, /agenda-gobierno/AAAA/MM/DD/…),
// una frase con quién lo protagoniza y el lugar.
//
// No publica días futuros: el histórico (/archivo-agenda-gobierno) solo
// llega hasta hoy. Por eso se lee varias veces al día.
//
// La web responde 404 al agente GovTalentBot y solo sirve la página a un
// navegador; se lee con el mismo agente que la agenda de La Moncloa
// (decisión de Jorge, 21-11-2026). El robots.txt permite la página.
// =====================================================================

import { textoPlano, huella, horaNormal, sinMayusculas, fechaDeTexto, personaDeTexto, nivelDeCargo, fila } from './comun';

export const BASE = 'https://www.comunidad.madrid';
export const URL_AGENDA = `${BASE}/agenda-gobierno`;

export const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-ES,es;q=0.9',
};

/**
 * Los actos de la página. Devuelve { actos, fechas, vacio, diagnostico }:
 * `fechas` son los días que la página cubre entera (para retirar lo que
 * desaparezca), `vacio` si la página dice que no hay actos.
 */
export function actosMadrid(html) {
  const s = String(html || '');
  const ini = s.indexOf('<main');
  const fin = s.indexOf('</main>');
  const main = ini >= 0 ? s.slice(ini, fin > ini ? fin : undefined) : s;

  const h2 = main.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const fechaPagina = h2 ? fechaDeTexto(textoPlano(h2[1])) : null;

  // Recorrido en orden: los subtítulos de sección (h3 «La Presidenta» o
  // «Consejerías»), los de consejería (p.heading dentro de
  // title-consejeria) y las filas de actos.
  const marcas = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>|<li[^>]*title-consejeria[^>]*>([\s\S]*?)<\/li>|<div class="views-row">/gi;
  let m;
  while ((m = re.exec(main))) {
    if (m[1] !== undefined) marcas.push({ tipo: 'seccion', texto: textoPlano(m[1]), pos: m.index });
    else if (m[2] !== undefined) marcas.push({ tipo: 'organo', texto: textoPlano(m[2]), pos: m.index });
    else marcas.push({ tipo: 'fila', pos: m.index });
  }

  const actos = [];
  let seccion = null;
  let organo = null;
  for (let k = 0; k < marcas.length; k++) {
    const mk = marcas[k];
    if (mk.tipo === 'seccion') {
      seccion = mk.texto;
      organo = /president/i.test(mk.texto) ? 'Presidencia de la Comunidad de Madrid' : null;
      continue;
    }
    if (mk.tipo === 'organo') {
      organo = mk.texto;
      continue;
    }
    const bloque = main.slice(mk.pos, marcas[k + 1] ? marcas[k + 1].pos : undefined);
    const hora = horaNormal(textoPlano((bloque.match(/views-field-datetime[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1]));
    const enlace = bloque.match(/<a\s+href\s*=\s*"?([^"\s>]+)"?[^>]*>([\s\S]*?)<\/a>/i);
    const href = enlace ? enlace[1] : null;
    const titulo = sinMayusculas(enlace ? textoPlano(enlace[2]) : '');
    const texto = textoPlano((bloque.match(/views-field-short-description[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/i) || [])[1]);
    const lugar = textoPlano((bloque.match(/views-field-place[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1]) || null;
    if (!titulo && !texto) continue;

    const enUrl = href && href.match(/\/agenda-gobierno\/(\d{4})\/(\d{2})\/(\d{2})\//);
    const fecha = enUrl ? `${enUrl[1]}-${enUrl[2]}-${enUrl[3]}` : fechaPagina;
    if (!fecha) continue;

    const { cargo, persona } = personaDeTexto(texto);
    const esPresidenta = /presidenta|presidente/i.test(seccion || '') && !/consejer/i.test(seccion || '');
    const nivel = esPresidenta ? 'presidente' : nivelDeCargo(cargo, 'consejero');
    const url = href ? new URL(href, BASE).href : URL_AGENDA;
    actos.push(
      fila('madrid', {
        id: `mad-${huella(href || `${fecha}|${hora}|${titulo}`)}`,
        fecha,
        hora,
        nivel,
        organo: organo || (esPresidenta ? 'Presidencia de la Comunidad de Madrid' : null),
        persona,
        cargo,
        titulo: titulo || texto,
        texto,
        lugar,
        url,
        agenda_url: URL_AGENDA,
        source_id: href,
      })
    );
  }

  const vacio = actos.length === 0 && /no hay (ning[uú]n )?(evento|acto)|sin actos/i.test(textoPlano(main));
  return {
    actos,
    // La página es la agenda entera de su día: lo que falte, se retira.
    fechas: fechaPagina ? [fechaPagina] : [],
    vacio,
    diagnostico: { fecha_pagina: fechaPagina, marcas: marcas.length },
  };
}

/** Lee la agenda de hoy. `pedir(url, headers)` devuelve el texto. */
export async function leerMadrid({ pedir }) {
  const html = await pedir(URL_AGENDA, HEADERS);
  return actosMadrid(html);
}
