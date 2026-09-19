// =====================================================================
// REGISTRO DE EJECUCIONES
// lib/syncLog.js
//
// Todo cron deja constancia en `sync_log` de que corrió, cuándo, cuánto
// tardó y qué hizo. Sin esto no hay forma de responder a "¿funcionó
// anoche?" salvo reconstruirlo a mano desde los datos, que es lo que
// nos costó una tarde entera: el encadenado de congreso-actividad
// llevaba roto desde el 17 de agosto y nadie podía saberlo.
//
// POR QUÉ UN ENVOLTORIO Y NO UNA LLAMADA EN CADA SITIO. Entre las rutas
// de sync hay más de noventa puntos de retorno. Añadir una línea en cada
// uno es noventa oportunidades de olvidar justo el camino que falla, que
// es siempre el que importa. Envolviendo el manejador se registra
// cualquier salida —incluidas las excepciones y los 500— sin tocar el
// cuerpo de la ruta.
//
// SE ESCRIBEN DOS FILAS, NO UNA. Al empezar se inserta con estado
// 'empezado' y al terminar se actualiza esa misma fila. Parece un rodeo,
// pero es lo que hace visible el fallo más traicionero: si la función se
// muere por tiempo, nunca llega el cierre y la fila se queda en
// 'empezado' para siempre. Una ejecución que desaparece sin dejar rastro
// es indistinguible de una que no se lanzó; una que se queda a medias se
// ve a simple vista.
//
// NUNCA ROMPE LA RUTA. Cualquier fallo al registrar se traga y se
// escribe por consola. El registro es para mirar, no de lo que depende
// el producto.
//
// Uso, en la ruta:
//
//   import { conRegistro } from '@/lib/syncLog';
//
//   export const GET = conRegistro('/api/sync/boe', handler);
//
//   async function handler(request) { ... }
//
// La declaración de `handler` se eleva, así que puede ir debajo.
// =====================================================================

import { createClient } from '@supabase/supabase-js';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (u, o = {}) => fetch(u, { ...o, cache: 'no-store' }) },
  });
}

// El detalle es texto y se mira a ojo: más de esto no aporta y engorda
// la tabla sin motivo.
const LIMITE_DETALLE = 1800;

// Cada ruta llama a sus cosas de forma distinta —una cuenta `registros`,
// otra `iniciativas`, otra `procedimientos`—. En vez de uniformar
// veinte informes, se busca el primero que exista. Lo que no encaje en
// ninguno sigue estando en el detalle completo.
const CAMPOS_LEIDOS = [
  'n_leidos',
  'leidos',
  'recorridos',
  'registros',
  'candidatos',
  'iniciativas',
  'procedimientos',
  'revisados',
  'alertas',
];

const CAMPOS_ESCRITOS = [
  'n_escritos',
  'escritos',
  'escritas',
  'insertadas',
  'nuevas',
  'eventos',
  'coincidencias',
];

// Claves que no valen para nada en un registro y ocupan casi todo: la
// muestra de una ficha del Congreso son varios miles de caracteres.
const CLAVES_PESADAS = new Set(['muestra', 'muestra_autores', 'muestra_etapas', 'muestra_personas', 'raw', 'ids_sin_persona', 'muestra_participacion_persona']);

function primerNumero(informe, campos) {
  for (const c of campos) {
    const v = informe?.[c];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

// Varias rutas agrupan lo escrito por tabla: { actividad: { escritas },
// autores: { escritas } }. Se suman.
function sumarEscrituras(informe) {
  const e = informe?.escritura;
  if (!e || typeof e !== 'object') return null;
  let total = 0;
  let hubo = false;
  for (const v of Object.values(e)) {
    if (v && typeof v.escritas === 'number') {
      total += v.escritas;
      hubo = true;
    }
  }
  return hubo ? total : null;
}

function resumir(informe) {
  if (!informe || typeof informe !== 'object') return null;
  const limpio = {};
  for (const [k, v] of Object.entries(informe)) {
    if (CLAVES_PESADAS.has(k)) continue;
    limpio[k] = v;
  }
  let txt;
  try {
    txt = JSON.stringify(limpio);
  } catch {
    return null;
  }
  return txt.length > LIMITE_DETALLE ? `${txt.slice(0, LIMITE_DETALLE)}…` : txt;
}

/**
 * El estado, por orden de gravedad.
 *
 * 'cortado' merece ser distinto de 'ok': la ruta terminó bien pero dejó
 * trabajo sin hacer, y si se repite noche tras noche es exactamente el
 * fallo que estamos tapando.
 *
 * Los estados posibles, de más a menos grave:
 *   error     · falló, con su motivo en el detalle
 *   empezado  · abrió y nunca cerró: muerta por tiempo
 *   cortado   · terminó pero dejó trabajo pendiente
 *   omitido   · no autorizada, ni siquiera llegó a empezar
 *   vacio     · corrió bien y no había nada que hacer
 *   prueba    · ejecución en seco, no cuenta como corrida
 *   ok        · corrió y escribió
 */
function calcularEstado(status, informe) {
  if (status === 401 || status === 403) return 'omitido';
  if (status >= 500) return 'error';
  if (informe?.error) return 'error';
  // Una prueba en seco no es una ejecución. Se distingue en el estado y
  // no solo en el detalle, porque la pantalla de estado lee esta columna
  // para decir qué corrió anoche: una prueba manual de media tarde no
  // puede contar como que el sync se ejecutó.
  if (informe?.dry_run) return 'prueba';
  if (informe?.cortado_por_tiempo || informe?.cortado || informe?.quedan) return 'cortado';
  const leidos = primerNumero(informe, CAMPOS_LEIDOS);
  const escritos = sumarEscrituras(informe) ?? primerNumero(informe, CAMPOS_ESCRITOS);
  if ((leidos ?? 0) === 0 && (escritos ?? 0) === 0) return 'vacio';
  return 'ok';
}

// Los parámetros distinguen un eslabón de otro: sin esto, seis
// invocaciones encadenadas son seis filas idénticas.
function parametros(request) {
  try {
    const sp = new URL(request.url).searchParams;
    const partes = [];
    for (const [k, v] of sp.entries()) {
      // La clave de depuración no se guarda en la base, evidentemente.
      if (k === 'key') continue;
      partes.push(`${k}=${v}`);
    }
    return partes.length ? `?${partes.join('&')}` : '';
  } catch {
    return '';
  }
}

async function abrir(supabase, ruta, request) {
  try {
    const { data, error } = await supabase
      .from('sync_log')
      .insert({
        ruta,
        estado: 'empezado',
        n_leidos: 0,
        n_escritos: 0,
        duracion_ms: null,
        detalle: parametros(request) || 'sin parámetros',
      })
      .select('id')
      .single();
    if (error) {
      console.error(`[syncLog] no se pudo abrir el registro de ${ruta}:`, error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error(`[syncLog] no se pudo abrir el registro de ${ruta}:`, err);
    return null;
  }
}

async function cerrar(supabase, id, ruta, fila) {
  try {
    if (id == null) {
      // No hubo fila de apertura: se inserta el cierre suelto, que es
      // mejor que perder la ejecución entera.
      await supabase.from('sync_log').insert({ ruta, ...fila });
      return;
    }
    await supabase.from('sync_log').update(fila).eq('id', id);
  } catch (err) {
    console.error(`[syncLog] no se pudo cerrar el registro de ${ruta}:`, err);
  }
}

// La ruta de la petición, sin parámetros. Para las rutas dinámicas: la
// misma función sirve /congreso-actividad/pnl y /comparecencia, y cada
// una tiene que quedar en su propia fila.
function rutaDe(request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return 'desconocida';
  }
}

/**
 * Envuelve el manejador de una ruta y registra su ejecución.
 *
 * Devuelve exactamente la respuesta del manejador: el cuerpo se lee de
 * un clon, así que el original llega intacto a quien llamó.
 *
 * Si `rutaFija` es null se usa la ruta real de cada petición. Es lo que
 * necesita una ruta dinámica como /congreso-actividad/[tipo], cuyo
 * nombre coincide así con el que tiene en vercel.json.
 */
export function conRegistro(rutaFija, handler) {
  return async function GET(request, ...resto) {
    const t0 = Date.now();
    const supabase = admin();
    const ruta = rutaFija || rutaDe(request);
    const id = await abrir(supabase, ruta, request);
    const params = parametros(request);

    try {
      const res = await handler(request, ...resto);

      let informe = null;
      try {
        informe = await res.clone().json();
      } catch {
        // No todas las respuestas son JSON, y no pasa nada.
      }

      const leidos = primerNumero(informe, CAMPOS_LEIDOS);
      const escritos = sumarEscrituras(informe) ?? primerNumero(informe, CAMPOS_ESCRITOS);
      const resumen = resumir(informe);

      await cerrar(supabase, id, ruta, {
        estado: calcularEstado(res.status, informe),
        n_leidos: leidos ?? 0,
        n_escritos: escritos ?? 0,
        duracion_ms: Date.now() - t0,
        detalle: [params, resumen].filter(Boolean).join(' ') || null,
      });

      return res;
    } catch (err) {
      // Una excepción sin registrar es justo el caso que nos dejó a
      // ciegas: se deja constancia y se vuelve a lanzar.
      await cerrar(supabase, id, ruta, {
        estado: 'error',
        n_leidos: 0,
        n_escritos: 0,
        duracion_ms: Date.now() - t0,
        detalle: [params, String(err?.message || err).slice(0, 500)].filter(Boolean).join(' '),
      });
      throw err;
    }
  };
}
