// =====================================================================
// Parlamento de La Rioja — lector
// lib/ccaa/rioja.js
//
// · Colecciones «Proyectos de ley» y «Proposiciones de ley», más el RSS
//   de últimas iniciativas (por si algo aún no está en las colecciones).
// · Ficha de cada expediente (Plone): título, situación, proponentes y
//   «Tramitación asociada» con el boletín (BOPR) y la página de cada paso.
// · Boletines a leer con IA: los BOPR enlazados desde esos trámites.
// =====================================================================

import { textoPlano, fechaDeTexto, elementosRss, enlacesDe } from '@/lib/ccaa/web';
import { tipoTramite, cerrado, resultadoDe } from '@/lib/ccaa/comun';

const BASE = 'https://www.parlamento-larioja.org';
const COLECCIONES = [`${BASE}/actividad-parlamentaria/proyectos-de-ley`, `${BASE}/actividad-parlamentaria/proposiciones-de-ley`];
const RSS = `${BASE}/actividad-parlamentaria/listado-ultimas-iniciativas/RSS`;
// Carpetas de iniciativas legislativas: pl (proyectos), ppl (proposiciones),
// y por si acaso ilp y dl. Lo demás (preguntas, comparecencias…) no.
const FICHA = /\/actividad-parlamentaria\/iniciativas\/(pl|ppl|ilp|dl|pley)\/(\d+l-[a-z]+-\d+)\/?$/i;
const MAX_FICHAS = 60;

export async function leer(web, ctx = {}) {
  const fichas = new Set();
  for (const url of COLECCIONES) {
    try {
      const html = await web.texto(url);
      let n = 0;
      for (const a of enlacesDe(html, url)) if (FICHA.test(a.href.split('#')[0])) { fichas.add(a.href.split('#')[0].replace(/\/$/, '')); n += 1; }
      // Diagnóstico: si una colección no da fichas, qué enlaces tiene.
      if (!n && ctx.diagnostico) ctx.diagnostico[url] = enlacesDe(html, url).filter((a) => /iniciativ|proposic/i.test(a.href)).slice(0, 40).map((a) => `${a.texto.slice(0, 80)} | ${a.href}`);
    } catch (e) {
      if (e.robots) throw e;
    }
  }
  try {
    for (const it of elementosRss(await web.texto(RSS))) if (it.enlace && FICHA.test(it.enlace)) fichas.add(it.enlace.replace(/\/$/, ''));
  } catch (e) {
    if (e.robots) throw e;
  }

  const expedientes = [];
  const boletines = new Map();
  for (const url of [...fichas].slice(0, MAX_FICHAS)) {
    // El número se deduce de la URL (11l-pl-0019 → 11L/PL-0019) para no
    // pedir la ficha de un expediente ya cerrado.
    const cod = url.split('/').pop().toUpperCase().match(/^(\d+L)-([A-Z]+)-(\d+)$/);
    if (cod && ctx.saltar?.(`${cod[1]}/${cod[2]}-${cod[3]}`)) continue;
    if (ctx.tiempoAgotado?.()) break;
    const html = await web.texto(url);
    const num = textoPlano((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
    const titulo = textoPlano((html.match(/<h2 class="h3-size">([\s\S]*?)<\/h2>/i) || [])[1]);
    if (!num || !titulo) continue;
    const situacion = textoPlano((html.match(/<p[^>]*class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || [])[1]) || null;
    const autor = textoPlano((html.split(/Proponentes:/i)[1] || '').split('</ul>')[0]).replace(/^[-\s]+/, '') || null;

    const tramites = [];
    const bloque = (html.split(/Tramitaci[oó]n asociada/i)[1] || '').split(/Documentaci[oó]n asociada|<\/main>/i)[0];
    for (const fila of bloque.split(/<div class="row discreet">/i).slice(1)) {
      const cols = [...fila.matchAll(/<div class="medium-\d+ columns">([\s\S]*?)<\/div>/gi)].map((m) => m[1]);
      const desc = textoPlano(cols[0]);
      const fecha = fechaDeTexto(textoPlano(cols[1]));
      const info = cols[2] || '';
      const enlace = (info.match(/href="([^"]+)"/i) || [])[1] || null;
      if (enlace && /boletines-oficiales\/bopr-/i.test(enlace)) {
        const limpio = enlace.split('#')[0];
        const cod = limpio.split('/').pop();
        boletines.set(`rioja:${cod}`, {
          id: `rioja:${cod}`,
          numero: cod.replace(/^bopr-\d+-/i, '').toUpperCase(),
          fecha,
          titulo: `BOPR ${cod.replace(/^bopr-\d+-/i, '')}`,
          url: limpio,
          url_pdf: limpio,
          expediente: num,
        });
      }
      if (desc || fecha) tramites.push({ tipo: tipoTramite(desc), fecha, descripcion: desc || null, url: enlace });
    }

    expedientes.push({
      num_expediente: num,
      tipo: /proposici/i.test(titulo) ? 'Proposición de ley' : /proyecto/i.test(titulo) ? 'Proyecto de ley' : null,
      titulo,
      autor,
      comision: null,
      fecha_presentacion: tramites.find((t) => t.tipo === 'registro')?.fecha || tramites[0]?.fecha || null,
      situacion,
      is_closed: cerrado(situacion),
      resultado: resultadoDe(situacion),
      url,
      tramites,
    });
  }
  return { expedientes, boletines: [...boletines.values()] };
}
