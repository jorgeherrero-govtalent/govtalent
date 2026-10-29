'use client';

/**
 * Explorador de las elecciones del 29N: hemiciclo de los 350 diputados de
 * la XV con su destino en las candidaturas, quién llegará al Congreso, mapa
 * por provincias y cargos del Gobierno en las listas.
 *
 * El DOM y la lógica vienen del prototipo aprobado (lib/elecciones29nExplorador.js),
 * para no rehacer a mano un hemiciclo en SVG con filtros y fichas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Logo from '@/components/Logo';
import { PieLanding } from '../landing/LandingClient';
import '../landing/landing.css';
import { iniciar } from '@/lib/elecciones29nExplorador';
import './elecciones29n.css';

const ESQUELETO = "<div class=\"wrap\">\n <div class=\"hero\">\n  <div class=\"ante\">Elecciones generales del 29 de noviembre</div>\n  <h1><em id=\"h-n\">110</em> de los 350 diputados<br>no vuelven a presentarse</h1>\n  <p class=\"lead\">Pasa por cada escaño para ver quién repite, quién salta al Senado y quién se va. Cruce de las candidaturas presentadas en el BOE con el Congreso de la XV Legislatura.</p>\n  <div class=\"fuente\">Fuente: BOE-A-2026-22607 (candidaturas presentadas, 28-10-2026). Se actualizará con las proclamadas el 3 de noviembre.</div>\n </div>\n\n <div class=\"stage\">\n  <div class=\"panel\">\n   <div class=\"gtabs\" id=\"gtabs\"></div>\n   <div class=\"barra-top\" style=\"margin-top:12px\">\n    <div class=\"modos\" id=\"dests\"></div>\n    <div style=\"display:flex;gap:8px;align-items:center;flex:1;justify-content:flex-end\"><input class=\"busca\" id=\"q\" placeholder=\"Busca un diputado o una provincia…\"><div class=\"modos\" id=\"modos\"><button data-m=\"grupo\">Hoy</button><button data-m=\"29n\" class=\"on\">29N</button></div></div>\n   </div>\n   <svg class=\"hemi\" id=\"hemi\" viewBox=\"0 0 800 430\"></svg>\n   <div class=\"leyenda\" id=\"ley\"></div>\n   <div id=\"filtro-prov\" style=\"margin-top:10px\"></div>\n  </div>\n  <div class=\"panel ficha\" id=\"ficha\"></div>\n </div>\n\n <section class=\"banda banda-a\">\n  <div class=\"banda-txt\">\n   <div class=\"ante-dk\">Con GovTalent</div>\n   <h2>El nuevo Congreso, con todos sus contactos</h2>\n   <p>En cuanto se constituyan las Cortes tendrás el directorio completo: Gobierno, diputados, grupos parlamentarios, comisiones y asesores, con su cargo y su contacto.</p>\n  </div>\n  <div class=\"banda-btns\">\n   <a class=\"btn-ai e29-btn\" href=\"/login?view=signup\">Crear cuenta gratis</a>\n  </div>\n </section>\n <section class=\"blk\">\n  <div class=\"ante\">Los que entran</div><h2>Quién llegará al Congreso</h2>\n  <p class=\"lead\">Descubre a los candidatos que pueden convertirse en diputados: quiénes son, de dónde vienen y en qué puesto de la lista van.</p>\n  <div class=\"otabs\" id=\"otabs\"></div>\n  <div class=\"gtabs\" id=\"ntabs\" style=\"margin-top:8px\"></div>\n  <div class=\"nuevos\" id=\"nuevos\"></div>\n  <div style=\"text-align:center;margin-top:14px\"><button class=\"mas\" id=\"nmas\">Ver todos</button></div>\n </section>\n\n <section class=\"blk\">\n  <div class=\"ante\">Por provincia</div><h2>El mapa del relevo</h2>\n  <p class=\"lead\">Cuanto más intenso, más diputados de esa circunscripción se van.</p>\n  <div class=\"mapgrid\"><div class=\"mapa\" id=\"mapa\"></div><div class=\"panel\" id=\"prov\"><div class=\"vacia\" style=\"color:#8b8780\"></div></div></div>\n </section>\n\n <section class=\"banda banda-c\">\n <div class=\"ante-dk\">Elecciones generales del 29 de noviembre</div>\n <h2>Toda la actividad legislativa e institucional, <span>en un mismo lugar</span></h2>\n <p>Vigilancia normativa con IA, avisos en tiempo real y la mayor base de datos del sector público, con más de 27.000 cargos y su contacto.</p>\n <div class=\"banda-btns\" style=\"justify-content:center\">\n  <a class=\"btn-ai e29-btn\" href=\"/login?view=signup\">Crear cuenta gratis</a>\n </div>\n</section>\n</div>\n<div class=\"tip\" id=\"tip\"></div>";

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

export default function Elecciones29n({ datos }) {
  const ref = useRef(null);
  const [video, setVideo] = useState(false);
  const cerrarVideo = useCallback(() => setVideo(false), []);
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
      <div className="e29" ref={ref} />
      <PieLanding />
      {video && <Video onCerrar={cerrarVideo} />}
    </>
  );
}
