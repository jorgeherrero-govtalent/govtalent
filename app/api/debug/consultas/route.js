// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Consultas públicas de los ministerios
//
// OBJETIVO: saber si las consultas públicas españolas son extraíbles.
//
// POR QUÉ IMPORTAN: son plazos abiertos donde todavía se puede influir,
// que es exactamente lo que vende Regulatorio. Y llevan meses marcadas
// como "próximamente" en la portada.
//
// LA DIFICULTAD: cada ministerio publica las suyas por su cuenta, sin
// portal único ni API. Hay que ir uno a uno, y este diagnóstico empieza
// por Transición Ecológica para ver qué forma tienen.
//
// LO QUE SE COMPRUEBA:
//   1. Si la página se puede leer o carga por JavaScript —el problema
//      que nos frenó con el listado de diputados—.
//   2. Si hay tabla o lista con fechas de plazo.
//   3. Si existe algún JSON detrás.
//
// Uso:
//   ?key=<DEBUG_KEY>              MITECO por defecto
//   ?key=...&url=<url>            otro ministerio
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json,*/*',
  'Accept-Language': 'es-ES,es;q=0.9',
};

// Los portales de participación que conocemos. Cada ministerio tiene el
// suyo y no comparten estructura.
const PORTALES = {
  miteco: {
    nombre: 'Transición Ecológica',
    url: 'https://www.miteco.gob.es/es/ministerio/servicios/participacion-publica/listado_proyectos_normativos.html',
  },
  sanidad: {
    nombre: 'Sanidad',
    url: 'https://www.sanidad.gob.es/normativa/audiencia/home.htm',
  },
  hacienda: {
    nombre: 'Hacienda',
    url: 'https://www.hacienda.gob.es/es-ES/Normativa%20y%20doctrina/NormativaEnTramitacion/Paginas/normativaentramitacion.aspx',
  },
  transportes: {
    nombre: 'Transportes',
    url: 'https://www.transportes.gob.es/el-ministerio/participacion-publica',
  },
};

async function pedir(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: HEADERS, cache: 'no-store', redirect: 'follow' });
    const txt = await res.text();
    return { url, status: res.status, ms: Date.now() - t0, texto: txt, final: res.url };
  } catch (e) {
    return { url, status: null, ms: Date.now() - t0, error: e.message };
  }
}

/**
 * Qué hay en el HTML.
 *
 * No se parsea entero: solo se mira si hay señales de que el contenido
 * está ahí —tablas, fechas, enlaces a documentos— o si la página es un
 * armazón vacío que carga por JavaScript.
 */
function analizar(html) {
  if (!html) return null;

  // Fechas en los formatos que usa la administración
  const fechas = [
    ...(html.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []),
    ...(html.match(/\d{1,2} de [a-zé]+ de \d{4}/gi) || []),
  ];

  // Palabras que indican que hay plazos de verdad
  const senales = {
    audiencia: (html.match(/audiencia/gi) || []).length,
    informacion_publica: (html.match(/informaci[óo]n p[úu]blica/gi) || []).length,
    plazo: (html.match(/plazo/gi) || []).length,
    consulta_previa: (html.match(/consulta previa/gi) || []).length,
    alegaciones: (html.match(/alegaciones/gi) || []).length,
  };

  return {
    tamano: html.length,
    // Si hay tabla, el contenido suele estar en el HTML
    n_tablas: (html.match(/<table/gi) || []).length,
    n_filas: (html.match(/<tr[\s>]/gi) || []).length,
    n_enlaces_pdf: (html.match(/href="[^"]*\.pdf"/gi) || []).length,
    n_fechas: fechas.length,
    muestra_fechas: [...new Set(fechas)].slice(0, 6),
    senales,
    // La señal de que carga por JavaScript: mucho script y poco texto
    n_scripts: (html.match(/<script/gi) || []).length,
    texto_visible: html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim().length,
  };
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  // --- Modo: una URL concreta -----------------------------------------
  if (sp.get('url')) {
    const r = await pedir(sp.get('url'));
    const a = analizar(r.texto);
    return Response.json({
      modo: 'url',
      url: sp.get('url'),
      status: r.status,
      ms: r.ms,
      analisis: a,
      // Un trozo del texto visible, para ver si los títulos están ahí
      muestra: (r.texto || '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 1200),
    });
  }

  const salida = { generado: new Date().toISOString(), portales: [] };

  for (const [id, p] of Object.entries(PORTALES)) {
    const r = await pedir(p.url);
    const a = analizar(r.texto);
    salida.portales.push({
      id,
      nombre: p.nombre,
      status: r.status,
      ms: r.ms,
      // El veredicto: hay contenido si el texto visible es suficiente y
      // aparecen fechas. Un armazón que carga por JavaScript da casi
      // cero en ambas.
      legible: a ? a.texto_visible > 800 && a.n_fechas >= 3 : false,
      analisis: a,
      redirigido: r.final !== p.url ? r.final : null,
      error: r.error || null,
    });
  }

  salida.siguiente_paso =
    'Con ?url=<url> se mira un portal concreto al detalle. Lo que decide: si el texto visible es grande y hay fechas, el contenido está en el HTML y se puede extraer.';

  return Response.json(salida);
}
