// =====================================================================
// PRECIOS — una sola fuente de verdad para la página y el cobro
// lib/precios.js
//
// Un único plan de vigilancia, de 1 a 50 usuarios, con precio por
// tramos: el primer usuario paga el precio de una persona y cada tramo
// siguiente es más barato. El pago anual ahorra como máximo un 20 %.
// El directorio se contrata aparte. Precios sin IVA.
//
// Cuando se conecte Stripe, los precios por tramos ("graduated") deben
// coincidir con estas tablas; la página y el checkout leen de aquí.
// =====================================================================

export const MAX_USUARIOS = 50;

// [hasta el usuario n.º, € por usuario en ese tramo]
export const TRAMOS_MENSUAL = [
  [1, 129],
  [5, 98],
  [10, 72],
  [25, 60],
  [50, 50],
];
export const TRAMOS_ANUAL = [
  [1, 1240],
  [5, 940],
  [10, 690],
  [25, 580],
  [50, 520],
];

export const DIRECTORIO_ANUAL = 350;

// Lo que incluye: 50 alarmas por usuario hasta el 5.º y 25 por cada
// usuario más; 300 créditos de IA al mes por usuario. Todo compartido
// por el equipo.
export const ALARMAS_POR_USUARIO = 50;
export const ALARMAS_A_PARTIR_DEL_SEXTO = 25;
export const CREDITOS_POR_USUARIO = 300;

function porTramos(tramos, usuarios) {
  const n = Math.max(1, Math.min(MAX_USUARIOS, Math.round(usuarios) || 1));
  let total = 0;
  let desde = 0;
  for (const [hasta, precio] of tramos) {
    if (n <= desde) break;
    total += (Math.min(n, hasta) - desde) * precio;
    desde = hasta;
  }
  return total;
}

export const precioMensual = (usuarios) => porTramos(TRAMOS_MENSUAL, usuarios);
export const precioAnual = (usuarios) => porTramos(TRAMOS_ANUAL, usuarios);

export function alarmasIncluidas(usuarios) {
  const n = Math.max(1, Math.min(MAX_USUARIOS, Math.round(usuarios) || 1));
  return ALARMAS_POR_USUARIO * Math.min(n, 5) + ALARMAS_A_PARTIR_DEL_SEXTO * Math.max(0, n - 5);
}

export const creditosIncluidos = (usuarios) =>
  CREDITOS_POR_USUARIO * Math.max(1, Math.min(MAX_USUARIOS, Math.round(usuarios) || 1));

/** 1234 -> "1.234 €" (sin decimales, como en la página). */
export function euros(v) {
  return `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
}

export const miles = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
