// =====================================================================
// En trámite o ya publicado
// lib/etapaNormativa.js
//
// El agente separa lo que AÚN NO está en vigor (se está tramitando y se
// puede influir) de lo que YA se publicó (rige, o se acaba de aprobar).
// Se decide por el tipo de asunto (`kind` de regulatorio_search). Sin
// imports de servidor: lo usan la API y la pantalla.
// =====================================================================

// Asuntos que siguen abiertos: iniciativas, procedimientos, expedientes,
// consultas y la agenda del Gobierno.
const TRAMITE = new Set(['ley', 'actividad', 'procedimiento', 'expediente', 'consulta', 'ccaa', 'ccaa_tramite', 'agenda']);

export const KINDS_TRAMITE = ['ley', 'actividad', 'procedimiento', 'expediente', 'consulta', 'ccaa', 'agenda'];
export const KINDS_PUBLICADO = ['boe', 'diario', 'consejo', 'cnmc'];

/** 'tramite' | 'publicado' */
export function etapaDe(kind, titulo = '') {
  if (TRAMITE.has(kind)) return 'tramite';
  // El Consejo de Ministros aprueba también anteproyectos y proyectos de
  // ley: eso sigue su camino al Congreso y aún no rige.
  if (kind === 'consejo' && /\b(anteproyecto|proyecto de (ley|real decreto))\b/i.test(titulo)) return 'tramite';
  return 'publicado';
}
