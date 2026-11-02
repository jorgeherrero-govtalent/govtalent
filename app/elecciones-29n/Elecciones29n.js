'use client';

/**
 * Explorador de las elecciones del 29N: hemiciclo de los 350 diputados de
 * la XV con su destino en las candidaturas, quién llegará al Congreso, mapa
 * por provincias y cargos del Gobierno en las listas.
 *
 * El DOM y la lógica vienen del prototipo aprobado (lib/elecciones29nExplorador.js),
 * para no rehacer a mano un hemiciclo en SVG con filtros y fichas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Logo from '@/components/Logo';
import { PieLanding } from '../landing/LandingClient';
import '../landing/landing.css';
import { iniciar } from '@/lib/elecciones29nExplorador';
import { ESQUELETO } from '@/lib/elecciones29nEsqueleto';
import './elecciones29n.css';


function Video({ onCerrar }) {
  useEffect(() => {
    const cerrar = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', cerrar);
    const desbordamiento = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', cerrar);
      document.body.style.overflow = desbordamiento;
    };
  }, [onCerrar]);
  // En un portal: la cabecera lleva backdrop-filter, que convierte a sus
  // hijos con position:fixed en relativos a ella y cortaba el vídeo.
  return createPortal(
    <div className="e29-vid" role="dialog" aria-modal="true" aria-label="Vídeo: ¿Qué es GovTalent?" onClick={onCerrar}>
      <div className="e29-vid-caja" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="e29-vid-x" aria-label="Cerrar" onClick={onCerrar}>
          ×
        </button>
        <div className="e29-vid-marco">
          <iframe
            src="https://www.youtube-nocookie.com/embed/3ZxkLcQZW1E?autoplay=1&rel=0&modestbranding=1"
            title="¿Qué es GovTalent?"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

// Cabecera de la landing: solo el logo y, a la derecha, el vídeo y el alta.
function Cabecera({ onVideo }) {
  return (
    <header className="e29-cab">
      <div className="e29-cab-in">
        <a href="/" aria-label="GovTalent">
          <Logo height={24} />
        </a>
        <div className="e29-cab-acc">
          <button type="button" className="btn-ai-o e29-cab-video" onClick={onVideo}>
            <i className="ti ti-player-play" aria-hidden="true"></i>
            ¿Qué es GovTalent?
          </button>
          <a className="btn-ai" href="/login?view=signup">
            Crear cuenta gratis
          </a>
        </div>
      </div>
    </header>
  );
}

// `inicial` es el explorador ya pintado en el servidor (lib/elecciones29nSsr.js),
// para que buscadores y asistentes de IA lean la página sin ejecutar JavaScript.
// Al montarse, el explorador se vuelve a pintar igual y queda interactivo.
export default function Elecciones29n({ datos, inicial }) {
  const ref = useRef(null);
  const [video, setVideo] = useState(false);
  const cerrarVideo = useCallback(() => setVideo(false), []);
  // Elemento memorizado: si React lo volviera a pintar (al abrir el vídeo),
  // repondría el HTML del servidor encima del explorador ya montado.
  const explorador = useMemo(
    () => <div className="e29" ref={ref} dangerouslySetInnerHTML={{ __html: inicial || '' }} />,
    [inicial]
  );
  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    raiz.innerHTML = ESQUELETO;
    iniciar(raiz, datos);
    const alPulsar = (e) => {
      if (e.target.closest('[data-video]')) setVideo(true);
    };
    raiz.addEventListener('click', alPulsar);
    return () => raiz.removeEventListener('click', alPulsar);
  }, [datos]);
  return (
    <>
      <Cabecera onVideo={() => setVideo(true)} />
      {explorador}
      <PieLanding />
      {video && <Video onCerrar={cerrarVideo} />}
    </>
  );
}
