import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
// La extracción, la normalización y el cruce viven en lib/boeCargos.js,
// donde se pueden probar con datos exportados sin pasar por Vercel.
import { indices, cruzar, materiaDe } from '@/lib/boeCargos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// force-dynamic evita el renderizado estático, pero NO impide que el Data
// Cache de Next sirva las lecturas de Supabase. Los logs de Vercel lo
// mostraban explícitamente: "Using cache …/rest/v1/boe_documents". La ruta
// leía una foto congelada del 29 de agosto, concluía que no había nada
// nuevo y devolvía 200 sin insertar. Cuatro días en silencio.
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Extrae los nombramientos y ceses de la sección II-A del BOE ya
 * sincronizada, y los cruza con el directorio de cargos.
 *
 * Guarda cada movimiento en boe_appointments y después lo vuelca al
 * directorio con volcar_titulares_boe() (sql/103): government_officials
 * para las unidades de la AGE y directorio_contactos para las
 * Delegaciones y Subdelegaciones del Gobierno.
 *
 * Uso:
 *   /api/sync/boe-cargos?key=<DEBUG_KEY>
 *   /api/sync/boe-cargos?key=<DEBUG_KEY>&desde=2023-11-01&hasta=2023-11-30
 *   /api/sync/boe-cargos?key=<DEBUG_KEY>&dry=1   (qué cambiaría, sin escribir)
 *
 * Para el backfill desde el inicio de la legislatura, por tandas de un
 * mes: Vercel corta a los 60 segundos y tres años no caben de una vez.
 */

const PRESUPUESTO_MS = 50_000;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Cinturón además de las directivas de arriba: el cliente de Supabase
    // usa fetch por debajo y es ahí donde Next intercepta. Sin esto, basta
    // con que cambie el comportamiento por defecto de una versión de Next
    // para que vuelva a cachearse sin avisar.
    global: {
      fetch: (url, opciones) => fetch(url, { ...opciones, cache: 'no-store' }),
    },
  });
}

/**
 * Deja constancia de la ejecución en sync_log. Nunca lanza: un fallo al
 * registrar no puede tumbar el sync.
 *
 * El estado 'omitido' es el que importa. Cada salida temprana debe
 * registrarse con su motivo, porque una ruta que sale por una guarda sin
 * dejar rastro es exactamente lo que pasó aquí.
 */
async function registrar(supabase, fila) {
  try {
    if (!supabase) return;
    await supabase.from('sync_log').insert({
      ruta: '/api/sync/boe-cargos',
      estado: fila.estado,
      n_leidos: fila.n_leidos || 0,
      n_escritos: fila.n_escritos || 0,
      duracion_ms: fila.duracion_ms ?? null,
      detalle: fila.detalle ?? null,
    });
  } catch (err) {
    console.error('[boe-cargos] no se pudo escribir en sync_log:', err);
  }
}

export async function GET(req) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);

  // Mismo patrón que el sync del BOE: DEBUG_KEY para lanzarlo a mano,
  // CRON_SECRET para cuando entre en vercel.json.
  const esCron = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const esManual = !!process.env.DEBUG_KEY && searchParams.get('key') === process.env.DEBUG_KEY;
  if (!esCron && !esManual) {
    // Se registra antes de salir: si CRON_SECRET cambia o desaparece, esto
    // deja rastro en vez de devolver 401 en silencio todos los días.
    await registrar(admin(), {
      estado: 'omitido',
      detalle: 'no autorizado: ni cabecera de cron válida ni DEBUG_KEY',
      duracion_ms: Date.now() - t0,
    });
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }

  const supabase = admin();
  const dry = searchParams.get('dry') === '1';
  const hasta = searchParams.get('hasta') || new Date().toISOString().slice(0, 10);
  const desde =
    searchParams.get('desde') ||
    new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  // 1. Los documentos de personal ya sincronizados en ese rango
  const { data: docs, error: eDocs } = await supabase
    .from('boe_documents')
    .select('id, fecha_publicacion, departamento, titulo')
    .eq('seccion', '2A')
    .gte('fecha_publicacion', desde)
    .lte('fecha_publicacion', hasta)
    .order('fecha_publicacion');

  if (eDocs) {
    await registrar(supabase, {
      estado: 'error',
      detalle: `lectura de boe_documents: ${eDocs.message}`,
      duracion_ms: Date.now() - t0,
    });
    return NextResponse.json({ error: eDocs.message }, { status: 500 });
  }

  // 2. Las unidades de la AGE, las equivalencias ya resueltas y las
  //    entidades territoriales del directorio.
  //
  //    El cruce (lib/boeCargos.js) se hace de más fiable a menos:
  //      0) Delegaciones, Subdelegaciones y Direcciones Insulares: a su
  //         entidad de directorio_entidades por el territorio. No existen
  //         en age_units.
  //      a) cargo_unit_map, decidido a mano y por tanto seguro
  //      b) coincidencia exacta de claves, con tipo de unidad compatible
  //      c) similitud por trigramas sobre lo distintivo, también con tipo
  //         compatible
  //
  //    Lo que no pasa ninguno queda pendiente de revisar, y al revisarlo
  //    se convierte en una entrada de cargo_unit_map: cada caso raro se
  //    decide una sola vez.
  const [{ data: unidades }, { data: mapa }, { data: entidades }] = await Promise.all([
    supabase.from('age_units').select('dir3_code, nombre, categoria').eq('activo', true),
    supabase.from('cargo_unit_map').select('clave_cargo, dir3_code, ignorar'),
    supabase
      .from('directorio_entidades')
      .select('id, organizacion, grupo')
      .eq('categoria', 'delegacion_gobierno')
      .eq('activo', true),
  ]);

  const idx = indices({ unidades, mapa, entidades });

  // 3. Extraer y cruzar
  const filas = [];
  let sinPatron = 0;

  for (const d of docs || []) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break;
    const fila = cruzar(d, idx);
    if (!fila) {
      sinPatron += 1;
      continue;
    }
    filas.push(fila);
  }

  // Prueba en seco: devuelve lo que cambiaría respecto a lo guardado, sin
  // escribir nada ni volcar al directorio.
  if (dry) {
    const ids = filas.map((f) => f.boe_id);
    const { data: previas } = await supabase
      .from('boe_appointments')
      .select('boe_id, estado, dir3_code, entidad_id')
      .in('boe_id', ids.length ? ids : ['-']);
    const antes = new Map((previas || []).map((p) => [p.boe_id, p]));
    const cambios = filas
      .filter((f) => {
        const p = antes.get(f.boe_id);
        return !p || p.estado !== f.estado || p.dir3_code !== f.dir3_code || p.entidad_id !== f.entidad_id;
      })
      .map((f) => ({
        boe_id: f.boe_id,
        accion: f.accion,
        persona: f.persona,
        cargo: f.cargo,
        antes: antes.get(f.boe_id) || null,
        despues: { estado: f.estado, dir3_code: f.dir3_code, entidad_id: f.entidad_id, nota: f.nota },
      }));
    return NextResponse.json({ dry: true, rango: { desde, hasta }, extraidos: filas.length, sin_patron: sinPatron, cambios });
  }

  // 4. Guardar. onConflict por boe_id: reejecutar no duplica y sí
  //    actualiza, que es lo que permite corregir una equivalencia y
  //    relanzar.
  //
  //    Se cuenta lo que devuelve la escritura, no el tamaño del grupo:
  //    sumar a ciegas hacía que el resumen dijera "guardados: 32" cuando
  //    solo se habían escrito 29.
  let guardadas = 0;
  const fallos = [];
  for (let i = 0; i < filas.length; i += 200) {
    const grupo = filas.slice(i, i + 200);
    const { data, error } = await supabase
      .from('boe_appointments')
      .upsert(grupo, { onConflict: 'boe_id', ignoreDuplicates: false })
      .select('id');
    if (error) fallos.push(error.message);
    else guardadas += data?.length || 0;
  }

  // El volcado al directorio, ya que estamos: sin esto los nombramientos
  // se quedaban en la tabla de revisión y había que ejecutar un SQL a
  // mano para que la ficha de la CNMC dejara de decir "todavía no
  // tenemos el titular".
  //
  // Va en una función de Postgres y no aquí porque el orden importa
  // —ceses antes que altas— y la comparación de nombres entre el BOE y
  // el directorio es la misma lógica: duplicarla en JavaScript sería
  // mantenerla en dos sitios.
  let volcado = null;
  const { data: vol, error: eVol } = await supabase.rpc('volcar_titulares_boe');
  if (eVol) volcado = { error: eVol.message };
  else volcado = Array.isArray(vol) ? vol[0] : vol;

  const resumen = filas.reduce((acc, f) => {
    acc[f.estado] = (acc[f.estado] || 0) + 1;
    return acc;
  }, {});

  // Los que no casaron, con su sugerencia si la hay: es la lista de lo
  // que hay que revisar para añadir a cargo_unit_map.
  // Se devuelve también la clave normalizada: sin ella, añadir una
  // equivalencia a mano es adivinar qué cadena espera el sync.
  //
  // Queda un caso sin resolver, la Autoridad de Investigación Técnica de
  // Accidentes: su clave coincide con la del mapa carácter a carácter y
  // aun así no casa, probablemente por algún carácter invisible en el
  // título del BOE. Son ocho documentos de un organismo que no legisla
  // ni tramita expedientes, así que no compensa perseguirlo.
  const revisar = filas
    .filter((f) => f.estado === 'sin_equivalencia')
    .map((f) => ({
      cargo: f.cargo,
      departamento: f.departamento,
      clave: materiaDe(f.cargo, f.organismo),
      nota: f.nota,
    }));

  const ms = Date.now() - t0;

  // Ojo con interpretar `guardadas`: el upsert va con onConflict por
  // boe_id, así que ese número mezcla inserciones y actualizaciones de
  // filas que ya existían. Por eso max(created_at) se quedó clavado en el
  // 29 de agosto mientras la ruta decía haber guardado. El indicador que
  // sirve para saber si entra contenido nuevo es max(fecha).
  await registrar(supabase, {
    estado: fallos.length > 0 ? 'error' : filas.length === 0 ? 'vacio' : 'ok',
    n_leidos: docs?.length || 0,
    n_escritos: guardadas,
    duracion_ms: ms,
    detalle:
      fallos.length > 0
        ? fallos.join(' | ').slice(0, 2000)
        : [
            `rango ${desde}..${hasta}`,
            `sin_patron ${sinPatron}`,
            Object.entries(resumen)
              .map(([k, v]) => `${k} ${v}`)
              .join(', '),
            volcado?.error
              ? `volcado: ${volcado.error}`
              : volcado
              ? `volcado: AGE −${volcado.ceses} +${volcado.altas}, agenda −${volcado.ceses_agenda} +${volcado.altas_agenda}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')
            .slice(0, 2000),
  });

  return NextResponse.json({
    rango: { desde, hasta },
    documentos_leidos: docs?.length || 0,
    sin_patron: sinPatron,
    extraidos: filas.length,
    guardados: guardadas,
    fallos: fallos.length > 0 ? fallos : undefined,
    por_estado: resumen,
    volcado,
    revisar,
    ms,
  });
}
