// =====================================================================
// RUTA TEMPORAL DE DIAGNÓSTICO — BOE
//
// OBJETIVO: saber qué publica el BOE, cómo se pide y si su clasificación
// por materias sirve para responder "qué me afecta como organización".
//
// POR QUÉ IMPORTA LA CLASIFICACIÓN: un listado del BOE lo tienen todas
// las herramientas del sector. Lo que lo haría útil aquí es poder
// filtrar por sector desde el primer día, sin que el usuario siga nada
// todavía. Si el BOE no clasifica bien, habría que clasificar nosotros
// y eso es otro proyecto.
//
// LO QUE SE SABE DE LA FUENTE:
//   El BOE publica un sumario diario y tiene una API abierta en
//   /datosabiertos/api. Los documentos llevan identificador BOE-A-AAAA-N.
//
// Uso:
//   ?key=<DEBUG_KEY>              prueba las rutas conocidas
//   ?key=...&fecha=20260817       un sumario concreto
//   ?key=...&doc=BOE-A-2026-1234  un documento concreto
//
// BORRAR ESTE ARCHIVO al cerrar el diagnóstico.
// =====================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.boe.es';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, application/xml, text/xml, */*',
  'Accept-Language': 'es-ES,es;q=0.9',
};

async function pedir(url, accept) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: accept ? { ...HEADERS, Accept: accept } : HEADERS,
      cache: 'no-store',
    });
    const txt = await res.text();
    let data = null;
    try {
      data = JSON.parse(txt);
    } catch {}
    return { url, status: res.status, ms: Date.now() - t0, texto: txt, data };
  } catch (e) {
    return { url, status: null, ms: Date.now() - t0, error: e.message };
  }
}

// El sumario puede venir en XML: se buscan las etiquetas sin parsearlo
// entero, solo para saber qué campos existen.
function etiquetasXml(xml) {
  const nombres = [...(xml || '').matchAll(/<(\w+)[\s>]/g)].map((m) => m[1]);
  const cuenta = new Map();
  for (const n of nombres) cuenta.set(n, (cuenta.get(n) || 0) + 1);
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([etiqueta, veces]) => ({ etiqueta, veces }));
}

function fechaHoy() {
  const d = new Date();
  // El sumario de hoy puede no estar publicado aún a primera hora: se
  // pide el de ayer, que siempre existe entre semana.
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  if (!process.env.DEBUG_KEY || sp.get('key') !== process.env.DEBUG_KEY) {
    return Response.json({ error: 'no autorizado — usa ?key=<DEBUG_KEY>' }, { status: 401 });
  }

  // --- Modo: un documento concreto ------------------------------------
  if (sp.get('doc')) {
    const id = sp.get('doc');
    const pruebas = [
      `${BASE}/diario_boe/xml.php?id=${id}`,
      `${BASE}/datosabiertos/api/legislacion-consolidada/id/${id}`,
      `${BASE}/datosabiertos/api/boe/id/${id}`,
    ];
    // Solo la ruta que funciona: las otras dos devolvían 400 y 404.
    const r = await pedir(`${BASE}/diario_boe/xml.php?id=${id}`, 'application/xml');
    const xml = r.texto || '';

    // Se extrae cada etiqueta de los metadatos con su código, que es lo
    // que permitiría filtrar sin depender del texto.
    const sacar = (tag) => {
      const re = new RegExp(`<${tag}(?:\\s+codigo="([^"]*)")?[^>]*>([^<]*)</${tag}>`, 'gi');
      return [...xml.matchAll(re)].map((m) => ({ codigo: m[1] || null, valor: m[2] }));
    };

    // El bloque de materias completo, para ver cómo viene estructurado
    const bloqueMaterias = xml.match(/<materias>[\s\S]*?<\/materias>/i);
    const bloqueAnalisis = xml.match(/<analisis>[\s\S]*?<\/analisis>/i);

    return Response.json({
      modo: 'documento',
      id,
      status: r.status,
      tamano: xml.length,
      // Los metadatos que sirven para clasificar
      metadatos: {
        departamento: sacar('departamento'),
        rango: sacar('rango'),
        origen_legislativo: sacar('origen_legislativo'),
        materia: sacar('materia'),
        alerta: sacar('alerta'),
        nota: sacar('nota'),
      },
      // Los bloques enteros, por si la estructura no es la que supongo
      bloque_materias: bloqueMaterias ? bloqueMaterias[0].slice(0, 1500) : null,
      bloque_analisis: bloqueAnalisis ? bloqueAnalisis[0].slice(0, 1500) : null,
      // Todas las etiquetas del documento y cuántas veces salen
      etiquetas: etiquetasXml(xml),
    });
  }

  // --- Modo: buscar normas de rango alto en un día --------------------
  // Las materias podrían rellenarse solo en las disposiciones generales,
  // no en resoluciones menores. Este modo saca las de la sección I para
  // poder comprobarlo.
  if (sp.get('generales')) {
    const f = sp.get('generales');
    const r = await pedir(`${BASE}/datosabiertos/api/boe/sumario/${f}`, 'application/json');
    const secciones = r.data?.data?.sumario?.diario?.[0]?.seccion || [];
    const seccionI = Array.isArray(secciones)
      ? secciones.find((s) => s.codigo === '1' || /disposiciones generales/i.test(s.nombre || ''))
      : null;

    const items = [];
    const recorrer = (nodo) => {
      if (!nodo) return;
      if (Array.isArray(nodo)) return nodo.forEach(recorrer);
      if (nodo.item) {
        const its = Array.isArray(nodo.item) ? nodo.item : [nodo.item];
        for (const it of its) {
          items.push({
            id: it.identificador,
            titulo: String(it.titulo || '').slice(0, 110),
            departamento: nodo._departamento || null,
          });
        }
      }
      for (const [k, v] of Object.entries(nodo)) {
        if (typeof v === 'object') {
          if (k === 'departamento' && v.nombre) v._departamento = v.nombre;
          recorrer(v);
        }
      }
    };
    recorrer(seccionI || secciones);

    return Response.json({
      modo: 'disposiciones_generales',
      fecha: f,
      seccion_encontrada: !!seccionI,
      secciones_disponibles: Array.isArray(secciones)
        ? secciones.map((s) => ({ codigo: s.codigo, nombre: s.nombre }))
        : null,
      n_items: items.length,
      items: items.slice(0, 12),
      nota: 'Prueba uno con ?doc=<identificador> para ver si trae materias.',
    });
  }

  const fecha = sp.get('fecha') || fechaHoy();
  const salida = { generado: new Date().toISOString(), fecha_probada: fecha };

  // --- A) El sumario del día -------------------------------------------
  // Se prueban las dos rutas conocidas: la API de datos abiertos y la
  // clásica en XML.
  const rutas = [
    { nombre: 'api_json', url: `${BASE}/datosabiertos/api/boe/sumario/${fecha}`, accept: 'application/json' },
    { nombre: 'api_xml', url: `${BASE}/datosabiertos/api/boe/sumario/${fecha}`, accept: 'application/xml' },
    { nombre: 'clasica_xml', url: `${BASE}/diario_boe/xml.php?id=BOE-S-${fecha}`, accept: 'application/xml' },
  ];

  salida.a_sumario = [];
  for (const r of rutas) {
    const res = await pedir(r.url, r.accept);
    salida.a_sumario.push({
      nombre: r.nombre,
      url: r.url.replace(BASE, ''),
      status: res.status,
      ms: res.ms,
      tamano: res.texto?.length,
      es_json: !!res.data,
      // Cuántos documentos trae el sumario
      n_items: (res.texto?.match(/BOE-A-\d{4}-\d+/g) || []).length,
      claves: res.data && !Array.isArray(res.data) ? Object.keys(res.data).slice(0, 12) : null,
      etiquetas: !res.data && res.texto ? etiquetasXml(res.texto).slice(0, 12) : null,
      muestra: (res.texto || '').slice(0, 500),
    });
  }

  // --- B) ¿Hay clasificación por materias? -----------------------------
  // Es lo que decide si se puede responder "qué me afecta" sin que el
  // usuario siga nada.
  const mejor = salida.a_sumario.find((s) => s.status === 200 && s.n_items > 0);
  salida.b_clasificacion = {
    pregunta: '¿El sumario clasifica por departamento y materia?',
    sumario_util: mejor?.nombre || null,
    nota: mejor
      ? 'Con ?doc=<BOE-A-...> se mira un documento al detalle para ver sus materias.'
      : 'Ningún sumario respondió con documentos. Revisar las rutas.',
  };

  salida.siguiente_paso =
    '?fecha=AAAAMMDD para otro día; ?doc=BOE-A-2026-1234 para un documento concreto.';

  return Response.json(salida);
}
