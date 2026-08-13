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
const PRESUPUESTO_MS = 25000;
// Tope de filas por pasada. Más allá, la escritura no cabe en el tiempo
// que queda por mucho que la descarga sea rápida.
const MAX_POR_PASADA = 300;

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
    detail_synced_at: new Date().toISOString(),
  };
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
  const supabase = admin();

  const informe = { inicio: new Date().toISOString(), dry_run: dry, paralelismo: lote };

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
  // En paralelo por lotes: fila a fila, 300 actualizaciones tardaban más
  // que toda la descarga y hacían que la función se pasara del límite.
  const tEscritura = Date.now();
  let escritas = 0;
  const erroresBd = [];
  const LOTE_ESCRITURA = 20;
  for (let i = 0; i < filas.length; i += LOTE_ESCRITURA) {
    const grupo = filas.slice(i, i + LOTE_ESCRITURA);
    const res = await Promise.all(
      grupo.map(({ id, ...campos }) =>
        supabase
          .from('eu_initiatives')
          .update(campos)
          .eq('id', id)
          .then(({ error }) => ({ id, error }))
      )
    );
    for (const r of res) {
      if (r.error) erroresBd.push(`${r.id}: ${r.error.message}`);
      else escritas += 1;
    }
  }
  informe.ms_escritura = Date.now() - tEscritura;

  informe.escritas = escritas;
  informe.errores_bd = erroresBd.slice(0, 5);
  informe.ms_total = Date.now() - t0;
  informe.ms_por_iniciativa = filas.length ? Math.round((Date.now() - t0) / filas.length) : null;

  if (cortado || pendientes.length > filas.length) {
    informe.nota = 'Quedan pendientes. Vuelve a lanzarlo: busca las que aún no tienen detalle, no hace falta indicar por dónde ibas.';
  }

  return NextResponse.json(informe);
}
