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
      { source: '/organizations/admin/plan', destination: '/account?tab=plan', permanent: false },
      ...escondidas.map((s) => ({
        source: `/organizations/admin/${s}`,
        destination: '/account',
        permanent: false,
      })),
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
