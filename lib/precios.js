// =====================================================================
// PRECIOS — una sola fuente de verdad para la página y el cobro
// lib/precios.js
//
// Vigilancia (15-10-2026): un plan por horquillas de usuarios. Cada
// horquilla tiene un precio cerrado y una bolsa de créditos mensuales
// para todo el equipo; más de 15 usuarios, a medida. El pago anual lleva
// un 15 % de descuento sobre doce mensualidades (redondeado a decenas).
//
// Precio fundador: los 5 primeros clientes pagan menos en las horquillas
// de equipo, y lo mantienen mientras sigan suscritos sin interrupción.
// La individual no tiene precio fundador.
//
// En Stripe cada horquilla es un precio fijo con lookup_key
// vigilancia_<id>_<mensual|anual> y, en las de equipo, su versión
// _fundador. Los importes de aquí y los de Stripe deben coincidir: la
// página lee de aquí y el checkout cobra lo que diga Stripe.
// El Directorio se contrata aparte. Precios sin IVA.
// =====================================================================

export const DESCUENTO_ANUAL = 0.15;
const anual = (mensual) => Math.round((mensual * 12 * (1 - DESCUENTO_ANUAL)) / 10) * 10;

// Créditos que gasta cada alarma activa al mes.
export const CREDITOS_POR_ALARMA = 20;

// Plazas con precio fundador.
export const PLAZAS_FUNDADOR = 5;

export const HORQUILLAS = [
  { id: 'individual', usuarios: 1, nombre: 'Individual', creditos: 150, mensual: 199, fundador: null, alarmasMax: 6 },
  { id: 'h3', usuarios: 3, nombre: 'Hasta 3 usuarios', creditos: 500, mensual: 449, fundador: 349 },
  { id: 'h6', usuarios: 6, nombre: 'Hasta 6 usuarios', creditos: 800, mensual: 750, fundador: 590 },
  { id: 'h10', usuarios: 10, nombre: 'Hasta 10 usuarios', creditos: 1200, mensual: 1090, fundador: 890 },
  { id: 'h15', usuarios: 15, nombre: 'Hasta 15 usuarios', creditos: 1600, mensual: 1390, fundador: 1150 },
].map((h) => ({
  ...h,
  anual: anual(h.mensual),
  fundadorAnual: h.fundador ? anual(h.fundador) : null,
}));

// Usuarios máximos con precio publicado; por encima, a medida.
export const MAX_USUARIOS = HORQUILLAS[HORQUILLAS.length - 1].usuarios;

export const horquilla = (id) => HORQUILLAS.find((h) => h.id === id) || null;

/** La horquilla que corresponde a un número de usuarios (o la última). */
export const horquillaPorUsuarios = (n) =>
  HORQUILLAS.find((h) => h.usuarios >= (Math.round(Number(n)) || 1)) || HORQUILLAS[HORQUILLAS.length - 1];

/** Precio que se cobra: oficial o fundador, mensual o anual. */
export function precioDe(h, { anual: esAnual = false, fundador = false } = {}) {
  if (!h) return null;
  const conFundador = fundador && h.fundador;
  if (esAnual) return conFundador ? h.fundadorAnual : h.anual;
  return conFundador ? h.fundador : h.mensual;
}

/** lookup_key del precio en Stripe. */
export function lookupVigilancia(h, { anual: esAnual = false, fundador = false } = {}) {
  return `vigilancia_${h.id}_${esAnual ? 'anual' : 'mensual'}${fundador && h.fundador ? '_fundador' : ''}`;
}

export const creditosIncluidos = (usuarios = 1) => horquillaPorUsuarios(usuarios).creditos;
export const alarmasEquivalentes = (creditos) => Math.floor(creditos / CREDITOS_POR_ALARMA);

/**
 * Alarmas activas a la vez que permite el plan. La individual tiene un
 * tope propio (6) para dejar créditos libres para el Asistente; las de
 * equipo, lo que dan sus créditos. Debe coincidir con limite_alarmas()
 * en la base de datos (sql/100).
 */
export const alarmasMaximas = (usuarios = 1) => {
  const h = horquillaPorUsuarios(usuarios);
  return h.alarmasMax ?? alarmasEquivalentes(h.creditos);
};

// Paquetes de créditos (pago único). Caducan a los 12 meses de la compra y
// se gastan después de los del mes. Stripe: creditos_ia_<n>.
export const PACKS_CREDITOS_IA = [
  { creditos: 500, precio: 89, lookup: 'creditos_ia_500' },
  { creditos: 1000, precio: 159, lookup: 'creditos_ia_1000' },
  { creditos: 2500, precio: 349, lookup: 'creditos_ia_2500' },
];
export const MESES_CADUCIDAD_PACKS = 12;

// Directorio (08-10-2026): 350 € al año con un usuario incluido y 80 € al
// año por cada usuario adicional con acceso. 25 créditos de contacto al
// mes por suscripción, compartidos por quienes tienen acceso.
export const DIRECTORIO_ANUAL = 350;
export const DIRECTORIO_USUARIO_EXTRA = 80;
export const CREDITOS_CONTACTO_MES = 25;
export const precioDirectorio = (usuarios = 1) =>
  DIRECTORIO_ANUAL + DIRECTORIO_USUARIO_EXTRA * Math.max(0, Math.round(usuarios || 1) - 1);

/** 1234 -> "1.234 €" (sin decimales, como en la página). */
export function euros(v) {
  return `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
}

export const miles = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
