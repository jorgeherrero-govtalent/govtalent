// =====================================================================
// SYNC — Comisiones del Congreso y su composición
// app/api/sync/congreso-comisiones/route.js
//
// FUENTE: endpoint opendataExport de congreso.es, uno por comisión.
// Los suborganos son correlativos (301 Constitucional, 302 Asuntos
// Exteriores), así que se recorre un rango y se conservan los que
// devuelvan miembros. Es más robusto que mantener una lista fija: si el
// Congreso crea una comisión nueva, aparece sola.
//
// CABE EN UNA PASADA: unas 40 peticiones ligeras.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin escribir
//   ?key=<DEBUG_KEY>              carga real
//   ?desde=300&hasta=345          ajustar el rango
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = 'https://www.congreso.es/es/organos/composicion-en-la-legislatura';

// Sin cabeceras de navegador el portal responde 403.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/html,*/*',
  'Accept-Language': 'es-ES,es;q=0.9',
  // El endpoint es una llamada interna de Liferay: sin Referer del
  // propio sitio suele devolver la página en vez del JSON.
  Referer: 'https://www.congreso.es/es/organos/composicion-en-la-legislatura',
};

// El rango cubre las comisiones conocidas con margen por arriba y por
// abajo. Los huecos se descartan solos al no devolver miembros.
const DESDE = 295;
const HASTA = 350;
const PARALELO = 4;
const PAUSA_MS = 250;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js cachea los GET del cliente de Supabase y hace que el sync
      // lea siempre lo mismo.
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function urlComision(suborgano, legislatura = 'XV') {
  // searchOrgano, no opendataExport: el segundo devuelve HTTP 400.
  // Verificado en el panel de red, que es lo que usa la propia página.
  // Tampoco lleva statusOpenData.
  const p = new URLSearchParams({
    p_p_id: 'organos',
    p_p_lifecycle: '2',
    p_p_state: 'normal',
    p_p_mode: 'view',
    p_p_resource_id: 'searchOrgano',
    p_p_cacheability: 'cacheLevelPage',
    _organos_selectedLegislatura: legislatura,
    _organos_selectedOrganoSup: '1',
    _organos_selectedSuborgano: String(suborgano),
  });
  return `${BASE}?${p.toString()}`;
}

async function pedirComision(suborgano) {
  try {
    const res = await fetch(urlComision(suborgano), { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) return { suborgano, ok: false, motivo: `HTTP ${res.status}` };
    const txt = await res.text();
    // Un suborgano inexistente devuelve HTML o una lista vacía, no un
    // error: hay que comprobar la forma, no el código de estado.
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      return { suborgano, ok: false, motivo: 'no es JSON' };
    }
    // La respuesta viene envuelta: {"data":[...]}, no es un array suelto.
    const lista = Array.isArray(data) ? data : data?.data;
    if (!Array.isArray(lista) || lista.length === 0) {
      return { suborgano, ok: false, motivo: 'sin miembros' };
    }
    return { suborgano, ok: true, data: lista };
  } catch (e) {
    return { suborgano, ok: false, motivo: e.message };
  }
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

// "04/12/2023" -> "2023-12-04"
function fechaEs(f) {
  if (!f) return null;
  const m = String(f).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Orden de peso de los cargos.
 *
 * Los portavoces van justo después de la mesa y por delante de vocales
 * y adscritos: en una comisión quien negocia por cada grupo es el
 * portavoz, y es a quien busca un profesional de asuntos públicos.
 */
const ORDEN_CARGOS = [
  // Sin anclar al final: hay comisiones donde el cargo llega como
  // "Presidente" a secas y otras con matices.
  [/^president/i, 1],
  [/^vicepresident/i, 2],
  [/^secretari[oa]/i, 3],
  [/^portavoces adjuntos/i, 5],
  [/^portavoc/i, 4],
  [/^vocales/i, 6],
  [/^adscritos/i, 7],
  [/^letrados/i, 8],
];

function ordenCargo(cargo) {
  const hit = ORDEN_CARGOS.find(([re]) => re.test((cargo || '').trim()));
  return hit ? hit[1] : 99;
}

// El tipo se deriva del nombre: el Congreso no lo publica como campo.
function tipoComision(nombre) {
  const n = (nombre || '').toLowerCase();
  if (n.includes('investigación')) return 'investigacion';
  if (n.includes('mixta')) return 'mixta';
  if (n.includes('seguimiento') || n.includes('evaluación')) return 'seguimiento';
  return 'permanente';
}

// "...&codParlamentario=35&idLegislatura=XV" -> "35"
function codParlamentario(url) {
  const m = String(url || '').match(/codParlamentario=(\d+)/);
  return m ? m[1] : null;
}

function normalizar(n) {
  return (n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Escritura verificada: .select() devuelve las filas afectadas, así el
// informe cuenta cambios reales y no llamadas sin error.
async function escribir(supabase, tabla, filas, conflicto, devolver) {
  if (filas.length === 0) return { escritas: 0, errores: [] };
  let escritas = 0;
  const errores = [];
  const salida = [];
  for (let i = 0; i < filas.length; i += 100) {
    const grupo = filas.slice(i, i + 100);
    const { data, error } = await supabase
      .from(tabla)
      .upsert(grupo, { onConflict: conflicto })
      .select(devolver || conflicto.split(',')[0]);
    if (error) errores.push(error.message);
    else {
      escritas += Array.isArray(data) ? data.length : 0;
      if (Array.isArray(data)) salida.push(...data);
    }
  }
  return { escritas, errores, filas: salida };
}

export async function GET(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Modo diagnóstico: devuelve la respuesta cruda de un suborgano para
  // ver por qué falla, en vez de suponerlo.
  if (sp.get('probar')) {
    const n = sp.get('probar');
    const url = urlComision(n);
    try {
      const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
      const txt = await res.text();
      let json = null;
      try {
        json = JSON.parse(txt);
      } catch {}
      const lista = Array.isArray(json) ? json : json?.data;
      return NextResponse.json({
        modo: 'probar',
        suborgano: n,
        status: res.status,
        tamano: txt.length,
        // Las claves de la raíz dicen dónde vive el nombre del órgano:
        // en el fichero manual venía en cada registro (NombreOrgano),
        // pero el endpoint puede ponerlo aparte.
        claves_raiz: json && !Array.isArray(json) ? Object.keys(json) : null,
        registros: Array.isArray(lista) ? lista.length : null,
        claves_registro: Array.isArray(lista) && lista[0] ? Object.keys(lista[0]) : null,
        primer_registro: Array.isArray(lista) ? lista[0] : null,
        // Todo lo que no sea la lista: ahí estaría el nombre.
        fuera_de_la_lista: json && !Array.isArray(json)
          ? Object.fromEntries(Object.entries(json).filter(([k]) => k !== 'data'))
          : null,
      });
    } catch (e) {
      return NextResponse.json({ modo: 'probar', suborgano: n, url, error: e.message });
    }
  }

  const dry = sp.get('dry') === '1';
  const desde = parseInt(sp.get('desde') || String(DESDE), 10);
  const hasta = parseInt(sp.get('hasta') || String(HASTA), 10);
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry, rango: [desde, hasta] };

  try {
    // --- Recorrer el rango --------------------------------------------
    const encontradas = [];
    const vacios = [];

    for (let n = desde; n <= hasta; n += PARALELO) {
      const grupo = [];
      for (let k = 0; k < PARALELO && n + k <= hasta; k++) grupo.push(n + k);
      const res = await Promise.all(grupo.map(pedirComision));
      for (const r of res) {
        if (r.ok) encontradas.push(r);
        else vacios.push(r.suborgano);
      }
      await espera(PAUSA_MS);
    }

    informe.comisiones_encontradas = encontradas.length;
    informe.suborganos_vacios = vacios.length;

    if (encontradas.length === 0) {
      return NextResponse.json({ ...informe, error: 'No se encontró ninguna comisión en el rango' }, { status: 502 });
    }

    // --- Transformar ---------------------------------------------------
    const comisiones = [];
    const miembrosPorSuborgano = new Map();

    for (const c of encontradas) {
      // El nombre del órgano viene en cada registro, no en la cabecera.
      const nombre = (c.data[0]?.NombreOrgano || '').trim();
      if (!nombre) continue;

      comisiones.push({
        suborgano_id: c.suborgano,
        legislature_code: 'XV',
        name: nombre,
        slug: slugify(nombre),
        kind: tipoComision(nombre),
        n_members: c.data.length,
        synced_at: new Date().toISOString(),
      });

      // El endpoint devuelve nombres de campo distintos a los del fichero
      // que se descarga a mano: apellidosNombre / descCargo / siglas en
      // lugar de Nombre / Cargo / Grupo. Se aceptan ambos por si acaso.
      miembrosPorSuborgano.set(
        c.suborgano,
        c.data
          .map((m) => {
            const cargo = (m.descCargo || m.Cargo || '').trim();
            return {
              nombre: (m.apellidosNombre || m.Nombre || '').trim(),
              cargo,
              // idCargo da el orden sin depender de expresiones sobre el
              // texto; el diccionario queda como respaldo.
              orden_cargo: typeof m.idCargo === 'number' ? m.idCargo : ordenCargo(cargo),
              grupo: (m.siglas || m.Grupo || '').trim() || null,
              // El identificador oficial del diputado, mucho más fiable
              // que cruzar por nombre. Viene dentro de la URL de su ficha.
              cod_parlamentario: codParlamentario(m.urlFichaDiputado),
              fecha_alta: fechaEs(m.fechaAltaFormat || m.FechaAlta),
              fecha_baja: fechaEs(m.fechaBajaFormat || m.FechaBaja),
            };
          })
          .filter((m) => m.nombre && m.cargo)
      );
    }

    informe.comisiones = comisiones.length;
    informe.miembros = [...miembrosPorSuborgano.values()].reduce((s, l) => s + l.length, 0);
    informe.portavoces = [...miembrosPorSuborgano.values()]
      .flat()
      .filter((m) => /^portavoc/i.test(m.cargo) && !/adjunt/i.test(m.cargo)).length;

    if (dry) {
      informe.muestra_comisiones = comisiones.slice(0, 5).map((c) => ({
        suborgano: c.suborgano_id,
        nombre: c.name,
        tipo: c.kind,
        miembros: c.n_members,
      }));
      const primera = [...miembrosPorSuborgano.values()][0] || [];
      informe.muestra_miembros = primera.slice(0, 6);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // --- Escritura -----------------------------------------------------
    const wCom = await escribir(
      supabase,
      'es_committees',
      comisiones,
      'suborgano_id,legislature_code',
      'id, suborgano_id'
    );
    const idPorSuborgano = new Map((wCom.filas || []).map((c) => [c.suborgano_id, c.id]));

    // Enlace con el directorio de diputados y con los grupos.
    const { data: diputados } = await supabase
      .from('deputies')
      .select('id, full_name, cod_parlamentario')
      .eq('active', true);
    // Se cruza primero por código oficial y solo se cae al nombre si
    // falta: el código es inequívoco y el nombre puede tener variantes.
    const porCodigo = new Map(
      (diputados || []).filter((d) => d.cod_parlamentario).map((d) => [String(d.cod_parlamentario), d.id])
    );
    const porNombre = new Map((diputados || []).map((d) => [normalizar(d.full_name), d.id]));

    const miembros = [];
    let enlazados = 0;
    let porCod = 0;
    for (const [suborgano, lista] of miembrosPorSuborgano) {
      const cid = idPorSuborgano.get(suborgano);
      if (!cid) continue;
      for (const m of lista) {
        let did = m.cod_parlamentario ? porCodigo.get(String(m.cod_parlamentario)) || null : null;
        if (did) porCod += 1;
        else did = porNombre.get(normalizar(m.nombre)) || null;
        if (did) enlazados += 1;
        miembros.push({ ...m, committee_id: cid, deputy_id: did });
      }
    }
    informe.enlazados_por_codigo = porCod;

    // Se reemplazan enteros: si alguien causa baja, un upsert lo dejaría.
    const ids = [...idPorSuborgano.values()];
    for (let i = 0; i < ids.length; i += 50) {
      await supabase.from('es_committee_members').delete().in('committee_id', ids.slice(i, i + 50));
    }
    const wMem = await escribir(supabase, 'es_committee_members', miembros, 'committee_id,nombre,cargo');

    informe.escritura = { comisiones: wCom.escritas, miembros: wMem.escritas, errores: [...wCom.errores, ...wMem.errores] };
    informe.miembros_enlazados = enlazados;
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
