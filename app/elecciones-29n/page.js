import PublicHeader from '@/components/PublicHeader';
import Elecciones29n from './Elecciones29n';
import datos from '@/lib/data/elecciones29n.json';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

const TITULO = 'Quién repite y quién llega al Congreso el 29N';
const DESCRIPCION = `${datos.d.filter((d) => d.d === 'no').length} de los 350 diputados no vuelven a presentarse. Explora el hemiciclo, quién llega al Congreso y los cargos del Gobierno que van en las listas.`;

export const metadata = {
  title: `${TITULO} | GovTalent`,
  description: DESCRIPCION,
  alternates: { canonical: `${SITE_URL}/elecciones-29n` },
  openGraph: {
    title: TITULO,
    description: DESCRIPCION,
    url: `${SITE_URL}/elecciones-29n`,
    siteName: 'GovTalent',
    locale: 'es_ES',
    type: 'article',
  },
};

// Datos estáticos (lib/data/elecciones29n.json): la página se sirve en caché.
// Se regenerarán con las candidaturas proclamadas el 3 de noviembre.
export default function Elecciones29nPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f0efe9' }}>
      <PublicHeader maxWidth={1180} />
      <Elecciones29n datos={datos} />
    </div>
  );
}
