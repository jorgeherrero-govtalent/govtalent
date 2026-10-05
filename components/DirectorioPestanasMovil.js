import Link from 'next/link';

/**
 * En el móvil no hay menú lateral y la barra inferior tiene una sola
 * entrada para el Directorio. Estas tres pestañas, solo visibles en
 * pantallas estrechas (.dir-movil en globals.css), llevan a las tres
 * partes: Instituciones, Organizaciones y Base de datos.
 */
const PESTANAS = [
  { id: 'instituciones', href: '/institutions', label: 'Instituciones' },
  { id: 'organizaciones', href: '/directorio/organizaciones', label: 'Organizaciones' },
  { id: 'base', href: '/instituciones/directorio', label: 'Base de datos' },
];

export default function DirectorioPestanasMovil({ activa }) {
  return (
    <nav className="dir-movil" aria-label="Secciones del directorio">
      {PESTANAS.map((p) => (
        <Link
          key={p.id}
          href={p.href}
          aria-current={p.id === activa ? 'page' : undefined}
          className={p.id === activa ? 'on' : undefined}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
