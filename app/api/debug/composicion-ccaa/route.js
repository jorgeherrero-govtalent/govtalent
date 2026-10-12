// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — composición de Valencia, La Rioja y Andalucía
// app/api/debug/composicion-ccaa/route.js
//
// Segunda ronda: páginas concretas de cada parlamento (Mesa, Junta,
// Diputación Permanente, comisiones, ficha de diputado, personal de los
// grupos). De cada una devuelve el texto, los correos, los enlaces que
// interesan y un trozo del HTML alrededor de lo que se busca; y sigue el
// primer enlace que case con `seguir`. Como GovTalentBot y respetando el
// robots.txt.
//
// Uso: ?key=<DEBUG_KEY>[&p=valencia|rioja|andalucia]
// BORRAR al terminar los lectores.
// =====================================================================

import { crearWeb, textoPlano, enlacesDe } from '@/lib/ccaa/web';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const V = 'https://www.cortsvalencianes.es/es/composicion';
const R = 'https://www.parlamento-larioja.org/composicion-y-organos';
const A = 'https://www.parlamentodeandalucia.es/webdinamica/portal-web-parlamento/composicionyfuncionamiento';

const PARL = {
  valencia: [
    { url: `${V}/organos/mesa`, html: /diputad/i },
    { url: `${V}/organos/junta-sindics`, html: /s[ií]ndic/i },
    { url: `${V}/organos/diputacion-permanente`, html: /diputad/i },
    { url: `${V}/organos/comisiones`, seguir: /organos\/comisiones\/[^/?#]+/, html: /comisi/i },
    { url: `${V}/grupos-parlamentarios`, seguir: /grupos-parlamentarios\/[^/?#]+/ },
  ],
  rioja: [
    { url: `${R}/diputados`, seguir: /legislatura-11\/diputados\/[a-z0-9-]+$/, html: /legislatura-11\/diputados\// },
    { url: `${R}/legislatura-organos`, seguir: /legislatura-11\/organos\/[a-z0-9-]+/, html: /organos\// },
    { url: `${R}/legislatura-11/grupos-parlamentarios/grupo-parlamentario-popular`, html: /diputad/i },
    { url: 'https://transparencia.parlamento-larioja.org/informacion-institucional-y-organizativa/diputados-diputadas-y-personal-eventual', seguir: /personal-eventual|eventual/i, html: /eventual/i },
  ],
  andalucia: [
    { url: `${A}/organosparlamentarios/pleno.do?modo=confoto`, html: /codmie=/ },
    { url: `${A}/diputadosysenadores.do?codmie=569&nlegis=13&codorg=3&cirele=0&accion=Ver%20Diputados`, html: /Pertenencia a [oó]rganos/i, despues: 4000 },
    { url: `${A}/organosparlamentarios/mesa.do?modo=confoto`, html: /codmie=/ },
    { url: `${A}/organosparlamentarios/juntadeportavoces.do?modo=confoto`, html: /codmie=/ },
    { url: `${A}/organosparlamentarios/diputacionpermanente.do?modo=confoto`, html: /codmie=/ },
    { url: `${A}/organosparlamentarios/comisiones.do`, seguir: /comisiones\.do\?.*cod/i, html: /comisiones\.do\?/ },
    { url: `${A}/gruposparlamentarios.do?nlegis=13&listado=portavocia`, html: /codmie=/ },
  ],
};

const sinScripts = (h) => h.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
const correos = (h) => [...new Set(h.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [])].filter((e) => !/\.(png|jpe?g|gif|svg)$/i.test(e)).slice(0, 15);

async function leer(web, paso, despues = 2000) {
  const h = await web.texto(paso.url);
  const limpio = sinScripts(h);
  const t = textoPlano(limpio).replace(/\s+/g, ' ');
  // El texto útil suele ir después del menú: se corta desde la mitad del
  // documento si es muy largo, guardando los 6.000 caracteres centrales.
  const m = paso.html ? limpio.match(paso.html) : null;
  const ls = enlacesDe(h, paso.url);
  return {
    url: paso.url,
    kb: Math.round(h.length / 1024),
    correos: correos(h),
    texto: t.length > 7000 ? t.slice(Math.floor(t.length * 0.25), Math.floor(t.length * 0.25) + 6000) : t,
    html: m ? limpio.slice(Math.max(0, m.index - 500), m.index + (paso.despues || despues)) : null,
    enlaces: [...new Set(ls.filter((a) => (paso.seguir && paso.seguir.test(a.href)) || /diputad|comisi|organo|grupo|mesa|junta|sindic|eventual|personal/i.test(a.href)).map((a) => `${a.texto.slice(0, 60)} | ${a.href}`))].slice(0, 40),
    siguiente: paso.seguir ? ls.map((a) => a.href).find((x) => paso.seguir.test(x) && x !== paso.url) || null : null,
  };
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
    salida[p] = [];
    for (const paso of PARL[p]) {
      try {
        const r = await leer(web, paso);
        salida[p].push(r);
        if (r.siguiente) {
          try {
            salida[p].push({ seguido_de: paso.url, ...(await leer(web, { url: r.siguiente, html: /comisi|cargo|portavoz|diputad|eventual|correo|mailto/i }, 4000)) });
          } catch (e) {
            salida[p].push({ url: r.siguiente, error: String(e.message || e).slice(0, 200) });
          }
        }
      } catch (e) {
        salida[p].push({ url: paso.url, error: String(e.message || e).slice(0, 200) });
      }
    }
  }
  return Response.json(salida);
}
