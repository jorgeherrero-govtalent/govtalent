// =====================================================================
// Boletín Oficial de la Región de Murcia (BORM) — lector (en pruebas)
// lib/diarios/murcia.js
//
// El BORM tiene un servicio XML interno, sin documentar, que responde
// desde Vercel (08-10-2026) y que su robots.txt no restringe:
//   /services/boletin/ultimo            → BoletinDTO (id, número, fecha)
//   /services/anuncio/{id}              → AnuncioDTO (sumario, apartado,
//                                         subApartado, emisor, número…)
// Falta saber qué ruta lista los anuncios de un boletín. Este lector
// prueba unas pocas candidatas, una vez por ejecución y despacio, y usa
// la primera que devuelva anuncios. En modo debug informa de todas para
// fijar la buena en cuanto se conozca (CANDIDATAS[0]).
// =====================================================================

import { textoPlano, fechaDeTexto } from '@/lib/ccaa/web';

const BASE = 'https://www.borm.es/services';

const CANDIDATAS = [
  (b) => `${BASE}/boletin/${b.id}/anuncios`,
  (b) => `${BASE}/anuncio/boletin/${b.id}`,
  (b) => `${BASE}/anuncios/boletin/${b.id}`,
  (b) => `${BASE}/boletin/${b.id}/sumario`,
  (b) => `${BASE}/sumario/boletin/${b.id}`,
  (b) => `${BASE}/boletin/ano/${b.ano}/numero/${b.numero}/anuncios`,
  (b) => `${BASE}/anuncio/ano/${b.ano}/boletin/${b.numero}`,
];

const campo = (xml, n) => textoPlano((String(xml).match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`, 'i')) || [])[1]) || null;

export async function leer(web, ctx = {}) {
  const ultimo = await web.texto(`${BASE}/boletin/ultimo`);
  const b = { id: campo(ultimo, 'id'), numero: campo(ultimo, 'numero'), ano: campo(ultimo, 'ano'), fecha: fechaDeTexto(campo(ultimo, 'fechaPublicacion')) };
  if (!b.id) throw new Error('El BORM no devolvió el último boletín');

  const pruebas = [];
  let lista = null;
  for (const hacer of CANDIDATAS) {
    const url = hacer(b);
    try {
      const t = await web.texto(url);
      const n = (t.match(/<AnuncioDTO\b/gi) || []).length;
      pruebas.push({ url, ok: true, anuncios: n, muestra: t.slice(0, 400) });
      if (n > 0) { lista = t; break; }
    } catch (e) {
      pruebas.push({ url, ok: false, error: String(e.message || e).slice(0, 120) });
      if (e.robots) break;
    }
  }
  if (ctx.debug || !lista) ctx.diagnostico.murcia = { boletin: b, pruebas };
  if (!lista) return [];

  const entradas = [];
  for (const m of lista.matchAll(/<AnuncioDTO\b[\s\S]*?<\/AnuncioDTO>/gi)) {
    const a = m[0];
    const numero = campo(a, 'numero');
    const titulo = campo(a, 'sumario') || campo(a, 'titulo');
    if (!numero || !titulo) continue;
    entradas.push({
      ref: `${b.ano}-${numero}`,
      fecha: b.fecha,
      numero: b.numero,
      seccion: [campo(a, 'apartado'), campo(a, 'subApartado')].filter(Boolean).join(' · ') || null,
      organo: campo(a, 'textoEmisor'),
      titulo,
      // La web del BORM es una aplicación de una sola página: el enlace
      // lleva a la consulta del anuncio por fecha y número (sin verificar).
      url: `https://www.borm.es/#/home/anuncio/${(b.fecha || '').split('-').reverse().join('-')}/${numero}`,
      url_pdf: null,
      publicado_en: null,
      npe: campo(a, 'npe'),
    });
  }
  return entradas;
}
