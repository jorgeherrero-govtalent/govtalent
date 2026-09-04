import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

/**
 * Sin <head> escrito a mano.
 *
 * El App Router monta la cabecera él solo a partir de este objeto
 * `metadata`. Cuando además había un <head> en el JSX, las dos cabeceras
 * competían: con dos etiquetas pasaba desapercibido, y al añadir las de
 * Open Graph la hidratación se rompía y React reconstruía el documento
 * entero. La hoja de iconos de Tabler ahora se carga desde globals.css.
 */
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'GovTalent — Talento para asuntos públicos',
  description:
    "La plataforma de talento para profesionales de los asuntos públicos, la política y el gobierno.",
  openGraph: {
    title: 'GovTalent',
    description:
      'La plataforma all in one del ecosistema profesional de los asuntos públicos.',
    url: SITE_URL,
    siteName: 'GovTalent',
    locale: 'es_ES',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'GovTalent' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GovTalent',
    description:
      'La plataforma all in one del ecosistema profesional de los asuntos públicos.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
