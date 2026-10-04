// =====================================================================
// Corts Valencianes — lector
// lib/ccaa/valencia.js
//
// La fuente es el RSS de iniciativas legislativas del portal de
// participación («Parlament obert»): proyectos y proposiciones de ley con
// su tipo, fecha, comisión, el número del BOC (Butlletí Oficial de les
// Corts) en que se publican y los plazos de participación ciudadana.
// No trae número de expediente.
//
// · Boletines a leer con IA: los BOCV citados en el RSS, en su versión en
//   castellano (idioma=es_ES).
// · Los expedientes nacen de lo que la IA encuentra en esos boletines; el
//   RSS aporta después la comisión y la página de participación, casando
//   por título (complementos).
// =====================================================================

import { elementosRss, textoPlano, fechaDeTexto } from '@/lib/ccaa/web';

const RSS = 'https://www.cortsvalencianes.es/ca-va/actividad/iniciativa/rss.xml';
const pdfBocv = (n) => `https://www.cortsvalencianes.es/publicaciones-CV/obtenerPdfBO?f_id_bocv=XI${String(n).padStart(5, '0')}000&idioma=es_ES`;
const DIAS = 60;

function campo(texto, etiqueta, siguiente) {
  const m = texto.match(new RegExp(`${etiqueta}\\s+(.+?)\\s+(?:${siguiente})`, 'i'));
  return m ? m[1].trim() : null;
}

export async function leer(web) {
  const limite = new Date(Date.now() - DIAS * 86400000).toISOString().slice(0, 10);
  const boletines = new Map();
  const complementos = [];
  for (const it of elementosRss(await web.texto(RSS))) {
    const d = textoPlano(String(it.descripcion || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')).replace(/\s+/g, ' ');
    const fecha = fechaDeTexto((d.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) || [])[1]);
    const boc = (d.match(/\bBOC\s+(\d+)/) || [])[1];
    const tipo = campo(d, 'Tipo', 'Fecha|Comissi|Proponent');
    const comision = campo(d, 'Comissió', 'Acord|Proponent|\\[|PDF');
    complementos.push({ titulo: it.titulo, tipo, comision, url: it.enlace, fecha, boc: boc || null });
    if (boc && (!fecha || fecha >= limite)) {
      boletines.set(`valencia:bocv-${boc}`, {
        id: `valencia:bocv-${boc}`,
        numero: boc,
        fecha,
        titulo: `BOC ${boc}`,
        url: pdfBocv(boc),
        url_pdf: pdfBocv(boc),
      });
    }
  }
  return { expedientes: [], boletines: [...boletines.values()], complementos };
}
