'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * Botón de vuelta atrás basado en el historial del navegador.
 *
 * POR QUÉ ASÍ y no pasando el origen en la URL:
 * a una misma ficha se llega desde varios sitios —el directorio del
 * Parlamento, una comisión, los actores de un expediente, los ponentes de
 * un procedimiento— y los caminos se encadenan. Pasar el origen obligaría
 * a apilarlo, y además se rompe si la ficha se abre en pestaña nueva o se
 * llega desde un buscador.
 *
 * El historial ya resuelve todo eso y coincide con lo que el usuario
 * espera del botón atrás de su navegador.
 *
 * SI NO HAY HISTORIAL —entrada directa, enlace compartido, buscador— se
 * cae al enlace de la sección, que es la única vuelta posible. Por eso
 * `fallbackHref` es obligatorio.
 */
export default function BackLink({ fallbackHref, fallbackLabel = 'Volver' }) {
  const router = useRouter();
  const [hayHistorial, setHayHistorial] = useState(false);

  useEffect(() => {
    // window.history.length > 1 no basta: en una pestaña nueva vale 1,
    // pero tras una recarga puede valer más sin que haya página anterior
    // dentro del sitio. document.referrer del mismo origen es la señal
    // fiable de que se llegó navegando desde dentro.
    try {
      const mismoOrigen =
        typeof document !== 'undefined' &&
        document.referrer &&
        new URL(document.referrer).origin === window.location.origin;
      setHayHistorial(!!mismoOrigen && window.history.length > 1);
    } catch {
      setHayHistorial(false);
    }
  }, []);

  const estilo = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11.5,
    color: '#999',
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  };

  if (!hayHistorial) {
    return (
      <Link href={fallbackHref} style={estilo}>
        <i className="ti ti-arrow-left" style={{ fontSize: 13 }} aria-hidden="true"></i>
        {fallbackLabel}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => router.back()} style={estilo}>
      <i className="ti ti-arrow-left" style={{ fontSize: 13 }} aria-hidden="true"></i>
      Atrás
    </button>
  );
}
