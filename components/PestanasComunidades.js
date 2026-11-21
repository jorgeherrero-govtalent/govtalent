'use client';

import Link from 'next/link';

/**
 * Pestañas de Instituciones › Comunidades autónomas: Parlamentos y
 * Gobiernos (21-11-2026). Mismo estilo que las de las secciones fusionadas
 * del directorio (components/DirectorioListado.js).
 */
export const PESTANAS_COMUNIDADES = [
  { href: '/institutions/comunidades', titulo: 'Parlamentos' },
  { href: '/institutions/comunidades/gobiernos', titulo: 'Gobiernos' },
];

export const pestanasComunidades = (activa) => PESTANAS_COMUNIDADES.map((p) => ({ ...p, activa: p.titulo === activa }));

const NAV = { display: 'flex', gap: 22, fontSize: 14, borderBottom: '1px solid #ececef', marginBottom: 18 };
const PESTANA = { color: '#6b6b70', textDecoration: 'none', paddingBottom: 10 };
const PESTANA_ON = { ...PESTANA, color: '#1a1a18', fontWeight: 600, borderBottom: '2px solid #1a1a18' };

export default function PestanasComunidades({ activa }) {
  return (
    <nav aria-label="Comunidades autónomas" style={NAV}>
      {pestanasComunidades(activa).map((p) => (
        <Link key={p.href} href={p.href} aria-current={p.activa ? 'page' : undefined} style={p.activa ? PESTANA_ON : PESTANA}>
          {p.titulo}
        </Link>
      ))}
    </nav>
  );
}
