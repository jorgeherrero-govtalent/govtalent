// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — composición de Valencia, La Rioja y Andalucía
// app/api/debug/composicion-ccaa/route.js
//
// Para cada parlamento: la página de diputados (texto, enlaces de
// composición, fotos, correos), la primera ficha de diputado que encuentre
// y la primera página de comisión, Mesa, Junta de Portavoces y grupos
// enlazadas. Como GovTalentBot y respetando el robots.txt.
//
// Uso: ?key=<DEBUG_KEY>[&p=valencia|rioja|andalucia]
// BORRAR al terminar los lectores.
// =====================================================================

import { crearWeb, textoPlano, enlacesDe } from '@/lib/ccaa/web';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PARL = {
  valencia: {
    inicio: ['https://www.cortsvalencianes.es/es/composicion/diputados'],
    ficha: /\/composicion\/diputados\/xi\/[^/]+\/[0-9a-f]{20,}/,
    extra: /composicion\/(comisiones|organos|mesa|junta|grupos|diputacion)/i,
  },
  rioja: {
    inicio: ['https://www.parlamento-larioja.org', 'https://www.parlamento-larioja.org/composicion', 'https://www.parlamento-larioja.org/composicion/diputados'],
    ficha: /diputad[oa]s?\/[a-z0-9-]{6,}/i,
    extra: /(comisi|mesa|junta|grupos-parlamentarios|diputacion-permanente|personal)/i,
  },
  andalucia: {
    inicio: ['https://www.parlamentodeandalucia.es/webdinamica/portal-web-parlamento/composicionyfuncionamiento/diputadosysenadores.do'],
    ficha: /diputadosysenadores\.do\?codmie=\d+/,
    extra: /composicionyfuncionamiento\/(comisiones|mesa|juntadeportavoces|gruposparlamentarios|diputacionpermanente|organos)/i,
  },
};

const sinScripts = (h) => h.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
const imgs = (h) => [...new Set([...h.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]))].slice(0, 10);
const correos = (h) => [...new Set(h.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [])].filter((e) => !/\.(png|jpe?g|gif|svg)$/i.test(e)).slice(0, 12);

function alrededor(html, re, antes = 600, despues = 1600) {
  const m = html.match(re);
  if (!m) return null;
  return html.slice(Math.max(0, m.index - antes), m.index + despues);
}

async function uno(web, cfg) {
  const out = { paginas: [] };
  let enlaces = [];
  let primeraFicha = null;
  for (const url of cfg.inicio) {
    try {
      const h = await web.texto(url);
      const ls = enlacesDe(h, url);
      enlaces.push(...ls);
      const fichas = [...new Set(ls.map((a) => a.href).filter((x) => cfg.ficha.test(x)))];
      if (!primeraFicha && fichas[0]) primeraFicha = fichas[0];
      out.paginas.push({
        url,
        kb: Math.round(h.length / 1024),
        n_fichas: fichas.length,
        fichas: fichas.slice(0, 4),
        correos: correos(h),
        imgs: imgs(h),
        texto: textoPlano(sinScripts(h)).replace(/\s+/g, ' ').slice(0, 2500),
        html_ficha: fichas[0] ? alrededor(h, new RegExp(fichas[0].replace(/^https?:\/\/[^/]+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60))) : null,
        composicion: [...new Set(ls.filter((a) => cfg.extra.test(a.href) || /composici|diputad|comisi|grupo|mesa|junta/i.test(a.texto)).map((a) => `${a.texto.slice(0, 70)} | ${a.href}`))].slice(0, 40),
      });
    } catch (e) {
      out.paginas.push({ url, error: String(e.message || e).slice(0, 200) });
    }
  }
  if (primeraFicha) {
    try {
      const h = await web.texto(primeraFicha);
      out.ficha = {
        url: primeraFicha,
        kb: Math.round(h.length / 1024),
        correos: correos(h),
        imgs: imgs(h),
        texto: textoPlano(sinScripts(h)).replace(/\s+/g, ' ').slice(0, 5000),
        html_cargos: alrededor(sinScripts(h), /comisi/i, 400, 2500),
      };
    } catch (e) {
      out.ficha = { url: primeraFicha, error: String(e.message || e).slice(0, 200) };
    }
  }
  // Una página de cada órgano enlazado (comisiones, mesa, junta, grupos).
  const vistos = new Set();
  out.organos = [];
  for (const a of enlaces) {
    if (!cfg.extra.test(a.href) || vistos.has(a.href) || out.organos.length >= 5) continue;
    const tipo = (a.href.match(cfg.extra) || [])[1]?.toLowerCase();
    if ([...vistos].some((v) => v.startsWith(`${tipo}:`))) continue;
    vistos.add(`${tipo}:${a.href}`);
    try {
      const h = await web.texto(a.href);
      const ls = enlacesDe(h, a.href);
      out.organos.push({
        url: a.href,
        texto: textoPlano(sinScripts(h)).replace(/\s+/g, ' ').slice(0, 2500),
        correos: correos(h),
        enlaces: [...new Set(ls.filter((x) => /comisi|grupo|mesa|junta|diputad|organo/i.test(x.href + x.texto)).map((x) => `${x.texto.slice(0, 70)} | ${x.href}`))].slice(0, 30),
      });
    } catch (e) {
      out.organos.push({ url: a.href, error: String(e.message || e).slice(0, 200) });
    }
  }
  return out;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado' }, { status: 401 });
  }
  const pedidos = sp.get('p') ? sp.get('p').split(',') : Object.keys(PARL);
  const web = crearWeb();
  const salida = {};
  for (const p of pedidos) {
    if (!PARL[p]) continue;
    try {
      salida[p] = await uno(web, PARL[p]);
    } catch (e) {
      salida[p] = { error: String(e.message || e).slice(0, 300) };
    }
  }
  return Response.json(salida);
}
