const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

// Se indexan la portada, los precios y las páginas legales. El resto de la
// plataforma pide sesión; aun así se cierran las rutas internas.
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/backoffice', '/auth/', '/onboarding', '/suscripcion', '/nueva-contrasena', '/calendario/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
