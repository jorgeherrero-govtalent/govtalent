import Elecciones29n from './Elecciones29n';
import datosBase from '@/lib/data/elecciones29n.json';
import cand from '@/lib/data/candidatos29n.json';
import BuscadorCandidatos from './BuscadorCandidatos';
import { provincias, slugProvincia, listasProvincia } from '@/lib/elecciones29nProvincias';
import { htmlInicial } from '@/lib/elecciones29nSsr';
import { cifras, preguntas, URL_PAGINA, URL_MD } from '@/lib/elecciones29nTexto';

const datos = datosBase;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';

const TITULO = 'Quién repite y quién llegará al Congreso el 29N';
const C = cifras(datos);
const DESCRIPCION = `${C.no} de los 350 diputados no vuelven a presentarse. Explora el hemiciclo, quién llegará al Congreso y los cargos del Gobierno que van en las listas.`;
const IMAGEN = `${SITE_URL}/og/elecciones-29n.png`;
const PUBLICADA = '2026-10-28';
const ACTUALIZADA = datos.meta?.fecha || PUBLICADA;

export const metadata = {
  title: `${TITULO} | GovTalent`,
  description: DESCRIPCION,
  keywords: [
    'elecciones generales 29N',
    'elecciones generales 2026',
    'candidaturas Congreso 2026',
    'diputados que repiten',
    'listas electorales 29 de noviembre',
    'nuevo Congreso XVI Legislatura',
  ],
  alternates: {
    canonical: `${SITE_URL}/elecciones-29n`,
    types: { 'text/markdown': URL_MD },
  },
  robots: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  openGraph: {
    title: TITULO,
    description: DESCRIPCION,
    url: `${SITE_URL}/elecciones-29n`,
    siteName: 'GovTalent',
    locale: 'es_ES',
    type: 'article',
    publishedTime: PUBLICADA,
    modifiedTime: ACTUALIZADA,
    images: [{ url: IMAGEN, width: 1200, height: 630, alt: TITULO }],
  },
  twitter: { card: 'summary_large_image', title: TITULO, description: DESCRIPCION, images: [IMAGEN] },
};

// Datos estructurados: artículo, conjunto de datos y preguntas frecuentes,
// todo calculado con los mismos datos que pinta la página.
function datosEstructurados() {
  const editor = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organizacion`,
    name: 'GovTalent',
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/govtalent-logo-email.png` },
    sameAs: ['https://www.youtube.com/@GovTalent'],
  };
  const eleccion = {
    '@type': 'Event',
    name: 'Elecciones generales de España del 29 de noviembre de 2026',
    startDate: '2026-11-29',
    eventStatus: 'https://schema.org/EventScheduled',
    location: { '@type': 'Country', name: 'España' },
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      editor,
      {
        '@type': 'NewsArticle',
        '@id': `${URL_PAGINA}#articulo`,
        headline: TITULO,
        description: DESCRIPCION,
        image: [IMAGEN],
        datePublished: PUBLICADA,
        dateModified: ACTUALIZADA,
        inLanguage: 'es-ES',
        mainEntityOfPage: URL_PAGINA,
        author: { '@id': `${SITE_URL}/#organizacion` },
        publisher: { '@id': `${SITE_URL}/#organizacion` },
        about: eleccion,
        isAccessibleForFree: true,
      },
      {
        '@type': 'Dataset',
        '@id': `${URL_PAGINA}#datos`,
        name: 'Diputados de la XV Legislatura y candidatos al Congreso en las elecciones del 29N',
        description: `Destino de los ${C.total} diputados de la XV Legislatura en las candidaturas del 29N (${C.repiten} repiten, ${C.senado} pasan al Senado, ${C.suplentes} suplentes y ${C.no} no se presentan) y ${C.nuevos} candidatos que pueden llegar nuevos al Congreso, con su cargo actual.`,
        url: URL_PAGINA,
        inLanguage: 'es-ES',
        dateModified: ACTUALIZADA,
        creator: { '@id': `${SITE_URL}/#organizacion` },
        isBasedOn: `https://www.boe.es/diario_boe/txt.php?id=${datos.meta?.boe}`,
        spatialCoverage: { '@type': 'Country', name: 'España' },
        temporalCoverage: '2026-11-29',
        isAccessibleForFree: true,
        distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/markdown', contentUrl: URL_MD }],
      },
      {
        '@type': 'FAQPage',
        '@id': `${URL_PAGINA}#preguntas`,
        mainEntity: preguntas(datos).map((p) => ({
          '@type': 'Question',
          name: p.q,
          acceptedAnswer: { '@type': 'Answer', text: p.a },
        })),
      },
    ],
  };
}

// Filas del buscador de candidatos: por provincia, por lista (de más a menos
// escaños hoy) y por puesto. Formato compacto: [nombre, provincia, slug,
// siglas, grupo, puesto, repite, cargo].
const GRUPOS = ['PSOE', 'PP', 'VOX', 'Sumar', 'Podemos', 'ERC', 'Junts', 'Bildu', 'PNV', 'BNG', 'CC'];
function tablaCandidatos() {
  const filas = [];
  const zs = provincias(datos);
  zs.forEach((z) => {
    const slug = slugProvincia(z);
    listasProvincia(datos, cand, z).forEach((l) => {
      l.filas.forEach((f) => filas.push([f.n, z, slug, l.siglas, l.grupo, f.o, f.nuevo ? 0 : 1, f.cargo || '']));
    });
  });
  const usados = new Set(filas.map((f) => f[4]));
  return { filas, provincias: zs, partidos: GRUPOS.filter((g) => usados.has(g)) };
}

// Datos estáticos (lib/data/elecciones29n.json): la página se sirve en caché
// y se pinta en el servidor una sola vez por despliegue.
export default function Elecciones29nPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f0efe9' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datosEstructurados()).replace(/</g, '\\u003c') }}
      />
      <Elecciones29n datos={datos} inicial={htmlInicial(datos)}>
        <div className="e29">
          <div className="wrap">
            <BuscadorCandidatos {...tablaCandidatos()} />
            <section className="banda banda-c">
              <div className="ante-dk">Elecciones generales del 29 de noviembre</div>
              <h2>
                Toda la actividad legislativa e institucional, <span>en un mismo lugar</span>
              </h2>
              <p>Vigilancia normativa con IA, avisos en tiempo real y la mayor base de datos del sector público, con más de 27.000 cargos y su contacto.</p>
              <div className="banda-btns" style={{ justifyContent: 'center' }}>
                <a className="btn-ai e29-btn" href="/login?view=signup">
                  Crear cuenta gratis
                </a>
              </div>
            </section>
          </div>
        </div>
      </Elecciones29n>
    </div>
  );
}
