'use client';

import { useEffect, useState } from 'react';

/**
 * El total del directorio institucional, contado y no escrito a mano.
 *
 * Lo usan el demo del directorio y la tarjeta de la home, que hasta ahora
 * llevaban la cifra copiada en el código. Con dos copias y un tercer
 * número en el panel del login, la contradicción era cuestión de tiempo:
 * el login anunciaba "+12.000" y el demo enseñaba "11.843".
 *
 * MIENTRAS CUENTA NO ENSEÑA NADA. Devuelve null hasta que la respuesta
 * llega, y quien lo usa decide qué pintar entretanto. Un número que
 * aparece y cambia a otro delante de quien está mirando es peor que un
 * hueco de medio segundo, sobre todo si quien mira es un cliente.
 *
 * SI FALLA, TAMBIÉN null. No hay cifra de reserva a propósito: una cifra
 * de reserva es exactamente el número escrito a mano del que venimos, y
 * volvería a envejecer sin que nadie se entere.
 */
export function useTotalDirectorio() {
  const [total, setTotal] = useState(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch('/api/instituciones/directorio/total');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelado && typeof json.total === 'number') setTotal(json.total);
      } catch {
        // Sin red o ruta caída: se queda en null y quien lo usa lo resuelve.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return total;
}

/** El total con separador de millar, o null si todavía no se sabe. */
export function formatearTotal(total) {
  return total === null || total === undefined ? null : total.toLocaleString('es-ES');
}
