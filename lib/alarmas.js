// =====================================================================
// ALARMAS — reglas compartidas por la pantalla, la API y la vigilancia
// lib/alarmas.js
//
// Aquí viven los límites por plan y los textos de cada frecuencia, para
// que la pantalla, la API y el cron no puedan decir cosas distintas.
//
// EL LÍMITE DE VERDAD ESTÁ EN LA BASE DE DATOS (sql/59, trigger
// alarmas_limite). Lo de aquí es para enseñarlo y para no gastar una
// llamada a la IA en algo que luego el trigger va a rechazar.
// =====================================================================

export const LIMITES = {
  free: {
    alarmas: 1,
    frecuencias: ['semanal'],
    // Cuántas veces al mes se puede pedir al agente que proponga o
    // rehaga una alarma. Cada una cuesta lo mismo que crearla.
    propuestas_mes: 3,
  },
  pro: {
    alarmas: 3,
    frecuencias: ['inmediato', 'diario', 'semanal'],
    propuestas_mes: 10,
  },
};

export const FRECUENCIAS = [
  {
    id: 'inmediato',
    label: 'Al momento',
    descripcion: 'En cuanto lo detectamos: plazos que se abren y cambios importantes.',
  },
  {
    id: 'diario',
    label: 'Cada mañana',
    descripcion: 'Un resumen a primera hora si hay novedades.',
  },
  {
    id: 'semanal',
    label: 'Los lunes',
    descripcion: 'Un resumen de la semana.',
  },
];

export const FUENTES_ALARMA = ['congreso', 'boe', 'comision', 'parlamento', 'consultas'];

export function limitesDe(nivel) {
  return LIMITES[nivel === 'pro' ? 'pro' : 'free'];
}

/** El error del trigger, traducido para el usuario. */
export function mensajeError(error) {
  const txt = String(error?.message || error || '');
  if (txt.includes('LIMITE_ALARMAS')) {
    return 'Has llegado al máximo de alarmas activas de tu plan. Desactiva una o pasa a Pro para tener hasta 3.';
  }
  return 'No se ha podido guardar la alarma.';
}
