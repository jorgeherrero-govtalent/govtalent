// =====================================================================
// MOTOR DE ALERTAS — detección de cambios y plazos
// app/api/sync/detectar-cambios/route.js
//
// Se ejecuta después de los syncs de datos, cada noche. Hace dos cosas:
//
//   1. COMPARA el estado actual con la huella guardada en
//      entity_snapshots. Si algo cambió y hay una regla activa para ese
//      campo, escribe un evento en follow_events.
//
//   2. CALCULA los plazos que vencen. Estos no comparan nada: se miran
//      las fechas y se avisa a 30, 7 y 1 día. deadline_alerts evita
//      repetir el mismo aviso cada noche.
//
// POR QUÉ ASÍ: los syncs sobrescriben, y sin huella no hay contra qué
// comparar. Guardar el histórico completo de 12.705 expedientes
// multiplicaría la base sin aportar: solo interesa saber QUÉ cambió.
//
// LAS REGLAS VIVEN EN LA BASE, no aquí. Si un tipo de aviso resulta ser
// ruido, se desactiva en change_rules sin desplegar nada.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin escribir
//   ?key=<DEBUG_KEY>&tipo=ley     solo un tipo
//   ?key=<DEBUG_KEY>              todo
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PRESUPUESTO_MS = 40000;
const LOTE = 1000;

// A cuántos días del cierre se avisa
const AVISOS_PLAZO = [30, 7, 1];

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Sin esto Next.js cachea los GET y el motor lee siempre lo mismo.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}

/**
 * Cómo se construye la huella de cada tipo.
 *
 * Cada entrada dice de dónde leer y qué campos vigilar. Añadir una
 * fuente nueva —consultas públicas, BOE— es añadir una entrada aquí.
 */
const TIPOS = {
  ley: {
    tabla: 'es_initiatives_directory',
    id: 'num_expediente',
    etiqueta: (r) => r.title,
    // Se piden solo las columnas de la huella, no la fila entera
    columnas: 'num_expediente, title, fase, situacion, plazo_enmiendas, n_prorrogas, n_ponentes, slug',
    huella: (r) => ({
      fase: r.fase,
      situacion: r.situacion,
      plazo: r.plazo_enmiendas,
      prorrogas: r.n_prorrogas,
      n_ponentes: r.n_ponentes,
    }),
    plazo: (r) => r.plazo_enmiendas,
    ruta: (r) => `/congreso/${r.slug}`,
  },
  actividad: {
    tabla: 'es_activity',
    id: 'num_expediente',
    etiqueta: (r) => r.titulo,
    columnas: 'num_expediente, titulo, situacion, resultado, is_closed, slug',
    huella: (r) => ({ situacion: r.situacion, resultado: r.resultado, is_closed: r.is_closed }),
    plazo: () => null,
    ruta: (r) => `/congreso/actividad/${r.slug}`,
  },
  expediente: {
    tabla: 'eu_initiatives',
    id: 'id',
    etiqueta: (r) => r.title_es || r.title_en,
    columnas: 'id, title_es, title_en, stage, feedback_end, n_attachments, slug',
    huella: (r) => ({ stage: r.stage, feedback_end: r.feedback_end, n_attachments: r.n_attachments }),
    plazo: (r) => r.feedback_end,
    ruta: (r) => `/initiatives/${r.slug}`,
  },
  procedimiento: {
    tabla: 'ep_procedures',
    id: 'process_id',
    // No hay columna "title": son title_es y title_en, como en los
    // expedientes. Con el nombre mal, el select fallaba en silencio y no
    // se leía ninguno de los 906.
    etiqueta: (r) => r.title_es || r.title_en || r.label,
    columnas: 'process_id, label, title_es, title_en, current_stage, current_stage_label, is_closed, slug',
    huella: (r) => ({ stage: r.current_stage, is_closed: r.is_closed }),
    plazo: () => null,
    ruta: (r) => `/procedures/${r.slug}`,
  },
};

// Dos valores son iguales si su forma en texto coincide. Se normaliza
// null y undefined para que no cuenten como cambio entre sí.
function igual(a, b) {
  const n = (v) => (v === null || v === undefined ? '' : String(v));
  return n(a) === n(b);
}

function aplicarPlantilla(tpl, antes, ahora) {
  return String(tpl || '')
    .replace('{antes}', antes === null || antes === undefined ? '—' : String(antes))
    .replace('{ahora}', ahora === null || ahora === undefined ? '—' : String(ahora));
}

function diasHasta(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

async function escribir(supabase, tabla, filas, conflicto) {
  if (filas.length === 0) return { escritas: 0, errores: [] };
  let escritas = 0;
  const errores = [];
  for (let i = 0; i < filas.length; i += 200) {
    const grupo = filas.slice(i, i + 200);
    const { data, error } = await supabase
      .from(tabla)
      .upsert(grupo, { onConflict: conflicto, ignoreDuplicates: false })
      .select(conflicto.split(',')[0]);
    if (error) errores.push(error.message);
    else escritas += Array.isArray(data) ? data.length : 0;
  }
  return { escritas, errores: errores.slice(0, 3) };
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
  const soloTipo = sp.get('tipo');
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry, tipos: {} };

  try {
    // Las reglas activas, agrupadas por tipo y campo
    const { data: reglas } = await supabase.from('change_rules').select('*').eq('active', true);
    const reglaDe = new Map((reglas || []).map((r) => [`${r.kind}:${r.field}`, r]));

    const eventos = [];
    const huellasNuevas = [];
    const avisosPlazo = [];

    const clavesTipo = soloTipo && TIPOS[soloTipo] ? [soloTipo] : Object.keys(TIPOS);

    for (const clave of clavesTipo) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }
      const t = TIPOS[clave];

      // Las huellas guardadas de este tipo
      const { data: guardadas } = await supabase
        .from('entity_snapshots')
        .select('ref_id, snapshot')
        .eq('kind', clave);
      const previa = new Map((guardadas || []).map((s) => [s.ref_id, s.snapshot]));

      // El estado actual, por lotes para no traerlo todo de golpe
      let desde = 0;
      let filas = [];
      let fallo = null;
      while (true) {
        const { data, error } = await supabase
          .from(t.tabla)
          .select(t.columnas)
          .order(t.id, { ascending: true })
          .range(desde, desde + LOTE - 1);
        // Un error aquí tiene que verse: una columna mal escrita hacía
        // que no se leyera ningún procedimiento y el informe decía
        // "revisados: 0" sin explicar por qué.
        if (error) {
          fallo = error.message;
          break;
        }
        if (!data || data.length === 0) break;
        filas = filas.concat(data);
        if (data.length < LOTE) break;
        desde += LOTE;
        if (Date.now() - t0 > PRESUPUESTO_MS) break;
      }

      let cambios = 0;
      let nuevos = 0;

      for (const r of filas) {
        const ref = String(r[t.id]);
        const ahora = t.huella(r);
        const antes = previa.get(ref);

        huellasNuevas.push({ kind: clave, ref_id: ref, snapshot: ahora, updated_at: new Date().toISOString() });

        // Sin huella previa es la primera vez que se ve: se guarda pero
        // no se avisa, o al añadir una fuente nueva llegarían miles de
        // avisos de cosas que ya existían.
        if (!antes) {
          nuevos += 1;
          continue;
        }

        for (const [campo, valor] of Object.entries(ahora)) {
          if (igual(antes[campo], valor)) continue;
          const regla = reglaDe.get(`${clave}:${campo}`);
          if (!regla) continue;

          cambios += 1;
          eventos.push({
            kind: clave,
            ref_id: ref,
            event_type: regla.event_type,
            title: t.etiqueta(r) || ref,
            detail: aplicarPlantilla(regla.template, antes[campo], valor),
            // La fecha del evento es hoy: no sabemos cuándo ocurrió en
            // realidad, solo cuándo lo hemos detectado.
            occurred_at: new Date().toISOString(),
          });
        }

        // --- Plazos -----------------------------------------------------
        const plazo = t.plazo(r);
        const dias = diasHasta(plazo);
        if (dias !== null && dias >= 0) {
          for (const umbral of AVISOS_PLAZO) {
            // Se avisa cuando cruza el umbral, no cada día por debajo
            if (dias <= umbral && dias > (AVISOS_PLAZO.find((u) => u < umbral) ?? -1)) {
              avisosPlazo.push({
                kind: clave,
                ref_id: ref,
                days_before: umbral,
                deadline: plazo,
                _evento: {
                  kind: clave,
                  ref_id: ref,
                  event_type: 'plazo_proximo',
                  title: t.etiqueta(r) || ref,
                  detail:
                    dias === 0
                      ? 'El plazo cierra hoy'
                      : `Quedan ${dias} ${dias === 1 ? 'día' : 'días'} de plazo`,
                  occurred_at: new Date().toISOString(),
                },
              });
              break;
            }
          }
        }
      }

      informe.tipos[clave] = { revisados: filas.length, cambios, nuevos, plazos: 0 };
      if (fallo) informe.tipos[clave].error = fallo;
    }

    // Los avisos de plazo ya enviados, para no repetirlos
    const clavesAviso = avisosPlazo.map((a) => `${a.kind}|${a.ref_id}|${a.days_before}|${a.deadline}`);
    const yaAvisados = new Set();
    if (clavesAviso.length > 0) {
      const { data: previos } = await supabase
        .from('deadline_alerts')
        .select('kind, ref_id, days_before, deadline')
        .in('ref_id', avisosPlazo.map((a) => a.ref_id).slice(0, 500));
      for (const p of previos || []) {
        yaAvisados.add(`${p.kind}|${p.ref_id}|${p.days_before}|${p.deadline}`);
      }
    }

    const plazosNuevos = avisosPlazo.filter(
      (a) => !yaAvisados.has(`${a.kind}|${a.ref_id}|${a.days_before}|${a.deadline}`)
    );
    for (const p of plazosNuevos) eventos.push(p._evento);
    for (const clave of Object.keys(informe.tipos)) {
      informe.tipos[clave].plazos = plazosNuevos.filter((p) => p.kind === clave).length;
    }

    informe.eventos = eventos.length;
    informe.huellas = huellasNuevas.length;
    informe.plazos_nuevos = plazosNuevos.length;
    informe.por_tipo_evento = eventos.reduce((acc, e) => {
      acc[e.event_type] = (acc[e.event_type] || 0) + 1;
      return acc;
    }, {});

    if (dry) {
      informe.muestra = eventos.slice(0, 8);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // Se escriben primero los eventos: si algo falla después, la huella
    // sigue siendo la vieja y se reintentará. Al revés se perderían.
    informe.escritura = {
      eventos: await escribir(supabase, 'follow_events', eventos, 'kind,ref_id,event_type,occurred_at'),
      plazos: await escribir(
        supabase,
        'deadline_alerts',
        plazosNuevos.map(({ _evento, ...p }) => p),
        'kind,ref_id,days_before,deadline'
      ),
      huellas: await escribir(supabase, 'entity_snapshots', huellasNuevas, 'kind,ref_id'),
    };

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
