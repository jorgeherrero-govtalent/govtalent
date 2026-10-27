// =====================================================================
// SYNC — CNMC (expedientes y actos)
// app/api/sync/cnmc/route.js
//
// Fuente aprobada el 27-10-2026 (documento del proyecto «cnmc-fuente.md»):
// bloque normativo (IPN, PRO, circulares) y decisiones de competencia
// (S/, C/, UM/, INF/CNMC) y de los sectores regulados (SNC/, CFT/, ANME/,
// RAP/, INF/DE de inhabilitaciones y traspasos). Lo demás es ruido.
//
// Cómo detecta lo nuevo, gastando lo mínimo:
//   1. RSS general y las primeras páginas del listado de Actuaciones.
//   2. Clasifica cada expediente por su prefijo (lib/cnmc.js), sin IA.
//      Lo que queda fuera se anota en cnmc_vistos y no se pide nunca.
//   3. Solo pide la ficha de los expedientes dentro del alcance que son
//      nuevos o tienen un acto nuevo (firma distinta).
//   4. Guarda el expediente (cnmc_expedientes) y sus actos (cnmc_actos).
//      Un acto ya guardado no se reescribe: detectado_en conserva la
//      primera vez que GovTalent lo vio.
//
// De cnmc_actos pasa a regulatorio_search como kind 'cnmc' (sql/102), así
// que las alarmas lo evalúan sin cambios en su motor.
//
// Todo como GovTalentBot y respetando el robots.txt (lib/ccaa/web.js).
//
// Uso:
//   cron (CRON_SECRET)                         RSS + páginas 0-1, guarda
//   ?key=<DEBUG_KEY>&dry=1                     lee y clasifica, sin guardar
//   ?key=<DEBUG_KEY>&dry=1&debug=1             además, muestras y HTML
//   ?key=<DEBUG_KEY>&paginas=3                 cuántas páginas del listado
//   ?key=<DEBUG_KEY>&carga=1&desde=0&hasta=10  carga inicial por tramos:
//        páginas desde..hasta, sin RSS; los actos entran con su fecha
//        (no como recién publicados), así que no disparan avisos.
//   ?key=<DEBUG_KEY>&fichas=40                 máximo de fichas por ejecución
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';
import { crearWeb } from '@/lib/ccaa/web';
import {
  URL_RSS, URL_LISTADO, urlFicha,
  bloqueDe, actoFuera, idActo, leerRss, leerListado, leerFicha, unirActos, frescuraRss,
} from '@/lib/cnmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Margen para guardar antes de que Vercel corte (300 s).
const PRESUPUESTO_MS = 230000;
const FICHAS_CRON = 30;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export const GET = conRegistro('/api/sync/cnmc', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && String(sp.get('key') || '').toLowerCase() === process.env.DEBUG_KEY.toLowerCase();
  if (!isCron && !isManual) return Response.json({ error: 'no autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const debug = sp.get('debug') === '1';
  const carga = sp.get('carga') === '1';
  const desde = Math.max(0, parseInt(sp.get('desde') || '0', 10) || 0);
  const paginas = Math.min(10, Math.max(1, parseInt(sp.get('paginas') || '2', 10) || 2));
  const hasta = carga ? Math.min(desde + 20, Math.max(desde, parseInt(sp.get('hasta') ?? String(desde + 4), 10) || desde)) : desde + paginas - 1;
  const maxFichas = Math.min(120, Math.max(0, parseInt(sp.get('fichas') || String(carga ? 60 : FICHAS_CRON), 10) || 0));

  const web = crearWeb();
  const db = dry ? null : admin();
  const res = { ok: true, dry, carga, paginas: [desde, hasta] };
  const diag = {};

  // ---- 1. Candidatos: RSS y listado --------------------------------
  const candidatos = new Map(); // slug → { slug, codigo, titulo, procedimiento, ambito, actos, rss }
  const tomar = (slug) => {
    if (!candidatos.has(slug)) candidatos.set(slug, { slug, actos: [] });
    return candidatos.get(slug);
  };

  if (!carga) {
    try {
      const xml = await web.texto(URL_RSS);
      const items = leerRss(xml);
      res.rss = { expedientes: items.length, mas_reciente: frescuraRss(xml) };
      if (debug) diag.rss_muestra = xml.slice(0, 1500);
      for (const it of items) {
        const c = tomar(it.slug);
        c.titulo = c.titulo || it.titulo;
        c.rss = it;
      }
    } catch (e) {
      res.rss = { error: String(e.message || e).slice(0, 200) };
    }
  }

  res.listado = [];
  for (let p = desde; p <= hasta; p++) {
    try {
      const html = await web.texto(`${URL_LISTADO}?page=${p}`);
      const filas = leerListado(html);
      res.listado.push({ pagina: p, filas: filas.length });
      if (debug && p === desde) {
        const i = html.search(/<tr\b[^>]*>[\s\S]{0,4000}?\/expedientes\//i);
        diag.listado_html = i >= 0 ? html.slice(i, i + 2500) : html.slice(0, 2500);
      }
      for (const f of filas) {
        const c = tomar(f.slug);
        Object.assign(c, { codigo: f.codigo || c.codigo, titulo: f.titulo || c.titulo, procedimiento: f.procedimiento, ambito: f.ambito });
        c.actos = unirActos(c.actos, f.actos);
      }
      if (filas.length === 0) break;
    } catch (e) {
      res.listado.push({ pagina: p, error: String(e.message || e).slice(0, 200) });
      break;
    }
  }

  // ---- 2. Clasificación y qué fichas pedir -------------------------
  const lista = [...candidatos.values()];
  for (const c of lista) c.bloque = bloqueDe(c);
  const dentro = lista.filter((c) => c.bloque);
  const fuera = lista.filter((c) => !c.bloque);
  res.candidatos = { total: lista.length, dentro: dentro.length, fuera: fuera.length };

  // Firma: lo último que se sabe del expediente; si cambia, hay acto nuevo.
  const firmaDe = (c) => {
    const ult = [...c.actos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
    return [ult ? `${ult.fecha}|${ult.acto}` : '', c.rss?.nodo ? `n${c.rss.nodo}` : ''].join('#');
  };

  let conocidos = new Map();
  if (db && lista.length) {
    const { data } = await db.from('cnmc_vistos').select('slug, firma, incluido').in('slug', lista.map((c) => c.slug));
    conocidos = new Map((data || []).map((r) => [r.slug, r]));
  }
  let expedientesYa = new Set();
  if (db && dentro.length) {
    const { data } = await db.from('cnmc_expedientes').select('slug').in('slug', dentro.map((c) => c.slug));
    expedientesYa = new Set((data || []).map((r) => r.slug));
  }

  // Una firma cuenta como «la misma» si coincide la parte que traemos ahora
  // (el RSS y el listado no siempre traen las dos).
  const mismaFirma = (nueva, vieja) => {
    if (!vieja) return false;
    const [l1, r1] = nueva.split('#');
    const [l2, r2] = vieja.split('#');
    return (!l1 || l1 === l2) && (!r1 || r1 === r2);
  };
  const pendientes = dentro.filter((c) => !mismaFirma(firmaDe(c), conocidos.get(c.slug)?.firma));
  res.candidatos.con_novedad = pendientes.length;

  // ---- 3. Fichas ---------------------------------------------------
  const expedientes = [];
  const actos = [];
  const vistos = [];
  const ahora = new Date().toISOString();
  let fichasLeidas = 0;
  const fallos = [];

  for (const c of pendientes) {
    if (fichasLeidas >= maxFichas || Date.now() - t0 > PRESUPUESTO_MS) break;
    let ficha;
    try {
      const html = await web.texto(urlFicha(c.slug));
      fichasLeidas++;
      ficha = leerFicha(html, c.slug);
      if (debug && !diag.ficha_html) {
        const i = html.search(/<h1\b/i);
        diag.ficha_html = html.slice(Math.max(0, i), Math.max(0, i) + 4000);
      }
    } catch (e) {
      fallos.push({ slug: c.slug, error: String(e.message || e).slice(0, 160) });
      if (e.robots) break;
      continue;
    }
    const codigo = ficha.codigo || c.codigo;
    const titulo = ficha.titulo || c.titulo;
    // Con el código de la ficha se vuelve a clasificar (el RSS solo da el slug).
    const bloque = bloqueDe({ codigo, slug: c.slug, titulo });
    const firma = firmaDe(c);
    if (!bloque) { vistos.push({ slug: c.slug, codigo, incluido: false, firma, visto_en: ahora }); continue; }

    expedientes.push({
      slug: c.slug,
      codigo,
      titulo: String(titulo || '').slice(0, 1000),
      bloque,
      prefijo: codigo ? String(codigo).split('/')[0].toUpperCase() : null,
      ambito: ficha.ambito || c.ambito || null,
      procedimiento: c.procedimiento || null,
      tipo: ficha.tipo || null,
      sector: ficha.sector || null,
      estado: ficha.estado || null,
      ultimo_resultado: ficha.ultimo_resultado || null,
      ultima_actualizacion: ficha.ultima_actualizacion || null,
      sectores_cnae: ficha.sectores_cnae,
      sujetos: ficha.sujetos,
      documentos: ficha.documentos,
      url: urlFicha(c.slug),
      ficha_leida_en: ahora,
      updated_at: ahora,
    });

    const todos = unirActos(ficha.cronologia, c.actos).filter((a) => !actoFuera(a.acto));
    const masReciente = [...todos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
    const yaExistia = expedientesYa.has(c.slug);
    for (const a of todos) {
      // Cuándo se publicó, para las alarmas:
      //   · carga inicial: nunca «recién publicado» (cuenta la fecha del acto);
      //   · expediente que ya teníamos: el acto que no estaba es nuevo;
      //   · expediente nuevo: solo su acto más reciente (el que lo ha traído).
      let publicado = null;
      if (!carga && (yaExistia || a === masReciente)) publicado = c.rss?.publicado_en || ahora;
      actos.push({
        id: idActo(c.slug, a.fecha, a.acto),
        slug: c.slug,
        acto: String(a.acto).slice(0, 300),
        fecha: a.fecha,
        publicado_en: publicado,
      });
    }
    vistos.push({ slug: c.slug, codigo, incluido: true, firma, visto_en: ahora });
  }
  // Lo de fuera se anota sin pedir nada.
  for (const c of fuera) {
    if (conocidos.get(c.slug)?.incluido === false) continue;
    vistos.push({ slug: c.slug, codigo: c.codigo || null, incluido: false, firma: firmaDe(c), visto_en: ahora });
  }

  res.fichas = { leidas: fichasLeidas, quedan: Math.max(0, pendientes.length - fichasLeidas), fallos: fallos.slice(0, 10) };
  const porBloque = {};
  for (const e of expedientes) porBloque[e.bloque] = (porBloque[e.bloque] || 0) + 1;
  res.expedientes = { leidos: expedientes.length, por_bloque: porBloque };
  res.actos = { encontrados: actos.length };

  if (dry) {
    res.muestra = expedientes.slice(0, debug ? 25 : 8).map((e) => ({
      codigo: e.codigo, bloque: e.bloque, titulo: e.titulo.slice(0, 140), ambito: e.ambito, estado: e.estado,
      sectores: e.sectores_cnae.slice(0, 3), sujetos: e.sujetos.slice(0, 6),
      actos: actos.filter((a) => a.slug === e.slug).slice(0, 6).map(({ acto, fecha, publicado_en }) => ({ acto, fecha, nuevo: !!publicado_en })),
      documentos: e.documentos.length,
    }));
    res.muestra_fuera = fuera.slice(0, debug ? 40 : 12).map((c) => ({ codigo: c.codigo || c.slug, titulo: String(c.titulo || '').slice(0, 100) }));
    if (debug) res.diagnostico = diag;
    res.ms = Date.now() - t0;
    return Response.json(res);
  }

  // ---- 4. Guardar ---------------------------------------------------
  if (expedientes.length) {
    const { error } = await db.from('cnmc_expedientes').upsert(expedientes, { onConflict: 'slug' });
    if (error) res.error_expedientes = error.message.slice(0, 200);
  }
  if (actos.length && !res.error_expedientes) {
    // Solo los nuevos: uno ya guardado conserva su detectado_en y publicado_en.
    const { data, error } = await db.from('cnmc_actos').upsert(actos, { onConflict: 'id', ignoreDuplicates: true }).select('id');
    if (error) res.error_actos = error.message.slice(0, 200);
    res.actos.nuevos = data?.length || 0;
  }
  // La firma solo se guarda si se leyó la ficha (o el expediente está fuera):
  // lo que no dio tiempo a leer se reintenta en la siguiente ejecución.
  if (vistos.length && !res.error_expedientes && !res.error_actos) {
    const { error } = await db.from('cnmc_vistos').upsert(vistos, { onConflict: 'slug' });
    if (error) res.error_vistos = error.message.slice(0, 200);
  }
  res.ms = Date.now() - t0;
  return Response.json(res);
}
