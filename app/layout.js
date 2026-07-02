import './globals.css';

export const metadata = {
  title: 'GovTalent — Talento para asuntos públicos',
  description:
    "La plataforma de talento para profesionales de los asuntos públicos, la política y el gobierno.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
