import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * La cabecera de las páginas públicas.
 *
 * El enlace de la derecha es solo volver atrás: en una página que se
 * abre en pestaña nueva —precios, por ejemplo— "Ir a mi organización"
 * llevaba a un sitio distinto del que se venía, y dejaba la pestaña
 * anterior abierta detrás.
 */
export default function PublicHeader({ maxWidth = 760, volverHref = '/' }) {
  return (
    <div className="pub-header">
      <div className="pub-header-inner" style={{ maxWidth }}>
        {/* Sin eslogan bajo el logo: en páginas que ya tienen su propio
            titular, repetía el mensaje dos veces en la misma pantalla. */}
        <div className="pub-header-brand">
          <Link href="/jobs" className="pub-header-logo" aria-label="GovTalent">
            <Logo height={24} />
          </Link>
        </div>
        <Link href={volverHref} className="pub-header-link">
          <i className="ti ti-arrow-left" style={{ fontSize: 13, verticalAlign: -1, marginRight: 5 }}></i>
          Volver
        </Link>
      </div>
    </div>
  );
}
