const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

// Se indexan la portada y las páginas legales. Los precios solo se ven
// dentro de la plataforma, con sesión. El resto de la
// plataforma pide sesión; aun así se cierran las rutas internas.
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/backoffice', '/auth/', '/onboarding', '/suscripcion', '/nueva-contrasena', '/calendario/', '/precios'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
