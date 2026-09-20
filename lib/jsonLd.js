// Serializa datos estructurados (JSON-LD) para incrustarlos en un
// <script type="application/ld+json"> con dangerouslySetInnerHTML.
//
// JSON.stringify no escapa "<", así que un texto editable que contenga
// "</script>" cerraba la etiqueta y lo que viniera detrás se ejecutaba como
// HTML bajo govtalent.app (auditoría, punto 4). Escapando <, > y & como
// secuencias \u, el JSON sigue siendo idéntico para los buscadores y el
// navegador ya no puede ver etiquetas dentro. U+2028 y U+2029 se escapan
// porque algunos analizadores los tratan como saltos de línea.
//
// Referencia: https://nextjs.org/docs/app/guides/json-ld
export function serializeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
