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
const LOTE_POR_DEFECTO = 4;
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

// "11 de septiembre de 2026" -> "2026-09-11"
function fechaISO(texto) {
  if (!texto) return null;
  const m = String(texto).toLowerCase().match(/(\d{1,2})\s+de\s+([a-zñ]+)\s+de\s+(\d{4})/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

/**
 * Extrae los trámites abiertos de la página.
 *
 * Se hace con el modelo y no con expresiones regulares porque cada
 * ministerio maqueta distinto: Sanidad usa listas anidadas, Trabajo e
 * Inclusión una aplicación con parámetros, Interior una tabla. Un parser
 * por ministerio serían 22 parsers que se rompen con cada rediseño.
 */
async function extraer(texto, tipo, urlOrigen) {
  const prompt = `Extrae los trámites de participación pública ABIERTOS de esta página del Ministerio.

Devuelve SOLO un array JSON, sin texto alrededor ni bloques de código. Cada elemento:
{"titulo": "...", "fecha_inicio": "...", "fecha_fin": "...", "buzon": "...", "referencia": "...", "asunto_requerido": "...", "url_documento": "..."}

Reglas:
- Solo los trámites ABIERTOS. Ignora los cerrados o archivados.
- Copia las fechas TAL CUAL aparecen ("11 de septiembre de 2026").
- "buzon" es la dirección de correo para enviar aportaciones.
- "referencia" es el código de expediente si lo hay (ej. "DG/72/26"); si no, null.
- "asunto_requerido" es el formato de asunto exigido si se indica; si no, null.
- Si un campo no aparece, pon null. NO inventes ningún valor.
- Si no hay trámites abiertos, devuelve [].

Página (${tipo}) — ${urlOrigen}:

${texto.slice(0, 60000)}`;

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
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);

  const data = await r.json();
  const bruto = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .replace(/```json|```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(bruto);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error(`respuesta no parseable: ${bruto.slice(0, 200)}`);
  }
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
    .order('prioridad', { ascending: true })
    .order('ultima_captura', { ascending: true, nullsFirst: true })
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
        headers: { 'user-agent': 'GovTalent/1.0 (+https://govtalent.app; hola@govtalent.app)' },
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

      const items = await extraer(texto, f.tipo, f.url);

      // Vinculo con el organigrama, si ese ministerio lo tiene cargado.
      const { data: fuenteOrg } = await supabase
        .from('organigrama_fuentes')
        .select('id')
        .eq('ministerio', f.ministerio)
        .maybeSingle();

      let insertadas = 0;
      const descartadas = [];

      for (const it of items) {
        if (!it?.titulo) continue;

        const inicio = fechaISO(it.fecha_inicio);
        const fin = fechaISO(it.fecha_fin);

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
          tipo: f.tipo,
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
      conError ? `errores ${conError}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 2000),
  });

  return NextResponse.json({ lote, nuevas, actualizadas, sin_cambios: sinCambios, resultados, ms });
}
