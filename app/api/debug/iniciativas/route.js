// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — Endpoint filtrarListado del Congreso
//
// OBJETIVO: saber si el buscador de iniciativas devuelve JSON o HTML, y
// si un solo endpoint sirve para todos los tipos.
//
// LO QUE YA SABEMOS, del panel de red:
//   POST /es/proposiciones-no-de-ley
//     ?p_p_id=iniciativas&p_p_lifecycle=2&p_p_resource_id=filtrarListado
//   con Form Data:
//     _iniciativas_legislatura      15
//     _iniciativas_cini             (161.CINI.+o+162.CINI.)
//     _iniciativas_paginaActual     1
//     _iniciativas_tipoLlamada      T
//
//   El campo cini lleva los prefijos del tipo de iniciativa, los mismos
//   que vimos en el análisis de intervenciones:
//     121 proyectos de ley          122 proposiciones de ley
//     161 PNL en comisión           162 PNL ante el pleno
//     130 reales decretos-ley       212/213 comparecencias
//
//   Si el mismo endpoint acepta cualquier cini, un solo sync cubre todo.
//
// Uso:
//   ?key=<DEBUG_KEY>              prueba los tipos principales
//   ?key=...&cini=130.CINI.       un tipo concreto
//   ?key=...&ruta=reales-decretos-leyes
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.congreso.es/es';
const TIMEOUT_MS = 20000;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  Origin: 'https://www.congreso.es',
};

function url(ruta) {
  const p = new URLSearchParams({
    p_p_id: 'iniciativas',
    p_p_lifecycle: '2',
    p_p_state: 'normal',
    p_p_mode: 'view',
    p_p_resource_id: 'filtrarListado',
    p_p_cacheability: 'cacheLevelPage',
  });
  return `${BASE}/${ruta}?${p.toString()}`;
}

function cuerpo({ cini, pagina = 1, legislatura = '15' }) {
  // Los nombres van con el prefijo del portlet, tal como los manda la
  // propia página. Se envían también los campos vacíos: el servidor los
  // espera y sin ellos puede devolver 400.
  const f = new URLSearchParams();
  f.set('_iniciativas_legislatura', legislatura);
  f.set('_iniciativas_estadoTramitacion', '');
  f.set('_iniciativas_faseTramitacion', '');
  f.set('_iniciativas_cini', cini);
  f.set('_iniciativas_tipoLlamada', 'T');
  f.set('_iniciativas_paginaActual', String(pagina));
  f.set('_iniciativas_comision_competente', '');
  return f.toString();
}

async function pedir(ruta, opciones) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url(ruta), {
      method: 'POST',
      headers: { ...HEADERS, Referer: `${BASE}/${ruta}` },
      body: cuerpo(opciones),
      signal: controller.signal,
      cache: 'no-store',
    });
    const txt = await res.text();
    let data = null;
    try {
      data = JSON.parse(txt);
    } catch {}
    return { status: res.status, ms: Date.now() - t0, texto: txt, data, tipo: res.headers.get('content-type') };
  } catch (e) {
    return { status: null, ms: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Si viene HTML, cuenta los expedientes que aparecen: es la señal de que
// hay resultados aunque no sea JSON.
function expedientesEnHtml(html) {
  const m = html.match(/\(\d{3}\/\d{6}\/\d{4}\)/g) || html.match(/\(\d{3}\/\d{6}\)/g) || [];
  return [...new Set(m)];
}

function resumen(r) {
  if (r.error) return { error: r.error };
  const base = { status: r.status, ms: r.ms, tipo: r.tipo, tamano: r.texto?.length };

  if (r.data) {
    const lista = Array.isArray(r.data) ? r.data : r.data.data || r.data.iniciativas || null;
    return {
      ...base,
      formato: 'JSON',
      claves: !Array.isArray(r.data) ? Object.keys(r.data) : null,
      registros: Array.isArray(lista) ? lista.length : null,
      campos: Array.isArray(lista) && lista[0] ? Object.keys(lista[0]) : null,
      muestra: Array.isArray(lista) && lista[0] ? JSON.stringify(lista[0]).slice(0, 500) : null,
    };
  }

  const exp = expedientesEnHtml(r.texto || '');
  return {
    ...base,
    formato: 'HTML',
    expedientes_detectados: exp.length,
    muestra_expedientes: exp.slice(0, 5),
    // El total suele aparecer como "Resultados 1 a 25 de 2612"
    total: (r.texto || '').match(/de\s+([\d.]+)\s*<\/?/)?.[1] || null,
    empieza_por: (r.texto || '').slice(0, 300),
  };
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  // Modo suelto: un cini y una ruta concretos
  if (sp.get('cini')) {
    const ruta = sp.get('ruta') || 'proposiciones-no-de-ley';
    const r = await pedir(ruta, { cini: sp.get('cini'), pagina: parseInt(sp.get('pagina') || '1', 10) });
    return Response.json({ modo: 'suelto', ruta, cini: sp.get('cini'), ...resumen(r) });
  }

  // Los cuatro tipos que interesan. Se prueba cada uno en SU ruta y
  // además todos en la de proposiciones no de ley: si esta última
  // funciona con cualquier cini, un solo endpoint cubre todo.
  const tipos = [
    { nombre: 'Proposiciones no de ley', ruta: 'proposiciones-no-de-ley', cini: '(161.CINI. o 162.CINI.)' },
    { nombre: 'Reales decretos-ley', ruta: 'reales-decretos-leyes', cini: '130.CINI.' },
    { nombre: 'Comparecencias', ruta: 'comparecencias', cini: '(212.CINI. o 213.CINI.)' },
    { nombre: 'Proyectos de ley (control)', ruta: 'proyectos-de-ley', cini: '121.CINI.' },
  ];

  const salida = { generado: new Date().toISOString() };

  salida.en_su_ruta = {};
  for (const t of tipos) {
    const r = await pedir(t.ruta, { cini: t.cini });
    salida.en_su_ruta[t.nombre] = { ruta: t.ruta, cini: t.cini, ...resumen(r) };
  }

  // ¿Sirve una sola ruta para todos los tipos?
  const r2 = await pedir('proposiciones-no-de-ley', { cini: '130.CINI.' });
  salida.una_ruta_para_todo = {
    pregunta: '¿Acepta la ruta de PNL un cini de decretos-ley?',
    ...resumen(r2),
  };

  salida.siguiente_paso = 'Con ?cini=<valor>&ruta=<ruta> se puede probar cualquier combinación.';
  return Response.json(salida);
}
