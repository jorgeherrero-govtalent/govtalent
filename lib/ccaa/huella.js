// =====================================================================
// Huella de un trámite autonómico: los números de registro que cita
// lib/ccaa/huella.js
//
// La clave única de ccaa_tramites era (expediente, tipo, fecha, plazo): si
// dos grupos presentaban enmiendas el mismo día, la segunda se perdía (la
// LIDER, PL-10/2026, solo tenía las del PSOE). Desde sql/110 la clave
// incluye esta huella: los números de registro del acto (RGEP.20078/2026
// en Madrid, «reg. 113817» en Cataluña, comparecencias C-1179/2026),
// normalizados y ordenados. Un acto sin números tiene huella vacía y se
// comporta como antes. sql/110 calcula lo mismo en SQL para las filas que
// ya había: si cambia esta función, hay que cambiar también la migración.
// =====================================================================

const NUMEROS = /(RGEP\.?\s*\d+\/\d{2,4}|reg\.\s*\d+|C-\d+\/\d{4})/gi;

export function huellaTramite(descripcion) {
  const m = String(descripcion || '').match(NUMEROS) || [];
  return [...new Set(m.map((x) => x.toUpperCase().replace(/[\s.]/g, '')))].sort().join('|');
}
