// =====================================================================
// SYNC — Diputados, Fase 2: código parlamentario, foto y correo
// app/api/sync/congreso-diputados-fase2/route.js
//
// La Fase 1 (/api/sync/instituciones, 04:00) carga los 350 diputados
// del fichero de datos abiertos. Ese fichero trae nombre,
// circunscripción, grupo y biografía, pero no foto, ni correo, ni el
// código con el que el Congreso identifica a cada diputado.
//
// DE DÓNDE SALE CADA COSA — verificado el 21-09-2026 contra el portal:
//
//   codParlamentario → el buscador de diputados no lleva los datos en
//     el HTML: los pide por AJAX a un endpoint de recurso de Liferay y
//     pagina en el navegador. Una sola petición devuelve los 350. No
//     hace falta token p_auth ni cookies de sesión. El registro trae
//     `apellidosNombre` con el mismo formato que deputies.full_name
//     ("Abascal Conde, Santiago"), así que el cruce es directo.
//
//   foto → https://www.congreso.es/docu/imgweb/diputados/{cod}_{15}.jpg
//     El número de legislatura va en cifra (15), no en romano. La URL
//     se construye desde el código, pero el paso 2 la confirma contra
//     la propia ficha: si alguien no tiene foto, no se inventa una.
//
//   correo → está en la ficha, en un enlace mailto:, y viaja en el HTML
//     que devuelve el servidor. Un fetch normal basta. Aquí sí hay que
//     pedir una ficha por diputado. Ojo: en la ficha el identificador de
//     legislatura va en ROMANO (XV), al revés que en el buscador.
//
// DOS PASOS:
//   ?paso=codigos    una petición: código y foto de los 350
//   ?paso=correos    una ficha por diputado, solo para el correo
//
// NO TODOS PUBLICAN CORREO. Comprobado el 21-09-2026: 319 de 350 lo
// tienen y 31 no, con la ficha cargando bien. Sin marcar esas 31 como
// ya miradas, el cron volvería a pedir sus fichas cada noche para no
// sacar nada. `email_checked_at` guarda cuándo se miró por última vez
// y se reintenta al mes: un diputado puede darse de alta el correo más
// tarde, así que tampoco vale con descartarlos para siempre.
//
// LAS LECTURAS DE SUPABASE MIRAN SU `error`. Quedarse solo con `data`
// convierte un fallo —una columna que falta, una policy de RLS— en una
// tabla vacía, y el sync remata con "todo al día" habiendo hecho nada.
// Pasó el 21-09-2026 con `email_checked_at`: 0 pendientes y 0 errores
// con la columna sin crear.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin escribir
//   ?key=<DEBUG_KEY>              todo, encadenando
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { conRegistro } from '@/lib/syncLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Único sitio donde se cambia de legislatura. El buscador la quiere en
// cifra y la ficha en romano — no es un descuido, es así en el portal.
const LEGISLATURA = { numero: '15', romana: 'XV' };

const BASE = 'https://www.congreso.es';
const BUSQUEDA = `${BASE}/es/busqueda-de-diputados`;
const RECURSO =
  `${BUSQUEDA}?p_p_id=diputadomodule&p_p_lifecycle=2&p_p_state=normal` +
  `&p_p_mode=view&p_p_resource_id=searchDiputados&p_p_cacheability=cacheLevelPage`;

// Sin cabeceras de navegador el portal responde 403.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
  'Accept-Language': 'es-ES,es;q=0.9',
};

const PRESUPUESTO_MS = 240000; // se corta antes del tope de 300 s
const PARALELO = 6;
const PAUSA_MS = 200;
const ESCRITURA_PARALELA = 10;
const MAX_CADENA = 20;
const MS_LANZAR_SIGUIENTE = 1500;
const MINIMO_ESPERADO = 300; // el Congreso tiene 350; menos de 300 es señal de que algo cambió
const REINTENTO_CORREO_DIAS = 30;

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
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------
// PASO 1 — El listado
// ---------------------------------------------------------------------
function cuerpoBusqueda(grupo) {
  return new URLSearchParams({
    _diputadomodule_idLegislatura: LEGISLATURA.numero,
    _diputadomodule_genero: '0',
    _diputadomodule_grupo: grupo,
    _diputadomodule_tipo: '0', // 0 = en activo
    _diputadomodule_nombre: '',
    _diputadomodule_apellidos: '',
    _diputadomodule_formacion: 'all',
    _diputadomodule_filtroProvincias: '[]',
    _diputadomodule_nombreCircunscripcion: '',
  });
}

async function pedirListado(grupo) {
  const res = await fetch(RECURSO, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: BUSQUEDA,
    },
    body: cuerpoBusqueda(grupo),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`El buscador devolvió HTTP ${res.status}`);
  const json = await res.json();
  const filas = Array.isArray(json?.data) ? json.data : [];
  return filas.filter((f) => f?.codParlamentario);
}

/**
 * Pide los 350 de una vez.
 *
 * El desplegable de grupo manda su nombre completo, y no está
 * documentado qué valor significa "todos". Se prueba el vacío, que es
 * lo que envía el formulario recién abierto; si viniera corto, se
 * recorren los grupos que ya tenemos en base de la Fase 1 y se unen.
 * Así el sync no depende de adivinar un valor centinela.
 */
async function pedirTodos(supabase, informe) {
  const directo = await pedirListado('');
  informe.estrategia = 'una petición';
  if (directo.length >= MINIMO_ESPERADO) return directo;

  informe.estrategia = 'por grupos';
  informe.directo_devolvio = directo.length;

  const { data: grupos, error: errorGrupos } = await supabase
    .from('parliamentary_groups')
    .select('name');
  if (errorGrupos) throw new Error(`No se pudieron leer los grupos: ${errorGrupos.message}`);
  const porCodigo = new Map(directo.map((d) => [d.codParlamentario, d]));
  for (const g of grupos || []) {
    try {
      const filas = await pedirListado(g.name);
      for (const f of filas) porCodigo.set(f.codParlamentario, f);
    } catch (e) {
      informe.grupos_fallidos = [...(informe.grupos_fallidos || []), `${g.name}: ${e.message}`];
    }
    await espera(PAUSA_MS);
  }
  return [...porCodigo.values()];
}

function urlFoto(cod) {
  return `${BASE}/docu/imgweb/diputados/${cod}_${LEGISLATURA.numero}.jpg`;
}

// ---------------------------------------------------------------------
// PASO 2 — La ficha
// ---------------------------------------------------------------------
function urlFicha(cod) {
  const p = new URLSearchParams({
    p_p_id: 'diputadomodule',
    p_p_lifecycle: '0',
    p_p_state: 'normal',
    p_p_mode: 'view',
    _diputadomodule_mostrarFicha: 'true',
    codParlamentario: String(cod),
    idLegislatura: LEGISLATURA.romana,
    mostrarAgenda: 'false',
  });
  return `${BUSQUEDA}?${p.toString()}`;
}

/**
 * Saca de la ficha el correo y confirma la foto.
 *
 * Cada campo falla por separado: si cambia el marcado de la foto, el
 * correo sigue funcionando. La ficha lleva además la misma imagen
 * incrustada en base64, que se descarta quedándose solo con las rutas
 * de /docu/imgweb/diputados/.
 */
function parsearFicha(html) {
  const out = { email: null, photo_url: null };

  const mail =
    html.match(/mailto:([A-Za-z0-9._%+-]+@congreso\.es)/i) ||
    html.match(/([A-Za-z0-9._%+-]+@congreso\.es)/i);
  if (mail) out.email = mail[1].toLowerCase();

  const foto = html.match(/\/docu\/imgweb\/diputados\/[A-Za-z0-9_-]+\.(?:jpe?g|png)/i);
  if (foto) out.photo_url = `${BASE}${foto[0]}`;

  return out;
}

async function pedirFicha(cod) {
  try {
    const res = await fetch(urlFicha(cod), { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return { cod, ok: false, motivo: `HTTP ${res.status}` };
    return { cod, ok: true, ...parsearFicha(await res.text()) };
  } catch (e) {
    return { cod, ok: false, motivo: e.message };
  }
}

// ---------------------------------------------------------------------
// Escritura
//
// Son actualizaciones fila a fila porque cada diputado recibe campos
// distintos y un upsert exigiría reenviar columnas obligatorias que
// aquí no tocamos. Van de diez en diez para no encadenar 350 idas y
// vueltas de una en una.
// ---------------------------------------------------------------------
async function escribir(supabase, filas) {
  if (filas.length === 0) return { escritas: 0, errores: [] };
  let escritas = 0;
  const errores = [];
  for (let i = 0; i < filas.length; i += ESCRITURA_PARALELA) {
    const lote = filas.slice(i, i + ESCRITURA_PARALELA);
    const res = await Promise.all(
      lote.map(({ id, ...campos }) => supabase.from('deputies').update(campos).eq('id', id).select('id'))
    );
    for (const { data, error } of res) {
      if (error) errores.push(error.message);
      else escritas += Array.isArray(data) ? data.length : 0;
    }
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
      headers: request.headers.get('authorization')
        ? { authorization: request.headers.get('authorization') }
        : {},
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

// ---------------------------------------------------------------------
export const GET = conRegistro('/api/sync/congreso-diputados-fase2', handler);

async function handler(request) {
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
    // PASO 1: código parlamentario y foto
    // =================================================================
    if (paso === 'codigos') {
      const listado = await pedirTodos(supabase, informe);
      informe.n_leidos = listado.length;

      const { data: diputados, error: errorDiputados } = await supabase
        .from('deputies')
        .select('id, full_name')
        .eq('active', true);
      if (errorDiputados) throw new Error(`No se pudieron leer los diputados: ${errorDiputados.message}`);

      const porNombre = new Map((diputados || []).map((d) => [normalizar(d.full_name), d]));
      const filas = [];
      const sinCasar = [];
      for (const r of listado) {
        const d = porNombre.get(normalizar(r.apellidosNombre));
        if (!d) {
          sinCasar.push(r.apellidosNombre);
          continue;
        }
        filas.push({
          id: d.id,
          cod_parlamentario: String(r.codParlamentario),
          photo_url: urlFoto(r.codParlamentario),
        });
      }

      informe.casados = filas.length;
      informe.sin_casar = sinCasar.length;
      informe.muestra_sin_casar = sinCasar.slice(0, 5);

      if (dry) {
        informe.muestra = filas.slice(0, 3);
        informe.ms_total = Date.now() - t0;
        return NextResponse.json(informe);
      }

      // Si casan muy pocos, algo cambió en el portal: mejor no tocar
      // nada que dejar los 350 a medias.
      if (filas.length < MINIMO_ESPERADO) {
        return NextResponse.json(
          {
            ...informe,
            error: `Solo casaron ${filas.length} de ~350 — no se escribe nada`,
            ms_total: Date.now() - t0,
          },
          { status: 502 }
        );
      }

      const escritura = await escribir(supabase, filas);
      informe.escritura = escritura;
      informe.n_escritos = escritura.escritas;

      const r = await lanzarSiguiente(request, eslabon + 1, {
        paso: 'correos',
        ...(sp.get('key') ? { key: sp.get('key') } : {}),
      });
      informe.siguiente = { paso: 'correos', ...r };
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // =================================================================
    // PASO 2: correo (y confirmación de la foto)
    //
    // Se piden los que aún no tienen correo. Sin memoria de posición:
    // relanzarlo continúa donde lo dejó.
    // =================================================================
    const limiteReintento = new Date(
      Date.now() - REINTENTO_CORREO_DIAS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: pendientes, error: errorPendientes } = await supabase
      .from('deputies')
      .select('id, cod_parlamentario, full_name')
      .eq('active', true)
      .not('cod_parlamentario', 'is', null)
      .is('email', null)
      // El valor va entrecomillado: lleva dos puntos y un punto decimal,
      // y sin comillas PostgREST puede partirlo por donde no toca.
      .or(`email_checked_at.is.null,email_checked_at.lt."${limiteReintento}"`)
      .order('id', { ascending: true })
      .limit(400);
    if (errorPendientes) {
      throw new Error(`No se pudieron leer los pendientes: ${errorPendientes.message}`);
    }

    informe.pendientes = (pendientes || []).length;

    const filas = [];
    const fallidos = [];
    const sinCorreo = [];
    const sinNada = [];
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
        // La ficha se pidió y respondió: queda marcada como mirada
        // aunque no traiga correo. Es lo que evita repetirla cada noche.
        const campos = { id: d.id, email_checked_at: new Date().toISOString() };
        if (r.email) campos.email = r.email;
        else sinCorreo.push(d.full_name);
        // La ficha manda sobre el patrón: si la imagen no está donde la
        // esperábamos, se corrige; si no hay ninguna, se deja lo que ya
        // tuviera en vez de apuntar a un enlace roto.
        if (r.photo_url) campos.photo_url = r.photo_url;
        // Ni correo ni foto es raro: puede ser que cambiara el marcado.
        if (!r.email && !r.photo_url) sinNada.push(d.full_name);
        filas.push(campos);
      });
      i += PARALELO;
      await espera(PAUSA_MS);
    }

    // `i` avanza de PARALELO en PARALELO y se pasa del final en el
    // último lote: sin el tope, el informe contaba fichas de más.
    const procesados = Math.min(i, (pendientes || []).length);
    informe.n_leidos = procesados;
    informe.con_correo = filas.filter((f) => f.email).length;
    informe.con_foto = filas.filter((f) => f.photo_url).length;
    informe.sin_correo = sinCorreo.length;
    informe.muestra_sin_correo = sinCorreo.slice(0, 5);
    informe.sin_correo_ni_foto = sinNada.length;
    informe.muestra_sin_correo_ni_foto = sinNada.slice(0, 5);
    informe.fallidos = fallidos.length;
    informe.detalle_fallos = fallidos.slice(0, 3);

    if (dry) {
      informe.muestra = filas.slice(0, 3);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    const escritura = await escribir(supabase, filas);
    informe.escritura = escritura;
    informe.n_escritos = escritura.escritas;

    const quedan = (pendientes || []).length > procesados;
    if (quedan && eslabon + 1 < MAX_CADENA) {
      const r = await lanzarSiguiente(request, eslabon + 1, {
        paso: 'correos',
        ...(sp.get('key') ? { key: sp.get('key') } : {}),
      });
      informe.siguiente = { paso: 'correos', ...r };
      informe.nota = 'Siguiente lote lanzado solo.';
    } else if (quedan) {
      informe.nota = `Tope de ${MAX_CADENA} eslabones. Vuelve a lanzarlo para continuar.`;
    } else {
      informe.nota = sinCorreo.length
        ? `Fase 2 completa. ${sinCorreo.length} sin correo publicado: se vuelven a mirar dentro de ${REINTENTO_CORREO_DIAS} días.`
        : 'Fase 2 completa: códigos, fotos y correos al día.';
    }

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
