// =====================================================================
// Asamblea de Madrid — lector
// lib/ccaa/madrid.js
//
// La web principal (www.asambleamadrid.es) está detrás del cortafuegos de
// Sucuri y no se intenta esquivar. Los PDF del Boletín Oficial de la
// Asamblea de Madrid (BOAM) se sirven también desde el subdominio
// ctyp.asambleamadrid.es con una URL predecible:
//
//   https://ctyp.asambleamadrid.es/static/doc/publicaciones/BOAM_13_00141.pdf
//
// Se leen identificándose como GovTalentBot y respetando el robots.txt de
// ese subdominio (lib/ccaa/web.js). Si el subdominio devuelve una página
// de verificación en vez de un PDF, se para y se informa: no se insiste.
// Decisión de Jorge del 09-10-2026, a la espera de la respuesta a la
// petición de acceso enviada el 04-10 a publicaciones@asambleamadrid.es.
//
// No hay índice que leer, así que se sigue la numeración: se localiza el
// último BOAM publicado con peticiones HEAD y se dan de alta los que
// falten desde el último guardado. Los expedientes nacen de lo que la IA encuentra en cada
// boletín (como en Asturias y la Comunitat Valenciana).
// =====================================================================

const BASE = 'https://ctyp.asambleamadrid.es/static/doc/publicaciones';
const LEGISLATURA = 13;
// El BOAM sale más o menos una vez por semana: el 150 es del 16-04-2026.
// Se parte de ahí para localizar el último publicado.
const SEMILLA = 150;
// Del último publicado hacia atrás, cuántos se leen la primera vez.
const PRIMERA_CARGA = 6;
const MAX_POR_EJECUCION = 8;

export const urlBoletin = (n) => `${BASE}/BOAM_${LEGISLATURA}_${String(n).padStart(5, '0')}.pdf`;

/**
 * Último BOAM publicado, con peticiones HEAD (no se descargan los PDF):
 * se avanza de 8 en 8 hasta el primero que no existe y se afina con una
 * búsqueda binaria.
 */
async function ultimoPublicado(web, desde, ctx) {
  let bajo = desde;
  if (!(await web.existe(urlBoletin(bajo)))) return null;
  let alto = null;
  for (let i = 0; i < 12 && alto === null; i += 1) {
    if (ctx.tiempoAgotado?.()) return bajo;
    if (await web.existe(urlBoletin(bajo + 8))) bajo += 8;
    else alto = bajo + 8;
  }
  if (alto === null) return bajo;
  while (alto - bajo > 1) {
    const medio = Math.floor((bajo + alto) / 2);
    if (await web.existe(urlBoletin(medio))) bajo = medio;
    else alto = medio;
  }
  return bajo;
}

export async function leer(web, ctx = {}) {
  const guardado = ctx.ultimoNumero || 0;
  let ultimo;
  try {
    ultimo = await ultimoPublicado(web, Math.max(guardado, SEMILLA), ctx);
  } catch (e) {
    if (e.robots) throw e;
    if (ctx.diagnostico) ctx.diagnostico.madrid = { error: e.message, cuerpo: e.cuerpo?.slice(0, 200) };
    return { expedientes: [], boletines: [] };
  }
  if (ctx.diagnostico) ctx.diagnostico.madrid = { ultimo_publicado: ultimo, ultimo_guardado: guardado || null };
  if (!ultimo) return { expedientes: [], boletines: [] };
  const desde = Math.max(guardado + 1, ultimo - PRIMERA_CARGA + 1, ultimo - MAX_POR_EJECUCION + 1);
  const boletines = [];
  for (let n = desde; n <= ultimo; n += 1) {
    boletines.push({
      id: `madrid:BOAM-${LEGISLATURA}-${n}`,
      numero: String(n),
      // La fecha la lee la IA de la cabecera del BOAM (fecha_boletin).
      fecha: null,
      titulo: `BOAM n.º ${n}`,
      url: urlBoletin(n),
      url_pdf: urlBoletin(n),
    });
  }
  return { expedientes: [], boletines };
}
