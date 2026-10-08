// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — estructura de los boletines de la fase 2
// app/api/debug/diarios-explorar/route.js
//
// Para escribir los lectores de Aragón, Asturias, Cantabria, Cataluña,
// C. Valenciana, Navarra y La Rioja hace falta ver cómo están montadas
// sus páginas, y desde fuera de Vercel no se pueden abrir. Esta ruta las
// pide desde Vercel como GovTalentBot (lib/ccaa/web.js: robots.txt y
// pausas incluidos) y devuelve, de cada una: título, enlaces (texto y
// destino), scripts y un trozo del texto. No guarda nada.
//
// Uso: ?key=<DEBUG_KEY>  (todas)  ·  ?key=<DEBUG_KEY>&p=navarra,rioja
//
// BORRAR ESTE ARCHIVO cuando estén los lectores.
// =====================================================================

import { crearWeb, enlacesDe, textoPlano } from '@/lib/ccaa/web';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function hoy() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { a: p.year, m: p.month, d: p.day };
}

// Segunda ronda (08-10-2026): lo que faltaba para Aragón, Asturias,
// Cantabria, Valencia y La Rioja. `js: true` descarga además los scripts
// principales de la página y busca en ellos rutas de API.
// Tercera ronda (08-10-2026): Cantabria, Valencia y La Rioja.
function paginas() {
  const h = hoy();
  return {
    cantabria: [
      'https://boc.cantabria.es/boces/boletines.do?boton=UltimoBOCPublicado',
      `https://boc.cantabria.es/boces/boletines.do?boton=Fecha&boletinBean.fecBolString=${h.d}/${h.m}/${h.a}`,
    ],
    valencia: [
      { url: 'https://dogv.gva.es/dogv-portal-frontend/es/sumari', js: true, todo: true },
      'https://dogv.gva.es/dogv-portal-frontend/assets/config.json',
    ],
    rioja: [{ url: 'https://web.larioja.org/bor-portada/bor', js: true, todo: true }],
  };
}

const API_JS = /["'`]([^"'`\s]{0,120}(?:BRSCGI|\/api\/|\/rest\/|services|backend|SEC=|rss|sumari|boletin)[^"'`\s]{0,160})["'`]/gi;

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }
  const P = paginas();
  const pedidos = sp.get('p') ? sp.get('p').split(',').map((s) => s.trim()).filter((s) => P[s]) : Object.keys(P);
  const web = crearWeb();
  const t0 = Date.now();

  const salida = await Promise.all(pedidos.map(async (clave) => {
    const res = [];
    for (const entrada of P[clave]) {
      const { url, js, formularios, todo } = typeof entrada === 'string' ? { url: entrada } : entrada;
      try {
        const r = await web.binario(url);
        const tipo = r.tipo || '';
        if (r.buf.subarray(0, 4).toString() === '%PDF') { res.push({ url, tipo, kb: Math.round(r.buf.length / 1024), pdf: true }); continue; }
        const html = await web.texto(url);
        if (/json/.test(tipo) || /^\s*[[{]/.test(html)) { res.push({ url, tipo, json: html.slice(0, 6000) }); continue; }
        const titulo = textoPlano((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
        const enlaces = [...new Map(enlacesDe(html, url).map((e) => [e.href, `${e.texto.slice(0, 90)} | ${e.href}`])).values()];
        const scripts = [...html.matchAll(/<script[^>]*src=["']([^"']+)/gi)].map((m) => m[1]).slice(0, 20);
        const apis = [...new Set([...html.matchAll(/["'](\/[a-z0-9_\-/]*(?:api|rest|services|json|rss|feed|sumari|boletin)[a-z0-9_\-/.]*)["']/gi)].map((m) => m[1]))].slice(0, 40);
        const cuerpo = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
        let api_js;
        if (js) {
          api_js = [];
          const srcs = scripts
            .filter((x) => !/googletagmanager|readspeaker|recaptcha|jquery|bootstrap|aui|frontend-js|vendor|polyfills|runtime|cookie|html5shiv|respond/i.test(x))
            .slice(0, 5);
          for (const src of srcs) {
            try {
              const codigo = await web.texto(new URL(src.replace(/&amp;/g, '&'), url).toString());
              const rutas = [...new Set([...codigo.matchAll(API_JS)].map((m) => m[1]))].slice(0, 60);
              // «todo»: además, cualquier URL o ruta /algo/api… del código.
              const urls = todo ? [...new Set([...codigo.matchAll(/(https?:\/\/[a-z0-9.\-]+(?:\/[^"'`\s)]*)?|\/[a-z0-9\-]+\/(?:api|rest|ws|v\d)[^"'`\s)]*)/gi)].map((m) => m[1]))].filter((u) => !/w3\.org|schema\.org|angular|github|mozilla|google/i.test(u)).slice(0, 80) : undefined;
              api_js.push({ src, kb: Math.round(codigo.length / 1024), rutas, urls });
            } catch (e) {
              api_js.push({ src, error: String(e.message || e).slice(0, 120) });
            }
          }
        }
        const forms = formularios
          ? [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m) => ({
              atributos: m[1].replace(/\s+/g, ' ').trim(),
              campos: [...m[2].matchAll(/<(input|select)\b[^>]*name=["']([^"']+)["'][^>]*>/gi)].map((c) => `${c[1]}:${c[2]}${(c[0].match(/value=["']([^"']*)/i) || [])[1] ? `=${(c[0].match(/value=["']([^"']*)/i) || [])[1]}` : ''}`),
            }))
          : undefined;
        res.push({
          url,
          tipo,
          api_js,
          formularios: forms,
          final: r.url !== url ? r.url : undefined,
          kb: Math.round(r.buf.length / 1024),
          titulo,
          enlaces: enlaces.slice(0, 150),
          scripts,
          rutas_api: apis,
          texto: textoPlano(cuerpo).replace(/\s+/g, ' ').slice(0, 2500),
          html_inicio_main: (cuerpo.match(/<main[\s\S]{0,3000}/i) || cuerpo.match(/<body[\s\S]{0,3000}/i) || [''])[0].replace(/\s+/g, ' '),
        });
      } catch (e) {
        res.push({ url, error: String(e.message || e).slice(0, 200) });
      }
    }
    return [clave, res];
  }));

  return Response.json({ ms: Date.now() - t0, paginas: Object.fromEntries(salida) });
}
