/** @type {import('next').NextConfig} */
const nextConfig = {
  // Administración de la organización escondida (06-10-2026): lo útil de
  // Configuración vive ahora en /account; Página, Ofertas, Candidatos,
  // Registro y Plan quedan fuera hasta que vuelva Empleo. Temporales, no
  // permanentes: las rutas siguen en el código.
  async redirects() {
    const escondidas = ['company', 'jobs', 'candidates', 'registro', 'settings'];
    return [
      { source: '/organizations/admin', destination: '/account', permanent: false },
      // El Buscador vive dentro de Base de datos (11-11-2026). Las listas siguen en /contactos/listas.
      { source: '/contactos', destination: '/instituciones/directorio', permanent: false },
      { source: '/institutions/senado', destination: '/institutions/senado/senadores', permanent: false },
      { source: '/organizations/admin/plan', destination: '/account?tab=plan', permanent: false },
      ...escondidas.map((s) => ({
        source: `/organizations/admin/${s}`,
        destination: '/account',
        permanent: false,
      })),
    ];
  },
  // El Senado usa las pantallas de los parlamentos autonómicos
  // (app/(app)/institutions/parlamentos/[p]) con su propia dirección:
  // /institutions/senado/senadores/<slug> y /institutions/senado/grupos.
  async rewrites() {
    return [
      { source: '/institutions/senado/senadores', destination: '/institutions/parlamentos/senado/diputados' },
      { source: '/institutions/senado/senadores/:slug', destination: '/institutions/parlamentos/senado/diputados/:slug' },
      { source: '/institutions/senado/grupos', destination: '/institutions/parlamentos/senado/grupos' },
      { source: '/institutions/senado/grupos/:slug', destination: '/institutions/parlamentos/senado/grupos/:slug' },
    ];
  },
  // MuPDF y pdf.js (lib/textoPdf.js) se cargan tal cual en el servidor, sin empaquetar.
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist', 'mupdf'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
};

module.exports = nextConfig;
