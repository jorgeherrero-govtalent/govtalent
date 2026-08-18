// =====================================================================
// SYNC — BOE
// app/api/sync/boe/route.js
//
// Carga las secciones I (disposiciones generales), II-A (nombramientos)
// y III (otras disposiciones). Fuera quedan oposiciones y anuncios: son
// otro público y multiplicarían el volumen por cuatro.
//
// DOS PASOS POR DÍA:
//   1. El sumario da la lista de documentos con su sección y
//      departamento: /datosabiertos/api/boe/sumario/AAAAMMDD en JSON
//   2. Cada documento se pide aparte para sus materias, alertas y
//      referencias: /diario_boe/xml.php?id=BOE-A-...
//
// El segundo paso es el caro —una petición por documento— pero es donde
// está el valor: las materias y alertas son lo que permite responder
// "qué me afecta como organización".
//
// boe_sync_log lleva la cuenta de qué días se han cargado, porque el BOE
// no publica los domingos ni festivos y no basta con restar días.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1                prueba sin escribir
//   ?key=<DEBUG_KEY>&fecha=20260817       un día concreto
//   ?key=<DEBUG_KEY>&dias=7               los últimos N días
//   ?key=<DEBUG_KEY>                      el día de ayer
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.boe.es';
const PRESUPUESTO_MS = 40000;
const PARALELO = 5;
const PAUSA_MS = 200;

// Las secciones que interesan. El resto —oposiciones y anuncios— son
// otro público.
const SECCIONES = new Set(['1', '2A', '3']);

// De la sección de personal solo se guardan los nombramientos y ceses de
// altos cargos. Medido en tres semanas: de 428 documentos, 238 eran
// oposiciones y 17 concursos de personal, que no aportan nada a asuntos
// públicos y dominaban el selector de sector.
//
// El rango no sirve para distinguirlos: los Reales Decretos de esa
// sección son ascensos militares y las Órdenes mezclan altos cargos con
// funcionarios de cuerpo. El único criterio fiable es la alerta.
const ALERTA_ALTOS_CARGOS = 'Nombramientos y ceses de altos cargos';

function interesa(seccion, alertas) {
  if (seccion !== '2A') return true;
  return (alertas || []).some((a) => a.valor === ALERTA_ALTOS_CARGOS);
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, application/xml, */*',
  'Accept-Language': 'es-ES,es;q=0.9',
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(t) {
  return (t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

// "20260817" -> "2026-08-17"
function aFecha(s) {
  if (!s || String(s).length !== 8) return null;
  const t = String(s);
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
}

function fechaCompacta(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function pedir(url, accept) {
  try {
    const res = await fetch(url, { headers: accept ? { ...HEADERS, Accept: accept } : HEADERS, cache: 'no-store' });
    const txt = await res.text();
    return { ok: res.ok, status: res.status, texto: txt };
  } catch (e) {
    return { ok: false, status: null, error: e.message };
  }
}

/**
 * Recorre el sumario y saca los documentos de las secciones que
 * interesan.
 *
 * La estructura anida sección → departamento → epígrafe → item, y el
 * epígrafe puede faltar. Se recorre en profundidad arrastrando el
 * departamento, porque el item no lo lleva.
 */
function itemsDelSumario(json) {
  const diario = json?.data?.sumario?.diario;
  const diarios = Array.isArray(diario) ? diario : diario ? [diario] : [];
  const salida = [];

  for (const d of diarios) {
    const secciones = Array.isArray(d.seccion) ? d.seccion : d.seccion ? [d.seccion] : [];
    for (const s of secciones) {
      if (!SECCIONES.has(String(s.codigo))) continue;

      const recorrer = (nodo, depto) => {
        if (!nodo) return;
        if (Array.isArray(nodo)) return nodo.forEach((n) => recorrer(n, depto));

        // El departamento se arrastra hacia abajo: los items no lo traen
        const deptoActual = nodo.nombre && nodo.codigo && !nodo.identificador ? nodo : depto;

        if (nodo.identificador && nodo.titulo) {
          salida.push({
            id: nodo.identificador,
            titulo: nodo.titulo,
            url_pdf: typeof nodo.url_pdf === 'object' ? nodo.url_pdf?.['#text'] || nodo.url_pdf?.texto : nodo.url_pdf,
            url_html: nodo.url_html,
            seccion: String(s.codigo),
            seccion_nombre: s.nombre,
            departamento_codigo: deptoActual?.codigo || null,
            departamento: deptoActual?.nombre || null,
          });
          return;
        }

        for (const v of Object.values(nodo)) {
          if (v && typeof v === 'object') recorrer(v, deptoActual);
        }
      };

      recorrer(s.departamento || s, null);
    }
  }
  return salida;
}

/**
 * Extrae los metadatos de un documento.
 *
 * Es XML, así que se buscan patrones. Cada campo falla por separado: si
 * cambia el marcado de las materias, el departamento sigue leyéndose.
 */
function parsearDocumento(xml) {
  const uno = (tag) => {
    const m = xml.match(new RegExp(`<${tag}(?:\\s+codigo="([^"]*)")?[^>]*>([^<]*)</${tag}>`, 'i'));
    return m ? { codigo: m[1] || null, valor: m[2] } : null;
  };
  const varios = (tag) => {
    const re = new RegExp(`<${tag}\\s+codigo="([^"]*)"[^>]*>([^<]*)</${tag}>`, 'gi');
    return [...xml.matchAll(re)].map((m) => ({ codigo: m[1], valor: m[2] }));
  };

  // Las referencias van dentro de <anteriores> o <posteriores>
  const refs = [];
  for (const dir of ['anteriores', 'posteriores']) {
    const bloque = xml.match(new RegExp(`<${dir}>([\\s\\S]*?)</${dir}>`, 'i'));
    if (!bloque) continue;
    const re = /<(?:anterior|posterior)\s+referencia="([^"]+)"[^>]*>([\s\S]*?)<\/(?:anterior|posterior)>/gi;
    for (const m of bloque[1].matchAll(re)) {
      const palabra = m[2].match(/<palabra\s+codigo="([^"]*)"[^>]*>([^<]*)<\/palabra>/i);
      const texto = m[2].match(/<texto>([^<]*)<\/texto>/i);
      refs.push({
        referencia_id: m[1],
        direccion: dir === 'anteriores' ? 'anterior' : 'posterior',
        palabra_codigo: palabra?.[1] || null,
        palabra: palabra?.[2] || null,
        texto: texto?.[1] || null,
      });
    }
  }

  const derog = uno('estatus_derogacion');

  return {
    departamento: uno('departamento'),
    rango: uno('rango'),
    origen: uno('origen_legislativo'),
    fecha_disposicion: (xml.match(/<fecha_disposicion>(\d{8})<\/fecha_disposicion>/i) || [])[1] || null,
    fecha_vigencia: (xml.match(/<fecha_vigencia>(\d{8})<\/fecha_vigencia>/i) || [])[1] || null,
    numero_oficial: (xml.match(/<numero_oficial>([^<]*)<\/numero_oficial>/i) || [])[1] || null,
    // El BOE marca la derogación con "S" cuando está derogada
    derogado: derog?.valor === 'S' || derog?.codigo === 'S',
    materias: varios('materia'),
    alertas: varios('alerta'),
    referencias: refs,
  };
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
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry, dias: [] };

  // Qué días hay que pedir
  const fechas = [];
  if (sp.get('fecha')) {
    fechas.push(sp.get('fecha'));
  } else {
    const n = Math.min(parseInt(sp.get('dias') || '1', 10), 30);
    for (let i = 1; i <= n; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      fechas.push(fechaCompacta(d));
    }
  }

  try {
    // Los días ya cargados, para no repetirlos
    const { data: yaCargados } = await supabase
      .from('boe_sync_log')
      .select('fecha')
      .in('fecha', fechas.map(aFecha).filter(Boolean));
    const hechos = new Set((yaCargados || []).map((r) => r.fecha));

    const documentos = [];
    const topics = [];
    const referencias = [];
    const registros = [];

    for (const f of fechas) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }
      if (!sp.get('fecha') && hechos.has(aFecha(f))) {
        informe.dias.push({ fecha: f, estado: 'ya cargado' });
        continue;
      }

      const sum = await pedir(`${BASE}/datosabiertos/api/boe/sumario/${f}`, 'application/json');
      if (!sum.ok) {
        // Domingos y festivos no hay boletín: no es un error
        informe.dias.push({ fecha: f, estado: sum.status === 404 ? 'sin boletín' : `HTTP ${sum.status}` });
        registros.push({ fecha: aFecha(f), n_items: 0, n_cargados: 0, estado: 'vacio' });
        continue;
      }

      let json = null;
      try {
        json = JSON.parse(sum.texto);
      } catch {}
      const items = json ? itemsDelSumario(json) : [];

      // Cada documento aparte, para sus materias y referencias
      let cargados = 0;
      let descartados = 0;
      for (let i = 0; i < items.length; i += PARALELO) {
        if (Date.now() - t0 > PRESUPUESTO_MS) break;
        const grupo = items.slice(i, i + PARALELO);
        const res = await Promise.all(grupo.map((it) => pedir(`${BASE}/diario_boe/xml.php?id=${it.id}`, 'application/xml')));

        res.forEach((r, k) => {
          const it = grupo[k];
          if (!r.ok) return;
          const d = parsearDocumento(r.texto);

          // Los documentos de personal que no son de altos cargos se
          // descartan aquí: hay que pedirlos igual para ver su alerta,
          // pero no se guardan.
          if (!interesa(it.seccion, d.alertas)) {
            descartados += 1;
            return;
          }

          documentos.push({
            id: it.id,
            slug: `${slugify(it.titulo)}-${it.id.split('-').pop()}`,
            fecha_publicacion: aFecha(f),
            fecha_disposicion: aFecha(d.fecha_disposicion),
            seccion: it.seccion,
            seccion_nombre: it.seccion_nombre,
            departamento_codigo: d.departamento?.codigo || it.departamento_codigo,
            departamento: d.departamento?.valor || it.departamento,
            rango_codigo: d.rango?.codigo || null,
            rango: d.rango?.valor || null,
            origen: d.origen?.valor || null,
            numero_oficial: d.numero_oficial || null,
            titulo: it.titulo,
            url_pdf: it.url_pdf || null,
            url_html: it.url_html || null,
            derogado: d.derogado,
            fecha_vigencia: aFecha(d.fecha_vigencia),
            updated_at: new Date().toISOString(),
          });

          for (const m of d.materias) topics.push({ document_id: it.id, kind: 'materia', codigo: m.codigo, valor: m.valor });
          for (const a of d.alertas) topics.push({ document_id: it.id, kind: 'alerta', codigo: a.codigo, valor: a.valor });
          for (const rf of d.referencias) {
            referencias.push({
              document_id: it.id,
              referencia_id: rf.referencia_id,
              direccion: rf.direccion,
              palabra_codigo: rf.palabra_codigo || '',
              palabra: rf.palabra,
              texto: rf.texto,
            });
          }
          cargados += 1;
        });

        await espera(PAUSA_MS);
      }

      // Solo se marca el día como hecho si se cargó entero. Si el
      // presupuesto de tiempo lo cortó a la mitad, se deja sin registrar
      // para que la próxima ejecución lo repita — si no, quedaría a
      // medias para siempre.
      // El día está completo si se revisaron todos, aunque algunos se
      // descartaran por no ser de interés.
      const completo = cargados + descartados === items.length;
      informe.dias.push({ fecha: f, items: items.length, cargados, descartados, completo });
      if (completo) {
        registros.push({ fecha: aFecha(f), n_items: items.length, n_cargados: cargados, estado: 'ok' });
      }
    }

    informe.documentos = documentos.length;
    informe.topics = topics.length;
    informe.referencias = referencias.length;
    informe.por_seccion = documentos.reduce((acc, d) => {
      acc[d.seccion] = (acc[d.seccion] || 0) + 1;
      return acc;
    }, {});
    informe.alertas_distintas = [...new Set(topics.filter((t) => t.kind === 'alerta').map((t) => t.valor))].length;

    if (dry) {
      informe.muestra = documentos.slice(0, 3);
      informe.muestra_alertas = [...new Set(topics.filter((t) => t.kind === 'alerta').map((t) => t.valor))].slice(0, 12);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    informe.escritura = {
      documentos: await escribir(supabase, 'boe_documents', documentos, 'id'),
      topics: await escribir(supabase, 'boe_document_topics', topics, 'document_id,kind,codigo'),
      referencias: await escribir(
        supabase,
        'boe_references',
        referencias,
        'document_id,referencia_id,direccion,palabra_codigo'
      ),
      registro: await escribir(supabase, 'boe_sync_log', registros, 'fecha'),
    };

    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
