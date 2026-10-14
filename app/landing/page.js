import './landing.css';
import LandingClient from './LandingClient';

/**
 * Portada pública. El middleware sirve esta página en govtalent.app/ a quien
 * no tiene sesión (reescritura, la dirección sigue siendo /); quien entra
 * directamente en /landing vuelve a /, para que solo exista una dirección.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';
const TITULO = 'GovTalent | Vigilancia normativa con IA y directorio del sector público';
const DESCRIPCION =
  'Desde la primera señal normativa hasta el contacto de quien la tramita: diseñada para que tu organización sea más eficiente con IA.';

export const metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    title: TITULO,
    description: DESCRIPCION,
    url: '/',
    siteName: 'GovTalent',
    locale: 'es_ES',
    type: 'website',
    images: [{ url: '/landing/og.png', width: 1200, height: 630, alt: 'GovTalent' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITULO,
    description: DESCRIPCION,
    images: ['/landing/og.png'],
  },
};

const LD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'GovTalent',
    url: SITE_URL,
    logo: `${SITE_URL}/govtalent-logo.svg`,
    email: 'hola@govtalent.app',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'GovTalent',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: DESCRIPCION,
    inLanguage: 'es',
  },
];

export default function Landing() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }} />
      <LandingClient />
    </>
  );
}
