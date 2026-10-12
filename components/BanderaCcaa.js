/**
 * Bandera de una comunidad o ciudad autónoma, dibujada en SVG y
 * simplificada: los colores y la disposición de cada bandera oficial, sin
 * los escudos (a 30 px no se distinguen y ensucian). Sirve para reconocer
 * la comunidad de un vistazo en los listados.
 *
 * <BanderaCcaa ccaa="Madrid" />  — el nombre tal como viene en
 * directorio_entidades.ccaa («Comunidad Valenciana», «Región de Murcia»…).
 * Si no reconoce el nombre, no pinta nada (devuelve null).
 */

const ROJO = '#C8102E';
const AMARILLO = '#FCDD09';
const CARMESI = '#B5123E';

function franjas(colores, ancho = 30, alto = 20) {
  const h = alto / colores.length;
  return colores.map((c, i) => <rect key={i} y={i * h} width={ancho} height={h + 0.05} fill={c} />);
}

function senyera(n = 9, x = 0, ancho = 30) {
  // Nueve franjas: amarillo, rojo, amarillo… (cuatro rojas).
  const h = 20 / n;
  return Array.from({ length: n }, (_, i) => <rect key={i} x={x} y={i * h} width={ancho} height={h + 0.05} fill={i % 2 ? ROJO : AMARILLO} />);
}

function estrella(cx, cy, r, color) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push(`${(cx + rr * Math.cos(ang)).toFixed(2)},${(cy + rr * Math.sin(ang)).toFixed(2)}`);
  }
  return <polygon points={pts.join(' ')} fill={color} />;
}

const BANDERAS = {
  andalucia: () => franjas(['#007A33', '#FFFFFF', '#007A33']),
  // Aragón: las cuatro barras horizontales, con el escudo hacia el asta
  // (aquí una placa clara, para distinguirla de la de Cataluña).
  aragon: () => (
    <>
      {senyera(9)}
      <rect x={5} y={4.5} width={8} height={11} rx={1.2} fill="#FFFFFF" />
      <rect x={6.5} y={6} width={5} height={8} rx={0.8} fill={ROJO} />
    </>
  ),
  asturias: () => (
    <>
      <rect width={30} height={20} fill="#0066CC" />
      <rect x={8.5} y={4} width={1.6} height={12} fill={AMARILLO} />
      <rect x={6} y={7} width={6.6} height={1.6} fill={AMARILLO} />
    </>
  ),
  baleares: () => (
    <>
      {senyera(9)}
      <rect width={13} height={11.1} fill="#5B2C6F" />
      <rect x={4.5} y={3.5} width={4} height={4.5} fill="#FFFFFF" />
    </>
  ),
  canarias: () => [
    <rect key="a" width={10} height={20} fill="#FFFFFF" />,
    <rect key="b" x={10} width={10} height={20} fill="#0768A9" />,
    <rect key="c" x={20} width={10} height={20} fill={AMARILLO} />,
  ],
  cantabria: () => franjas(['#FFFFFF', ROJO]),
  castillalamancha: () => (
    <>
      <rect width={15} height={20} fill={CARMESI} />
      <rect x={15} width={15} height={20} fill="#FFFFFF" />
    </>
  ),
  castillayleon: () => (
    <>
      <rect width={15} height={10} fill={CARMESI} />
      <rect x={15} width={15} height={10} fill="#FFFFFF" />
      <rect y={10} width={15} height={10} fill="#FFFFFF" />
      <rect x={15} y={10} width={15} height={10} fill={CARMESI} />
      <rect x={5.5} y={3} width={4} height={4} fill={AMARILLO} />
      <rect x={20.5} y={13} width={4} height={4} fill={AMARILLO} />
    </>
  ),
  cataluna: () => senyera(9),
  ceuta: () => {
    // Gironado de ocho piezas, blanco y negro.
    const c = [15, 10];
    const borde = [[0, 0], [15, 0], [30, 0], [30, 10], [30, 20], [15, 20], [0, 20], [0, 10]];
    return borde.map((p, i) => {
      const q = borde[(i + 1) % borde.length];
      return <polygon key={i} points={`${c[0]},${c[1]} ${p[0]},${p[1]} ${q[0]},${q[1]}`} fill={i % 2 ? '#FFFFFF' : '#111111'} />;
    });
  },
  valencia: () => (
    <>
      {senyera(9, 0, 30)}
      <rect width={6} height={20} fill="#0039A6" />
    </>
  ),
  extremadura: () => franjas(['#007A33', '#FFFFFF', '#111111']),
  galicia: () => (
    <>
      <rect width={30} height={20} fill="#FFFFFF" />
      <polygon points="0,0 4.5,0 30,17 30,20 25.5,20 0,3" fill="#0099D8" />
    </>
  ),
  rioja: () => franjas([ROJO, '#FFFFFF', '#00843D', AMARILLO]),
  madrid: () => (
    <>
      <rect width={30} height={20} fill={ROJO} />
      {[6, 12, 18, 24].map((x) => <g key={`a${x}`}>{estrella(x, 7, 2.3, '#FFFFFF')}</g>)}
      {[9, 15, 21].map((x) => <g key={`b${x}`}>{estrella(x, 13, 2.3, '#FFFFFF')}</g>)}
    </>
  ),
  melilla: () => <rect width={30} height={20} fill="#6CACE4" />,
  murcia: () => (
    <>
      <rect width={30} height={20} fill={CARMESI} />
      {[[3, 3], [7, 3], [3, 7], [7, 7]].map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width={2.6} height={2.6} fill={AMARILLO} />)}
    </>
  ),
  navarra: () => (
    <>
      <rect width={30} height={20} fill={ROJO} />
      <circle cx={15} cy={10} r={4} fill="none" stroke={AMARILLO} strokeWidth={1.4} />
    </>
  ),
  paisvasco: () => (
    <>
      <rect width={30} height={20} fill="#D52B1E" />
      <line x1={0} y1={0} x2={30} y2={20} stroke="#009B48" strokeWidth={3} />
      <line x1={30} y1={0} x2={0} y2={20} stroke="#009B48" strokeWidth={3} />
      <rect x={13.5} width={3} height={20} fill="#FFFFFF" />
      <rect y={8.5} width={30} height={3} fill="#FFFFFF" />
    </>
  ),
};

const NOMBRES = [
  [/andaluc/, 'andalucia'],
  [/arag/, 'aragon'],
  [/asturias/, 'asturias'],
  [/balear/, 'baleares'],
  [/canarias/, 'canarias'],
  [/cantabria/, 'cantabria'],
  [/la mancha/, 'castillalamancha'],
  [/castilla y le/, 'castillayleon'],
  [/catal/, 'cataluna'],
  [/ceuta/, 'ceuta'],
  [/valencia/, 'valencia'],
  [/extremadura/, 'extremadura'],
  [/galicia/, 'galicia'],
  [/rioja/, 'rioja'],
  [/madrid/, 'madrid'],
  [/melilla/, 'melilla'],
  [/murcia/, 'murcia'],
  [/navarra/, 'navarra'],
  [/vasco|euskadi/, 'paisvasco'],
];

export function claveBandera(ccaa) {
  const n = String(ccaa || '').toLowerCase();
  return (NOMBRES.find(([re]) => re.test(n)) || [])[1] || null;
}

export default function BanderaCcaa({ ccaa, ancho = 30 }) {
  const k = claveBandera(ccaa);
  if (!k) return null;
  const alto = Math.round((ancho * 2) / 3);
  return (
    <svg
      viewBox="0 0 30 20"
      width={ancho}
      height={alto}
      role="img"
      aria-label={`Bandera de ${ccaa}`}
      style={{ display: 'block', borderRadius: 3, boxShadow: '0 0 0 .5px rgba(0,0,0,.18)', flexShrink: 0 }}
    >
      {BANDERAS[k]()}
    </svg>
  );
}
