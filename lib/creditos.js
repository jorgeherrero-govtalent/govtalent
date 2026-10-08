// Créditos del Directorio (sql/75).
//
// · 25 créditos de contacto al mes por suscripción al Directorio (no por
//   usuario), que no se acumulan.
// · Packs de pago único que no caducan (Stripe: creditos_100/500/1000).
// · Primero se gastan los del mes y después los comprados.
// · Bolsa común: la de la organización si el usuario pertenece a una.
// · Buscar es gratis; un crédito = enriquecer una persona, y solo se cobra
//   si se encuentra algo.
//
// Solo servidor: las funciones SQL solo las puede ejecutar service_role.

export const CREDITOS_MES_POR_USUARIO = 25; // por suscripción al Directorio (nombre heredado)

// El precio vive en Stripe (lookup_key) y el número de créditos va en los
// metadatos del precio. Aquí solo lo que hace falta para pintar los packs.
export const PACKS_CREDITOS = [
  { creditos: 100, lookup: 'creditos_100', precio: 35 },
  { creditos: 500, lookup: 'creditos_500', precio: 170 },
  { creditos: 1000, lookup: 'creditos_1000', precio: 340 },
];

export function packPorCreditos(n) {
  return PACKS_CREDITOS.find((p) => p.creditos === Number(n)) || null;
}

/** Saldo de la bolsa del usuario. Nunca lanza: si falla, saldo a cero. */
export async function saldoCreditos(admin, userId) {
  const { data, error } = await admin.rpc('creditos_saldo', { p_user: userId });
  if (error) {
    console.error('[creditos] saldo:', error.message);
    return { mensuales: 0, mensuales_usados: 0, mensuales_disponibles: 0, comprados: 0, disponibles: 0, compartida: false, renuevan: null };
  }
  return data;
}

/** Gasta créditos. Devuelve { ok, disponibles } u { ok: false, error }. */
export async function consumirCreditos(admin, userId, cantidad, concepto, referencia = null) {
  const { data, error } = await admin.rpc('creditos_consumir', {
    p_user: userId,
    p_cantidad: cantidad,
    p_concepto: concepto,
    p_referencia: referencia,
  });
  if (error) {
    console.error('[creditos] consumir:', error.message);
    return { ok: false, error: 'No se pudieron descontar los créditos' };
  }
  return data;
}

/** Suma una compra. Idempotente por la referencia (id de la sesión). */
export async function sumarCompraCreditos(admin, userId, cantidad, referencia, concepto) {
  const { data, error } = await admin.rpc('creditos_sumar_compra', {
    p_user: userId,
    p_cantidad: cantidad,
    p_referencia: referencia,
    p_concepto: concepto || null,
  });
  if (error) throw new Error(`No se pudieron sumar los créditos: ${error.message}`);
  if (!data?.ok) throw new Error(data?.error || 'No se pudieron sumar los créditos');
  return data;
}
