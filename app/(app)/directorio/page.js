import Link from 'next/link';
import DirectorioCaras from '@/components/DirectorioCaras';

/**
 * Portada de Directorio (10-11-2026; canvas «GovTalent: navegación con
 * tres productos», «Portada 4. Tarjetas ilustradas»).
 *
 * Es la entrada «Directorio» del menú: dos tarjetas grandes, Instituciones
 * y Organizaciones, con una ilustración sobre fondo de puntos en la mitad
 * de arriba (estilo del modal «Crear campaña» de Enginy), y una fila «Más
 * consultados». Sin subtítulo (decisión de Jorge). Las ilustraciones son
 * dibujos con ejemplos reales: el Gobierno con sus caras (leídas en vivo,
 * components/DirectorioCaras.js) y tres organizaciones del directorio.
 */

const PUNTOS = {
  backgroundColor: '#fafaf8',
  backgroundImage: 'radial-gradient(#dcdbd4 1px, transparent 1px)',
  backgroundSize: '18px 18px',
};

const MAS_CONSULTADOS = [
  { href: '/institutions/comisiones', icono: 'ti-building-community', titulo: 'Congreso de los Diputados', texto: 'Diputados, grupos, comisiones y asesores.' },
  { href: '/institutions/ministries', icono: 'ti-building-bank', titulo: 'Ministerios', texto: 'Organigramas y altos cargos de cada ministerio.' },
  { href: '/institutions/comunidades', icono: 'ti-map', titulo: 'Comunidades autónomas', texto: 'Gobiernos y parlamentos de las 17 comunidades.' },
  { href: '/directorio/organizaciones/patronales', icono: 'ti-building-factory-2', titulo: 'Patronales y asociaciones', texto: 'Quién representa a cada sector.' },
];

function IlustracionInstituciones() {
  return (
    <div className="gt-dir-ilu" style={PUNTOS} aria-hidden="true">
      <span className="gt-dir-chip">Al día con el BOE</span>
      <div className="gt-dir-mini">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: '#f0efe9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-building-bank" style={{ fontSize: 17, color: '#1a1a18' }} />
          </span>
          <b style={{ fontSize: 14.5 }}>Gobierno de España</b>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 14, borderLeft: '2px solid #e5e4de', marginLeft: 14 }}>
          <span style={{ fontSize: 12.5, color: '#55524c' }}>Presidencia y vicepresidencias</span>
          <span style={{ fontSize: 12.5, color: '#55524c' }}>22 ministerios</span>
        </div>
        <div style={{ borderTop: '1px solid #efeee8', paddingTop: 10 }}>
          <DirectorioCaras />
        </div>
      </div>
    </div>
  );
}

function IlustracionOrganizaciones() {
  // Ejemplos reales del directorio (directorio_entidades).
  const filas = [
    ['CEOE', 'Patronal', 'ti-building-factory-2'],
    ['Cámara de Comercio de España', 'Cámara de Comercio', 'ti-building-store'],
    ['Consejo General de la Abogacía Española', 'Consejo General', 'ti-scale'],
  ];
  return (
    <div className="gt-dir-ilu" style={PUNTOS} aria-hidden="true">
      <div className="gt-dir-mini" style={{ padding: '8px 14px', gap: 0 }}>
        {filas.map(([t, tipo, icono], i) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid #efeee8' : 'none' }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, background: '#f0efe9', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={`ti ${icono}`} style={{ fontSize: 15, color: '#55524c' }} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</span>
              <span style={{ fontSize: 11.5, color: '#6e6a63' }}>{tipo}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Grande({ href, icono, titulo, texto, children }) {
  return (
    <Link href={href} className="gt-dir-grande">
      {children}
      <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className={`ti ${icono}`} style={{ fontSize: 20, color: '#1a1a18' }} aria-hidden="true" />
          <b style={{ fontSize: 19, letterSpacing: '-.2px' }}>{titulo}</b>
        </span>
        <span style={{ color: '#55524c', fontSize: 14.5 }}>{texto}</span>
      </div>
    </Link>
  );
}

const ESTILOS = `
.gt-dir-dos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.gt-dir-cuatro { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.gt-dir-grande { background: #fff; border: 1px solid #e5e4de; border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; text-decoration: none; color: #1a1a18; box-shadow: 0 1px 2px rgba(26,26,24,.04); transition: border-color .15s, box-shadow .15s; }
.gt-dir-grande:hover, .gt-dir-peq:hover { border-color: #d3d1c9; box-shadow: 0 4px 14px rgba(26,26,24,.07); }
.gt-dir-grande:focus-visible, .gt-dir-peq:focus-visible { outline: 2px solid #6d5aef; outline-offset: 2px; }
.gt-dir-ilu { height: 210px; border-bottom: 1px solid #e5e4de; display: flex; align-items: center; justify-content: center; position: relative; }
.gt-dir-mini { background: #fff; border: 1px solid #e5e4de; border-radius: 12px; box-shadow: 0 6px 18px rgba(26,26,24,.08); padding: 14px 16px; width: 300px; max-width: calc(100% - 32px); display: flex; flex-direction: column; gap: 10px; }
.gt-dir-chip { position: absolute; top: 14px; right: 14px; font-size: 12px; color: #6d5aef; font-weight: 600; background: #f3f1fe; border: 1px solid #d9d3fb; border-radius: 7px; padding: 3px 8px; }
.gt-dir-peq { background: #fff; border: 1px solid #e5e4de; border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; text-decoration: none; color: #1a1a18; transition: border-color .15s, box-shadow .15s; }
.gt-dir-ico { width: 32px; height: 32px; border-radius: 9px; background: #f3f1fe; display: flex; align-items: center; justify-content: center; }
@media (max-width: 1000px) { .gt-dir-cuatro { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 720px) {
  .gt-dir-dos, .gt-dir-cuatro { grid-template-columns: 1fr; }
  .gt-dir-ilu { height: 180px; }
  .gt-dir-chip { display: none; }
}
`;

export default function DirectorioPortada() {
  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <style>{ESTILOS}</style>
      <h1 style={{ fontSize: 21, fontWeight: 600, margin: '0 0 20px', letterSpacing: '-.3px' }}>Directorio</h1>

      <div className="gt-dir-dos">
        <Grande href="/institutions" icono="ti-building-bank" titulo="Instituciones" texto="Congreso, Senado, Gobierno, comunidades autónomas y Unión Europea.">
          <IlustracionInstituciones />
        </Grande>
        <Grande href="/directorio/organizaciones" icono="ti-users" titulo="Organizaciones" texto="Patronales, asociaciones, corporaciones, empresa pública y medios.">
          <IlustracionOrganizaciones />
        </Grande>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 26 }}>
        <span style={{ alignSelf: 'flex-start', fontSize: 13, color: '#6d5aef', fontWeight: 600, background: '#f3f1fe', borderRadius: 7, padding: '4px 10px' }}>
          Más consultados
        </span>
        <div className="gt-dir-cuatro">
          {MAS_CONSULTADOS.map((m) => (
            <Link key={m.href} href={m.href} className="gt-dir-peq">
              <span className="gt-dir-ico">
                <i className={`ti ${m.icono}`} style={{ fontSize: 18, color: '#6d5aef' }} aria-hidden="true" />
              </span>
              <b style={{ fontSize: 15.5 }}>{m.titulo}</b>
              <span style={{ color: '#55524c', fontSize: 13.5, lineHeight: 1.45 }}>{m.texto}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
