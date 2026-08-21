'use client';

/**
 * El avatar de un actor del mapa.
 *
 * DOS FORMAS, UNA REGLA: las personas van en círculo y las
 * organizaciones en cuadrado redondeado. Eso permite leer de qué está
 * hecho un mapa sin acercarse a leer los nombres, y evita el error de
 * ponerle cara a una patronal.
 *
 * Cuando el directorio tiene foto o logo, se usan. Cuando no, se dibuja
 * una silueta plana derivada del identificador del actor: así el mismo
 * diputado tiene siempre el mismo avatar en todos los proyectos sin
 * guardar nada en base de datos.
 */

// Los kind que son organismos u organizaciones. El resto son personas.
const ORGANIZACIONES = new Set(['comision', 'comision-eu', 'grupo', 'direccion', 'organizacion']);

export function esOrganizacion(actor) {
  return ORGANIZACIONES.has(actor?.kind);
}

// Paletas sobrias, dentro de los grises de la plataforma. Nada saturado:
// el avatar acompaña, no compite con el chip.
const PELO = ['#3f3a35', '#4a423a', '#6b5847', '#8a7a6a', '#5c5148', '#a89b8c'];
const PIEL = ['#e8c9ac', '#d8b89a', '#c9a486', '#b08d78'];
const ROPA = ['#7a736b', '#5f6b66', '#8b8780', '#6b7370'];
const CORTE = ['corto', 'recogido', 'melena', 'corto'];

// Un hash estable y barato. No necesita ser bueno, solo repartir y no
// cambiar nunca para el mismo actor.
function semilla(texto) {
  let h = 0;
  for (let i = 0; i < (texto || '').length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

function iniciales(nombre) {
  return (nombre || '?')
    .replace(/^(la|el|los|las)\s+/i, '')
    .split(/[\s.–—-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export default function ActorAvatar({ actor, size = 30, atenuado = false, fondo = '#f0f0eb' }) {
  const org = esOrganizacion(actor);
  const clave = actor?.ref_id || actor?.id || actor?.nombre || '';
  const foto = actor?.photo_url || actor?.logo_url;

  const estiloBase = {
    width: size,
    height: size,
    flexShrink: 0,
    display: 'block',
    opacity: atenuado ? 0.6 : 1,
    borderRadius: org ? Math.round(size * 0.27) : '50%',
  };

  // --- Con imagen del directorio ---------------------------------------
  if (foto) {
    return (
      // Los logos suelen venir con márgenes propios y sobre blanco, así
      // que se encajan enteros; las fotos de personas se recortan.
      <img
        src={foto}
        alt=""
        style={{
          ...estiloBase,
          objectFit: org ? 'contain' : 'cover',
          background: '#fff',
          border: org ? '.5px solid #e0dfd8' : 'none',
        }}
      />
    );
  }

  // --- Organización sin logo: monograma ---------------------------------
  if (org) {
    return (
      <div
        aria-hidden="true"
        style={{
          ...estiloBase,
          background: fondo,
          border: '.5px solid #e0dfd8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.37),
          fontWeight: 600,
          color: atenuado ? '#a8a49c' : '#7a736b',
          letterSpacing: '.3px',
        }}
      >
        {iniciales(actor?.nombre)}
      </div>
    );
  }

  // --- Persona sin foto: silueta plana -----------------------------------
  const s = semilla(clave);
  const pelo = PELO[s % PELO.length];
  const piel = PIEL[(s >> 3) % PIEL.length];
  const ropa = ROPA[(s >> 6) % ROPA.length];
  const corte = CORTE[(s >> 9) % CORTE.length];

  return (
    <svg viewBox="0 0 48 48" style={estiloBase} aria-hidden="true">
      <rect width="48" height="48" fill={fondo} />
      {corte === 'melena' && <path d="M13 20h22v17a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z" fill={pelo} />}
      <path d="M24 30c9 0 15 6 15 14v4H9v-4c0-8 6-14 15-14z" fill={ropa} />
      {corte === 'recogido' && <circle cx="24" cy="8" r="4.5" fill={pelo} />}
      <circle cx="24" cy="19" r="10" fill={pelo} />
      <rect x="21" y="25" width="6" height="7" fill={piel} />
      <circle cx="24" cy="21" r="8.5" fill={piel} />
    </svg>
  );
}
