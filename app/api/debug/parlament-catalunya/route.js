// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — composición del Parlament de Catalunya
// app/api/debug/parlament-catalunya/route.js
//
// Devuelve trozos del Ple (lista de diputados por grupo y Mesa), de una
// ficha de diputado, de la Diputació Permanent, de la Junta de Portaveus,
// del índice de comisiones y de un grupo, para escribir el lector. Como
// GovTalentBot y respetando el robots.txt (lib/ccaa/web.js): nada de /ext,
// /pls ni /apl (las fotos se enlazan, no se descargan).
//
// Uso: ?key=<DEBUG_KEY>[&diputat=2133]
// BORRAR al terminar el lector.
// =====================================================================

import { crearWeb, textoPlano, enlacesDe } from '@/lib/ccaa/web';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const W = 'https://www.parlament.cat/web/composicio';

function sinScripts(h) {
  return h.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
}
function alrededor(html, aguja, antes = 1200, despues = 2500) {
  const i = html.indexOf(aguja);
  return i < 0 ? null : html.slice(Math.max(0, i - antes), i + despues);
}
function cuerpo(h, n = 6000) {
  const t = textoPlano(sinScripts(h));
  const i = t.search(/Ple del Parlament|Fitxa|Composició|Diputació Permanent|Junta de Portaveus|Comissions|Grups parlamentaris/);
  return t.slice(Math.max(0, i), Math.max(0, i) + n);
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado' }, { status: 401 });
  }
  const id = sp.get('diputat') || '2133';
  const web = crearWeb();
  const salida = {};
  const intenta = async (k, fn) => {
    try {
      salida[k] = await fn();
    } catch (e) {
      salida[k] = { error: String(e.message || e).slice(0, 300) };
    }
  };

  await intenta('ple', async () => {
    const h = await web.texto(`${W}/ple-parlament/index.html`);
    const codis = [...new Set((h.match(/diputats-fitxa\/index\.html\?p_codi=\d+/g) || []))];
    return {
      kb: Math.round(h.length / 1024),
      n_codis: codis.length,
      codis: codis.slice(0, 10),
      html_mesa: alrededor(h, 'diputats-fitxa', 1500, 2000),
      // El primer bloque de grupo después de la Mesa.
      html_grup: alrededor(h, 'Socialistes', 1500, 3000),
      html_ultim: (() => { const i = h.lastIndexOf('diputats-fitxa'); return i < 0 ? null : h.slice(i - 1500, i + 1200); })(),
      grups: enlacesDe(h, `${W}/ple-parlament/index.html`).filter((a) => /grups-parlamentaris/.test(a.href)).slice(0, 12).map((a) => `${a.texto.slice(0, 80)} | ${a.href}`),
    };
  });

  await intenta('fitxa', async () => {
    const url = `${W}/diputats-fitxa/index.html?p_codi=${id}`;
    const h = await web.texto(url);
    return {
      url,
      kb: Math.round(h.length / 1024),
      correus: [...new Set(h.match(/[\w.+-]+@parlament\.cat/gi) || [])],
      imgs: [...new Set([...h.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]))].slice(0, 12),
      text: cuerpo(h, 9000),
      html_carrecs: alrededor(sinScripts(h), 'rrecs', 300, 4000),
    };
  });

  for (const [k, ruta] of [
    ['mesa', '/president-mesa/index.html'],
    ['diputacio', '/diputacio-permanent/index.html'],
    ['junta', '/junta-portaveus/index.html'],
    ['comissions', '/comissions/index.html'],
    ['grups', '/grups-parlamentaris/index.html'],
  ]) {
    await intenta(k, async () => {
      const h = await web.texto(`${W}${ruta}`);
      return {
        kb: Math.round(h.length / 1024),
        text: cuerpo(h, 3500),
        enllacos: [...new Set(enlacesDe(h, `${W}${ruta}`).filter((a) => /composicio\/(comissions|grups|junta|diputacio|president)/.test(a.href)).map((a) => `${a.texto.slice(0, 90)} | ${a.href}`))].slice(0, 50),
      };
    });
  }

  await intenta('grup', async () => {
    const url = `${W}/grups-parlamentaris/composicio-actual/index.html?p_codi=39&p_mesa=S&p_ordre=GRUP_PARLAMENTARI&p_tipus=COMPOSICIO`;
    const h = await web.texto(url);
    return { url, text: cuerpo(h, 3500), imgs: [...new Set([...h.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]))].slice(0, 8) };
  });

  await intenta('comissio', async () => {
    const url = `${W}/comissions/composicio-actual/index.html?p_codi=838&p_mesa=N&p_ordre=PERGRUP&p_tipus=COMPOSICIO`;
    const h = await web.texto(url);
    return { url, text: cuerpo(h, 3500), html: alrededor(h, 'diputats-fitxa', 800, 1500) };
  });

  return Response.json(salida);
}
