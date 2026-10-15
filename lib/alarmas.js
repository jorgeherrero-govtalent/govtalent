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

import { creditosIncluidos, alarmasEquivalentes } from './precios';

export const LIMITES = {
  free: {
    alarmas: 1,
    frecuencias: ['semanal'],
    // Cuántas veces al mes se puede pedir al agente que proponga o
    // rehaga una alarma. Cada una cuesta lo mismo que crearla.
    propuestas_mes: 3,
  },
  // El plan de pago (Vigilancia). Con las horquillas (lib/precios.js) las
  // alarmas se pagan con créditos (CREDITOS_POR_ALARMA); hasta que la
  // reserva de créditos esté construida, el tope sigue siendo este, el
  // mismo que limite_alarmas() en la base de datos.
  pro: {
    alarmas: 50,
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

// Cuentas sin tope mensual de propuestas: las de demos comerciales. Sus
// propuestas se siguen registrando en ai_usage_log, así que el coste se
// ve igual; solo no se bloquean. Quien tenga role 'platform_admin' en
// users tampoco tiene tope. Para quitar una cuenta, basta con borrarla.
export const CUENTAS_SIN_TOPE = ['info@apinstitute.com'];

export const FUENTES_ALARMA = ['congreso', 'boe', 'comision', 'parlamento', 'consultas', 'consejo'];

/**
 * Límites del plan. Con `usuarios` (users.plan_usuarios: el tope de la
 * horquilla), el número de alarmas de pago sale de los créditos del plan:
 * cada alarma activa usa CREDITOS_POR_ALARMA al mes. Es el límite para
 * ACTIVAR alarmas (pantalla y trigger alarmas_limite).
 *
 * Sin `usuarios`, el de pago vale LIMITES.pro.alarmas (50): es el techo de
 * seguridad que usan la vigilancia y el Consejo para no evaluar de más.
 * No se baja ahí al de créditos: una alarma ya activa nunca se deja de
 * vigilar a mitad de mes (condiciones, 5.2).
 */
export function limitesDe(nivel, usuarios = null) {
  const base = LIMITES[nivel === 'pro' ? 'pro' : 'free'];
  if (nivel !== 'pro' || usuarios === null || usuarios === undefined) return base;
  return { ...base, alarmas: alarmasEquivalentes(creditosIncluidos(usuarios)) };
}

/** El error del trigger, traducido para el usuario. */
export function mensajeError(error) {
  const txt = String(error?.message || error || '');
  if (txt.includes('LIMITE_ALARMAS')) {
    return 'Has llegado al máximo de alarmas activas de tu plan. Desactiva una o suscríbete para tener hasta 50.';
  }
  return 'No se ha podido guardar la alarma.';
}
