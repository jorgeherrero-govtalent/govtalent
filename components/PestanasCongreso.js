'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Las pestañas del Congreso, en un solo sitio.
 *
 * POR QUÉ UN COMPONENTE Y NO EL MISMO JSX EN CADA PÁGINA: estaba
 * copiado cuatro veces —Diputados, Grupos, Comisiones y Órganos de
 * gobierno— y cada una llevaba su propia marca de pestaña activa. Con
 * cuatro copias, cambiar el orden significa acertar cuatro veces, y basta
 * fallar en una para que el usuario vea las pestañas bailar al navegar.
 *
 * La activa se deduce de la ruta y no de una prop: la ruta ya es la
 * verdad, y pasarla a mano abre la puerta a que una página se declare
 * activa en la pestaña equivocada.
 *
 * EL ORDEN es el del uso, no el del organigrama: se entra a buscar la
 * comisión que tramita un asunto mucho más a menudo que a mirar la ficha
 * de un grupo parlamentario.
 */

const PESTANAS = [
  { href: '/institutions/comisiones', label: 'Comisiones' },
  { href: '/institutions/deputies', label: 'Diputados' },
  { href: '/institutions/organos-gobierno', label: 'Órganos de gobierno' },
  { href: '/institutions/groups', label: 'Grupos parlamentarios' },
];

const VERDE = '#1d6f5c';

export default function PestanasCongreso() {
  const pathname = usePathname();

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        borderBottom: '.5px solid #e0dfd8',
        marginBottom: 14,
        flexWrap: 'wrap',
      }}
    >
      {PESTANAS.map((p) => {
        // startsWith y no igualdad estricta: desde la ficha de una
        // comisión la pestaña debe seguir marcada.
        const activa = pathname === p.href || pathname.startsWith(p.href + '/');

        if (activa) {
          return (
            <span
              key={p.href}
              aria-current="page"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: VERDE,
                borderBottom: `2px solid ${VERDE}`,
                paddingBottom: 8,
              }}
            >
              {p.label}
            </span>
          );
        }

        return (
          <Link
            key={p.href}
            href={p.href}
            style={{ fontSize: 13, color: '#999', paddingBottom: 8, textDecoration: 'none' }}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
