// Normaliza mayúsculas/minúsculas en ubicaciones para evitar duplicados como
// "Madrid" / "MADRID" / "madrid" apareciendo como valores distintos.
export function normalizeLocation(location) {
  if (!location) return '';
  return location
    .trim()
    .toLowerCase()
    .replace(/(^|[\s([-])([a-záéíóúñü])/g, (match, sep, letter) => sep + letter.toUpperCase());
}
