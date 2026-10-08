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

function paginas() {
  const h = hoy();
  return {
    aragon: [
      'https://www.boa.aragon.es/',
      'https://www.boa.aragon.es/cgi-bin/EBOA/BRSCGI?CMD=VERLST&BASE=BOLE&DOCS=1-20&SEC=FIRMA&SORT=-PUBL',
    ],
    asturias: [
      'https://miprincipado.asturias.es/bopa',
      `https://www.asturias.es/bopa/${h.a}/${h.m}/${h.d}/${h.a}${h.m}${h.d}.pdf`,
    ],
    cantabria: ['https://boc.cantabria.es/boces/'],
    cataluna: [
      'https://analisi.transparenciacatalunya.cat/resource/n6hn-rmy7.json?$limit=2',
      'https://analisi.transparenciacatalunya.cat/api/views/n6hn-rmy7.json',
    ],
    valencia: ['https://dogv.gva.es/es/inici', 'https://dogv.gva.es/es/sumari'],
    navarra: ['https://bon.navarra.es/es/'],
    rioja: ['https://web.larioja.org/bor-portada'],
  };
}

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
    for (const url of P[clave]) {
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
        res.push({
          url,
          tipo,
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
