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
// No hay índice que leer, así que se sigue la numeración: a partir del
// último BOAM guardado se piden los siguientes hasta el primero que aún
// no existe. Los expedientes nacen de lo que la IA encuentra en cada
// boletín (como en Asturias y la Comunitat Valenciana).
// =====================================================================

const BASE = 'https://ctyp.asambleamadrid.es/static/doc/publicaciones';
const LEGISLATURA = 13;
// Primer número que se mira si todavía no hay ninguno guardado. El 141
// es de principios de octubre de 2026.
const SEMILLA = 136;
// Como mucho, cuántos números nuevos se piden por ejecución (y cuántos
// huecos seguidos se toleran: a veces se salta un número).
const MAX_POR_EJECUCION = 8;
const MAX_HUECOS = 2;

export const urlBoletin = (n) => `${BASE}/BOAM_${LEGISLATURA}_${String(n).padStart(5, '0')}.pdf`;

/** Fecha de creación del PDF (D:AAAAMMDD…), si viene sin comprimir. */
function fechaDelPdf(buf) {
  const cab = buf.subarray(0, Math.min(buf.length, 400000)).toString('latin1');
  const m = cab.match(/CreationDate\s*\(D:(\d{4})(\d{2})(\d{2})/) || cab.match(/<xmp:CreateDate>(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export async function leer(web, ctx = {}) {
  const desde = (ctx.ultimoNumero || SEMILLA) + 1;
  const boletines = [];
  let huecos = 0;
  for (let n = desde; n < desde + MAX_POR_EJECUCION + MAX_HUECOS; n += 1) {
    if (boletines.length >= MAX_POR_EJECUCION || ctx.tiempoAgotado?.()) break;
    const url = urlBoletin(n);
    let r;
    try {
      r = await web.binario(url);
    } catch (e) {
      if (e.robots) throw e;
      if (e.status === 404 || e.status === 410) {
        huecos += 1;
        if (huecos > MAX_HUECOS) break;
        continue;
      }
      // Cortafuegos, tiempo agotado u otro error: se para y se informa.
      if (ctx.diagnostico) ctx.diagnostico.madrid = { url, error: e.message, cuerpo: e.cuerpo?.slice(0, 200) };
      break;
    }
    if (r.buf.subarray(0, 4).toString() !== '%PDF') {
      if (ctx.diagnostico) ctx.diagnostico.madrid = { url, error: `No es un PDF (${r.tipo || 'tipo desconocido'})`, cuerpo: r.buf.subarray(0, 200).toString('utf8') };
      break;
    }
    huecos = 0;
    boletines.push({
      id: `madrid:BOAM-${LEGISLATURA}-${n}`,
      numero: String(n),
      fecha: fechaDelPdf(r.buf),
      titulo: `BOAM n.º ${n}`,
      url,
      url_pdf: url,
    });
  }
  return { expedientes: [], boletines };
}
