// =====================================================================
// SYNC — Comisiones del Congreso y su composición
// app/api/sync/congreso-comisiones/route.js
//
// FUENTE: endpoint opendataExport de congreso.es, uno por comisión.
// Los suborganos son correlativos (301 Constitucional, 302 Asuntos
// Exteriores), así que se recorre un rango y se conservan los que
// devuelvan miembros. Es más robusto que mantener una lista fija: si el
// Congreso crea una comisión nueva, aparece sola.
//
// CABE EN UNA PASADA: unas 40 peticiones ligeras.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin escribir
//   ?key=<DEBUG_KEY>              carga real
//   ?desde=300&hasta=345          ajustar el rango
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.congreso.es/es/organos/composicion-en-la-legislatura';

// Sin cabeceras de navegador el portal responde 403.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/html,*/*',
  'Accept-Language': 'es-ES,es;q=0.9',
  // El endpoint es una llamada interna de Liferay: sin Referer del
  // propio sitio suele devolver la página en vez del JSON.
  Referer: 'https://www.congreso.es/es/organos/composicion-en-la-legislatura',
};

// Las comisiones NO son un solo bloque correlativo, como se creyó al
// escribir esto. Hay dos tramos:
//
//   300-330  las primeras permanentes, mixtas y de seguimiento
//   358-379  el resto de legislativas —Educación, Trabajo, Industria,
//            Agricultura, Transición Ecológica, Economía…— más las de
//            investigación
//
// Con el rango 295-350 faltaban nueve comisiones legislativas, entre
// ellas la de Economía, Comercio y Transformación Digital, que es la que
// tramita la ley de gobernanza de la IA.
//
// Se deja margen por arriba para que una comisión nueva aparezca sola.
const DESDE = 295;
const HASTA = 390;
// Con 96 suborganos —antes 56— el tirón se acercaba al límite de 60s de
// la función: el rango de 56 tardaba 14s y el de 71 llegó a 14,5s. Se
// sube el paralelismo y se acorta la pausa para dejar margen.
const PARALELO = 6;
const PAUSA_MS = 150;

// Los órganos de gobierno NO son suborganos. Cuelgan de su propia página
// y su llamada a searchOrgano no lleva selectedSuborgano ni
// selectedOrganoSup, así que el barrido del rango nunca iba a
// encontrarlos por muchos números que se ampliaran: se comprobó de 1 a
// 390 y solo aparecen los 300+.
//
// El nombre va escrito aquí porque estas páginas no tienen un título del
// que rasparlo como las comisiones.
//
// suborgano_id negativo para no chocar jamás con los reales, que
// empiezan en el 300, y para que se reconozcan de un vistazo en la tabla
// como lo que son: identificadores nuestros, no del Congreso.
//
// La Junta de Portavoces no está aquí: esa sí es el suborgano 300 y se
// carga con el barrido normal. Lo único que le cambia es el kind.
const ORGANOS_GOBIERNO = [
  { suborgano_id: -1, ruta: '/es/mesa', name: 'Mesa del Congreso' },
  { suborgano_id: -2, ruta: '/es/diputacion-permanente', name: 'Diputación Permanente' },
];

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js cachea los GET del cliente de Supabase y hace que el sync
      // lea siempre lo mismo.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// La página HTML de la comisión. El endpoint de datos no trae el
// nombre —solo data, fechaConstitucion y fechaDisolucion— así que hay
// que sacarlo del título de la página.
function urlPagina(suborgano, legislatura = 'XV') {
  const p = new URLSearchParams({
    p_p_id: 'organos',
    p_p_lifecycle: '0',
    p_p_state: 'normal',
    p_p_mode: 'view',
    _organos_selectedLegislatura: legislatura,
    _organos_selectedOrganoSup: '1',
    _organos_selectedSuborgano: String(suborgano),
  });
  return `${BASE}?${p.toString()}`;
}

/**
 * Extrae el nombre del título de la página:
 *   <h2>Composición Actual de la Comisión Constitucional</h2>
 * Se prueban varias formas porque el marcado puede variar entre
 * comisiones permanentes, mixtas y de investigación.
 */
// Lo que de verdad es una comisión. Cualquier otra cosa que devuelva el
// HTML —"Selector de idioma", "Enlaces", un título de menú— se descarta:
// es preferible un hueco visible a una fila con basura.
//
// Y las que fallan al leerse colapsan todas en el mismo slug y se pisan
// unas a otras, así que un nombre malo no ensucia una fila: borra varias.
const EMPIEZA_COMISION = /^(Comisión|Comision|Junta|Diputación|Diputacion|Mesa|Pleno)\b/i;

function nombreDelHtml(html) {
  // Se limpia el HTML del título antes de leerlo: los nombres largos
  // —"Comisión Mixta para la Coordinación y Seguimiento de la Estrategia
  // Española para alcanzar los Objetivos de Desarrollo Sostenible (ODS)",
  // 118 caracteres— se parten en varias líneas y el portal mete etiquetas
  // dentro. El patrón anterior exigía que el nombre acabara antes del
  // primer '<' y por eso fallaba justo en las comisiones de nombre largo.
  const sinEtiquetas = (t) =>
    String(t || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

  const patrones = [
    // El encabezado de la página, ya sin etiquetas dentro
    /Composición\s+Actual\s+de\s+la\s+([\s\S]{5,200}?)(?:<\/h1>|<\/h2>|<\/div>)/i,
    /<h1[^>]*>([\s\S]{5,200}?)<\/h1>/i,
    /<h2[^>]*>([\s\S]{5,200}?)<\/h2>/i,
    /<title>\s*([^<|]{5,200}?)\s*[|<]/i,
  ];

  for (const re of patrones) {
    const m = html.match(re);
    if (!m || !m[1]) continue;
    let n = sinEtiquetas(m[1]);
    // El encabezado a veces conserva el "Composición Actual de la"
    n = n.replace(/^Composición\s+Actual\s+de\s+la\s+/i, '').trim();
    if (!n) continue;
    if (/^composición en la legislatura$/i.test(n)) continue;
    // Solo se acepta si parece el nombre de un órgano
    if (EMPIEZA_COMISION.test(n)) return n;
  }
  return null;
}

function urlComision(suborgano, legislatura = 'XV') {
  // searchOrgano, no opendataExport: el segundo devuelve HTTP 400.
  // Verificado en el panel de red, que es lo que usa la propia página.
  // Tampoco lleva statusOpenData.
  const p = new URLSearchParams({
    p_p_id: 'organos',
    p_p_lifecycle: '2',
    p_p_state: 'normal',
    p_p_mode: 'view',
    p_p_resource_id: 'searchOrgano',
    p_p_cacheability: 'cacheLevelPage',
    _organos_selectedLegislatura: legislatura,
    _organos_selectedOrganoSup: '1',
    _organos_selectedSuborgano: String(suborgano),
  });
  return `${BASE}?${p.toString()}`;
}

async function pedirComision(suborgano) {
  try {
    const res = await fetch(urlComision(suborgano), { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return { suborgano, ok: false, motivo: `HTTP ${res.status}` };
    const txt = await res.text();
    // Un suborgano inexistente devuelve HTML o una lista vacía, no un
    // error: hay que comprobar la forma, no el código de estado.
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      return { suborgano, ok: false, motivo: 'no es JSON' };
    }
    // La respuesta viene envuelta: {"data":[...]}, no es un array suelto.
    const lista = Array.isArray(data) ? data : data?.data;
    if (!Array.isArray(lista) || lista.length === 0) {
      return { suborgano, ok: false, motivo: 'sin miembros' };
    }
    // El nombre solo está en la página HTML, así que hace falta una
    // segunda petición por comisión.
    let nombre = null;
    let fechaConstitucion = null;
    try {
      fechaConstitucion = data?.fechaConstitucion?.fechaConstitucion || null;
      const resPag = await fetch(urlPagina(suborgano), { headers: HEADERS, cache: 'no-store' });
      if (resPag.ok) nombre = nombreDelHtml(await resPag.text());
    } catch {}

    return { suborgano, ok: true, data: lista, nombre, fechaConstitucion };
  } catch (e) {
    return { suborgano, ok: false, motivo: e.message };
  }
}

// Misma llamada de Liferay que las comisiones, pero colgando de la
// página del órgano y sin los dos parámetros de suborgano.
//
// selectedLegislatura es obligatorio aunque parezca opcional: sin él el
// endpoint no da error, devuelve la legislatura 0 —la Constituyente,
// con la Mesa de Álvarez de Miranda de 1977— como si fuera la actual.
function urlOrganoGobierno(ruta, legislatura = 'XV') {
  const p = new URLSearchParams({
    p_p_id: 'organos',
    p_p_lifecycle: '2',
    p_p_state: 'normal',
    p_p_mode: 'view',
    p_p_resource_id: 'searchOrgano',
    p_p_cacheability: 'cacheLevelPage',
    _organos_selectedLegislatura: legislatura,
  });
  return `https://www.congreso.es${ruta}?${p.toString()}`;
}

// Devuelve la misma forma que pedirComision() para poder mezclarlos en
// la misma lista. El nombre ya viene dado, así que se ahorra la segunda
// petición al HTML.
async function pedirOrganoGobierno(org, legislatura = 'XV') {
  try {
    const res = await fetch(urlOrganoGobierno(org.ruta, legislatura), { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return { suborgano: org.suborgano_id, ok: false, motivo: `HTTP ${res.status}` };
    const txt = await res.text();
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      return { suborgano: org.suborgano_id, ok: false, motivo: 'no es JSON' };
    }
    const lista = Array.isArray(data) ? data : data?.data;
    if (!Array.isArray(lista) || lista.length === 0) {
      return { suborgano: org.suborgano_id, ok: false, motivo: 'sin miembros' };
    }
    return {
      suborgano: org.suborgano_id,
      ok: true,
      data: lista,
      nombre: org.name,
      fechaConstitucion: data?.fechaConstitucion?.fechaConstitucion || null,
    };
  } catch (e) {
    return { suborgano: org.suborgano_id, ok: false, motivo: e.message };
  }
}

function slugify(t) {
  return (t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

// "04/12/2023" -> "2023-12-04"
function fechaEs(f) {
  if (!f) return null;
  const m = String(f).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Orden de peso de los cargos.
 *
 * Los portavoces van justo después de la mesa y por delante de vocales
 * y adscritos: en una comisión quien negocia por cada grupo es el
 * portavoz, y es a quien busca un profesional de asuntos públicos.
 */
const ORDEN_CARGOS = [
  // Sin anclar al final: hay comisiones donde el cargo llega como
  // "Presidente" a secas y otras con matices.
  [/^president/i, 1],
  [/^vicepresident/i, 2],
  [/^secretari[oa]/i, 3],
  [/^portavoces? (adjunt|suplent)/i, 5],
  // Llega como "Portavoces" y como "Portavoces titulares" según el órgano.
  [/^portavoc/i, 4],
  [/^vocales/i, 6],
  [/^adscritos/i, 7],
  [/^letrados/i, 8],
];

function ordenCargo(cargo) {
  const hit = ORDEN_CARGOS.find(([re]) => re.test((cargo || '').trim()));
  return hit ? hit[1] : 99;
}

// Mesa, Junta de Portavoces y Diputación Permanente no son comisiones:
// no tramitan, gobiernan la cámara. Sin esta rama la Junta de Portavoces
// entraba como 'permanente' y salía mezclada con las legislativas.
const ES_GOBIERNO = /^(Mesa|Junta de Portavoces|Diputaci[oó]n Permanente|Pleno)\b/i;

// El tipo se deriva del nombre: el Congreso no lo publica como campo.
function tipoComision(nombre) {
  const n = (nombre || '').toLowerCase();
  if (ES_GOBIERNO.test((nombre || '').trim())) return 'gobierno';
  if (n.includes('investigación')) return 'investigacion';
  if (n.includes('mixta')) return 'mixta';
  if (n.includes('seguimiento') || n.includes('evaluación')) return 'seguimiento';
  return 'permanente';
}

// "...&codParlamentario=35&idLegislatura=XV" -> "35"
function codParlamentario(url) {
  const m = String(url || '').match(/codParlamentario=(\d+)/);
  return m ? m[1] : null;
}

function normalizar(n) {
  return (n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Escritura verificada: .select() devuelve las filas afectadas, así el
// informe cuenta cambios reales y no llamadas sin error.
async function escribir(supabase, tabla, filas, conflicto, devolver) {
  if (filas.length === 0) return { escritas: 0, errores: [] };
  let escritas = 0;
  const errores = [];
  const salida = [];
  for (let i = 0; i < filas.length; i += 100) {
    const grupo = filas.slice(i, i + 100);
    const { data, error } = await supabase
      .from(tabla)
      .upsert(grupo, { onConflict: conflicto })
      .select(devolver || conflicto.split(',')[0]);
    if (error) errores.push(error.message);
    else {
      escritas += Array.isArray(data) ? data.length : 0;
      if (Array.isArray(data)) salida.push(...data);
    }
  }
  return { escritas, errores, filas: salida };
}

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Modo diagnóstico: devuelve la respuesta cruda de un suborgano para
  // ver por qué falla, en vez de suponerlo.
  if (sp.get('probar')) {
    const n = sp.get('probar');
    const url = urlComision(n);
    try {
      const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
      const txt = await res.text();
      let json = null;
      try {
        json = JSON.parse(txt);
      } catch {}
      const lista = Array.isArray(json) ? json : json?.data;
      return NextResponse.json({
        modo: 'probar',
        suborgano: n,
        status: res.status,
        tamano: txt.length,
        // Las claves de la raíz dicen dónde vive el nombre del órgano:
        // en el fichero manual venía en cada registro (NombreOrgano),
        // pero el endpoint puede ponerlo aparte.
        claves_raiz: json && !Array.isArray(json) ? Object.keys(json) : null,
        registros: Array.isArray(lista) ? lista.length : null,
        claves_registro: Array.isArray(lista) && lista[0] ? Object.keys(lista[0]) : null,
        primer_registro: Array.isArray(lista) ? lista[0] : null,
        // Todo lo que no sea la lista: ahí estaría el nombre.
        fuera_de_la_lista: json && !Array.isArray(json)
          ? Object.fromEntries(Object.entries(json).filter(([k]) => k !== 'data'))
          : null,
      });
    } catch (e) {
      return NextResponse.json({ modo: 'probar', suborgano: n, url, error: e.message });
    }
  }

  const dry = sp.get('dry') === '1';
  const desde = parseInt(sp.get('desde') || String(DESDE), 10);
  const hasta = parseInt(sp.get('hasta') || String(HASTA), 10);
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry, rango: [desde, hasta] };

  try {
    // --- Recorrer el rango --------------------------------------------
    const encontradas = [];
    const vacios = [];

    for (let n = desde; n <= hasta; n += PARALELO) {
      const grupo = [];
      for (let k = 0; k < PARALELO && n + k <= hasta; k++) grupo.push(n + k);
      const res = await Promise.all(grupo.map(pedirComision));
      for (const r of res) {
        if (r.ok) encontradas.push(r);
        else vacios.push(r.suborgano);
      }
      await espera(PAUSA_MS);
    }

    informe.comisiones_encontradas = encontradas.length;
    informe.suborganos_vacios = vacios.length;

    // Los órganos de gobierno van aparte porque no viven en el rango.
    // Solo se piden cuando el barrido cubre el tramo real de comisiones:
    // así un ?desde=1&hasta=40 de diagnóstico no los arrastra.
    informe.gobierno = [];
    if (hasta >= 300) {
      const resGob = await Promise.all(ORGANOS_GOBIERNO.map((o) => pedirOrganoGobierno(o)));
      for (const r of resGob) {
        const org = ORGANOS_GOBIERNO.find((o) => o.suborgano_id === r.suborgano);
        informe.gobierno.push({
          nombre: org?.name,
          ok: r.ok,
          miembros: r.ok ? r.data.length : 0,
          motivo: r.ok ? undefined : r.motivo,
        });
        if (r.ok) encontradas.push(r);
      }
    }

    if (encontradas.length === 0) {
      return NextResponse.json({ ...informe, error: 'No se encontró ninguna comisión en el rango' }, { status: 502 });
    }

    // --- Transformar ---------------------------------------------------
    const comisiones = [];
    const miembrosPorSuborgano = new Map();

    for (const c of encontradas) {
      // El nombre llega de la página HTML; los registros no lo traen.
      const nombre = (c.nombre || c.data[0]?.NombreOrgano || '').trim();
      if (!nombre) continue;

      comisiones.push({
        suborgano_id: c.suborgano,
        legislature_code: 'XV',
        name: nombre,
        slug: slugify(nombre),
        kind: tipoComision(nombre),
        n_members: c.data.length,
        fecha_constitucion: fechaEs(c.fechaConstitucion),
        synced_at: new Date().toISOString(),
      });

      // El endpoint devuelve nombres de campo distintos a los del fichero
      // que se descarga a mano: apellidosNombre / descCargo / siglas en
      // lugar de Nombre / Cargo / Grupo. Se aceptan ambos por si acaso.
      miembrosPorSuborgano.set(
        c.suborgano,
        c.data
          .map((m) => {
            const cargo = (m.descCargo || m.Cargo || '').trim();
            return {
              nombre: (m.apellidosNombre || m.Nombre || '').trim(),
              cargo,
              // Se usa el diccionario, no idCargo: ese número es el
              // identificador interno del Congreso, no un orden de peso
              // (Presidenta llega como 2 y Portavoces titulares como 13).
              orden_cargo: ordenCargo(cargo),
              id_cargo: typeof m.idCargo === 'number' ? m.idCargo : null,
              grupo: (m.siglas || m.Grupo || '').trim() || null,
              // El identificador oficial del diputado, mucho más fiable
              // que cruzar por nombre. Viene dentro de la URL de su ficha.
              cod_parlamentario: codParlamentario(m.urlFichaDiputado),
              fecha_alta: fechaEs(m.fechaAltaFormat || m.FechaAlta),
              fecha_baja: fechaEs(m.fechaBajaFormat || m.FechaBaja),
            };
          })
          .filter((m) => m.nombre && m.cargo)
      );
    }

    informe.comisiones = comisiones.length;
    informe.miembros = [...miembrosPorSuborgano.values()].reduce((s, l) => s + l.length, 0);
    informe.portavoces = [...miembrosPorSuborgano.values()]
      .flat()
      .filter((m) => /^portavoc/i.test(m.cargo) && !/adjunt/i.test(m.cargo)).length;

    if (dry) {
      informe.muestra_comisiones = comisiones.slice(0, 5).map((c) => ({
        suborgano: c.suborgano_id,
        nombre: c.name,
        tipo: c.kind,
        miembros: c.n_members,
      }));
      const primera = [...miembrosPorSuborgano.values()][0] || [];
      informe.muestra_miembros = primera.slice(0, 6);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // --- Escritura -----------------------------------------------------
    const wCom = await escribir(
      supabase,
      'es_committees',
      comisiones,
      'suborgano_id,legislature_code',
      'id, suborgano_id'
    );
    const idPorSuborgano = new Map((wCom.filas || []).map((c) => [c.suborgano_id, c.id]));

    // Enlace con el directorio de diputados y con los grupos.
    const { data: diputados } = await supabase
      .from('deputies')
      .select('id, full_name, cod_parlamentario')
      .eq('active', true);
    // Se cruza primero por código oficial y solo se cae al nombre si
    // falta: el código es inequívoco y el nombre puede tener variantes.
    const porCodigo = new Map(
      (diputados || []).filter((d) => d.cod_parlamentario).map((d) => [String(d.cod_parlamentario), d.id])
    );
    const porNombre = new Map((diputados || []).map((d) => [normalizar(d.full_name), d.id]));

    const miembros = [];
    let enlazados = 0;
    let porCod = 0;
    for (const [suborgano, lista] of miembrosPorSuborgano) {
      const cid = idPorSuborgano.get(suborgano);
      if (!cid) continue;
      for (const m of lista) {
        let did = m.cod_parlamentario ? porCodigo.get(String(m.cod_parlamentario)) || null : null;
        if (did) porCod += 1;
        else did = porNombre.get(normalizar(m.nombre)) || null;
        if (did) enlazados += 1;
        miembros.push({ ...m, committee_id: cid, deputy_id: did });
      }
    }
    informe.enlazados_por_codigo = porCod;

    // Se reemplazan enteros: si alguien causa baja, un upsert lo dejaría.
    const ids = [...idPorSuborgano.values()];
    for (let i = 0; i < ids.length; i += 50) {
      await supabase.from('es_committee_members').delete().in('committee_id', ids.slice(i, i + 50));
    }
    const wMem = await escribir(supabase, 'es_committee_members', miembros, 'committee_id,nombre,cargo');

    informe.escritura = { comisiones: wCom.escritas, miembros: wMem.escritas, errores: [...wCom.errores, ...wMem.errores] };
    informe.miembros_enlazados = enlazados;
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}// =====================================================================
// SYNC — Comisiones del Congreso y su composición
// app/api/sync/congreso-comisiones/route.js
//
// FUENTE: endpoint opendataExport de congreso.es, uno por comisión.
// Los suborganos son correlativos (301 Constitucional, 302 Asuntos
// Exteriores), así que se recorre un rango y se conservan los que
// devuelvan miembros. Es más robusto que mantener una lista fija: si el
// Congreso crea una comisión nueva, aparece sola.
//
// CABE EN UNA PASADA: unas 40 peticiones ligeras.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin escribir
//   ?key=<DEBUG_KEY>              carga real
//   ?desde=300&hasta=345          ajustar el rango
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.congreso.es/es/organos/composicion-en-la-legislatura';

// Sin cabeceras de navegador el portal responde 403.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/html,*/*',
  'Accept-Language': 'es-ES,es;q=0.9',
  // El endpoint es una llamada interna de Liferay: sin Referer del
  // propio sitio suele devolver la página en vez del JSON.
  Referer: 'https://www.congreso.es/es/organos/composicion-en-la-legislatura',
};

// Las comisiones NO son un solo bloque correlativo, como se creyó al
// escribir esto. Hay dos tramos:
//
//   300-330  las primeras permanentes, mixtas y de seguimiento
//   358-379  el resto de legislativas —Educación, Trabajo, Industria,
//            Agricultura, Transición Ecológica, Economía…— más las de
//            investigación
//
// Con el rango 295-350 faltaban nueve comisiones legislativas, entre
// ellas la de Economía, Comercio y Transformación Digital, que es la que
// tramita la ley de gobernanza de la IA.
//
// Se deja margen por arriba para que una comisión nueva aparezca sola.
const DESDE = 295;
const HASTA = 390;
// Con 96 suborganos —antes 56— el tirón se acercaba al límite de 60s de
// la función: el rango de 56 tardaba 14s y el de 71 llegó a 14,5s. Se
// sube el paralelismo y se acorta la pausa para dejar margen.
const PARALELO = 6;
const PAUSA_MS = 150;

// Los órganos de gobierno NO son suborganos. Cuelgan de su propia página
// y su llamada a searchOrgano no lleva selectedSuborgano ni
// selectedOrganoSup, así que el barrido del rango nunca iba a
// encontrarlos por muchos números que se ampliaran: se comprobó de 1 a
// 390 y solo aparecen los 300+.
//
// El nombre va escrito aquí porque estas páginas no tienen un título del
// que rasparlo como las comisiones.
//
// suborgano_id negativo para no chocar jamás con los reales, que
// empiezan en el 300, y para que se reconozcan de un vistazo en la tabla
// como lo que son: identificadores nuestros, no del Congreso.
//
// La Junta de Portavoces no está aquí: esa sí es el suborgano 300 y se
// carga con el barrido normal. Lo único que le cambia es el kind.
const ORGANOS_GOBIERNO = [
  { suborgano_id: -1, ruta: '/es/mesa', name: 'Mesa del Congreso' },
  { suborgano_id: -2, ruta: '/es/diputacion-permanente', name: 'Diputación Permanente' },
];

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js cachea los GET del cliente de Supabase y hace que el sync
      // lea siempre lo mismo.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// La página HTML de la comisión. El endpoint de datos no trae el
// nombre —solo data, fechaConstitucion y fechaDisolucion— así que hay
// que sacarlo del título de la página.
function urlPagina(suborgano, legislatura = 'XV') {
  const p = new URLSearchParams({
    p_p_id: 'organos',
    p_p_lifecycle: '0',
    p_p_state: 'normal',
    p_p_mode: 'view',
    _organos_selectedLegislatura: legislatura,
    _organos_selectedOrganoSup: '1',
    _organos_selectedSuborgano: String(suborgano),
  });
  return `${BASE}?${p.toString()}`;
}

/**
 * Extrae el nombre del título de la página:
 *   <h2>Composición Actual de la Comisión Constitucional</h2>
 * Se prueban varias formas porque el marcado puede variar entre
 * comisiones permanentes, mixtas y de investigación.
 */
// Lo que de verdad es una comisión. Cualquier otra cosa que devuelva el
// HTML —"Selector de idioma", "Enlaces", un título de menú— se descarta:
// es preferible un hueco visible a una fila con basura.
//
// Y las que fallan al leerse colapsan todas en el mismo slug y se pisan
// unas a otras, así que un nombre malo no ensucia una fila: borra varias.
const EMPIEZA_COMISION = /^(Comisión|Comision|Junta|Diputación|Diputacion|Mesa|Pleno)\b/i;

function nombreDelHtml(html) {
  // Se limpia el HTML del título antes de leerlo: los nombres largos
  // —"Comisión Mixta para la Coordinación y Seguimiento de la Estrategia
  // Española para alcanzar los Objetivos de Desarrollo Sostenible (ODS)",
  // 118 caracteres— se parten en varias líneas y el portal mete etiquetas
  // dentro. El patrón anterior exigía que el nombre acabara antes del
  // primer '<' y por eso fallaba justo en las comisiones de nombre largo.
  const sinEtiquetas = (t) =>
    String(t || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

  const patrones = [
    // El encabezado de la página, ya sin etiquetas dentro
    /Composición\s+Actual\s+de\s+la\s+([\s\S]{5,200}?)(?:<\/h1>|<\/h2>|<\/div>)/i,
    /<h1[^>]*>([\s\S]{5,200}?)<\/h1>/i,
    /<h2[^>]*>([\s\S]{5,200}?)<\/h2>/i,
    /<title>\s*([^<|]{5,200}?)\s*[|<]/i,
  ];

  for (const re of patrones) {
    const m = html.match(re);
    if (!m || !m[1]) continue;
    let n = sinEtiquetas(m[1]);
    // El encabezado a veces conserva el "Composición Actual de la"
    n = n.replace(/^Composición\s+Actual\s+de\s+la\s+/i, '').trim();
    if (!n) continue;
    if (/^composición en la legislatura$/i.test(n)) continue;
    // Solo se acepta si parece el nombre de un órgano
    if (EMPIEZA_COMISION.test(n)) return n;
  }
  return null;
}

function urlComision(suborgano, legislatura = 'XV') {
  // searchOrgano, no opendataExport: el segundo devuelve HTTP 400.
  // Verificado en el panel de red, que es lo que usa la propia página.
  // Tampoco lleva statusOpenData.
  const p = new URLSearchParams({
    p_p_id: 'organos',
    p_p_lifecycle: '2',
    p_p_state: 'normal',
    p_p_mode: 'view',
    p_p_resource_id: 'searchOrgano',
    p_p_cacheability: 'cacheLevelPage',
    _organos_selectedLegislatura: legislatura,
    _organos_selectedOrganoSup: '1',
    _organos_selectedSuborgano: String(suborgano),
  });
  return `${BASE}?${p.toString()}`;
}

async function pedirComision(suborgano) {
  try {
    const res = await fetch(urlComision(suborgano), { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return { suborgano, ok: false, motivo: `HTTP ${res.status}` };
    const txt = await res.text();
    // Un suborgano inexistente devuelve HTML o una lista vacía, no un
    // error: hay que comprobar la forma, no el código de estado.
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      return { suborgano, ok: false, motivo: 'no es JSON' };
    }
    // La respuesta viene envuelta: {"data":[...]}, no es un array suelto.
    const lista = Array.isArray(data) ? data : data?.data;
    if (!Array.isArray(lista) || lista.length === 0) {
      return { suborgano, ok: false, motivo: 'sin miembros' };
    }
    // El nombre solo está en la página HTML, así que hace falta una
    // segunda petición por comisión.
    let nombre = null;
    let fechaConstitucion = null;
    try {
      fechaConstitucion = data?.fechaConstitucion?.fechaConstitucion || null;
      const resPag = await fetch(urlPagina(suborgano), { headers: HEADERS, cache: 'no-store' });
      if (resPag.ok) nombre = nombreDelHtml(await resPag.text());
    } catch {}

    return { suborgano, ok: true, data: lista, nombre, fechaConstitucion };
  } catch (e) {
    return { suborgano, ok: false, motivo: e.message };
  }
}

// Misma llamada de Liferay que las comisiones, pero colgando de la
// página del órgano y sin los dos parámetros de suborgano.
//
// selectedLegislatura es obligatorio aunque parezca opcional: sin él el
// endpoint no da error, devuelve la legislatura 0 —la Constituyente,
// con la Mesa de Álvarez de Miranda de 1977— como si fuera la actual.
function urlOrganoGobierno(ruta, legislatura = 'XV') {
  const p = new URLSearchParams({
    p_p_id: 'organos',
    p_p_lifecycle: '2',
    p_p_state: 'normal',
    p_p_mode: 'view',
    p_p_resource_id: 'searchOrgano',
    p_p_cacheability: 'cacheLevelPage',
    _organos_selectedLegislatura: legislatura,
  });
  return `https://www.congreso.es${ruta}?${p.toString()}`;
}

// Devuelve la misma forma que pedirComision() para poder mezclarlos en
// la misma lista. El nombre ya viene dado, así que se ahorra la segunda
// petición al HTML.
async function pedirOrganoGobierno(org, legislatura = 'XV') {
  try {
    const res = await fetch(urlOrganoGobierno(org.ruta, legislatura), { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return { suborgano: org.suborgano_id, ok: false, motivo: `HTTP ${res.status}` };
    const txt = await res.text();
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      return { suborgano: org.suborgano_id, ok: false, motivo: 'no es JSON' };
    }
    const lista = Array.isArray(data) ? data : data?.data;
    if (!Array.isArray(lista) || lista.length === 0) {
      return { suborgano: org.suborgano_id, ok: false, motivo: 'sin miembros' };
    }
    return {
      suborgano: org.suborgano_id,
      ok: true,
      data: lista,
      nombre: org.name,
      fechaConstitucion: data?.fechaConstitucion?.fechaConstitucion || null,
    };
  } catch (e) {
    return { suborgano: org.suborgano_id, ok: false, motivo: e.message };
  }
}

function slugify(t) {
  return (t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

// "04/12/2023" -> "2023-12-04"
function fechaEs(f) {
  if (!f) return null;
  const m = String(f).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Orden de peso de los cargos.
 *
 * Los portavoces van justo después de la mesa y por delante de vocales
 * y adscritos: en una comisión quien negocia por cada grupo es el
 * portavoz, y es a quien busca un profesional de asuntos públicos.
 */
const ORDEN_CARGOS = [
  // Sin anclar al final: hay comisiones donde el cargo llega como
  // "Presidente" a secas y otras con matices.
  [/^president/i, 1],
  [/^vicepresident/i, 2],
  [/^secretari[oa]/i, 3],
  [/^portavoces? (adjunt|suplent)/i, 5],
  // Llega como "Portavoces" y como "Portavoces titulares" según el órgano.
  [/^portavoc/i, 4],
  [/^vocales/i, 6],
  [/^adscritos/i, 7],
  [/^letrados/i, 8],
];

function ordenCargo(cargo) {
  const hit = ORDEN_CARGOS.find(([re]) => re.test((cargo || '').trim()));
  return hit ? hit[1] : 99;
}

// Mesa, Junta de Portavoces y Diputación Permanente no son comisiones:
// no tramitan, gobiernan la cámara. Sin esta rama la Junta de Portavoces
// entraba como 'permanente' y salía mezclada con las legislativas.
const ES_GOBIERNO = /^(Mesa|Junta de Portavoces|Diputaci[oó]n Permanente|Pleno)\b/i;

// El tipo se deriva del nombre: el Congreso no lo publica como campo.
function tipoComision(nombre) {
  const n = (nombre || '').toLowerCase();
  if (ES_GOBIERNO.test((nombre || '').trim())) return 'gobierno';
  if (n.includes('investigación')) return 'investigacion';
  if (n.includes('mixta')) return 'mixta';
  if (n.includes('seguimiento') || n.includes('evaluación')) return 'seguimiento';
  return 'permanente';
}

// "...&codParlamentario=35&idLegislatura=XV" -> "35"
function codParlamentario(url) {
  const m = String(url || '').match(/codParlamentario=(\d+)/);
  return m ? m[1] : null;
}

function normalizar(n) {
  return (n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Escritura verificada: .select() devuelve las filas afectadas, así el
// informe cuenta cambios reales y no llamadas sin error.
async function escribir(supabase, tabla, filas, conflicto, devolver) {
  if (filas.length === 0) return { escritas: 0, errores: [] };
  let escritas = 0;
  const errores = [];
  const salida = [];
  for (let i = 0; i < filas.length; i += 100) {
    const grupo = filas.slice(i, i + 100);
    const { data, error } = await supabase
      .from(tabla)
      .upsert(grupo, { onConflict: conflicto })
      .select(devolver || conflicto.split(',')[0]);
    if (error) errores.push(error.message);
    else {
      escritas += Array.isArray(data) ? data.length : 0;
      if (Array.isArray(data)) salida.push(...data);
    }
  }
  return { escritas, errores, filas: salida };
}

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Modo diagnóstico: devuelve la respuesta cruda de un suborgano para
  // ver por qué falla, en vez de suponerlo.
  if (sp.get('probar')) {
    const n = sp.get('probar');
    const url = urlComision(n);
    try {
      const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
      const txt = await res.text();
      let json = null;
      try {
        json = JSON.parse(txt);
      } catch {}
      const lista = Array.isArray(json) ? json : json?.data;
      return NextResponse.json({
        modo: 'probar',
        suborgano: n,
        status: res.status,
        tamano: txt.length,
        // Las claves de la raíz dicen dónde vive el nombre del órgano:
        // en el fichero manual venía en cada registro (NombreOrgano),
        // pero el endpoint puede ponerlo aparte.
        claves_raiz: json && !Array.isArray(json) ? Object.keys(json) : null,
        registros: Array.isArray(lista) ? lista.length : null,
        claves_registro: Array.isArray(lista) && lista[0] ? Object.keys(lista[0]) : null,
        primer_registro: Array.isArray(lista) ? lista[0] : null,
        // Todo lo que no sea la lista: ahí estaría el nombre.
        fuera_de_la_lista: json && !Array.isArray(json)
          ? Object.fromEntries(Object.entries(json).filter(([k]) => k !== 'data'))
          : null,
      });
    } catch (e) {
      return NextResponse.json({ modo: 'probar', suborgano: n, url, error: e.message });
    }
  }

  const dry = sp.get('dry') === '1';
  const desde = parseInt(sp.get('desde') || String(DESDE), 10);
  const hasta = parseInt(sp.get('hasta') || String(HASTA), 10);
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry, rango: [desde, hasta] };

  try {
    // --- Recorrer el rango --------------------------------------------
    const encontradas = [];
    const vacios = [];

    for (let n = desde; n <= hasta; n += PARALELO) {
      const grupo = [];
      for (let k = 0; k < PARALELO && n + k <= hasta; k++) grupo.push(n + k);
      const res = await Promise.all(grupo.map(pedirComision));
      for (const r of res) {
        if (r.ok) encontradas.push(r);
        else vacios.push(r.suborgano);
      }
      await espera(PAUSA_MS);
    }

    informe.comisiones_encontradas = encontradas.length;
    informe.suborganos_vacios = vacios.length;

    // Los órganos de gobierno van aparte porque no viven en el rango.
    // Solo se piden cuando el barrido cubre el tramo real de comisiones:
    // así un ?desde=1&hasta=40 de diagnóstico no los arrastra.
    informe.gobierno = [];
    if (hasta >= 300) {
      const resGob = await Promise.all(ORGANOS_GOBIERNO.map((o) => pedirOrganoGobierno(o)));
      for (const r of resGob) {
        const org = ORGANOS_GOBIERNO.find((o) => o.suborgano_id === r.suborgano);
        informe.gobierno.push({
          nombre: org?.name,
          ok: r.ok,
          miembros: r.ok ? r.data.length : 0,
          motivo: r.ok ? undefined : r.motivo,
        });
        if (r.ok) encontradas.push(r);
      }
    }

    if (encontradas.length === 0) {
      return NextResponse.json({ ...informe, error: 'No se encontró ninguna comisión en el rango' }, { status: 502 });
    }

    // --- Transformar ---------------------------------------------------
    const comisiones = [];
    const miembrosPorSuborgano = new Map();

    for (const c of encontradas) {
      // El nombre llega de la página HTML; los registros no lo traen.
      const nombre = (c.nombre || c.data[0]?.NombreOrgano || '').trim();
      if (!nombre) continue;

      comisiones.push({
        suborgano_id: c.suborgano,
        legislature_code: 'XV',
        name: nombre,
        slug: slugify(nombre),
        kind: tipoComision(nombre),
        n_members: c.data.length,
        fecha_constitucion: fechaEs(c.fechaConstitucion),
        synced_at: new Date().toISOString(),
      });

      // El endpoint devuelve nombres de campo distintos a los del fichero
      // que se descarga a mano: apellidosNombre / descCargo / siglas en
      // lugar de Nombre / Cargo / Grupo. Se aceptan ambos por si acaso.
      miembrosPorSuborgano.set(
        c.suborgano,
        c.data
          .map((m) => {
            const cargo = (m.descCargo || m.Cargo || '').trim();
            return {
              nombre: (m.apellidosNombre || m.Nombre || '').trim(),
              cargo,
              // Se usa el diccionario, no idCargo: ese número es el
              // identificador interno del Congreso, no un orden de peso
              // (Presidenta llega como 2 y Portavoces titulares como 13).
              orden_cargo: ordenCargo(cargo),
              id_cargo: typeof m.idCargo === 'number' ? m.idCargo : null,
              grupo: (m.siglas || m.Grupo || '').trim() || null,
              // El identificador oficial del diputado, mucho más fiable
              // que cruzar por nombre. Viene dentro de la URL de su ficha.
              cod_parlamentario: codParlamentario(m.urlFichaDiputado),
              fecha_alta: fechaEs(m.fechaAltaFormat || m.FechaAlta),
              fecha_baja: fechaEs(m.fechaBajaFormat || m.FechaBaja),
            };
          })
          .filter((m) => m.nombre && m.cargo)
      );
    }

    informe.comisiones = comisiones.length;
    informe.miembros = [...miembrosPorSuborgano.values()].reduce((s, l) => s + l.length, 0);
    informe.portavoces = [...miembrosPorSuborgano.values()]
      .flat()
      .filter((m) => /^portavoc/i.test(m.cargo) && !/adjunt/i.test(m.cargo)).length;

    if (dry) {
      informe.muestra_comisiones = comisiones.slice(0, 5).map((c) => ({
        suborgano: c.suborgano_id,
        nombre: c.name,
        tipo: c.kind,
        miembros: c.n_members,
      }));
      const primera = [...miembrosPorSuborgano.values()][0] || [];
      informe.muestra_miembros = primera.slice(0, 6);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // --- Escritura -----------------------------------------------------
    const wCom = await escribir(
      supabase,
      'es_committees',
      comisiones,
      'suborgano_id,legislature_code',
      'id, suborgano_id'
    );
    const idPorSuborgano = new Map((wCom.filas || []).map((c) => [c.suborgano_id, c.id]));

    // Enlace con el directorio de diputados y con los grupos.
    const { data: diputados } = await supabase
      .from('deputies')
      .select('id, full_name, cod_parlamentario')
      .eq('active', true);
    // Se cruza primero por código oficial y solo se cae al nombre si
    // falta: el código es inequívoco y el nombre puede tener variantes.
    const porCodigo = new Map(
      (diputados || []).filter((d) => d.cod_parlamentario).map((d) => [String(d.cod_parlamentario), d.id])
    );
    const porNombre = new Map((diputados || []).map((d) => [normalizar(d.full_name), d.id]));

    const miembros = [];
    let enlazados = 0;
    let porCod = 0;
    for (const [suborgano, lista] of miembrosPorSuborgano) {
      const cid = idPorSuborgano.get(suborgano);
      if (!cid) continue;
      for (const m of lista) {
        let did = m.cod_parlamentario ? porCodigo.get(String(m.cod_parlamentario)) || null : null;
        if (did) porCod += 1;
        else did = porNombre.get(normalizar(m.nombre)) || null;
        if (did) enlazados += 1;
        miembros.push({ ...m, committee_id: cid, deputy_id: did });
      }
    }
    informe.enlazados_por_codigo = porCod;

    // Se reemplazan enteros: si alguien causa baja, un upsert lo dejaría.
    const ids = [...idPorSuborgano.values()];
    for (let i = 0; i < ids.length; i += 50) {
      await supabase.from('es_committee_members').delete().in('committee_id', ids.slice(i, i + 50));
    }
    const wMem = await escribir(supabase, 'es_committee_members', miembros, 'committee_id,nombre,cargo');

    informe.escritura = { comisiones: wCom.escritas, miembros: wMem.escritas, errores: [...wCom.errores, ...wMem.errores] };
    informe.miembros_enlazados = enlazados;
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
