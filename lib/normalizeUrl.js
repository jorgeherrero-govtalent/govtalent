// Normaliza una URL de sitio web para que siempre sea un enlace absoluto válido.
// Sin esto, un valor guardado como "www.ejemplo.com" (sin protocolo) se trata
// como una ruta relativa al hacer clic, y el navegador intenta abrir
// "https://govtalent.app/.../www.ejemplo.com" en vez del sitio real.
export function normalizeUrl(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
}
