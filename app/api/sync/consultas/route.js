import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Las tres son necesarias, no redundantes: force-dynamic evita el
// renderizado estático pero NO impide que el Data Cache de Next sirva las
// lecturas de Supabase. Es lo que tuvo a boe-cargos cuatro días
// devolviendo 200 sin insertar nada.
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Sondea las páginas de participación pública de cada ministerio y
 * mantiene al día consultas_publicas.
 *
 * No hay API: la Orden PRE/1590/2016 obliga a publicar estos trámites en
 * los portales web de cada departamento, no en un punto único. De ahí que
 * haya que sondear ~44 páginas (dos por ministerio) en vez de llamar a un
 * endpoint como con el BOE.
 *
 * Uso:
 *   /api/sync/consultas?key=<DEBUG_KEY>
 *   /api/sync/consultas?key=<DEBUG_KEY>&lote=2        (procesar menos)
 *   /api/sync/consultas?key=<DEBUG_KEY>&forzar=1      (ignorar el hash)
 */

// Cuántas fuentes por invocación. Cada una puede implicar una llamada al
// modelo, que tarda; con 60s de techo, cuatro es lo que cabe con holgura.
const LOTE_POR_DEFECTO = 3;
// Fichas de detalle por invocacion, ademas de las fuentes. Cada una es
// otra peticion y otra llamada al modelo, asi que van contadas aparte.
const FICHAS_POR_DEFECTO = 4;
const PRESUPUESTO_MS = 50_000;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (u, o) => fetch(u, { ...o, cache: 'no-store' }) },
  });
}

async function registrar(supabase, fila) {
  try {
    await supabase.from('sync_log').insert({ ruta: '/api/sync/consultas', ...fila });
  } catch (err) {
    console.error('[consultas] no se pudo escribir en sync_log:', err);
  }
}

// ---------------------------------------------------------------------
// Limpieza del HTML
//
// Se quitan script, style, nav y footer antes de mandar nada al modelo:
// reduce el texto a un tercio y evita que el menú de un ministerio se
// confunda con contenido.
// ---------------------------------------------------------------------
function textoUtil(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Enlaces del cuerpo de la pagina, para las fuentes en modo indice.
 *
 * Se sacan del HTML crudo porque textoUtil() elimina las etiquetas y con
 * ellas los href. Solo se conservan los que cuelgan del mismo dominio: el
 * resto es navegacion, redes sociales y pie.
 */
function enlacesDe(html, urlBase) {
  const base = new URL(urlBase);
  const vistos = new Set();
  const candidatos = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    const texto = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!texto || texto.length < 8) continue;
    try {
      href = new URL(href, urlBase).toString();
    } catch {
      continue;
    }
    if (new URL(href).hostname !== base.hostname) continue;
    if (vistos.has(href)) continue;
    vistos.add(href);
    candidatos.push({ texto: texto.slice(0, 200), href });
  }

  // Solo los que cuelgan de la misma seccion que la fuente.
  //
  // Antes se cogian los 80 primeros del HTML y se los comia entero el
  // menu lateral del ministerio: idiomas, organigrama, secretarias. Los
  // enlaces de los tramites, que van despues en el documento, no
  // entraban nunca, y por eso url_ficha llegaba siempre a null.
  //
  // La seccion es el DIRECTORIO de la fuente, no su ruta completa. En
  // MITECO la fuente es .../participacion-publica/listado_proyectos_normativos.html
  // y las fichas son .../participacion-publica/rd-concesion-directa.html:
  // hermanas, no hijas. Usando la ruta entera no casaba ninguna, y por
  // eso ese ministerio se quedaba sin un solo buzon.
  const ruta = base.pathname.replace(/\/$/, '');
  const seccion = /\.[a-z]{2,5}$/i.test(ruta) ? ruta.replace(/\/[^/]*$/, '') : ruta;

  const hermanos = candidatos.filter((c) => {
    const p = new URL(c.href).pathname;
    return p.startsWith(seccion + '/') && p !== ruta && p !== seccion;
  });

  // Si el filtro no encuentra nada se devuelve vacio, no la lista sin
  // filtrar: 60 enlaces de menu no ayudan al modelo, lo despistan.
  return hermanos.slice(0, 60);
}

/**
 * Casa un titulo con el enlace cuyo texto mas se le parece.
 *
 * Respaldo para cuando el modelo no devuelve url_ficha: se comparan las
 * palabras significativas del titulo con las del texto del enlace y se
 * acepta a partir de la mitad en comun. Por debajo es ruido.
 */
function enlaceParecido(titulo, enlaces) {
  if (!titulo || !enlaces?.length) return null;
  const palabras = (t) =>
    new Set(
      String(t)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );

  const objetivo = palabras(titulo);
  if (objetivo.size < 3) return null;

  let mejor = null;
  let mejorRatio = 0;
  for (const e of enlaces) {
    const otras = palabras(e.texto);
    if (!otras.size) continue;
    let comunes = 0;
    for (const w of objetivo) if (otras.has(w)) comunes += 1;
    const ratio = comunes / objetivo.size;
    if (ratio > mejorRatio) {
      mejorRatio = ratio;
      mejor = e.href;
    }
  }
  return mejorRatio >= 0.5 ? mejor : null;
}

function hash(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex');
}

/**
 * Misma normalización que la columna generada titulo_norm en Postgres.
 *
 * Hace falta porque el título de la página y el que se cargó a mano
 * difieren en un punto final, y eso bastaba para que el upsert por título
 * literal creara un duplicado de cada consulta.
 */
function claveTitulo(titulo) {
  return String(titulo || '')
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]+/gi, ' ')
    .trim();
}

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/**
 * Normaliza a AAAA-MM-DD los formatos que usan los ministerios.
 *
 * Sanidad escribe "11 de septiembre de 2026"; Transformacion Digital
 * "18/09/2026". Solo se contemplaba el primero, y por eso las 30 filas de
 * digital.gob.es entraron sin fecha.
 */
function fechaISO(texto) {
  if (!texto) return null;
  const t = String(texto).toLowerCase().trim();

  // Ya normalizada
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  // "18/09/2026" o "18-09-2026"
  const num = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (num) {
    const [, d, m, a] = num;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // "11 de septiembre de 2026"
  const lit = t.match(/(\d{1,2})\s+de\s+([a-zñ]+)\s+de\s+(\d{4})/);
  if (lit) {
    const mes = MESES[lit[2]];
    if (mes) return `${lit[3]}-${String(mes).padStart(2, '0')}-${String(lit[1]).padStart(2, '0')}`;
  }

  return null;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Extrae los tramites vigentes de la pagina.
 *
 * Se le pide filtrar por fecha en vez de devolver todo y filtrar aqui: la
 * pagina de audiencia del MTDFP tiene unos setenta tramites y la
 * respuesta se cortaba por max_tokens en mitad del bloque tool_use, con
 * lo que el JSON quedaba invalido y la fuente devolvia cero. El codigo
 * revalida la vigencia despues, asi que un error del modelo no cuela.
 *
 * Extrae los tramites abiertos de la pagina.
 *
 * Se hace con el modelo y no con expresiones regulares porque cada
 * ministerio maqueta distinto: Sanidad usa listas anidadas, Trabajo e
 * Inclusión una aplicación con parámetros, Interior una tabla. Un parser
 * por ministerio serían 22 parsers que se rompen con cada rediseño.
 */
async function extraer(texto, tipo, urlOrigen, enlaces) {
  // Los enlaces van ANTES del texto: si van detras y la pagina es larga,
  // el recorte se los lleva por delante.
  const bloqueEnlaces = enlaces?.length
    ? `\n\nENLACES DE LA PÁGINA. Cada trámite del listado tiene su enlace aquí.
Para CADA trámite que registres, copia en url_ficha el href cuyo texto coincida con su título.
Es obligatorio: sin url_ficha no se puede consultar el detalle.\n\n` +
      enlaces.map((e) => `- "${e.texto}" => ${e.href}`).join('\n')
    : '';

  const prompt = `Extrae los trámites de participación pública ABIERTOS de esta página del Ministerio y registralos con la herramienta.

Hoy es ${hoyISO()}.

Reglas:
- Registra SOLO los trámites cuya fecha de fin de plazo sea igual o
  posterior a hoy. Los vencidos no interesan.
- NO te fies de etiquetas como "Abierta hasta el ...": algunas webs las
  ponen en todos los trámites, incluidos los de hace años. Compara la
  fecha con la de hoy.
- Si un trámite no tiene fecha de fin visible, inclúyelo igualmente.
- Copia las fechas TAL CUAL aparecen ("11 de septiembre de 2026").
- "buzon" es la dirección de correo para enviar aportaciones.
- "referencia" es el código de expediente si lo hay (ej. "DG/72/26"); si no, null.
- "asunto_requerido" es el formato de asunto exigido si se indica; si no, null.
- Si un campo no aparece, pon null. NO inventes ningún valor.
- Si no hay trámites abiertos, llama a la herramienta con un array vacio.

Página (${tipo}) — ${urlOrigen}:${bloqueEnlaces}

${texto.slice(0, 15000)}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    cache: 'no-store',
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      // Holgura: si un ministerio publica muchos tramites vigentes, una
      // respuesta cortada deja el JSON invalido y la fuente en cero.
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
      // Se fuerza la salida con una herramienta de esquema fijo en vez de
      // pedir JSON en el prompt. claude-sonnet-5 no admite prefijar la
      // respuesta del asistente, y sin forzarlo el modelo contesta con
      // prosa cuando no encuentra tramites: paso con Transformacion
      // Digital, que devolvio una explicacion en vez de [].
      tools: [
        {
          name: 'registrar_tramites',
          description: 'Registra los tramites de participacion publica abiertos encontrados en la pagina.',
          input_schema: {
            type: 'object',
            properties: {
              tramites: {
                type: 'array',
                description: 'Tramites abiertos. Array vacio si no hay ninguno.',
                items: {
                  type: 'object',
                  properties: {
                    titulo: { type: 'string' },
                    tipo: {
                      type: ['string', 'null'],
                      enum: ['consulta_previa', 'audiencia_publica', null],
                      description:
                        'consulta_previa si es previa a redactar la norma, audiencia_publica si el texto ya esta redactado. Deducelo del titulo y del texto del tramite.',
                    },
                    fecha_inicio: { type: ['string', 'null'] },
                    fecha_fin: { type: ['string', 'null'] },
                    buzon: { type: ['string', 'null'] },
                    referencia: { type: ['string', 'null'] },
                    asunto_requerido: { type: ['string', 'null'] },
                    url_documento: { type: ['string', 'null'] },
                    url_ficha: { type: ['string', 'null'], description: 'Enlace a la ficha del tramite, si la pagina es un indice.' },
                  },
                  required: ['titulo'],
                },
              },
            },
            required: ['tramites'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'registrar_tramites' },
    }),
  });

  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);

  const data = await r.json();

  // Con tool_choice forzado la respuesta llega en un bloque tool_use, ya
  // como objeto: no hay que parsear texto ni limpiar bloques de codigo.
  const uso = (data.content || []).find((b) => b.type === 'tool_use');
  if (!uso) {
    const texto = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    throw new Error(`sin tool_use: ${texto.slice(0, 200)}`);
  }

  const tramites = uso.input?.tramites;
  return Array.isArray(tramites) ? tramites : [];
}

/**
 * Segunda pasada: entra en la ficha de un tramite y saca lo que el indice
 * no traia. Se usa una herramienta distinta porque aqui solo hay un
 * tramite, no una lista.
 */
async function extraerDetalle(texto, url) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    cache: 'no-store',
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `Esta es la ficha de un tramite de participacion publica. Registra sus datos con la herramienta.

Reglas:
- Copia las fechas TAL CUAL aparecen ("11 de septiembre de 2026").
- "buzon" es la direccion de correo para enviar aportaciones.
- Si un campo no aparece, pon null. NO inventes ningun valor.

Ficha - ${url}:

${texto.slice(0, 40000)}`,
        },
      ],
      tools: [
        {
          name: 'registrar_detalle',
          description: 'Registra los datos del tramite descrito en la ficha.',
          input_schema: {
            type: 'object',
            properties: {
              fecha_inicio: { type: ['string', 'null'] },
              fecha_fin: { type: ['string', 'null'] },
              buzon: { type: ['string', 'null'] },
              referencia: { type: ['string', 'null'] },
              asunto_requerido: { type: ['string', 'null'] },
              url_documento: { type: ['string', 'null'] },
            },
            required: [],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'registrar_detalle' },
    }),
  });

  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const uso = (data.content || []).find((b) => b.type === 'tool_use');
  return uso?.input || {};
}

export async function GET(req) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);

  const esCron = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const esManual = !!process.env.DEBUG_KEY && searchParams.get('key') === process.env.DEBUG_KEY;
  if (!esCron && !esManual) {
    await registrar(admin(), {
      estado: 'omitido',
      detalle: 'no autorizado',
      duracion_ms: Date.now() - t0,
    });
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }

  const supabase = admin();
  const lote = Math.min(Number(searchParams.get('lote')) || LOTE_POR_DEFECTO, 10);
  const forzar = searchParams.get('forzar') === '1';

  // Cola: las que llevan más tiempo sin mirarse primero. Se descartan las
  // que llevan 3 fallos seguidos para que una URL rota no bloquee el turno
  // de las demás cada día.
  const { data: fuentes, error: eF } = await supabase
    .from('consulta_fuentes')
    .select('*')
    .eq('activo', true)
    .lt('intentos_fallidos', 3)
    // Antiguedad primero y prioridad como desempate. Al reves, una fuente
    // nueva con prioridad baja no entraba nunca: las de prioridad alta se
    // llevaban todos los turnos y las recien anadidas se quedaban con
    // ultima_captura a null indefinidamente.
    .order('ultima_captura', { ascending: true, nullsFirst: true })
    .order('prioridad', { ascending: true })
    .limit(lote);

  if (eF) {
    await registrar(supabase, { estado: 'error', detalle: eF.message, duracion_ms: Date.now() - t0 });
    return NextResponse.json({ error: eF.message }, { status: 500 });
  }

  const resultados = [];
  let nuevas = 0;
  let actualizadas = 0;
  let sinCambios = 0;

  for (const f of fuentes || []) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break;

    try {
      const res = await fetch(f.url, {
        cache: 'no-store',
        // Cabeceras de navegador ademas del user-agent identificable:
        // Interior (OpenCMS) devolvia 403 con una peticion demasiado
        // escueta. Se mantiene el contacto para que cualquier
        // administrador sepa quien esta pidiendo.
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; GovTalent/1.0; +https://govtalent.app; hola@govtalent.app)',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'es-ES,es;q=0.9',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = await res.text();
      const texto = textoUtil(html);
      const h = hash(texto);

      // Sin cambios: ni extracción ni llamada al modelo. Es lo que hace
      // que sondear 44 páginas a diario salga casi gratis.
      if (!forzar && h === f.ultimo_hash) {
        sinCambios += 1;
        await supabase
          .from('consulta_fuentes')
          .update({ ultima_captura: new Date().toISOString(), ultimo_error: null, intentos_fallidos: 0 })
          .eq('id', f.id);
        resultados.push({ ministerio: f.ministerio, tipo: f.tipo, estado: 'sin_cambios' });
        continue;
      }

      // En modo indice se le dan tambien los enlaces: el listado solo
      // trae titulos y el detalle esta dentro de cada ficha.
      const enlaces = f.modo === 'indice' ? enlacesDe(html, f.url) : null;

      // Modo diagnostico: devuelve lo que se le iba a mandar al modelo,
      // sin llamarlo. Sirve para ver si el problema es el contenido que
      // llega o la extraccion, en vez de ir probando a ciegas.
      if (searchParams.get('debug') === '1') {
        return NextResponse.json({
          fuente: { ministerio: f.ministerio, tipo: f.tipo, url: f.url, modo: f.modo },
          html_bytes: html.length,
          texto_bytes: texto.length,
          texto_primeros_2000: texto.slice(0, 2000),
          n_enlaces: enlaces?.length ?? 0,
          primeros_enlaces: (enlaces || []).slice(0, 15),
        });
      }

      const items = await extraer(texto, f.tipo, f.url, enlaces);

      // Vinculo con el organigrama, si ese ministerio lo tiene cargado.
      const { data: fuenteOrg } = await supabase
        .from('organigrama_fuentes')
        .select('id')
        .eq('ministerio', f.ministerio)
        .maybeSingle();

      let insertadas = 0;
      let vencidos = 0;
      const descartadas = [];

      for (const it of items) {
        if (!it?.titulo) continue;

        const inicio = fechaISO(it.fecha_inicio);
        const fin = fechaISO(it.fecha_fin);

        // Vencidos fuera. La vigencia se decide aqui comparando la fecha,
        // no por lo que diga la pagina: digital.gob.es rotula "Abierta
        // hasta el ..." en mas de cien tramites, incluidos los de 2017.
        //
        // Los que no traen fecha se dejan pasar solo si hay ficha que
        // consultar; si no, no hay forma de saber si siguen vivos y
        // guardarlos solo ensucia el listado.
        if (fin && fin < hoyISO()) {
          vencidos += 1;
          continue;
        }
        if (!fin && !it.url_ficha) {
          vencidos += 1;
          continue;
        }

        // Guardrail anti-alucinación: el buzón tiene que aparecer
        // literalmente en la página. Un correo inventado es peor que un
        // hueco, porque el usuario lo usa y rebota.
        const buzonOk = it.buzon && texto.toLowerCase().includes(String(it.buzon).toLowerCase());
        if (it.buzon && !buzonOk) {
          descartadas.push(`buzón no verificado en origen: ${it.buzon} (${it.titulo.slice(0, 50)})`);
        }

        const fila = {
          ministerio: f.ministerio,
          fuente_id: fuenteOrg?.id ?? null,
          // El tipo que dice el tramite manda sobre el de la fuente:
          // MITECO publica consultas previas dentro de su listado de
          // audiencias, y salian mal clasificadas. La fuente queda de
          // respaldo cuando el modelo no lo determina.
          tipo:
            it.tipo === 'consulta_previa' || it.tipo === 'audiencia_publica' ? it.tipo : f.tipo,
          titulo: String(it.titulo).replace(/\s+/g, ' ').trim(),
          referencia: it.referencia || null,
          fecha_inicio: inicio,
          fecha_fin: fin,
          buzon: buzonOk ? it.buzon : null,
          asunto_requerido: it.asunto_requerido || null,
          url_documento: it.url_documento || null,
          url_origen: f.url,
          fecha_captura: new Date().toISOString(),
          nota: buzonOk || !it.buzon ? null : `Buzón propuesto sin verificar: ${it.buzon}`,
          url_ficha: it.url_ficha || enlaceParecido(it.titulo, enlaces) || null,
          // Si falta el plazo y hay ficha, queda pendiente de segunda
          // pasada. Sin fecha_fin la consulta no sirve: no hay plazo, ni
          // estado, ni alerta.
          // En modo indice la ficha aporta buzon y documentos aunque el
          // listado ya traiga la fecha, asi que se encola siempre que
          // falte alguno de los dos.
          //
          // Si el modelo no supo asociar el enlace, se intenta casar por
          // parecido de titulo con los enlaces de la pagina: MITECO
          // devolvia siempre url_ficha a null y por eso no encolaba
          // ninguna ficha ni conseguia un solo buzon.
          detalle_pendiente:
            f.modo === 'indice' && !!(it.url_ficha || enlaceParecido(it.titulo, enlaces)) && (!buzonOk || !it.url_documento),
        };

        // Comprobar y escribir, en vez de upsert.
        //
        // No se usa upsert porque la clave de conflicto real es
        // titulo_norm, que es una columna generada: PostgREST no admite
        // enviarla en el payload. Y hacerlo así permite además contar
        // bien lo nuevo frente a lo actualizado, que con el upsert salía
        // mal.
        //
        // detectada_at solo se escribe al insertar: es lo que distingue
        // una consulta nueva de una que ya habíamos visto, y lo que lee
        // la alerta diaria.
        const clave = claveTitulo(fila.titulo);

        const { data: existente, error: eBuscar } = await supabase
          .from('consultas_publicas')
          .select('id')
          .eq('url_origen', f.url)
          .eq('titulo_norm', clave)
          .maybeSingle();

        if (eBuscar) {
          descartadas.push(`${eBuscar.message} (${fila.titulo.slice(0, 40)})`);
          continue;
        }

        if (existente) {
          const { error } = await supabase
            .from('consultas_publicas')
            .update(fila)
            .eq('id', existente.id);
          if (error) descartadas.push(`${error.message} (${fila.titulo.slice(0, 40)})`);
          else {
            insertadas += 1;
            actualizadas += 1;
          }
        } else {
          const { error } = await supabase.from('consultas_publicas').insert(fila);
          if (error) descartadas.push(`${error.message} (${fila.titulo.slice(0, 40)})`);
          else {
            insertadas += 1;
            nuevas += 1;
          }
        }
      }

      await supabase
        .from('consulta_fuentes')
        .update({
          ultimo_hash: h,
          ultima_captura: new Date().toISOString(),
          ultimo_error: descartadas.length ? descartadas.join(' | ').slice(0, 500) : null,
          intentos_fallidos: 0,
        })
        .eq('id', f.id);

      resultados.push({
        ministerio: f.ministerio,
        tipo: f.tipo,
        estado: 'procesada',
        encontradas: items.length,
        guardadas: insertadas,
        vencidas: vencidos || undefined,
        descartadas: descartadas.length || undefined,
      });
    } catch (err) {
      await supabase
        .from('consulta_fuentes')
        .update({
          ultimo_error: String(err.message || err).slice(0, 500),
          intentos_fallidos: (f.intentos_fallidos || 0) + 1,
          ultima_captura: new Date().toISOString(),
        })
        .eq('id', f.id);

      resultados.push({ ministerio: f.ministerio, tipo: f.tipo, estado: 'error', detalle: String(err.message || err) });
    }
  }

  // -------------------------------------------------------------------
  // Segunda pasada: fichas pendientes.
  //
  // Va despues de las fuentes y con lo que quede de presupuesto: si no da
  // tiempo, se quedan para manana. La cola no se pierde porque
  // detalle_pendiente sigue a true.
  // -------------------------------------------------------------------
  const maxFichas = Math.min(Number(searchParams.get('fichas')) || FICHAS_POR_DEFECTO, 10);
  let fichasHechas = 0;
  let fichasFallidas = 0;

  if (Date.now() - t0 < PRESUPUESTO_MS) {
    // Solo se piden fichas de lo que sigue vivo: gastar una llamada en un
    // tramite cerrado en 2019 no aporta nada.
    const { data: pendientes } = await supabase
      .from('consultas_publicas')
      .select('id, url_ficha, titulo, fecha_fin')
      .eq('detalle_pendiente', true)
      .not('url_ficha', 'is', null)
      .or(`fecha_fin.is.null,fecha_fin.gte.${hoyISO()}`)
      .limit(maxFichas);

    for (const p of pendientes || []) {
      if (Date.now() - t0 > PRESUPUESTO_MS) break;

      try {
        const res = await fetch(p.url_ficha, {
          cache: 'no-store',
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; GovTalent/1.0; +https://govtalent.app; hola@govtalent.app)',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'es-ES,es;q=0.9',
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const htmlFicha = await res.text();
        const textoFicha = textoUtil(htmlFicha);
        const d = await extraerDetalle(textoFicha, p.url_ficha);

        const fin = fechaISO(d.fecha_fin);
        const buzonOk = d.buzon && textoFicha.toLowerCase().includes(String(d.buzon).toLowerCase());

        await supabase
          .from('consultas_publicas')
          .update({
            // coalesce manual: si la ficha no trae fecha se conserva la
            // que ya venia del listado, en vez de borrarla.
            fecha_inicio: fechaISO(d.fecha_inicio) ?? undefined,
            fecha_fin: fin ?? undefined,
            buzon: buzonOk ? d.buzon : null,
            referencia: d.referencia || null,
            asunto_requerido: d.asunto_requerido || null,
            url_documento: d.url_documento || null,
            fecha_captura: new Date().toISOString(),
            // Se marca resuelta aunque no haya fecha: si la ficha tampoco
            // la trae, reintentarlo cada dia no va a cambiar nada.
            detalle_pendiente: false,
          })
          .eq('id', p.id);

        fichasHechas += 1;
      } catch (err) {
        fichasFallidas += 1;
        await supabase
          .from('consultas_publicas')
          .update({ nota: `Ficha no leida: ${String(err.message || err).slice(0, 200)}` })
          .eq('id', p.id);
      }
    }
  }

  const ms = Date.now() - t0;
  const conError = resultados.filter((r) => r.estado === 'error').length;

  await registrar(supabase, {
    estado: conError === resultados.length && resultados.length > 0 ? 'error' : resultados.length ? 'ok' : 'vacio',
    n_leidos: resultados.length,
    n_escritos: nuevas + actualizadas,
    duracion_ms: ms,
    detalle: [
      `lote ${lote}`,
      `nuevas ${nuevas}`,
      `actualizadas ${actualizadas}`,
      `sin_cambios ${sinCambios}`,
      fichasHechas ? `fichas ${fichasHechas}` : null,
      fichasFallidas ? `fichas_fallidas ${fichasFallidas}` : null,
      conError ? `errores ${conError}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 2000),
  });

  return NextResponse.json({
    lote,
    nuevas,
    actualizadas,
    sin_cambios: sinCambios,
    fichas: fichasHechas,
    fichas_fallidas: fichasFallidas || undefined,
    resultados,
    ms,
  });
}
