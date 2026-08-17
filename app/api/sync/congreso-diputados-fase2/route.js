// =====================================================================
// SYNC — Diputados, Fase 2: foto, correo y código parlamentario
// app/api/sync/congreso-diputados-fase2/route.js
//
// La Fase 1 carga los 350 diputados del fichero de datos abiertos, que
// trae nombre, circunscripción y grupo pero no foto ni contacto.
//
// Esos datos están en la ficha web de cada diputado:
//   /es/busqueda-de-diputados?...&_diputadomodule_mostrarFicha=true
//     &codParlamentario=160&idLegislatura=XV
//
// Verificado en la ficha: foto, correo institucional y tres enlaces a
// declaraciones. Solo se guarda la de intereses económicos —la relevante
// para asuntos públicos— y como ENLACE al documento oficial, no como
// dato: son PDF escaneados con información personal sensible, y
// almacenarla no aporta lo suficiente para justificarlo.
//
// DOS FASES DENTRO DE ESTA:
//   ?paso=codigos   saca el codParlamentario de los 350 del listado
//   ?paso=fichas    pide cada ficha y extrae foto, correo y declaración
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin escribir
//   ?key=<DEBUG_KEY>              todo, encadenando
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.congreso.es';
const LISTADO = `${BASE}/es/busqueda-de-diputados`;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
  'Accept-Language': 'es-ES,es;q=0.9',
};

const PRESUPUESTO_MS = 30000;
const PARALELO = 4;
const PAUSA_MS = 250;
const MAX_CADENA = 20;
const MS_LANZAR_SIGUIENTE = 1500;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Sin esto Next.js cachea los GET y el sync lee siempre lo mismo.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizar(n) {
  return (n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------
// PASO 1: los códigos
//
// El listado de búsqueda devuelve HTML con un enlace por diputado que
// lleva su codParlamentario y su nombre. Con eso se rellena la columna
// que hoy está vacía en los 350.
// ---------------------------------------------------------------------
async function pedirCodigos() {
  const p = new URLSearchParams({
    p_p_id: 'diputadomodule',
    p_p_lifecycle: '0',
    p_p_state: 'normal',
    p_p_mode: 'view',
    _diputadomodule_idLegislatura: 'XV',
    // Sin paginar: se piden todos de una vez.
    _diputadomodule_delta: '400',
  });
  const res = await fetch(`${LISTADO}?${p.toString()}`, { headers: HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`El listado devolvió HTTP ${res.status}`);
  const html = await res.text();

  // Los enlaces de ficha llevan el código y, cerca, el nombre.
  const encontrados = new Map();
  const re = /codParlamentario=(\d+)[^>]*>([^<]{4,80})</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const cod = m[1];
    const nombre = m[2].replace(/\s+/g, ' ').trim();
    // El mismo código aparece varias veces (foto, nombre, enlaces); se
    // guarda la aparición con nombre más largo, que es la buena.
    const previo = encontrados.get(cod);
    if (!previo || nombre.length > previo.length) encontrados.set(cod, nombre);
  }
  return [...encontrados.entries()].map(([cod, nombre]) => ({ cod, nombre }));
}

// ---------------------------------------------------------------------
// PASO 2: las fichas
// ---------------------------------------------------------------------
function urlFicha(cod) {
  const p = new URLSearchParams({
    p_p_id: 'diputadomodule',
    p_p_lifecycle: '0',
    p_p_state: 'normal',
    p_p_mode: 'view',
    _diputadomodule_mostrarFicha: 'true',
    codParlamentario: String(cod),
    idLegislatura: 'XV',
    mostrarAgenda: 'false',
  });
  return `${LISTADO}?${p.toString()}`;
}

/**
 * Extrae de la ficha lo que la Fase 1 no trae.
 *
 * Es HTML, no JSON, así que se buscan patrones. Cada campo tiene su
 * propio criterio y falla por separado: si cambia el marcado de la foto,
 * el correo sigue funcionando.
 */
function parsearFicha(html) {
  const out = { photo_url: null, email: null, intereses_url: null, bio: null };

  // La foto vive en /wc/diputados/ o similar
  const foto =
    html.match(/src="(\/wc\/[^"]*(?:foto|imagen)[^"]*)"/i) ||
    html.match(/src="([^"]*\/fotos_diputados\/[^"]+)"/i) ||
    html.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*foto/i);
  if (foto) out.photo_url = foto[1].startsWith('http') ? foto[1] : `${BASE}${foto[1]}`;

  // El correo institucional siempre acaba en @congreso.es
  const mail = html.match(/([a-z0-9._%-]+@congreso\.es)/i);
  if (mail) out.email = mail[1].toLowerCase();

  // Solo la declaración de intereses económicos: es la relevante para
  // asuntos públicos. Se guarda el enlace, no el contenido.
  const int = html.match(/href="([^"]+)"[^>]*>\s*Declaración de Intereses Económicos/i);
  if (int) out.intereses_url = int[1].startsWith('http') ? int[1] : `${BASE}${int[1]}`;

  return out;
}

async function pedirFicha(cod) {
  try {
    const res = await fetch(urlFicha(cod), { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return { cod, ok: false, motivo: `HTTP ${res.status}` };
    const html = await res.text();
    return { cod, ok: true, ...parsearFicha(html) };
  } catch (e) {
    return { cod, ok: false, motivo: e.message };
  }
}

async function escribir(supabase, filas) {
  if (filas.length === 0) return { escritas: 0, errores: [] };
  let escritas = 0;
  const errores = [];
  for (const f of filas) {
    const { id, ...campos } = f;
    const { data, error } = await supabase.from('deputies').update(campos).eq('id', id).select('id');
    if (error) errores.push(error.message);
    else escritas += Array.isArray(data) ? data.length : 0;
  }
  return { escritas, errores: errores.slice(0, 3) };
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
  const paso = sp.get('paso') || 'codigos';
  const eslabon = Math.max(parseInt(sp.get('cadena') || '0', 10), 0);
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry, paso, eslabon };

  try {
    // =================================================================
    // PASO 1: rellenar cod_parlamentario
    // =================================================================
    if (paso === 'codigos') {
      const codigos = await pedirCodigos();
      informe.encontrados = codigos.length;

      const { data: diputados } = await supabase
        .from('deputies')
        .select('id, full_name, cod_parlamentario')
        .eq('active', true);

      // El listado da el nombre como "Apellidos, Nombre", igual que
      // deputies.full_name, así que el cruce es directo.
      const porNombre = new Map((diputados || []).map((d) => [normalizar(d.full_name), d]));
      const filas = [];
      const sinCasar = [];
      for (const c of codigos) {
        const d = porNombre.get(normalizar(c.nombre));
        if (d) filas.push({ id: d.id, cod_parlamentario: c.cod });
        else sinCasar.push(c.nombre);
      }

      informe.casados = filas.length;
      informe.sin_casar = sinCasar.length;
      informe.muestra_sin_casar = sinCasar.slice(0, 5);
      informe.muestra = codigos.slice(0, 3);

      if (dry) {
        informe.ms_total = Date.now() - t0;
        return NextResponse.json(informe);
      }

      // Salvaguarda: si casan muy pocos, algo cambió en el listado y es
      // mejor no tocar nada que dejar los datos a medias.
      if (filas.length < 300) {
        return NextResponse.json(
          { ...informe, error: `Solo casaron ${filas.length} de 350 — no se escribe nada`, ms_total: Date.now() - t0 },
          { status: 502 }
        );
      }

      informe.escritura = await escribir(supabase, filas);
      const r = await lanzarSiguiente(request, eslabon + 1, {
        paso: 'fichas',
        ...(sp.get('key') ? { key: sp.get('key') } : {}),
      });
      informe.siguiente = { paso: 'fichas', ...r };
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // =================================================================
    // PASO 2: foto, correo y declaración de intereses
    // =================================================================
    // Se buscan los que aún no tienen foto: sin memoria de posición, así
    // que relanzarlo continúa donde lo dejó.
    const { data: pendientes } = await supabase
      .from('deputies')
      .select('id, cod_parlamentario, full_name')
      .eq('active', true)
      .not('cod_parlamentario', 'is', null)
      .is('photo_url', null)
      .order('id', { ascending: true })
      .limit(400);

    informe.pendientes = (pendientes || []).length;

    const filas = [];
    const fallidos = [];
    let i = 0;

    while (i < (pendientes || []).length && Date.now() - t0 < PRESUPUESTO_MS) {
      const grupo = pendientes.slice(i, i + PARALELO);
      const res = await Promise.all(grupo.map((d) => pedirFicha(d.cod_parlamentario)));
      res.forEach((r, k) => {
        const d = grupo[k];
        if (!r.ok) {
          fallidos.push({ nombre: d.full_name, motivo: r.motivo });
          return;
        }
        // Solo se escriben los campos que se han encontrado, para no
        // borrar lo que ya hubiera.
        const campos = { id: d.id };
        if (r.photo_url) campos.photo_url = r.photo_url;
        if (r.email) campos.email = r.email;
        if (r.intereses_url) campos.intereses_url = r.intereses_url;
        if (Object.keys(campos).length > 1) filas.push(campos);
        else fallidos.push({ nombre: d.full_name, motivo: 'ficha sin datos reconocibles' });
      });
      i += PARALELO;
      await espera(PAUSA_MS);
    }

    informe.procesados = i;
    informe.con_datos = filas.length;
    informe.con_foto = filas.filter((f) => f.photo_url).length;
    informe.con_email = filas.filter((f) => f.email).length;
    informe.con_intereses = filas.filter((f) => f.intereses_url).length;
    informe.fallidos = fallidos.length;
    informe.detalle_fallos = fallidos.slice(0, 3);

    if (dry) {
      informe.muestra = filas.slice(0, 3);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    informe.escritura = await escribir(supabase, filas);

    const quedan = (pendientes || []).length > i;
    if (quedan && eslabon + 1 < MAX_CADENA) {
      const r = await lanzarSiguiente(request, eslabon + 1, {
        paso: 'fichas',
        ...(sp.get('key') ? { key: sp.get('key') } : {}),
      });
      informe.siguiente = { paso: 'fichas', ...r };
      informe.nota = 'Siguiente lote lanzado solo.';
    } else if (quedan) {
      informe.nota = `Tope de ${MAX_CADENA} eslabones. Vuelve a lanzarlo para continuar.`;
    } else {
      informe.nota = 'Fase 2 completa: fotos, correos y declaraciones al día.';
    }

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
