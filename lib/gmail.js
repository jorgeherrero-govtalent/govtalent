// =====================================================================
// GMAIL — borradores en hola@govtalent.app
// lib/gmail.js
//
// Los borradores los crea un Google Apps Script publicado como aplicación
// web dentro de la propia cuenta hola@govtalent.app. GovTalent le envía
// los correos con una clave secreta y el script los guarda como borrador.
// No necesita cuenta de servicio ni permisos de administrador.
//
// Variables de entorno:
//   GMAIL_DRAFTS_URL     URL de la aplicación web (termina en /exec)
//   GMAIL_DRAFTS_SECRET  la misma clave que está en el script
// =====================================================================

export function gmailConfigurado() {
  return Boolean(process.env.GMAIL_DRAFTS_URL && process.env.GMAIL_DRAFTS_SECRET);
}

/**
 * Crea borradores en el buzón del founder, todos en una sola llamada.
 * Devuelve, por cada correo y en el mismo orden, { ok, id } o
 * { ok: false, error }.
 */
export async function crearBorradores(correos) {
  if (correos.length === 0) return [];

  const res = await fetch(process.env.GMAIL_DRAFTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secreto: process.env.GMAIL_DRAFTS_SECRET,
      correos: correos.map(({ to, subject, text }) => ({ to, subject, text })),
    }),
    // Apps Script responde con una redirección a la respuesta: hay que seguirla.
    redirect: 'follow',
    cache: 'no-store',
  });

  const texto = await res.text();
  let data;
  try {
    data = JSON.parse(texto);
  } catch {
    throw new Error(`El script de Gmail no devolvió JSON (${res.status}). ¿Está publicado con acceso para cualquier usuario?`);
  }
  if (!data.ok) throw new Error(`El script de Gmail rechazó la petición: ${data.error || 'error desconocido'}`);

  const resultados = Array.isArray(data.resultados) ? data.resultados : [];
  return correos.map((_, i) => resultados[i] || { ok: false, error: 'Sin respuesta del script' });
}
