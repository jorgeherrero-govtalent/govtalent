// =====================================================================
// AGENDA INSTITUCIONAL DEL GOBIERNO ANDALUZ
// lib/agendaCcaa/andalucia.js
//
// La Junta publica en su portal (Transparencia › Agenda institucional del
// Gobierno) el «listado de actividades del presidente, los consejeros y
// otros altos cargos del Gobierno»:
//   https://www.juntadeandalucia.es/organismos/sobre-junta/altos-cargos/agenda.html
// Es una lista por días (un <h2> «23/11/2026» y debajo los actos), de hoy
// en adelante. Cada acto enlaza a su ficha
//   …/agenda/detalle/220645.html
// que trae el texto y un recuadro de «Convocatoria» con DÍA, HORA y LUGAR.
// La hora y el lugar solo están en la ficha, así que se lee la ficha de
// los actos nuevos (los ya guardados no se vuelven a pedir).
//
// Muchos actos son de las delegaciones provinciales («Jaén- La delegada de
// Agricultura asiste…»): se guardan como nivel 'delegacion' y no entran en
// las alarmas.
//
// El robots.txt de la Junta permite estas páginas. Se lee como
// GovTalentBot.
// =====================================================================

import { textoPlano, horaNormal, fechaDeNumeros, personaDeTexto, nivelDeCargo, fila, normalizar } from './comun';
import { HEADERS_BOT } from '@/lib/govtalentBot';

export const BASE = 'https://www.juntadeandalucia.es';
export const URL_AGENDA = `${BASE}/organismos/sobre-junta/altos-cargos/agenda.html`;
export const HEADERS = HEADERS_BOT;

const PROVINCIAS = ['almeria', 'cadiz', 'cordoba', 'granada', 'huelva', 'jaen', 'malaga', 'sevilla', 'campo de gibraltar'];

// Fichas nuevas que se leen como mucho en una pasada (el resto, en la
// siguiente) y pausa entre ellas.
const MAX_FICHAS = 40;
const PAUSA_MS = 300;

/** La lista: días y actos con su id, titular y enlace. */
export function listaAndalucia(html) {
  const s = String(html || '');
  const ini = s.indexOf('Listado de actividades');
  const fin = s.indexOf('Consulta por fecha');
  const zona = s.slice(ini >= 0 ? ini : 0, fin > ini ? fin : undefined);
  const items = [];
  const fechas = [];
  const re = /<h2[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/h2>|<a[^>]*href="([^"]*\/agenda\/detalle\/(\d+)\.html)"[^>]*class="titular"[^>]*>([\s\S]*?)<\/a>/gi;
  let fecha = null;
  let m;
  while ((m = re.exec(zona))) {
    if (m[1]) {
      fecha = fechaDeNumeros(m[1]);
      if (fecha) fechas.push(fecha);
      continue;
    }
    if (!fecha) continue;
    items.push({ fecha, id: m[3], href: new URL(m[2], BASE).href, titular: textoPlano(m[4]) });
  }
  return { items, fechas };
}

/** La ficha de un acto: texto, hora y lugar. */
export function fichaAndalucia(html) {
  const s = String(html || '');
  const texto = textoPlano((s.match(/<div class="contenidos_nivel3">([\s\S]*?)<\/div>/i) || [])[1]);
  const conv = textoPlano((s.match(/<div class="servicios_datos_basicos[^"]*">([\s\S]*?)<\/div>/i) || [])[1]);
  const hora = horaNormal((conv.match(/HORA:\s*([0-9.:,h ]{1,12})/i) || [])[1]);
  const lugar = (conv.match(/LUGAR:\s*(.+)$/i) || [])[1] || null;
  const dia = fechaDeNumeros((s.match(/<p>\s*Andaluc[ií]a,\s*(\d{2}\/\d{2}\/\d{4})\s*<\/p>/i) || [])[1]);
  // El lugar a veces termina con el enlace al mapa: fuera.
  const sitio = lugar ? lugar.replace(/https?:\/\/\S+/g, '').replace(/[\s,.]+$/, '').trim() : null;
  return { texto, hora, lugar: sitio || null, dia };
}

/** Titular sin el prefijo de provincia, y si es de una delegación. */
export function limpiarTitular(titular) {
  const m = String(titular || '').match(/^\s*([A-ZÁÉÍÓÚÑ][\wáéíóúñ ]{2,25}?)\s*-\s+(.*)$/);
  if (m && PROVINCIAS.includes(normalizar(m[1]))) return { titulo: m[2].trim(), provincia: m[1].trim() };
  return { titulo: String(titular || '').trim(), provincia: null };
}

function nivelAndalucia(titulo, texto, provincia, cargo) {
  if (provincia) return 'delegacion';
  const t = normalizar(`${titulo} ${texto}`);
  if (/\bdelegad[oa] (del gobierno de la junta|territorial|provincial|de la junta)/.test(t) && !/consejer/.test(normalizar(cargo))) return 'delegacion';
  if (/^(el )?presidente de la junta|juanma moreno|moreno bonilla/.test(t)) return 'presidente';
  return nivelDeCargo(cargo, 'consejero');
}

/**
 * Lee la lista y las fichas de los actos nuevos. `conocidos` son las filas
 * ya guardadas (por id): de esas no se pide la ficha.
 */
export async function leerAndalucia({ pedir, conocidos = new Map(), esperar = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const html = await pedir(URL_AGENDA, HEADERS);
  const { items, fechas } = listaAndalucia(html);
  const actos = [];
  const errores = [];
  let fichas = 0;
  for (const it of items) {
    const id = `and-${it.id}`;
    const { titulo, provincia } = limpiarTitular(it.titular);
    const ya = conocidos.get(id);
    // Una fila guardada sin texto es una ficha que no se pudo leer: se
    // vuelve a intentar.
    let det = ya?.texto ? { texto: ya.texto, hora: ya.hora, lugar: ya.lugar } : null;
    if (!det && fichas < MAX_FICHAS) {
      try {
        if (fichas > 0) await esperar(PAUSA_MS);
        fichas += 1;
        det = fichaAndalucia(await pedir(it.href, HEADERS));
      } catch (e) {
        errores.push(`${it.id}: ${e.message}`);
      }
    }
    // Sin ficha (tope de la pasada o fallo) se guarda igual con lo de la
    // lista; la próxima pasada la vuelve a pedir.
    const texto = det?.texto || null;
    const { cargo, persona } = personaDeTexto(texto);
    actos.push(
      fila('andalucia', {
        id,
        fecha: it.fecha,
        hora: det?.hora || null,
        nivel: nivelAndalucia(titulo, texto || '', provincia, cargo),
        organo: provincia ? `Delegación del Gobierno en ${provincia}` : null,
        persona,
        cargo,
        titulo,
        texto,
        lugar: det?.lugar || null,
        url: it.href,
        agenda_url: URL_AGENDA,
        source_id: it.id,
      })
    );
  }
  return { actos, fechas, errores, diagnostico: { items: items.length, fichas_leidas: fichas } };
}
