// =====================================================================
// GMAIL — correos de founder desde hola@govtalent.app
// lib/gmail.js
//
// Los envía un Google Apps Script publicado como aplicación web dentro de
// la propia cuenta hola@govtalent.app. GovTalent le pasa los correos con
// una clave secreta y el script los envía con la firma de Gmail de la
// cuenta. Quedan en Enviados y las respuestas llegan al mismo hilo.
// No necesita cuenta de servicio ni permisos de administrador.
//
// LA REDIRECCIÓN SE SIGUE A MANO. Un Apps Script no contesta al POST
// directamente: ejecuta doPost y responde con una redirección a otra
// dirección donde deja el resultado. Antes se dejaba que fetch la
// siguiera sola, y desde el 18 de septiembre esa vuelta dejó de ser
// fiable: el script enviaba los correos —el panel de Ejecuciones lo
// registraba como completado— pero GovTalent no recibía la respuesta, lo
// daba por fallido y los volvía a mandar al día siguiente. Dos
// organizaciones recibieron la misma bienvenida dos veces.
//
// Ahora el POST no sigue la redirección; se lee la dirección de destino y
// se pide con un GET explícito. Y si aun así la respuesta no es JSON, el
// error dice qué llegó en su lugar, para no volver a diagnosticarlo a
// ciegas.
//
// Variables de entorno:
//   GMAIL_DRAFTS_URL     URL de la aplicación web (termina en /exec)
//   GMAIL_DRAFTS_SECRET  la misma clave que está en el script
// =====================================================================

export function gmailConfigurado() {
  return Boolean(process.env.GMAIL_DRAFTS_URL && process.env.GMAIL_DRAFTS_SECRET);
}

// Lo que llegó en vez de JSON, legible y corto: suele ser una página de
// Google, y el título basta para saber cuál.
function extracto(texto) {
  return String(texto || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function host(url) {
  try {
    return new URL(url).host;
  } catch {
    return '?';
  }
}

/**
 * Envía los correos de founder, todos en una sola llamada.
 *
 * Devuelve, por cada correo y en el mismo orden:
 *   { ok: true, id }                  el script confirma que lo envió
 *   { ok: false, error }              el script confirma que NO lo envió
 *   { ok: false, desconocido: true }  el script contestó pero no dijo nada
 *                                     de este correo: no se sabe
 *
 * La distinción importa a quien llama: solo lo que el script confirma
 * como no enviado se puede reintentar sin riesgo de duplicar.
 *
 * Si la llamada entera falla, lanza. En ese caso tampoco se sabe qué se
 * envió, y quien llama no debe reintentar nada.
 */
export async function enviarCorreosFounder(correos) {
  if (correos.length === 0) return [];

  const url = process.env.GMAIL_DRAFTS_URL;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secreto: process.env.GMAIL_DRAFTS_SECRET,
      correos: correos.map(({ to, subject, text }) => ({ to, subject, text })),
    }),
    redirect: 'manual',
    cache: 'no-store',
  });

  let final = res;
  let via = host(url);

  if (res.status >= 300 && res.status < 400) {
    const destino = res.headers.get('location');
    if (!destino) {
      throw new Error(`El script de Gmail redirigió (${res.status}) sin indicar a dónde.`);
    }
    // La dirección puede venir relativa; se resuelve contra la del script.
    const absoluta = new URL(destino, url).toString();
    via = host(absoluta);
    // GET explícito: el resultado ya está calculado, solo hay que leerlo.
    final = await fetch(absoluta, { method: 'GET', redirect: 'follow', cache: 'no-store' });
  }

  const texto = await final.text();
  let data;
  try {
    data = JSON.parse(texto);
  } catch {
    throw new Error(
      `El script de Gmail no devolvió JSON (${final.status}, vía ${via}): «${extracto(texto) || 'respuesta vacía'}»`
    );
  }
  if (!data.ok) throw new Error(`El script de Gmail rechazó la petición: ${data.error || 'error desconocido'}`);

  const resultados = Array.isArray(data.resultados) ? data.resultados : [];
  return correos.map(
    (_, i) => resultados[i] || { ok: false, desconocido: true, error: 'El script no devolvió resultado para este correo' }
  );
}
