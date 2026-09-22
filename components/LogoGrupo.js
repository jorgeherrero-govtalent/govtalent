'use client';

import { useState } from 'react';
import { groupColor, siglaGrupo, tintaGrupo, claveLogo, claveGrupo, TINTE_CASILLA } from '@/lib/grupos';

/**
 * La marca de un grupo parlamentario: su logo si lo hay, su sigla si no.
 *
 * POR QUÉ NO HACE FALTA SABER QUÉ LOGOS EXISTEN. El componente pinta
 * siempre la sigla y, por debajo, intenta cargar el archivo. Si el
 * archivo está, aparece encima cuando termina de cargar; si no está, el
 * navegador falla en silencio y la sigla se queda. No hay lista que
 * mantener, ni columna en la base de datos, ni despliegue que hacer
 * cuando se añade un emblema: se sube el archivo y a la siguiente visita
 * está. Se descartó la alternativa —un manifiesto de qué grupos tienen
 * logo— justo por eso: obliga a tocar código cada vez.
 *
 * NUNCA HAY HUECO. La sigla se pinta desde el primer milisegundo y el
 * logo aparece encima ya cargado, así que no hay ni parpadeo ni salto de
 * maquetación. Las dos capas miden exactamente lo mismo.
 *
 * DÓNDE VAN LOS ARCHIVOS. `public/grupos/<clave>.png`, cuadrados y de
 * 160 px, que es el doble de lo que mide la casilla más grande. La clave
 * sale del nombre del grupo en el Congreso y de su código en el
 * Parlamento Europeo. Van en el repositorio y no en Storage porque son
 * diecisiete archivos que no cambian nunca: así se despliegan con el
 * código y no hay nada que administrar.
 *
 * SE RECORTAN, NO SE ENCAJAN. Los emblemas vienen con su propio fondo de
 * color y son cuadrados, así que van a sangre y la casilla los redondea,
 * como el icono de una aplicación. Encajarlos con margen dejaba un anillo
 * blanco alrededor de los que llevan fondo y quedaba sucio.
 *
 * EL LOGO NO LLEVA TEXTO ALTERNATIVO. El nombre del grupo está siempre
 * al lado, y repetirlo haría que un lector de pantalla lo leyera dos
 * veces seguidas.
 */
export default function LogoGrupo({ nombre, clave, color, sigla, size = 38, radius = 9 }) {
  const [cargado, setCargado] = useState(false);
  const [falla, setFalla] = useState(false);

  const c = color || groupColor(nombre);
  const texto = sigla || siglaGrupo(nombre);
  const k = clave || claveGrupo(nombre);
  const archivo = k ? `/grupos/${claveLogo(k)}.png` : null;

  // Proporcional al tamaño para que valga igual en la lista (38 px) y en
  // la cabecera de la ficha (56 px).
  const cuerpo = Math.max(9, Math.round(size * 0.3));

  return (
    <span
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: cargado ? '#fff' : `rgba(0,0,0,0)`,
      }}
    >
      {/* La sigla, siempre debajo. Se oculta solo cuando el logo ya está
          pintado encima, no cuando empieza a cargar. */}
      <span
        aria-hidden={cargado ? 'true' : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${TINTE_CASILLA})`,
          color: tintaGrupo(c),
          fontSize: cuerpo,
          fontWeight: 700,
          letterSpacing: '-.2px',
          opacity: cargado ? 0 : 1,
        }}
      >
        {texto}
      </span>

      {archivo && !falla && (
        <img
          src={archivo}
          alt=""
          aria-hidden="true"
          onLoad={() => setCargado(true)}
          onError={() => setFalla(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: cargado ? 1 : 0,
          }}
        />
      )}
    </span>
  );
}
