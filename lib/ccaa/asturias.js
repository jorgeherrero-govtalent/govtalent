// =====================================================================
// Junta General del Principado de Asturias — lector
// lib/ccaa/asturias.js
//
// Solo agoranet.jgpa.es: la web principal (www.jgpa.es) veta en su
// robots.txt a los bots de IA y se respeta esa intención.
//
// agoranet no ofrece un listado de expedientes por GET (sus buscadores son
// formularios), así que la fuente es el RSS de boletines: se leen con IA
// los de la serie A, que es la de proyectos y proposiciones de ley. La
// serie B (control, impulso, información) es para la fase 4.
// Los expedientes nacen de lo que la IA encuentra en esos boletines.
// =====================================================================

import { elementosRss, fechaDeTexto } from '@/lib/ccaa/web';

const RSS = 'https://agoranet.jgpa.es/docuAst/rss.jsp';
const DIAS = 45;

export async function leer(web) {
  const limite = new Date(Date.now() - DIAS * 86400000).toISOString().slice(0, 10);
  const boletines = [];
  for (const it of elementosRss(await web.texto(RSS))) {
    const t = it.titulo || '';
    const m = t.match(/Bolet[ií]n n[ºo°]\s*([\d.]+),\s*serie\s*([A-Z])/i);
    if (!m || m[2].toUpperCase() !== 'A' || !it.enlace) continue;
    const fecha = fechaDeTexto(t) || fechaDeTexto(it.fecha);
    if (fecha && fecha < limite) continue;
    const cod = it.enlace.split('/').pop().replace(/\.pdf$/i, '');
    boletines.push({
      id: `asturias:${cod}`,
      numero: `${m[1]} serie A`,
      fecha,
      titulo: t,
      url: it.enlace,
      url_pdf: it.enlace,
    });
  }
  return { expedientes: [], boletines };
}
