const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

export default function sitemap() {
  const hoy = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: hoy, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/precios`, lastModified: hoy, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/condiciones`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacidad`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/cookies`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/legal`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
