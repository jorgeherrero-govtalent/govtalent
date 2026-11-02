// Imagen para redes de cada página de provincia del 29N (1200x630).
// Titular con la provincia y los primeros candidatos nuevos de sus listas.
import { ImageResponse } from 'next/og';
import datos from '@/lib/data/elecciones29n.json';
import { COLORES, provincias, provinciaPorSlug, slugProvincia, cifrasProvincia, listasProvincia } from '@/lib/elecciones29nProvincias';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Las listas de la provincia en las elecciones del 29N';

export function generateStaticParams() {
  return provincias(datos).map((z) => ({ provincia: slugProvincia(z) }));
}

const iniciales = (n) =>
  n.split(' ').filter((w) => w.length > 2 && !/^(del|las|los)$/i.test(w)).slice(0, 2).map((w) => w[0]).join('');

export default function Imagen({ params }) {
  const z = provinciaPorSlug(datos, params.provincia) || 'España';
  const c = cifrasProvincia(datos, z);
  // Primero los nuevos; si no hay, los primeros de cada lista.
  const filas = listasProvincia(datos, z).flatMap((l) => l.filas.map((f) => ({ ...f, siglas: l.grupo })));
  const destacados = [...filas.filter((f) => f.nuevo), ...filas.filter((f) => !f.nuevo)].slice(0, 4);
  const subtitulo =
    c.no === 0 ? `Los ${c.total} diputados vuelven a presentarse.` : `${c.no} de ${c.total} diputados se van. Quién llega en su lugar.`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#0e0d18', color: '#fff', position: 'relative', fontFamily: 'sans-serif' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', backgroundImage: 'radial-gradient(circle at 100% 0%, rgba(109,90,239,0.6), rgba(14,13,24,0) 55%), radial-gradient(circle at 0% 100%, rgba(29,111,92,0.4), rgba(14,13,24,0) 50%)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 0 56px 70px', width: 590 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', color: '#cfc7ff', fontWeight: 600 }}>Elecciones 29N</div>
            <div style={{ fontSize: z.length > 14 ? 66 : 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1, marginTop: 22 }}>{`Las listas de ${z}`}</div>
            <div style={{ fontSize: 28, color: '#b9b5cc', marginTop: 24, lineHeight: 1.3 }}>{subtitulo}</div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 700 }}>GovTalent</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', margin: '80px 70px 0 auto', width: 470, padding: 30, borderRadius: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', alignSelf: 'flex-start' }}>
          {destacados.map((f) => {
            const color = COLORES[f.g] || '#9a978f';
            return (
              <div key={f.n} style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
                <div style={{ width: 58, height: 58, borderRadius: 29, border: `3px solid ${color}`, background: '#fff', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, marginRight: 16 }}>
                  {iniciales(f.n)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', width: 330 }}>
                  <div style={{ fontSize: 24, fontWeight: 650 }}>{f.n}</div>
                  <div style={{ fontSize: 19, color: '#b9b5cc' }}>{`${f.siglas}, número ${f.o}${f.nuevo ? '' : ' (repite)'}`}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    size
  );
}
