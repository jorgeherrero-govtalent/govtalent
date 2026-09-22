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

// Tres familias, no dos. La distinción que importa en asuntos públicos
// es público / privado, y hasta ahora el avatar solo separaba personas
// de "todo lo demás".
const INSTITUCIONES = new Set(['comision', 'comision-eu', 'grupo', 'direccion']);
const ORGANIZACIONES = new Set(['organizacion']);

export function esInstitucion(actor) {
  return actor?.familia === 'institucion' || INSTITUCIONES.has(actor?.kind);
}

export function esOrganizacion(actor) {
  return (
    actor?.familia === 'organizacion' ||
    ORGANIZACIONES.has(actor?.kind) ||
    INSTITUCIONES.has(actor?.kind)
  );
}

// Lo que no es persona: sirve para decidir forma y encaje de la imagen.
function noEsPersona(actor) {
  return esInstitucion(actor) || actor?.familia === 'organizacion' || ORGANIZACIONES.has(actor?.kind);
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

// Palabras que no distinguen a nadie. Sin esta lista, los nueve grupos
// del Congreso comparten monograma: «Grupo Parlamentario Socialista»,
// «…Popular» y «…VOX» salen los tres como GP, y un mapa con cinco
// grupos enseña cinco cuadraditos idénticos.
const VACIAS = new Set([
  'grupo', 'parlamentario', 'parlamentaria', 'comision', 'comisión', 'congreso',
  'senado', 'direccion', 'dirección', 'general', 'de', 'del', 'la', 'el', 'los',
  'las', 'y', 'en', 'para', 'por', 'per',
]);

/**
 * El monograma de una institución.
 *
 * Tres reglas, en orden. Si el identificador del directorio ya es un
 * código corto —ITRE, IMCO, CNECT, ENER—, ese código ES el nombre
 * corto y no hay que inventar nada. Si el nombre trae una sigla entre
 * paréntesis o en mayúsculas, se respeta. Y si no, se abrevia la
 * primera palabra que signifique algo.
 *
 * No se deducen siglas de partido: «Socialista» da SOC, no PSOE. El
 * grupo parlamentario y el partido no son la misma cosa y no nos toca
 * a nosotros decidirlo.
 */
function siglaInstitucion(actor) {
  const ref = String(actor?.ref_id || '').trim();
  if (ref.length >= 2 && ref.length <= 6 && ref === ref.toUpperCase() && /^[A-Z0-9]+$/.test(ref)) {
    return ref;
  }

  const n = String(actor?.nombre || '').trim();
  const parentesis = n.match(/\(([^)]{2,14})\)/);
  if (parentesis) {
    const limpio = parentesis[1].replace(/[^A-Za-zÁÉÍÓÚÜÑ]/g, '');
    if (limpio.length >= 2) return limpio.slice(-3).toUpperCase();
  }

  const palabras = n.split(/[\s.,()–—-]+/).filter(Boolean).filter((p) => !VACIAS.has(p.toLowerCase()));
  if (palabras.length === 0) return iniciales(n);

  const mayusculas = palabras.find((p) => p.length >= 2 && p === p.toUpperCase());
  if (mayusculas) return mayusculas.slice(0, 3).toUpperCase();

  const primera = palabras[0];
  if (primera.length >= 4) return primera.slice(0, 3).toUpperCase();
  return palabras.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export default function ActorAvatar({ actor, size = 30, atenuado = false, fondo = '#f0f0eb' }) {
  const org = noEsPersona(actor);
  const institucion = esInstitucion(actor);
  const clave = actor?.ref_id || actor?.id || actor?.nombre || '';
  const foto = actor?.imagen || actor?.photo_url || actor?.logo_url;

  // Círculo la persona, esquina casi recta la institución y esquina
  // redondeada la organización. Lo recto se lee como público y lo
  // redondeado como privado.
  //
  // Y el borde marcado solo en instituciones: a 26px —el chip pequeño
  // del mapa— un borde sobrevive donde un icono de esquina sería un
  // punto sin forma.
  const estiloBase = {
    width: size,
    height: size,
    flexShrink: 0,
    display: 'block',
    opacity: atenuado ? 0.6 : 1,
    borderRadius: !org ? '50%' : institucion ? Math.round(size * 0.1) : Math.round(size * 0.27),
  };

  const bordeFamilia = institucion ? '1.5px solid #b8b4ac' : '.5px solid #e0dfd8';

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
          border: org ? bordeFamilia : 'none',
        }}
      />
    );
  }

  // --- Organización sin logo: monograma ---------------------------------
  if (org) {
    // Las instituciones se abrevian con criterio; a una empresa le
    // bastan sus iniciales, que es como se la nombra de todos modos.
    const texto = institucion ? siglaInstitucion(actor) : iniciales(actor?.nombre);
    // Tres letras no caben al mismo cuerpo que dos: el monograma se
    // encoge en vez de desbordar el cuadrado.
    const cuerpo = texto.length > 3 ? 0.26 : texto.length > 2 ? 0.3 : 0.37;
    return (
      <div
        aria-hidden="true"
        title={actor?.nombre || undefined}
        style={{
          ...estiloBase,
          background: fondo,
          border: bordeFamilia,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * cuerpo),
          fontWeight: 600,
          color: atenuado ? '#a8a49c' : '#7a736b',
          letterSpacing: texto.length > 3 ? 0 : '.3px',
        }}
      >
        {texto}
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
