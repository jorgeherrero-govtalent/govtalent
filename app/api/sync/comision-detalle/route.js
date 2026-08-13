// =====================================================================
// SYNC — Detalle de las iniciativas de la Comisión
// app/api/sync/comision-detalle/route.js
//
// Fuente: brpapi/groupInitiatives/{id}. NO está documentado: se localizó
// mirando el panel de red del navegador en la página de una iniciativa.
// Siete rutas conjeturadas antes habían fallado.
//
// Trae 27 campos frente a los 7 del listado, incluido el resumen en las
// 24 lenguas y la dirección general responsable.
//
// SIN MEMORIA DE POSICIÓN: en vez de recordar por dónde iba, busca las
// que tienen detail_synced_at a null. Así nunca se descoloca aunque una
// pasada falle, y reejecutarlo es inofensivo.
//
// ORDEN DE PRIORIDAD: primero las que tienen ventana abierta, luego las
// activas, y al final el archivo. Si la carga se interrumpe, lo que el
// usuario ve ya está cubierto.
//
// Parámetros:
//   ?key=<DEBUG_KEY>       lanzarlo a mano
//   ?lote=5                peticiones en paralelo (1-10, por defecto 5)
//   ?max=100               tope de iniciativas en esta pasada
//   ?dry=1                 no escribe
//   ?id=<n>                una iniciativa concreta
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BRP = 'https://ec.europa.eu/info/law/better-regulation/brpapi/groupInitiatives';
const TIMEOUT_MS = 15000;
// El límite de Vercel en plan Hobby es 60 s. El presupuesto solo controla
// la DESCARGA, así que hay que reservar tiempo para la escritura: con 500
// filas actualizadas una a una se agotaban los 18 s restantes y la función
// moría con FUNCTION_INVOCATION_TIMEOUT.
//
// Medido después: 300 iniciativas tardan 18 s en total (62 ms cada una,
// más 3,4 s de escritura). Con 600 salen unos 45 s; con 800 se rozarían los
// 60 y no merece la pena arriesgar una pasada perdida.
const PRESUPUESTO_MS = 40000;
const MAX_POR_PASADA = 600;

// Encadenamiento: al terminar, si quedan pendientes, la función se llama a
// sí misma. Así una sola invocación completa toda la carga sin depender de
// la frecuencia del cron, que en el plan Hobby está limitada a una vez al
// día.
//
// El tope de eslabones es la salvaguarda: sin él, un fallo que impidiera
// marcar detail_synced_at haría que se llamara indefinidamente. Con 12 y
// 600 por pasada se cubren 7.200 iniciativas, casi el doble de las 3.790
// que hay.
const MAX_CADENA = 12;
// Tiempo que se espera al lanzar el siguiente eslabón. No hay que esperar
// la respuesta —tardaría 45 s y agotaría esta función—; solo lo suficiente
// para que Vercel reciba la petición y arranque la nueva invocación.
const MS_LANZAR_SIGUIENTE = 1500;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Los resúmenes traducidos vienen con etiquetas HTML: <p>, <em>, &nbsp;
function limpiarHtml(t) {
  if (!t) return null;
  const limpio = t
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return limpio || null;
}

// La posición del español NO es fija: era la 13 en una iniciativa y la 34
// en otra. Hay que buscarlo por código de idioma, nunca por índice.
function traduccion(traducciones, idioma) {
  if (!Array.isArray(traducciones)) return null;
  const delIdioma = traducciones.filter((t) => t?.language === idioma && t?.value);
  if (delIdioma.length === 0) return null;
  // Puede haber varias entradas por idioma (título y resumen). El resumen
  // es la larga; se toma la de mayor longitud.
  const mejor = delIdioma.reduce((a, b) => ((b.value || '').length > (a.value || '').length ? b : a));
  const texto = limpiarHtml(mejor.value);
  // Por debajo de 100 caracteres es un título, no un resumen.
  return texto && texto.length > 100 ? texto : null;
}

// El autor está en las publicaciones, no en la raíz. Se prefiere la
// publicación vigente; si no tiene correo, se busca en las demás.
function autor(publicaciones) {
  if (!Array.isArray(publicaciones)) return {};
  const conMail = publicaciones.filter((p) => p?.authorMail);
  const elegida = conMail.find((p) => p.isCurrent) || conMail[0];
  if (!elegida) {
    const conNombre = publicaciones.find((p) => p?.authorName);
    return conNombre
      ? { nombre: [conNombre.authorName, conNombre.authorSurname].filter(Boolean).join(' '), email: null }
      : {};
  }
  return {
    nombre: [elegida.authorName, elegida.authorSurname].filter(Boolean).join(' ') || null,
    email: elegida.authorMail,
  };
}

async function pedirDetalle(id) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BRP}/${id}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    if (res.status !== 200) return { id, ok: false, motivo: `HTTP ${res.status}` };
    const d = await res.json();
    if (!d || typeof d !== 'object') return { id, ok: false, motivo: 'respuesta no es un objeto' };
    return { id, ok: true, data: d };
  } catch (e) {
    return { id, ok: false, motivo: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Documentos publicados del expediente. Vienen anidados dentro de cada
 * publicación; se aplanan, se quedan solo los publicados y se ordenan por
 * fecha descendente. Se guardan los campos que la interfaz muestra, no el
 * objeto entero: cada adjunto trae 20 campos y la mayoría son internos.
 */
function documentos(publicaciones) {
  if (!Array.isArray(publicaciones)) return [];
  const out = [];
  for (const p of publicaciones) {
    if (!Array.isArray(p.attachments)) continue;
    for (const a of p.attachments) {
      if (a.published === false) continue;
      out.push({
        titulo: a.title || null,
        tipo: a.type || a.category || null,
        fecha: a.date || a.createdDate || null,
        paginas: typeof a.pages === 'number' ? a.pages : null,
        bytes: typeof a.size === 'number' ? a.size : null,
        idioma: a.language || null,
        documento_id: a.documentId || null,
      });
    }
  }
  // Un mismo documento puede repetirse entre publicaciones
  const vistos = new Set();
  return out
    .filter((x) => {
      const k = x.documento_id || x.titulo;
      if (!k || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
    .slice(0, 40);
}

function transformar(id, d) {
  const a = autor(d.publications);
  const adjuntos = Array.isArray(d.publications)
    ? d.publications.reduce((n, p) => n + (Array.isArray(p.attachments) ? p.attachments.length : 0), 0)
    : 0;

  return {
    id,
    summary_en: limpiarHtml(d.dossierSummary) || traduccion(d.initiativeTranslations, 'EN'),
    summary_es: traduccion(d.initiativeTranslations, 'ES'),
    // 'unit' vale SECRETARIAT-GENERAL en todas: es quien registra, no
    // quien tramita. El campo bueno es 'dg'.
    dg_code: d.dg || null,
    unit_name: d.unit || null,
    expert_group: d.expertGroup || null,
    legal_basis: typeof d.legalBasis === 'string' ? d.legalBasis : d.legalBasis ? JSON.stringify(d.legalBasis) : null,
    committee_code: typeof d.committee === 'string' ? d.committee : d.committee ? JSON.stringify(d.committee) : null,
    author_name: a.nombre || null,
    author_email: a.email || null,
    is_major: typeof d.isMajor === 'boolean' ? d.isMajor : null,
    is_evaluation: typeof d.isEvaluation === 'boolean' ? d.isEvaluation : null,
    n_attachments: adjuntos,
    attachments: documentos(d.publications),
    detail_synced_at: new Date().toISOString(),
  };
}

/**
 * Lanza la siguiente pasada sin esperar a que termine.
 *
 * Se aborta la espera a propósito: la nueva invocación tarda unos 45 s y
 * esperarla agotaría el tiempo de esta. Basta con que Vercel reciba la
 * petición para que arranque una función independiente.
 *
 * El AbortError que se produce al cortar NO es un fallo: es el
 * comportamiento buscado.
 */
async function lanzarSiguiente(request, eslabon, params) {
  const url = new URL(request.url);
  url.searchParams.set('cadena', String(eslabon));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MS_LANZAR_SIGUIENTE);
  try {
    await fetch(url.toString(), {
      signal: controller.signal,
      headers: request.headers.get('authorization')
        ? { authorization: request.headers.get('authorization') }
        : {},
      cache: 'no-store',
    });
    return { lanzado: true, motivo: 'respondió antes de tiempo' };
  } catch (e) {
    // Abortar es lo esperado: la petición ya salió y la función arrancó.
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
  const lote = Math.min(Math.max(parseInt(sp.get('lote') || '5', 10), 1), 10);
  const max = parseInt(sp.get('max') || '0', 10);
  const eslabon = Math.max(parseInt(sp.get('cadena') || '0', 10), 0);
  const encadenar = sp.get('encadenar') !== '0';
  const supabase = admin();

  const informe = {
    inicio: new Date().toISOString(),
    dry_run: dry,
    paralelismo: lote,
    eslabon,
  };

  // --- Una iniciativa concreta ----------------------------------------
  const unaSola = sp.get('id');
  if (unaSola) {
    const r = await pedirDetalle(unaSola);
    if (!r.ok) return NextResponse.json({ error: 'no se pudo leer', detalle: r }, { status: 502 });
    const fila = transformar(Number(unaSola), r.data);
    if (dry) return NextResponse.json({ modo: 'una sola', dry_run: true, fila });
    const { error } = await supabase.from('eu_initiatives').update(fila).eq('id', Number(unaSola));
    return NextResponse.json({ modo: 'una sola', escrita: !error, error: error?.message, fila });
  }

  // --- Pendientes, por orden de importancia ---------------------------
  // Sin memoria de posición: se piden las que aún no tienen detalle. Las
  // de ventana abierta primero, para que una carga interrumpida deje ya
  // cubierto lo que el usuario ve.
  let q = supabase
    .from('eu_initiatives')
    .select('id, feedback_status, feedback_end, status')
    .is('detail_synced_at', null)
    .order('feedback_end', { ascending: false, nullsFirst: false })
    .limit(max > 0 ? Math.min(max, MAX_POR_PASADA) : MAX_POR_PASADA);

  const { data: pendientes, error: errSel } = await q;
  if (errSel) {
    return NextResponse.json({ error: `no se pudieron leer las pendientes: ${errSel.message}` }, { status: 500 });
  }

  if (!pendientes || pendientes.length === 0) {
    return NextResponse.json({ ...informe, nada_pendiente: true, ms_total: Date.now() - t0 });
  }

  // Las abiertas al principio de la cola
  const ahora = new Date();
  const abiertas = pendientes.filter(
    (p) => p.feedback_status === 'OPEN' && p.feedback_end && new Date(p.feedback_end) > ahora
  );
  const resto = pendientes.filter((p) => !abiertas.includes(p));
  const cola = [...abiertas, ...resto];

  // --- Descarga en paralelo, por lotes --------------------------------
  const filas = [];
  const fallidas = [];
  let cortado = false;

  for (let i = 0; i < cola.length; i += lote) {
    if (Date.now() - t0 > PRESUPUESTO_MS) {
      cortado = true;
      break;
    }
    const grupo = cola.slice(i, i + lote);
    const res = await Promise.all(grupo.map((p) => pedirDetalle(p.id)));
    for (const r of res) {
      if (r.ok) filas.push(transformar(r.id, r.data));
      else fallidas.push({ id: r.id, motivo: r.motivo });
    }
  }

  informe.pendientes_totales = pendientes.length;
  informe.abiertas_priorizadas = abiertas.length;
  informe.procesadas = filas.length;
  informe.fallidas = fallidas.length;
  informe.detalle_fallos = fallidas.slice(0, 5);
  informe.cortado_por_tiempo = cortado;
  informe.con_resumen_es = filas.filter((f) => f.summary_es).length;
  informe.con_dg = filas.filter((f) => f.dg_code).length;
  informe.con_autor = filas.filter((f) => f.author_email).length;

  if (dry) {
    informe.ms_total = Date.now() - t0;
    informe.muestra = filas[0] || null;
    return NextResponse.json(informe);
  }

  // --- Escritura ------------------------------------------------------
  // Uno a uno porque son actualizaciones sobre filas existentes: un upsert
  // masivo requeriría reenviar el resto de columnas y podría borrarlas.
  // Se escribe con .select('id'): PostgREST devuelve entonces las filas
  // realmente modificadas. Sin eso, un update que no encuentra nada
  // devuelve éxito sin error, y el informe decía "600 escritas" mientras
  // la tabla no cambiaba.
  const tEscritura = Date.now();
  let escritas = 0;
  let sinCoincidencia = 0;
  let sinMarcar = 0;
  const erroresBd = [];
  const LOTE_ESCRITURA = 20;

  for (let i = 0; i < filas.length; i += LOTE_ESCRITURA) {
    const grupo = filas.slice(i, i + LOTE_ESCRITURA);
    const res = await Promise.all(
      grupo.map(async (f) => {
        // Los campos se enumeran uno a uno en vez de usar el resto de una
        // desestructuración: con `const {id, ...campos} = f` había 555 filas
        // en las que se guardaba dg_code pero NO detail_synced_at, así que
        // el sync las volvía a coger indefinidamente.
        const { data, error } = await supabase
          .from('eu_initiatives')
          .update({
            summary_en: f.summary_en,
            summary_es: f.summary_es,
            dg_code: f.dg_code,
            unit_name: f.unit_name,
            expert_group: f.expert_group,
            legal_basis: f.legal_basis,
            committee_code: f.committee_code,
            author_name: f.author_name,
            author_email: f.author_email,
            is_major: f.is_major,
            is_evaluation: f.is_evaluation,
            n_attachments: f.n_attachments,
            attachments: f.attachments,
            detail_synced_at: f.detail_synced_at,
          })
          .eq('id', f.id)
          .select('id, detail_synced_at');
        // Se comprueba que la marca de sincronizado quedó puesta: es lo que
        // decide si la fila vuelve a la cola.
        const marcada = Array.isArray(data) && data[0]?.detail_synced_at != null;
        return { id: f.id, error, afectadas: Array.isArray(data) ? data.length : 0, marcada };
      })
    );
    for (const r of res) {
      if (r.error) erroresBd.push(`${r.id}: ${r.error.message}`);
      else if (r.afectadas === 0) sinCoincidencia += 1;
      else if (!r.marcada) sinMarcar += 1;
      else escritas += 1;
    }
  }
  informe.ms_escritura = Date.now() - tEscritura;
  informe.sin_coincidencia = sinCoincidencia;
  informe.sin_marcar = sinMarcar;
  if (sinMarcar > 0) {
    informe.aviso_marca = `${sinMarcar} filas se actualizaron pero detail_synced_at quedó a null: volverían a la cola.`;
  }
  if (sinCoincidencia > 0) {
    informe.aviso_escritura = `${sinCoincidencia} actualizaciones no encontraron su fila. El id del listado no está casando con el de la tabla.`;
    informe.ids_sin_coincidencia = filas.slice(0, 3).map((f) => ({ id: f.id, tipo: typeof f.id }));
  }

  informe.escritas = escritas;
  informe.errores_bd = erroresBd.slice(0, 5);
  informe.ms_total = Date.now() - t0;
  informe.ms_por_iniciativa = filas.length ? Math.round((Date.now() - t0) / filas.length) : null;

  // Se recuenta contra la base de datos, no se deduce de lo procesado: si
  // alguna escritura falló, esas filas siguen pendientes y hay que verlo.
  const { count: quedan } = await supabase
    .from('eu_initiatives')
    .select('id', { count: 'exact', head: true })
    .is('detail_synced_at', null);

  informe.quedan_pendientes = quedan ?? null;

  if (quedan && quedan > 0) {
    if (!encadenar) {
      informe.nota = 'Quedan pendientes y el encadenado está desactivado.';
    } else if (escritas === 0) {
      // Si una pasada no escribe nada pero quedan pendientes, encadenar
      // solo repetiría el fallo. Mejor parar y que se vea.
      informe.nota = 'No se escribió ninguna fila pese a haber pendientes: se detiene la cadena para no repetir el error.';
    } else if (eslabon + 1 >= MAX_CADENA) {
      informe.nota = `Se alcanzó el tope de ${MAX_CADENA} eslabones. Vuelve a lanzarlo para continuar.`;
    } else {
      const r = await lanzarSiguiente(request, eslabon + 1, {
        lote: String(lote),
        ...(max > 0 ? { max: String(max) } : {}),
        ...(sp.get('key') ? { key: sp.get('key') } : {}),
      });
      informe.siguiente_eslabon = { numero: eslabon + 1, ...r };
      informe.nota = r.lanzado
        ? 'Siguiente pasada lanzada automáticamente. No hace falta hacer nada.'
        : `No se pudo encadenar (${r.motivo}). Vuelve a lanzarlo a mano.`;
    }
  } else {
    informe.nota = 'Carga completa: no quedan iniciativas sin detalle.';
  }

  return NextResponse.json(informe);
}
