'use client';

/**
 * Explorador de las elecciones del 29N: hemiciclo de los 350 diputados de
 * la XV con su destino en las candidaturas, quién llega al Congreso, mapa
 * por provincias y cargos del Gobierno en las listas.
 *
 * El DOM y la lógica vienen del prototipo aprobado (lib/elecciones29nExplorador.js),
 * para no rehacer a mano un hemiciclo en SVG con filtros y fichas.
 */

import { useEffect, useRef } from 'react';
import { iniciar } from '@/lib/elecciones29nExplorador';
import './elecciones29n.css';

const ESQUELETO = "<div class=\"wrap\">\n <div class=\"hero\">\n  <div class=\"ante\">Elecciones generales del 29 de noviembre</div>\n  <h1><em id=\"h-n\">110</em> de los 350 diputados<br>no vuelven a presentarse</h1>\n  <p class=\"lead\">Pasa por cada escaño para ver quién repite, quién salta al Senado y quién se va. Cruce de las candidaturas presentadas en el BOE con el Congreso de la XV Legislatura.</p>\n  <div class=\"fuente\">Fuente: BOE-A-2026-22607 (candidaturas presentadas, 28-10-2026). Se actualizará con las proclamadas el 3 de noviembre.</div>\n </div>\n\n <div class=\"stage\">\n  <div class=\"panel\">\n   <div class=\"gtabs\" id=\"gtabs\"></div>\n   <div class=\"barra-top\" style=\"margin-top:12px\">\n    <div class=\"modos\" id=\"dests\"></div>\n    <div style=\"display:flex;gap:8px;align-items:center;flex:1;justify-content:flex-end\"><input class=\"busca\" id=\"q\" placeholder=\"Busca un diputado o una provincia…\"><div class=\"modos\" id=\"modos\"><button data-m=\"grupo\">Hoy</button><button data-m=\"29n\" class=\"on\">29N</button></div></div>\n   </div>\n   <svg class=\"hemi\" id=\"hemi\" viewBox=\"0 0 800 430\"></svg>\n   <div class=\"leyenda\" id=\"ley\"></div>\n   <div id=\"filtro-prov\" style=\"margin-top:10px\"></div>\n  </div>\n  <div class=\"panel ficha\" id=\"ficha\"></div>\n </div>\n\n <section class=\"blk\">\n  <div class=\"ante\">Los que entran</div><h2>Quién llega al Congreso</h2>\n  <p class=\"lead\"><b style=\"color:#1a1a18\"><span id=\"nn\"></span> candidatos</b> que hoy no son diputados van en puestos en los que su partido obtuvo escaño en 2023. Entre ellos, 10 ministros, 6 alcaldes y los 4 delegados del Gobierno que dejaron el cargo la semana pasada.</p>\n  <div class=\"otabs\" id=\"otabs\"></div>\n  <div class=\"gtabs\" id=\"ntabs\" style=\"margin-top:8px\"></div>\n  <div class=\"nuevos\" id=\"nuevos\"></div>\n  <div style=\"text-align:center;margin-top:14px\"><button class=\"mas\" id=\"nmas\">Ver todos</button></div>\n </section>\n\n <section class=\"blk\">\n  <div class=\"ante\">Por provincia</div><h2>El mapa del relevo</h2>\n  <p class=\"lead\">Cuanto más intenso, más diputados de esa circunscripción se van.</p>\n  <div class=\"mapgrid\"><div class=\"mapa\" id=\"mapa\"></div><div class=\"panel\" id=\"prov\"><div class=\"vacia\" style=\"color:#8b8780\">Pulsa una provincia.</div></div></div>\n </section>\n\n <section class=\"blk\">\n  <div class=\"ante\">Del Gobierno a las listas</div><h2><span id=\"nc\"></span> cargos del Gobierno se presentan</h2>\n  <p class=\"lead\">Si salen elegidos, dejarán su puesto: relevos previsibles en ministerios y secretarías de Estado a partir de diciembre.</p>\n  <div class=\"cargos\" id=\"cargos\"></div>\n </section>\n\n <div class=\"cta\"><div><h3>Sigue el relevo en GovTalent</h3><p>Nuevos diputados, nombramientos en el BOE y alarmas sobre lo que te afecta.</p></div><a class=\"btn-ai\" href=\"/login?view=signup\">Crear cuenta gratis</a></div>\n</div>\n<div class=\"tip\" id=\"tip\"></div>";

export default function Elecciones29n({ datos }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = ESQUELETO;
    iniciar(ref.current, datos);
  }, [datos]);
  return <div className="e29" ref={ref} />;
}
