// =====================================================================
// ACTIVIDAD PARLAMENTARIA DEL CONGRESO — el sync, sin rutas
// lib/congresoActividad.js
//
// Descarga un tipo de actividad del Congreso entero y lo guarda en
// es_activity y es_activity_authors. Lo usan las tres rutas de cron
// (una por tipo) y la ruta manual: todas llaman a lo mismo.
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
// LO QUE NO HAY: comisión competente, plazos ni tramitación. No están
// escondidos — la propia ficha web del Congreso tampoco los muestra para
// estos tipos. Una PNL no tiene plazo de enmiendas ni ponencia.
//
// -------------------------------------------------------------------
// POR QUÉ YA NO SE ENCADENA
//
// Hasta septiembre de 2026 esto era una sola ruta que descargaba 30
// segundos, escribía, y se relanzaba a sí misma para seguir. Con un
// límite de 60 segundos por invocación, la escritura —que tarda casi lo
// mismo que la descarga— empujaba cada eslabón más allá del límite.
// Vercel lo mataba justo antes de relanzarse, y la cadena moría en el
// primer eslabón todas las noches. Resultado: las comparecencias y los
// decretos-ley llevaban desde el 17 de agosto sin actualizarse, y de las
// PNL solo se refrescaban las ~900 más recientes.
//
// Ahora cada tipo tiene su propio cron y su propia invocación larga, sin
// relanzarse. El trabajo de un tipo cabe entero en una sola ejecución.
//
// SE ESCRIBE POR TANDAS, NO AL FINAL. Cada LOTE_PAGINAS páginas se guarda
// lo descargado. Si algo corta la ejecución a mitad, lo ya procesado
// queda guardado en vez de perderse entero.
//
// SE REDESCARGA TODO CADA NOCHE, a propósito. Una PNL de hace un año
// puede cambiar de situación hoy; solo mirando lo nuevo, ese cambio no
// se vería nunca, y es justo lo que vigila el motor de avisos. Las
// escrituras son upsert, así que repetir una noche —Vercel a veces lanza
// dos veces el mismo cron— no estropea nada.
// =====================================================================

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

// Pausa entre páginas: el portal es del Congreso, no nuestro.
const PAUSA_MS = 300;

// Cada cuántas páginas se escribe lo acumulado. 20 páginas son 500
// registros: poco que perder si algo se corta, y pocas idas y vueltas a
// la base.
const LOTE_PAGINAS = 20;

// Reintentos de una página antes de darla por perdida. De madrugada el
// portal a veces tarda o falla una petición suelta; un fallo puntual no
// debe dejar 25 registros sin actualizar.
const REINTENTOS = [1000, 3000];

// Si fallan más páginas que esto después de reintentar, el portal está
// caído o ha cambiado. Seguir solo acumularía huecos: se para.
const MAX_PAGINAS_PERDIDAS = 5;

export const TIPOS_ACTIVIDAD = {
  pnl: {
    cini: '(161.CINI. o 162.CINI.)',
    kind: 'pnl',
    label: 'Proposición no de ley',
  },
  comparecencia: {
    cini: '(212.CINI. o 213.CINI. o 214.CINI. o 219.CINI.)',
    kind: 'comparecencia',
    label: 'Comparecencia',
  },
  // Los decretos-ley son legislación, pero su tramitación no se parece a
  // la de una ley: el Gobierno los aprueba y el Congreso los convalida o
  // deroga en un solo acto. Sin plazo de enmiendas ni ponencia, así que
  // encajan aquí y no en es_initiatives.
  decreto: {
    cini: '130.CINI.',
    kind: 'decreto',
    label: 'Real decreto-ley',
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
  130: 'Real decreto-ley',
};

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

async function pedirConReintentos(cini, pagina) {
  let r = await pedirPagina(cini, pagina);
  for (const ms of REINTENTOS) {
    if (r.ok) return r;
    await espera(ms);
    r = await pedirPagina(cini, pagina);
  }
  return r;
}

// Para casar nombres de grupo: sin tildes, sin dobles espacios.
function normalizar(n) {
  return (n || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(t) {
  return (t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
    autores: Object.values(row.autores || {})
      .map((a, i) => ({
        num_expediente: num,
        nombre: String(a.nombre || '').trim(),
        // idGrupo permite enlazar por identificador y no por nombre, que
        // es más fiable que lo que hacemos con las leyes.
        id_grupo: a.idGrupo ? String(a.idGrupo) : null,
        // Una persona lleva coma (apellidos, nombre); un grupo no.
        es_persona: String(a.nombre || '').includes(',') && !/^Grupo Parlamentario/i.test(a.nombre || ''),
        orden: i,
      }))
      .filter((a) => a.nombre),
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

// Un upsert no admite la misma clave dos veces en el mismo lote: Postgres
// rechaza el lote entero. Si el Congreso repite un autor en una ficha, se
// quedaría sin escribir toda la tanda por eso.
function sinDuplicados(filas, clave) {
  const vistos = new Map();
  for (const f of filas) vistos.set(clave(f), f);
  return [...vistos.values()];
}

/**
 * Sincroniza un tipo entero.
 *
 * Devuelve el informe; si trae `error`, la ejecución debe darse por
 * fallida. Si trae `quedan: true`, terminó bien pero dejó trabajo, y el
 * registro la marcará como 'cortado'.
 *
 * @param opts.supabase      cliente con permisos de servicio
 * @param opts.clave         'pnl' | 'comparecencia' | 'decreto'
 * @param opts.dry           si es true no escribe nada
 * @param opts.desdePagina   para retomar a mano una carga a medias
 * @param opts.t0            momento en que empezó la invocación
 * @param opts.presupuestoMs a partir de cuándo no se pide otra página
 */
export async function sincronizarActividad({ supabase, clave, dry = false, desdePagina = 1, t0 = Date.now(), presupuestoMs }) {
  const tipo = TIPOS_ACTIVIDAD[clave];
  const informe = { inicio: new Date(t0).toISOString(), dry_run: dry, tipo: clave };
  if (!tipo) {
    informe.error = `Tipo desconocido: ${clave}. Válidos: ${Object.keys(TIPOS_ACTIVIDAD).join(', ')}`;
    return informe;
  }

  // Los grupos se leen una vez, no en cada tanda. El endpoint da idGrupo,
  // que sería inequívoco, pero parliamentary_groups no guarda ese
  // identificador, así que se cruza por nombre normalizado, igual que en
  // el sync de leyes. El idGrupo se guarda de todas formas: si algún día
  // se añade la columna, el enlace se puede rehacer sin volver a
  // descargar.
  const porNombre = new Map();
  if (!dry) {
    const { data: grupos } = await supabase.from('parliamentary_groups').select('id, name, short_name');
    for (const g of grupos || []) {
      if (g.name) porNombre.set(normalizar(g.name), g.id);
      if (g.short_name) porNombre.set(normalizar(g.short_name), g.id);
    }
  }

  let bufFilas = [];
  let bufAutores = [];
  let muestra = null;
  const subtipos = new Set();

  const total = { registros: 0, autores: 0, cerrados: 0, enlazados: 0 };
  const escritura = { actividad: { escritas: 0 }, autores: { escritas: 0 } };
  const erroresEscritura = [];

  async function volcar() {
    if (bufFilas.length === 0) return true;
    const filas = sinDuplicados(bufFilas, (f) => f.num_expediente);
    const autores = sinDuplicados(bufAutores, (a) => `${a.num_expediente}|${a.nombre}`);
    bufFilas = [];
    bufAutores = [];
    if (dry) return true;

    for (const a of autores) {
      const id = porNombre.get(normalizar(a.nombre));
      if (id) {
        a.group_id = id;
        total.enlazados += 1;
      }
    }

    const wAct = await escribir(supabase, 'es_activity', filas, 'num_expediente');
    const wAut = await escribir(supabase, 'es_activity_authors', autores, 'num_expediente,nombre');
    escritura.actividad.escritas += wAct.escritas;
    escritura.autores.escritas += wAut.escritas;
    erroresEscritura.push(...wAct.errores, ...wAut.errores);

    // Si una tanda con registros no guarda ninguno, la base está
    // rechazando todo. Seguir descargando sería trabajar para nada.
    return !(filas.length > 0 && wAct.escritas === 0);
  }

  const perdidas = [];
  let totalOrigen = null;
  let pagina = desdePagina;
  let paginasEnLote = 0;
  let terminado = false;
  let parado = null;

  while (true) {
    if (presupuestoMs && Date.now() - t0 > presupuestoMs) {
      parado = 'tiempo';
      break;
    }

    const r = await pedirConReintentos(tipo.cini, pagina);
    if (!r.ok) {
      perdidas.push({ pagina, motivo: r.motivo });
      if (perdidas.length > MAX_PAGINAS_PERDIDAS) {
        parado = 'fuente';
        break;
      }
      pagina += 1;
      continue;
    }
    if (totalOrigen === null) totalOrigen = r.total;
    if (r.lista.length === 0) {
      terminado = true;
      break;
    }

    for (const row of r.lista) {
      const t = transformar(row, tipo);
      if (!t) continue;
      bufFilas.push(t.fila);
      bufAutores.push(...t.autores);
      total.registros += 1;
      total.autores += t.autores.length;
      if (t.fila.is_closed) total.cerrados += 1;
      subtipos.add(t.fila.kind_label);
      if (!muestra) muestra = { ...t.fila, raw: '[...recortado]' };
    }

    pagina += 1;
    paginasEnLote += 1;

    if (paginasEnLote >= LOTE_PAGINAS) {
      paginasEnLote = 0;
      if (!(await volcar())) {
        parado = 'escritura';
        break;
      }
    }

    if ((pagina - 1) * POR_PAGINA >= (totalOrigen || 0)) {
      terminado = true;
      break;
    }
    await espera(PAUSA_MS);
  }

  // Lo que quede en el búfer se guarda siempre, también si se paró por
  // tiempo: es trabajo hecho.
  if (parado !== 'escritura' && !(await volcar())) parado = 'escritura';

  const ultimaPagina = pagina - 1;

  informe.total_en_origen = totalOrigen;
  informe.paginas = { desde: desdePagina, hasta: ultimaPagina };
  informe.recorridos = Math.max(0, ultimaPagina - desdePagina + 1) * POR_PAGINA;
  informe.registros = total.registros;
  informe.autores = total.autores;
  informe.cerrados = total.cerrados;
  informe.autores_enlazados = total.enlazados;
  informe.escritura = escritura;
  informe.paginas_perdidas = perdidas.map((p) => p.pagina);
  informe.detalle_fallos = perdidas.slice(0, 3);

  if (dry) {
    informe.muestra = muestra;
    informe.subtipos = [...subtipos];
  }

  // El veredicto, por orden de gravedad.
  if (parado === 'escritura') {
    informe.error = `La base rechazó la escritura: ${erroresEscritura.slice(0, 2).join(' | ') || 'sin detalle'}`;
  } else if (parado === 'fuente') {
    informe.error = `El portal del Congreso falló en más de ${MAX_PAGINAS_PERDIDAS} páginas tras reintentar: ${perdidas[0]?.motivo || ''}`;
  } else if (erroresEscritura.length > 0) {
    // Algunas tandas se guardaron y otras no: el dato queda incompleto, y
    // eso tiene que verse.
    informe.error = `Escritura incompleta (${erroresEscritura.length} errores): ${erroresEscritura[0]}`;
  } else if (parado === 'tiempo') {
    informe.quedan = true;
    informe.nota = `Se acabó el tiempo en la página ${ultimaPagina}. Para seguir a mano: ?pagina=${ultimaPagina + 1}`;
  } else if (perdidas.length > 0) {
    // Terminó, pero con huecos: esas páginas no se han actualizado hoy.
    informe.quedan = true;
    informe.nota = `Terminado con ${perdidas.length} página(s) sin poder descargar: ${informe.paginas_perdidas.join(', ')}`;
  } else if (terminado) {
    informe.nota = `Completo: ${total.registros} registros de ${totalOrigen}.`;
  }

  informe.ms_total = Date.now() - t0;
  return informe;
}
