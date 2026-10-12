// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — composición de la Asamblea de Madrid
// app/api/debug/asamblea-madrid/route.js
//
// Devuelve trozos del HTML del listado de diputados y de una ficha
// (servidos por ctyp.asambleamadrid.es/es/web/guest/…) para escribir el
// lector: cómo se pagina el listado, dónde va la foto, el correo, el
// grupo y las comisiones con su cargo. Como GovTalentBot y respetando el
// robots.txt (lib/ccaa/web.js).
//
// Uso: ?key=<DEBUG_KEY>[&diputado=2026]
// BORRAR al terminar el lector.
// =====================================================================

import { crearWeb, textoPlano, enlacesDe } from '@/lib/ccaa/web';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://ctyp.asambleamadrid.es/es/web/guest/composicion/diputados';

function alrededor(html, aguja, antes = 1500, despues = 2500) {
  const i = html.indexOf(aguja);
  return i < 0 ? null : html.slice(Math.max(0, i - antes), i + despues);
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado' }, { status: 401 });
  }
  const id = sp.get('diputado') || '2026';
  const web = crearWeb();
  const salida = {};

  const lista = await web.texto(BASE);
  const fichas = [...new Set((lista.match(/ficha-del-diputado\?diputado=\d+/g) || []))];
  salida.listado = {
    kb: Math.round(lista.length / 1024),
    fichas,
    paginacion: enlacesDe(lista, BASE).filter((a) => /NumeroDePagina|pagina|page/i.test(a.href)).slice(0, 8).map((a) => `${a.texto} | ${a.href}`),
    imgs: [...new Set([...lista.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]))].filter((x) => !/layout_icon/.test(x)).slice(0, 15),
    primer_diputado_html: fichas[0] ? alrededor(lista, fichas[0], 2500, 1500) : null,
  };

  const url = `${BASE}/ficha-del-diputado?diputado=${id}&legislatura=13`;
  const ficha = await web.texto(url);
  const ini = ficha.search(/<h1|class="[^"]*ficha|nombre-diputado|datos-diputado/i);
  salida.ficha = {
    url,
    kb: Math.round(ficha.length / 1024),
    imgs: [...new Set([...ficha.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]))].filter((x) => !/layout_icon/.test(x)).slice(0, 15),
    correos: [...new Set(ficha.match(/[\w.+-]+@asambleamadrid\.es/gi) || [])],
    // El cuerpo de la ficha en texto, para ver qué secciones tiene.
    texto: textoPlano(ficha.slice(Math.max(0, ini))).slice(0, 6000),
    html_comisiones: alrededor(ficha, 'Comisi', 800, 3000),
    html_foto: alrededor(ficha, '<img', 0, 0) && (() => {
      const m = [...ficha.matchAll(/<img[^>]+>/gi)].map((x) => x[0]).filter((x) => !/layout_icon/.test(x));
      return m.slice(0, 6);
    })(),
  };

  return Response.json(salida);
}
