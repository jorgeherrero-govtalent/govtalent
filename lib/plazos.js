'use client';

/**
 * Cómo se dice un plazo.
 *
 * POR QUÉ NO "0 DÍAS". Cero días es una resta, no una fecha. Obliga a
 * traducir mentalmente algo que el idioma ya sabe decir en una palabra,
 * y encima "0" se lee como "ninguno" antes que como "hoy", que es justo
 * lo contrario de lo urgente que es.
 *
 * Las dos funciones cubren los dos sitios donde aparece un plazo en la
 * aplicación: la cifra grande con su unidad debajo, y la frase corrida.
 */

/**
 * Para el hueco de 44px con la cifra arriba y la unidad debajo.
 *
 *   0  → { cifra: 'Hoy',    unidad: '' }
 *   1  → { cifra: '1',      unidad: 'día' }
 *   9  → { cifra: '9',      unidad: 'días' }
 *  -2  → { cifra: 'Cerrado', unidad: '' }
 *
 * Con `unidad` vacía el segundo renglón no se pinta, así que "Hoy" queda
 * centrado en el hueco en vez de colgando sobre una línea vacía.
 *
 * "Hoy" en 19px no cabe en 44px, de ahí `tam`: quien lo use puede bajar
 * el tamaño solo cuando es una palabra.
 */
export function cifraPlazo(dias) {
  if (dias === null || dias === undefined) return { cifra: null, unidad: '', tam: 19 };
  if (dias < 0) return { cifra: 'Cerrado', unidad: '', tam: 11.5 };
  if (dias === 0) return { cifra: 'Hoy', unidad: '', tam: 14 };
  return { cifra: String(dias), unidad: dias === 1 ? 'día' : 'días', tam: 19 };
}

/**
 * Para meterlo dentro de una frase.
 *
 *   0 → 'hoy'
 *   1 → 'mañana'
 *   9 → 'en 9 días'
 *
 * "Mañana" para el 1 porque "en 1 día" no lo dice nadie.
 */
export function frasePlazo(dias) {
  if (dias === null || dias === undefined) return '';
  if (dias < 0) return 'ya cerrado';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return `en ${dias} días`;
}
