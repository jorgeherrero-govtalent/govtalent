import datos29n from '@/lib/data/elecciones29n.json';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

export default function sitemap() {
  const hoy = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: hoy, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/elecciones-29n`, lastModified: new Date(`${datos29n.meta?.fecha || '2026-10-28'}T08:00:00Z`), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/condiciones`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacidad`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/cookies`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/legal`, lastModified: hoy, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
