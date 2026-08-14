// =====================================================================
// SYNC — Iniciativas legislativas del Congreso
// app/api/sync/congreso-iniciativas/route.js
//
// FUENTE: datos abiertos de congreso.es. Dos ficheros:
//   ProyectosDeLey       106 · los presenta el Gobierno
//   ProposicionesDeLey   361 · grupos, Senado, parlamentos autonómicos
//
// El nombre del fichero lleva marca de tiempo y cambia cada vez que lo
// regeneran, así que hay que descubrirlo leyendo la página del portal.
// Mismo patrón que el sync de diputados, que ya funciona.
//
// CABE EN UNA SOLA PASADA: son 467 registros en dos peticiones, no hay
// que encadenar nada. Muy distinto de los syncs europeos.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1     prueba sin escribir
//   ?key=<DEBUG_KEY>           carga real
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.congreso.es';
const PORTAL = `${BASE}/es/opendata/iniciativas`;

// Sin cabeceras de navegador el portal responde 403.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js cachea las consultas GET del cliente de Supabase y hace
      // que el sync lea siempre lo mismo. Costó media sesión descubrirlo.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}

async function pedir(url) {
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res;
}

/**
 * Localiza el fichero JSON más reciente de un conjunto.
 * El nombre lleva marca de tiempo (ProyectosDeLey__20260814050037.json),
 * así que se busca por prefijo y se toma el mayor.
 */
async function urlDelFichero(prefijo) {
  const res = await pedir(PORTAL);
  const html = await res.text();
  const re = new RegExp(`/webpublica/opendata/iniciativas/${prefijo}__\\d+\\.json`, 'g');
  const encontrados = [...new Set(html.match(re) || [])];
  if (encontrados.length === 0) throw new Error(`No se encontró el fichero ${prefijo} en el portal`);
  // El mayor por orden alfabético es el de marca de tiempo más alta.
  return `${BASE}${encontrados.sort().reverse()[0]}`;
}

function slugify(t) {
  return (t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

// "07/12/2023" -> "2023-12-07"
function fechaEs(f) {
  if (!f) return null;
  const m = String(f).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// "03/02/2024 (14:00)" -> Date. La hora importa: un plazo que vence hoy
// a las 14:00 ya está cerrado a las 18:00.
function fechaHoraEs(f, h) {
  const d = fechaEs(f);
  if (!d) return null;
  const hora = h && /^\d{2}:\d{2}$/.test(h) ? h : '23:59';
  return `${d}T${hora}:00`;
}

/**
 * PLAZOS es texto libre con una línea por plazo:
 *   "Hasta: 03/02/2024 (14:00) De enmiendas"
 *   "Hasta: 07/02/2024 (18:00) Ampliación de enmiendas al articulado"
 *
 * Un expediente puede acumular decenas de prórrogas — el Proyecto de Ley
 * de Familias lleva 90, dos años y medio. Ese número no es ruido: dice
 * que el expediente está bloqueado sin acuerdo.
 */
function parsearPlazos(texto) {
  if (!texto) return { plazo: null, prorrogas: 0, total: 0 };
  const lineas = String(texto)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const plazos = [];
  let prorrogas = 0;
  for (const l of lineas) {
    const m = l.match(/Hasta:\s*(\d{2}\/\d{2}\/\d{4})\s*(?:\((\d{2}:\d{2})\))?\s*(.*)$/);
    if (!m) continue;
    const iso = fechaHoraEs(m[1], m[2]);
    if (!iso) continue;
    const concepto = (m[3] || '').trim();
    if (/ampliaci[óo]n/i.test(concepto)) prorrogas += 1;
    plazos.push({ iso, concepto });
  }
  if (plazos.length === 0) return { plazo: null, prorrogas: 0, total: 0 };

  // El plazo vigente es el más lejano: las ampliaciones sustituyen al
  // anterior, no se suman.
  const ultimo = plazos.map((p) => p.iso).sort().reverse()[0];
  return { plazo: ultimo, prorrogas, total: plazos.length };
}

/**
 * TRAMITACIONSEGUIDA trae el recorrido en grupos de tres líneas:
 *   "Comisión de Igualdad"
 *   "Publicación"
 *   "desde 12/12/2023 hasta 15/12/2023"
 *
 * Se recorre buscando las líneas de fecha y se toman las dos anteriores
 * como órgano y fase. Es más robusto que asumir grupos exactos de tres,
 * porque algunas etapas traen la fase en la misma línea del órgano.
 */
function parsearTramitacion(texto) {
  if (!texto) return [];
  const lineas = String(texto)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const esFecha = (l) => !!l && /^desde\s+\d{2}\/\d{2}\/\d{4}/i.test(l);

  const etapas = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(/^desde\s+(\d{2}\/\d{2}\/\d{4})(?:\s+hasta\s+(\d{2}\/\d{2}\/\d{4}))?/i);
    if (!m) continue;

    // Algunas etapas traen órgano + fase antes de la fecha, y otras solo
    // el órgano: "Senado \ndesde 27/06/2024...". Si la línea de dos atrás
    // ya es una fecha, es que esta etapa solo tiene una línea de texto.
    const anterior = lineas[i - 1] || null;
    const dosAtras = lineas[i - 2] || null;
    const soloOrgano = esFecha(dosAtras) || !dosAtras;

    etapas.push({
      ord: etapas.length,
      organo: soloOrgano ? anterior : dosAtras,
      fase: soloOrgano ? null : anterior,
      fecha_inicio: fechaEs(m[1]),
      fecha_fin: fechaEs(m[2]),
    });
  }
  return etapas;
}

/**
 * AUTOR puede traer varios firmantes separados por saltos de línea:
 *   "Grupo Parlamentario Socialista \nGrupo Parlamentario Plurinacional SUMAR"
 * o diputados individuales con su grupo entre paréntesis:
 *   "Rufián Romero, Gabriel (GR) \nÁlvaro Vidal, Francesc-Marc (GR)"
 *
 * Se separan grupos de personas: los grupos van a es_initiative_groups y
 * las personas a es_initiative_people, donde pueden enlazar con el
 * directorio de diputados.
 */
function parsearAutor(texto) {
  const grupos = [];
  const personas = [];
  if (!texto) return { grupos, personas };

  for (const linea of String(texto).split('\n').map((l) => l.trim()).filter(Boolean)) {
    // Una persona lleva coma (apellidos, nombre) y a menudo el grupo
    // entre paréntesis al final.
    const conGrupo = linea.match(/^(.+?,\s*.+?)\s*\(([^)]+)\)\s*$/);
    if (conGrupo) {
      personas.push({ nombre: conGrupo[1].trim(), grupo: conGrupo[2].trim() });
      continue;
    }
    if (/^Grupo Parlamentario|^Senado$|^Comunidad|^Comisión|^Gobierno$/i.test(linea)) {
      grupos.push(linea);
      continue;
    }
    // Con coma pero sin paréntesis: persona sin grupo indicado.
    if (linea.includes(',')) personas.push({ nombre: linea, grupo: null });
    else grupos.push(linea);
  }
  return { grupos, personas };
}

// PONENTES viene como una lista de nombres, uno por línea, en el mismo
// formato que deputies.full_name ("Apellido Apellido, Nombre").
function parsearPonentes(texto) {
  if (!texto) return [];
  return String(texto)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 3 && l.includes(','));
}

// Para casar nombres con el directorio: sin tildes, sin dobles espacios.
function normalizar(n) {
  return (n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function transformar(row, kind) {
  const num = String(row.NUMEXPEDIENTE || '').trim();
  if (!num) return null;

  // SITUACIONACTUAL no dice la fase, dice DÓNDE está el expediente:
  // "Comisión de Hacienda \nEnmiendas". La primera línea es el órgano y
  // la segunda, la fase.
  const sitLineas = String(row.SITUACIONACTUAL || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const situacion = sitLineas[0] || null;
  const fase = sitLineas[1] || null;

  const { plazo, prorrogas } = parsearPlazos(row.PLAZOS);
  const cerrado = /^cerrado|^concluido/i.test(situacion || '');

  return {
    fila: {
      num_expediente: num,
      legislature_code: row.LEGISLATURA || null,
      slug: `${slugify(row.OBJETO)}-${num.replace(/\//g, '-')}`,
      kind,
      tipo: row.TIPO || null,
      objeto: String(row.OBJETO || '').replace(/\s*\n\s*/g, ' ').trim(),
      autor: row.AUTOR || null,
      tipo_tramitacion: row.TIPOTRAMITACION || null,
      fecha_presentacion: fechaEs(row.FECHAPRESENTACION),
      fecha_calificacion: fechaEs(row.FECHACALIFICACION),
      situacion,
      fase,
      // Las proposiciones no traen COMISIONCOMPETENTE: se deriva de dónde
      // está ahora, que en la mayoría de casos es la comisión.
      comision: row.COMISIONCOMPETENTE || (/^Comisión/i.test(situacion || '') ? situacion : null),
      resultado: row.RESULTADOTRAMITACION ? String(row.RESULTADOTRAMITACION).replace(/\s*\n\s*/g, ' ').trim() : null,
      is_closed: cerrado,
      // Un plazo ya vencido no es una ventana abierta.
      plazo_enmiendas: plazo && !cerrado ? plazo : null,
      n_prorrogas: prorrogas,
      texto_plazos: row.PLAZOS || null,
      texto_tramitacion: row.TRAMITACIONSEGUIDA || null,
      iniciativas_relacionadas: row.INICIATIVASRELACIONADAS || null,
      enlaces_bocg: row.ENLACESBOCG || null,
      enlaces_ds: row.ENLACESDS || null,
      raw: row,
      synced_at: new Date().toISOString(),
    },
    etapas: parsearTramitacion(row.TRAMITACIONSEGUIDA).map((e) => ({ ...e, num_expediente: num })),
    ponentes: parsearPonentes(row.PONENTES),
    autor: parsearAutor(row.AUTOR),
  };
}

// Escritura verificada: .select() hace que PostgREST devuelva las filas
// afectadas, así el informe cuenta cambios reales y no llamadas sin error.
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

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const dry = sp.get('dry') === '1';
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry };

  try {
    // --- Descarga ------------------------------------------------------
    const conjuntos = [
      { prefijo: 'ProyectosDeLey', kind: 'proyecto', minimo: 50 },
      { prefijo: 'ProposicionesDeLey', kind: 'proposicion', minimo: 200 },
    ];

    const filas = [];
    const etapas = [];
    const personas = [];
    const gruposFilas = [];
    informe.conjuntos = {};

    for (const c of conjuntos) {
      const url = await urlDelFichero(c.prefijo);
      const res = await pedir(url);
      const datos = await res.json();

      // Salvaguarda del sync de diputados: si vienen muchos menos
      // registros de lo esperado, la fuente ha fallado y es mejor no
      // tocar nada que machacar datos buenos con una descarga parcial.
      if (!Array.isArray(datos) || datos.length < c.minimo) {
        throw new Error(
          `${c.prefijo} trajo ${Array.isArray(datos) ? datos.length : 0} registros, menos del mínimo ${c.minimo} — no se continúa`
        );
      }
      informe.conjuntos[c.prefijo] = { url: url.split('/').pop(), registros: datos.length };

      for (const row of datos) {
        const t = transformar(row, c.kind);
        if (!t) continue;
        filas.push(t.fila);
        etapas.push(...t.etapas);
        for (const p of t.ponentes) {
          personas.push({ num_expediente: t.fila.num_expediente, role: 'ponente', nombre: p, grupo: null });
        }
        for (const p of t.autor.personas) {
          personas.push({ num_expediente: t.fila.num_expediente, role: 'autor', nombre: p.nombre, grupo: p.grupo });
        }
        for (const g of t.autor.grupos) {
          gruposFilas.push({ num_expediente: t.fila.num_expediente, grupo: g });
        }
      }
    }

    // --- Enlace con el directorio de diputados -------------------------
    // El formato de PONENTES coincide con deputies.full_name, así que el
    // cruce es directo. Se normaliza para que las tildes no lo rompan.
    const { data: diputados } = await supabase.from('deputies').select('id, full_name').eq('active', true);
    const porNombre = new Map((diputados || []).map((d) => [normalizar(d.full_name), d.id]));
    let enlazados = 0;
    for (const p of personas) {
      const id = porNombre.get(normalizar(p.nombre));
      if (id) {
        p.deputy_id = id;
        enlazados += 1;
      }
    }

    const { data: grupos } = await supabase.from('parliamentary_groups').select('id, name');
    const porGrupo = new Map((grupos || []).map((g) => [normalizar(g.name), g.id]));
    let gruposEnlazados = 0;
    for (const g of gruposFilas) {
      const id = porGrupo.get(normalizar(g.grupo));
      if (id) {
        g.group_id = id;
        gruposEnlazados += 1;
      }
    }

    // --- Informe -------------------------------------------------------
    informe.iniciativas = filas.length;
    informe.vivas = filas.filter((f) => !f.is_closed).length;
    informe.con_plazo_abierto = filas.filter((f) => f.plazo_enmiendas).length;
    informe.con_comision = filas.filter((f) => f.comision).length;
    informe.etapas = etapas.length;
    informe.personas = personas.length;
    informe.personas_enlazadas = enlazados;
    informe.grupos = gruposFilas.length;
    informe.grupos_enlazados = gruposEnlazados;
    informe.max_prorrogas = filas.reduce((m, f) => Math.max(m, f.n_prorrogas || 0), 0);

    if (dry) {
      informe.muestra = filas[0] ? { ...filas[0], raw: '[...recortado]' } : null;
      informe.muestra_etapas = etapas.slice(0, 5);
      informe.muestra_personas = personas.slice(0, 5);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // --- Escritura -----------------------------------------------------
    const wInit = await escribir(supabase, 'es_initiatives', filas, 'num_expediente');

    // Las etapas se reemplazan enteras: el recorrido puede cambiar de
    // orden y un upsert por (expediente, ord) dejaría etapas viejas.
    const nums = filas.map((f) => f.num_expediente);
    for (let i = 0; i < nums.length; i += 100) {
      await supabase.from('es_initiative_stages').delete().in('num_expediente', nums.slice(i, i + 100));
    }
    const wStages = await escribir(supabase, 'es_initiative_stages', etapas, 'num_expediente,ord');
    const wPeople = await escribir(supabase, 'es_initiative_people', personas, 'num_expediente,role,nombre');
    const wGroups = await escribir(supabase, 'es_initiative_groups', gruposFilas, 'num_expediente,grupo');

    informe.escritura = {
      iniciativas: wInit,
      etapas: wStages,
      personas: wPeople,
      grupos: wGroups,
    };
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
