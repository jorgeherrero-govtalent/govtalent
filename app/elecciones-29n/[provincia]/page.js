// Página de provincia del 29N: /elecciones-29n/valencia, /elecciones-29n/madrid…
// Las listas de cada partido al Congreso en la provincia (diputados que repiten
// y candidatos nuevos en puestos con opciones) y quién deja el Congreso.
// Página estática, sin JavaScript: pensada para buscadores y asistentes de IA.

import { notFound } from 'next/navigation';
import Logo from '@/components/Logo';
import { PieLanding } from '../../landing/LandingClient';
import '../../landing/landing.css';
import '../elecciones29n.css';
import datos from '@/lib/data/elecciones29n.json';
import cand from '@/lib/data/candidatos29n.json';
import cruce2023 from '@/lib/data/cruce2023.json';
import { fechaLarga } from '@/lib/elecciones29nTexto';
import {
  COLORES,
  provincias,
  provinciaPorSlug,
  slugProvincia,
  cifrasProvincia,
  destinoDiputado,
  listasProvincia,
  movimiento2023,
} from '@/lib/elecciones29nProvincias';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app').replace(/\/$/, '');
const PUBLICADA = '2026-10-28';
const ACTUALIZADA = datos.meta?.fecha || PUBLICADA;

export const dynamicParams = false;

export function generateStaticParams() {
  return provincias(datos).map((z) => ({ provincia: slugProvincia(z) }));
}

function textos(z) {
  const c = cifrasProvincia(datos, z);
  return {
    c,
    titulo: `Listas al Congreso por ${z} el 29N: quién repite y quién entra`,
    descripcion: `${c.no} de los ${c.total} diputados de ${z} no se presentan el 29N. Las listas de cada partido al Congreso, quién repite y quién puede entrar, con su cargo actual.`,
  };
}

export function generateMetadata({ params }) {
  const z = provinciaPorSlug(datos, params.provincia);
  if (!z) return {};
  const { titulo, descripcion } = textos(z);
  const url = `${SITE_URL}/elecciones-29n/${params.provincia}`;
  return {
    title: `${titulo} | GovTalent`,
    description: descripcion,
    alternates: { canonical: url },
    robots: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    openGraph: {
      title: titulo,
      description: descripcion,
      url,
      siteName: 'GovTalent',
      locale: 'es_ES',
      type: 'article',
      publishedTime: PUBLICADA,
      modifiedTime: ACTUALIZADA,
    },
    twitter: { card: 'summary_large_image', title: titulo, description: descripcion },
  };
}

const iniciales = (n) =>
  n
    .split(' ')
    .filter((w) => w.length > 2 && !/^(del|las|los)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

function Foto({ p }) {
  const color = COLORES[p.g] || '#9a978f';
  if (p.f) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="foto" src={p.f} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ borderColor: color }} />;
  }
  return (
    <span className="ini" style={{ borderColor: color, color }} aria-hidden="true">
      {iniciales(p.n)}
    </span>
  );
}

function Lista({ l }) {
  const ultimo = l.filas.length ? l.filas[l.filas.length - 1].o : 0;
  const estrenan = l.filas.filter((f) => f.nuevo && !f.a23).length;
  return (
    <div className="lista">
      <h3>
        <i style={{ background: l.color }} />
        {l.siglas}
      </h3>
      <div className="lista-ren">
        {estrenan} de {l.filas.length} se estrenan como candidatos
      </div>
      {l.filas.map((f, k) => (
        <div key={`${f.o}-${f.n}`}>
          <div className="fila">
            <span className="num">{f.o}</span>
            <Foto p={f} />
            <span className="nom">
              {f.n}
              {(f.cargo || f.vieneDe) && <small>{f.cargo || `Diputado por ${f.vieneDe}`}</small>}
              {f.a23 && (
                <small className={`m23 m23-${movimiento2023(f.o, f.a23).tipo}`}>En 2023: {movimiento2023(f.o, f.a23).texto}</small>
              )}
            </span>
            <span className={`etq ${f.nuevo ? 'nu' : 'si'}`}>{f.nuevo ? 'Nuevo' : 'Repite'}</span>
          </div>
          {f.o <= l.escanos && (l.filas[k + 1]?.o ?? Infinity) > l.escanos && ultimo > l.escanos && (
            <div className="corte">{l.escanos === 1 ? '1 escaño hoy' : `${l.escanos} escaños hoy`}</div>
          )}
        </div>
      ))}
      {ultimo <= l.escanos && l.escanos > 0 && (
        <div className="corte">
          {l.escanos === 1 ? '1 escaño hoy' : `${l.escanos} escaños hoy`}
        </div>
      )}
    </div>
  );
}

export default function PaginaProvincia({ params }) {
  const z = provinciaPorSlug(datos, params.provincia);
  if (!z) notFound();
  const { c, titulo, descripcion } = textos(z);
  const url = `${SITE_URL}/elecciones-29n/${params.provincia}`;
  const listas = listasProvincia(datos, cand, z, cruce2023);
  const salen = datos.d
    .filter((d) => d.z === z && !(d.d === 'congreso' && d.x?.z === z && !d.x?.p))
    .sort((a, b) => a.n.localeCompare(b.n, 'es'));
  const todas = provincias(datos);
  const i = todas.indexOf(z);
  const anterior = todas[(i - 1 + todas.length) % todas.length];
  const siguiente = todas[(i + 1) % todas.length];
  const m = datos.meta || {};

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Elecciones 29N', item: `${SITE_URL}/elecciones-29n` },
          { '@type': 'ListItem', position: 2, name: z, item: url },
        ],
      },
      {
        '@type': 'NewsArticle',
        headline: titulo,
        description: descripcion,
        datePublished: PUBLICADA,
        dateModified: ACTUALIZADA,
        inLanguage: 'es-ES',
        mainEntityOfPage: url,
        image: [`${url}/opengraph-image`],
        author: { '@type': 'Organization', name: 'GovTalent', url: SITE_URL },
        publisher: { '@type': 'Organization', name: 'GovTalent', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/govtalent-logo-email.png` } },
        isAccessibleForFree: true,
        about: { '@type': 'Event', name: 'Elecciones generales de España del 29 de noviembre de 2026', startDate: '2026-11-29' },
      },
    ],
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0efe9' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <header className="e29-cab">
        <div className="e29-cab-in">
          <a href="/" aria-label="GovTalent">
            <Logo height={24} />
          </a>
          <div className="e29-cab-acc">
            <a className="btn-ai" href="/login?view=signup">
              Crear cuenta gratis
            </a>
          </div>
        </div>
      </header>
      <main className="e29">
        <div className="wrap">
          <nav className="miga" aria-label="Ruta">
            <a href="/elecciones-29n">Elecciones 29N</a> / {z}
          </nav>
          <div className="hero" style={{ paddingTop: 18 }}>
            <div className="ante">Elecciones generales del 29 de noviembre</div>
            <h1>
              Las listas de <em>{z}</em>
            </h1>
            <p className="lead">
              {c.no === 0
                ? `Los ${c.total} diputados que tiene hoy ${z} vuelven a presentarse.`
                : `${c.no} de los ${c.total} diputados que tiene hoy ${z} no vuelven a presentarse.`}{' '}
              Así quedan las listas de cada partido al Congreso, con la línea de los escaños que tiene hoy.
            </p>
            <div className="fuente">
              Fuente: {m.boe} ({m.estado === 'proclamadas' ? 'candidaturas proclamadas' : 'candidaturas presentadas'}, {fechaLarga(m.fecha)}), cruzado con el Congreso de la XV Legislatura.
            </div>
          </div>

          {salen.length > 0 && (
            <section className="panel" style={{ marginTop: 20 }}>
              <h2 className="ante" style={{ margin: 0 }}>
                Dejan el Congreso por {z}
              </h2>
              <div className="chips-van">
                {salen.map((d) => (
                  <span key={d.n} className="chip-van">
                    <i style={{ background: COLORES[d.g] }} />
                    {d.n} ({d.g})<b>{destinoDiputado(d, z).texto}</b>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 24, letterSpacing: -0.6, margin: 0 }}>Las listas de cada partido</h2>
            <p className="lead" style={{ fontSize: 14.5, marginTop: 6 }}>
              Todos los candidatos de los partidos con representación hoy, por su número en la lista, y su puesto en 2023. «Repite»: es diputado hoy. «Nuevo»: no lo es.
            </p>
            <div className="listas">
              {listas.map((l) => (
                <Lista key={l.siglas} l={l} />
              ))}
            </div>
          </section>

          <nav className="otras" aria-label="Otras provincias">
            <a href={`/elecciones-29n/${slugProvincia(anterior)}`}>← {anterior}</a>
            <a href="/elecciones-29n#candidatos">Todas las provincias</a>
            <a href={`/elecciones-29n/${slugProvincia(siguiente)}`}>{siguiente} →</a>
          </nav>

          <section className="banda banda-c">
            <div className="ante-dk">Base de datos</div>
            <h2>
              El nuevo Congreso, <span>con todos sus contactos</span>
            </h2>
            <p>
              Cuando se constituyan las Cortes tendrás el directorio completo y actualizado: Gobierno y sus equipos, diputados, grupos parlamentarios, comisiones, senadores y asesores, con su cargo y su contacto.
            </p>
            <div className="banda-btns" style={{ justifyContent: 'center' }}>
              <a className="btn-ai e29-btn" href="/login?view=signup">
                Crear cuenta gratis
              </a>
            </div>
          </section>
        </div>
      </main>
      <PieLanding />
    </div>
  );
}
