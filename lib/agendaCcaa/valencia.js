// =====================================================================
// AGENDA DE LA GENERALITAT VALENCIANA
// lib/agendaCcaa/valencia.js
//
// El Gabinete de prensa de la Generalitat (comunica.gva.es) publica dos
// páginas de convocatorias, las dos del DÍA SIGUIENTE («Convocatorias de
// conselleries para el domingo, 22 de noviembre de 2026»):
//   https://comunica.gva.es/es/agenda-del-president
//   https://comunica.gva.es/es/convocatories-de-conselleries
// Son portales Liferay: un bloque por conselleria (h2.portlet-title-text)
// y dentro una tarjeta por acto (div.convocatoria) con la fecha
// (span.fecha-conv «22.11.2026»), la hora («10.30h»), el titular
// (p.title) y el lugar. El id del acto es data-analytics-asset-id.
//
// La agenda del president en gva.es (un calendario que pide JSON) trae lo
// mismo; se usa la de comunica.gva.es para leer las dos páginas igual.
//
// robots.txt: el grupo general («*») lo permite todo; veta a una lista de
// bots de IA en la que no está GovTalentBot. Jorge decidió leerla
// (21-11-2026): GovTalent no es un bot de IA. Se lee como GovTalentBot.
// =====================================================================

import { textoPlano, huella, horaNormal, fechaDeNumeros, fechaDeTexto, personaDeTexto, nivelDeCargo, fila } from './comun';
import { HEADERS_BOT } from '@/lib/govtalentBot';

export const BASE = 'https://comunica.gva.es';
export const PAGINAS = [
  { url: `${BASE}/es/agenda-del-president`, presidente: true },
  { url: `${BASE}/es/convocatories-de-conselleries`, presidente: false },
];
export const HEADERS = HEADERS_BOT;

/** Los actos de una de las dos páginas. */
export function actosValencia(html, { url, presidente }) {
  const s = String(html || '');
  // El día de la página, del titular («… para el domingo, 22 de noviembre de 2026»).
  const cab = textoPlano((s.match(/<h1[^>]*>((?:(?!<\/h1>)[\s\S])*?(?:para|per a)[\s\S]*?)<\/h1>/i) || [])[1]);
  const fechaPagina = fechaDeTexto(cab) || null;

  const marcas = [];
  const re = /<h2 class="portlet-title-text">([\s\S]*?)<\/h2>|data-analytics-asset-id="(\d+)"/gi;
  let m;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) marcas.push({ tipo: 'organo', texto: textoPlano(m[1]), pos: m.index });
    else marcas.push({ tipo: 'acto', id: m[2], pos: m.index });
  }

  const actos = [];
  const fechas = new Set(fechaPagina ? [fechaPagina] : []);
  let organo = presidente ? 'Presidencia de la Generalitat' : null;
  for (let k = 0; k < marcas.length; k++) {
    const mk = marcas[k];
    if (mk.tipo === 'organo') {
      organo = mk.texto || organo;
      continue;
    }
    const bloque = s.slice(mk.pos, marcas[k + 1] ? marcas[k + 1].pos : undefined);
    if (!/class="convocatoria/.test(bloque)) continue;
    const fecha = fechaDeNumeros(textoPlano((bloque.match(/class="fecha-conv[^"]*">([\s\S]*?)<\/span>/i) || [])[1])) || fechaPagina;
    if (!fecha) continue;
    fechas.add(fecha);
    const hora = horaNormal(textoPlano((bloque.match(/class="date">([\s\S]*?)<\/span>/i) || [])[1]));
    const titulo = textoPlano((bloque.match(/<p class="title">([\s\S]*?)<\/p>/i) || [])[1]);
    if (!titulo) continue;
    const lugar = textoPlano((bloque.match(/class="extra-info lugar">([\s\S]*?)<\/div>/i) || [])[1]) || null;
    const { cargo, persona } = personaDeTexto(titulo);
    const nivel = presidente || /^(el|la) president(a)? de la generalitat/i.test(titulo) ? 'presidente' : nivelDeCargo(cargo, 'consejero');
    actos.push(
      fila('valenciana', {
        id: `val-${mk.id || huella(`${fecha}|${hora}|${titulo}`)}`,
        fecha,
        hora,
        nivel,
        organo: presidente ? 'Presidencia de la Generalitat' : organo,
        persona,
        cargo,
        titulo,
        texto: titulo,
        lugar,
        url,
        agenda_url: url,
        source_id: mk.id,
      })
    );
  }
  return { actos, fechas: [...fechas], diagnostico: { fecha_pagina: fechaPagina, marcas: marcas.length } };
}

/** Lee las dos páginas. */
export async function leerValencia({ pedir }) {
  const actos = [];
  const fechas = [];
  const errores = [];
  const diagnostico = {};
  for (const p of PAGINAS) {
    try {
      const r = actosValencia(await pedir(p.url, HEADERS), p);
      actos.push(...r.actos);
      // Cada página cubre su día solo para sus propios actos: no se
      // pueden retirar los de conselleries porque falten en la del
      // president. Por eso el día cubierto va con su página.
      for (const f of r.fechas) fechas.push({ fecha: f, agenda_url: p.url });
      diagnostico[p.presidente ? 'president' : 'conselleries'] = { ...r.diagnostico, actos: r.actos.length };
    } catch (e) {
      errores.push(`${p.url}: ${e.message}`);
    }
  }
  return { actos, fechas, errores, diagnostico };
}
