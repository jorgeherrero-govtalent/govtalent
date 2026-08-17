// =====================================================================
// SYNC — Actividad parlamentaria del Congreso
// app/api/sync/congreso-actividad/route.js
//
// FUENTE: endpoint filtrarListado de congreso.es, el mismo que usa el
// buscador de la web. Localizado en el panel de red: los ficheros de
// datos abiertos solo publican leyes, no PNL ni comparecencias.
//
//   POST /es/proposiciones-no-de-ley?p_p_resource_id=filtrarListado
//   Form Data: _iniciativas_cini, _iniciativas_paginaActual, ...
//
// Un solo endpoint sirve para todos los tipos cambiando el cini, y la
// ruta da igual: probado que la de PNL acepta un cini de decretos-ley.
//
// VOLUMEN medido:
//   161/162 proposiciones no de ley   4.465 · 179 páginas
//   212/213/214/219 comparecencias    3.025 · 121 páginas
//   130 reales decretos-ley              50 ·   2 páginas → van a
//                                          es_initiatives, son legislación
//
// LO QUE NO HAY: comisión competente, plazos ni tramitación. No están
// escondidos — la propia ficha web del Congreso tampoco los muestra para
// estos tipos. Una PNL no tiene plazo de enmiendas ni ponencia.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin escribir
//   ?key=<DEBUG_KEY>&tipo=pnl     solo un tipo
//   ?key=<DEBUG_KEY>              todo, encadenando
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.congreso.es/es';
const RUTA = 'proposiciones-no-de-ley';
const POR_PAGINA = 25;

// Sin cabeceras de navegador el portal responde 403.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  Origin: 'https://www.congreso.es',
  Referer: `${BASE}/${RUTA}`,
};

// El presupuesto controla la descarga; después vienen la escritura y el
// encadenado. Con 45 s la función terminaba cerca del límite de 60.
const PRESUPUESTO_MS = 30000;
const PAUSA_MS = 300;
const MAX_CADENA = 40;
const MS_LANZAR_SIGUIENTE = 1500;

const TIPOS = {
  pnl: {
    cini: '(161.CINI. o 162.CINI.)',
    kind: 'pnl',
    label: 'Proposición no de ley',
    total: 4465,
  },
  comparecencia: {
    cini: '(212.CINI. o 213.CINI. o 214.CINI. o 219.CINI.)',
    kind: 'comparecencia',
    label: 'Comparecencia',
    total: 3025,
  },
};

// El prefijo del expediente da el subtipo exacto.
const SUBTIPOS = {
  161: 'Proposición no de ley en comisión',
  162: 'Proposición no de ley ante el pleno',
  212: 'Comparecencia de autoridades y funcionarios',
  213: 'Comparecencia del Gobierno en comisión',
  214: 'Comparecencia del Gobierno en comisión',
  219: 'Otras comparecencias en comisión',
  210: 'Comparecencia del Gobierno ante el pleno',
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js cachea los GET del cliente de Supabase y el sync acaba
      // leyendo siempre lo mismo.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function urlListado() {
  const p = new URLSearchParams({
    p_p_id: 'iniciativas',
    p_p_lifecycle: '2',
    p_p_state: 'normal',
    p_p_mode: 'view',
    p_p_resource_id: 'filtrarListado',
    p_p_cacheability: 'cacheLevelPage',
  });
  return `${BASE}/${RUTA}?${p.toString()}`;
}

function cuerpo(cini, pagina) {
  // Los campos vacíos se envían igual: el servidor los espera y sin
  // ellos puede responder 400.
  const f = new URLSearchParams();
  f.set('_iniciativas_legislatura', '15');
  f.set('_iniciativas_estadoTramitacion', '');
  f.set('_iniciativas_faseTramitacion', '');
  f.set('_iniciativas_cini', cini);
  f.set('_iniciativas_tipoLlamada', 'T');
  f.set('_iniciativas_paginaActual', String(pagina));
  f.set('_iniciativas_comision_competente', '');
  return f.toString();
}

async function pedirPagina(cini, pagina) {
  try {
    const res = await fetch(urlListado(), {
      method: 'POST',
      headers: HEADERS,
      body: cuerpo(cini, pagina),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, motivo: `HTTP ${res.status}` };
    const d = await res.json();
    // lista_iniciativas es un objeto indexado (iniciativa1, iniciativa2...),
    // no un array: hay que convertirlo.
    const lista = d?.lista_iniciativas ? Object.values(d.lista_iniciativas) : [];
    return { ok: true, lista, total: parseInt(d?.iniciativas_encontradas || '0', 10) };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

// Para casar nombres de grupo: sin tildes, sin dobles espacios.
function normalizar(n) {
  return (n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

// "21/07/2026" -> "2026-07-21"
function fechaEs(f) {
  if (!f) return null;
  const m = String(f).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function transformar(row, tipo) {
  const num = String(row.id_iniciativa || '').trim();
  if (!num) return null;

  const prefijo = num.split('/')[0];
  const situacion = (row.situacion_actual || '').trim() || null;
  // El resultado llega como "Aprobado 12/05/2025", con la fecha pegada.
  const resultado = (row.resultado_tram || '').replace(/\s*\n\s*/g, ' ').trim() || null;

  return {
    fila: {
      num_expediente: num,
      legislature_code: row.legislatura || 'XV',
      slug: `${slugify(row.titulo)}-${num.replace(/\//g, '-')}`,
      kind: tipo.kind,
      cini: prefijo,
      kind_label: SUBTIPOS[prefijo] || tipo.label,
      titulo: String(row.titulo || '').replace(/\s*\n\s*/g, ' ').trim(),
      fecha_presentacion: fechaEs(row.fecha_presentado),
      fecha_calificacion: fechaEs(row.fecha_calificado),
      situacion,
      resultado,
      // Sin situación y con resultado, es que terminó. "Cerrado" también
      // aparece como situación en algunos casos.
      is_closed: /^cerrado|^caducad|^rechazad|^retirad/i.test(situacion || '') || (!situacion && !!resultado),
      raw: row,
      synced_at: new Date().toISOString(),
    },
    // Los autores vienen como objeto: {autor01: {...}, autor02: {...}}
    autores: Object.values(row.autores || {}).map((a, i) => ({
      num_expediente: num,
      nombre: String(a.nombre || '').trim(),
      // idGrupo permite enlazar por identificador y no por nombre, que
      // es más fiable que lo que hacemos con las leyes.
      id_grupo: a.idGrupo ? String(a.idGrupo) : null,
      // Una persona lleva coma (apellidos, nombre); un grupo no.
      es_persona: String(a.nombre || '').includes(',') && !/^Grupo Parlamentario/i.test(a.nombre || ''),
      orden: i,
    })).filter((a) => a.nombre),
  };
}

async function escribir(supabase, tabla, filas, conflicto) {
  if (filas.length === 0) return { escritas: 0, errores: [] };
  let escritas = 0;
  const errores = [];
  for (let i = 0; i < filas.length; i += 100) {
    const grupo = filas.slice(i, i + 100);
    const { data, error } = await supabase
      .from(tabla)
      .upsert(grupo, { onConflict: conflicto })
      .select(conflicto.split(',')[0]);
    if (error) errores.push(error.message);
    else escritas += Array.isArray(data) ? data.length : 0;
  }
  return { escritas, errores };
}

async function lanzarSiguiente(request, eslabon, extra = {}) {
  const url = new URL(request.url);
  url.searchParams.set('cadena', String(eslabon));
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MS_LANZAR_SIGUIENTE);
  try {
    await fetch(url.toString(), {
      signal: controller.signal,
      headers: request.headers.get('authorization') ? { authorization: request.headers.get('authorization') } : {},
      cache: 'no-store',
    });
    return { lanzado: true };
  } catch (e) {
    // Abortar es lo buscado: la petición ya salió.
    if (e.name === 'AbortError') return { lanzado: true };
    return { lanzado: false, motivo: e.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const dry = sp.get('dry') === '1';
  const eslabon = Math.max(parseInt(sp.get('cadena') || '0', 10), 0);
  const encadenar = sp.get('encadenar') !== '0';
  const tipoParam = sp.get('tipo');
  const desdePagina = Math.max(parseInt(sp.get('pagina') || '1', 10), 1);
  const supabase = admin();

  const informe = { inicio: new Date().toISOString(), dry_run: dry, eslabon };

  // Qué tipo toca. Sin parámetro se empieza por las PNL y al terminar se
  // salta a las comparecencias.
  const clave = tipoParam && TIPOS[tipoParam] ? tipoParam : 'pnl';
  const tipo = TIPOS[clave];
  informe.tipo = clave;

  const filas = [];
  const autores = [];
  const fallidas = [];
  let totalReal = null;
  let pagina = desdePagina;
  let cortado = false;

  while (Date.now() - t0 < PRESUPUESTO_MS) {
    const r = await pedirPagina(tipo.cini, pagina);
    if (!r.ok) {
      fallidas.push({ pagina, motivo: r.motivo });
      // Un fallo puntual no debe abortar: se salta esa página.
      pagina += 1;
      if (fallidas.length > 5) break;
      continue;
    }
    if (totalReal === null) totalReal = r.total;
    if (r.lista.length === 0) break;

    for (const row of r.lista) {
      const t = transformar(row, tipo);
      if (!t) continue;
      filas.push(t.fila);
      autores.push(...t.autores);
    }

    pagina += 1;
    if ((pagina - 1) * POR_PAGINA >= (totalReal || 0)) break;
    await espera(PAUSA_MS);
  }

  const ultimaPagina = pagina - 1;
  const quedanPaginas = totalReal !== null && ultimaPagina * POR_PAGINA < totalReal;
  cortado = quedanPaginas;

  informe.total_en_origen = totalReal;
  informe.paginas = { desde: desdePagina, hasta: ultimaPagina };
  informe.registros = filas.length;
  informe.autores = autores.length;
  informe.con_grupo = autores.filter((a) => a.id_grupo).length;
  informe.cerrados = filas.filter((f) => f.is_closed).length;
  informe.fallidas = fallidas.length;
  informe.detalle_fallos = fallidas.slice(0, 3);

  if (dry) {
    informe.muestra = filas[0] ? { ...filas[0], raw: '[...recortado]' } : null;
    informe.muestra_autores = autores.slice(0, 4);
    informe.subtipos = [...new Set(filas.map((f) => f.kind_label))];
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  }

  const wAct = await escribir(supabase, 'es_activity', filas, 'num_expediente');

  // Enlace con los grupos. El endpoint da idGrupo, que sería inequívoco,
  // pero parliamentary_groups no guarda ese identificador —comprobado en
  // information_schema— así que se cruza por nombre normalizado, igual
  // que en el sync de leyes.
  //
  // El idGrupo se guarda de todas formas: si algún día se añade la
  // columna, el enlace se puede rehacer sin volver a descargar.
  const { data: grupos } = await supabase.from('parliamentary_groups').select('id, name, short_name');
  const porNombre = new Map();
  for (const g of grupos || []) {
    if (g.name) porNombre.set(normalizar(g.name), g.id);
    if (g.short_name) porNombre.set(normalizar(g.short_name), g.id);
  }
  let enlazados = 0;
  for (const a of autores) {
    const id = porNombre.get(normalizar(a.nombre));
    if (id) {
      a.group_id = id;
      enlazados += 1;
    }
  }
  const wAut = await escribir(supabase, 'es_activity_authors', autores, 'num_expediente,nombre');

  informe.escritura = { actividad: wAct, autores: wAut };
  informe.autores_enlazados = enlazados;

  // --- Encadenado ----------------------------------------------------
  const siguienteTipo = clave === 'pnl' ? 'comparecencia' : null;

  if (!encadenar) {
    informe.nota = 'Queda trabajo y el encadenado está desactivado.';
  } else if (wAct.escritas === 0 && filas.length > 0) {
    informe.nota = 'Se procesaron registros pero no se escribió ninguno: se detiene la cadena.';
  } else if (eslabon + 1 >= MAX_CADENA) {
    informe.nota = `Tope de ${MAX_CADENA} eslabones. Vuelve a lanzarlo para continuar.`;
  } else if (quedanPaginas) {
    const r = await lanzarSiguiente(request, eslabon + 1, {
      tipo: clave,
      pagina: String(ultimaPagina + 1),
      ...(sp.get('key') ? { key: sp.get('key') } : {}),
    });
    informe.siguiente = { tipo: clave, pagina: ultimaPagina + 1, ...r };
    informe.nota = r.lanzado ? 'Siguiente página lanzada sola.' : `No se pudo encadenar (${r.motivo}).`;
  } else if (siguienteTipo) {
    const r = await lanzarSiguiente(request, eslabon + 1, {
      tipo: siguienteTipo,
      pagina: '1',
      ...(sp.get('key') ? { key: sp.get('key') } : {}),
    });
    informe.siguiente = { tipo: siguienteTipo, pagina: 1, ...r };
    informe.nota = `Terminadas las ${clave}. Lanzado el siguiente tipo.`;
  } else {
    informe.nota = 'Carga completa: proposiciones no de ley y comparecencias al día.';
  }

  informe.ms_total = Date.now() - t0;
  return NextResponse.json(informe);
}
