// =====================================================================
// LECTOR DE BOLETINES PARLAMENTARIOS CON IA
// lib/lectorBoletines.js
//
// Recibe el PDF de un boletín oficial de un parlamento autonómico y
// devuelve los actos de tramitación LEGISLATIVA que contiene: admisión a
// trámite, apertura y ampliación del plazo de enmiendas, enmiendas a la
// totalidad, ponencia, dictamen, pleno, aprobación, retirada…, cada uno
// con su expediente, fecha, plazo y la página del PDF de la que sale.
//
// Lo de control e impulso (preguntas, PNL, mociones, interpelaciones) se
// ignora: es la fase 4.
//
// El PDF va entero a la IA como documento: lee el texto y la maquetación,
// y puede citar la página. Disciplina de nulos: lo que no esté escrito en
// el boletín se devuelve como null, nunca deducido.
//
// guardarActos() escribe en ccaa_expedientes y ccaa_tramites (sql/64).
// =====================================================================

import { MODELO } from '@/lib/agenteAlarmas';
import { mismoTitulo } from '@/lib/ccaa/comun';
import { PARLAMENTOS, claveExpediente, idExpediente, slugExpediente, tipoNorm, fechaISO, finDePlazo } from '@/lib/parlamentosAutonomicos';

const TIMEOUT_IA_MS = 240000;
// Límite práctico de la API para PDF. Por encima, el boletín se marca como
// omitido y se lee por otra vía (p. ej. Castilla y León publica cada
// entrada por separado).
export const MAX_PDF_KB = 25000;

const ACTOS = [
  'registro', 'admision', 'publicacion', 'toma_consideracion', 'criterio_gobierno',
  'plazo_enmiendas', 'ampliacion_plazo', 'enmiendas_totalidad', 'enmiendas_parciales',
  'comparecencias', 'ponencia', 'comision', 'dictamen', 'pleno',
  'aprobacion', 'rechazo', 'retirada', 'caducidad', 'otro',
];

const SISTEMA = `Eres un letrado parlamentario que vacía boletines oficiales de parlamentos autonómicos españoles para una base de datos de seguimiento legislativo.

Extraes SOLO actos de tramitación de iniciativas legislativas: proyectos de ley, proposiciones de ley, decretos-ley (convalidación o tramitación como proyecto), iniciativas legislativas populares, presupuestos y ley de medidas o de acompañamiento. Ignora preguntas, proposiciones no de ley, mociones, interpelaciones, solicitudes de información, comparecencias que no sean de un expediente legislativo, nombramientos y cuestiones de personal.

Reglas:
- Un elemento por cada acto y expediente, sin repetir el mismo acto. Si el boletín publica a la vez el texto del proyecto, su admisión y la apertura del plazo de enmiendas, son tres actos.
- Copia el número de expediente tal como está impreso. Si no aparece, null.
- Fechas en formato AAAA-MM-DD. Convierte con cuidado el mes escrito en letra («30 de septiembre» es 09-30, no 10-30). Usa el año del boletín cuando el texto omite el año. Si una fecha no está escrita, null: nunca la deduzcas.
- Un acto publicado en el boletín ocurrió antes o el mismo día que el boletín: su fecha_acto nunca es posterior a la del boletín.
- Si el plazo se da en días («cinco días», «quince días hábiles») sin fecha final escrita, plazo_hasta es null y lo indicas en la descripción.
- plazo_hasta: solo para plazos (enmiendas, ampliaciones, comparecencias), el último día del plazo. hora_plazo, si se indica («hasta las 14 horas» → "14:00").
- fecha_acto: la fecha del acuerdo o del acto (p. ej. la reunión de la Mesa), no la del boletín, si está escrita.
- pagina: la página del PDF donde aparece el acto (la del archivo, empezando en 1).
- descripcion: una frase breve y literal o casi literal del acto (máximo 200 caracteres).
- Si el texto no está en castellano, titulo_es es la traducción al castellano del título; si está en castellano, null.
- leyes_modificadas: solo para la ley de medidas o de acompañamiento (o leyes ómnibus), la lista de leyes que modifica si el boletín las enumera; si no, null.

Devuelve SOLO un JSON válido, sin texto alrededor:
{"actos": [{"num_expediente": string|null, "tipo_iniciativa": string, "titulo": string, "titulo_es": string|null, "autor": string|null, "comision": string|null, "acto": "${ACTOS.join('"|"')}", "fecha_acto": string|null, "plazo_hasta": string|null, "hora_plazo": string|null, "organo": string|null, "descripcion": string, "pagina": number|null, "leyes_modificadas": [{"ley": string, "materia": string|null}]|null}]}

Si no hay ningún acto legislativo, {"actos": []}.`;

function leerJSON(texto) {
  const limpio = String(texto || '').replace(/```json|```/g, '');
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio < 0 || fin < inicio) throw new Error('La IA no devolvió JSON');
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

async function llamarIA(pdfBase64, contexto, maxTokens) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_IA_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: maxTokens,
        system: SISTEMA,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: contexto },
          ],
        }],
      }),
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    if (data.stop_reason === 'max_tokens') {
      const e = new Error('La respuesta de la IA llegó cortada');
      e.cortada = true;
      throw e;
    }
    return leerJSON((data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('La IA ha tardado demasiado');
    throw e;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Lee un boletín. `pdf` es un Buffer con el PDF.
 * Devuelve { actos, modelo }. Lanza si la IA falla.
 */
export async function leerBoletin({ parlamento, numero, fecha, pdf }) {
  const p = PARLAMENTOS[parlamento];
  const contexto = `Boletín: ${p?.boletin || 'boletín oficial'} ${numero || ''} del ${p?.nombre || parlamento}${fecha ? `, de ${fecha}` : ''}.\nExtrae los actos de tramitación legislativa.`;
  const b64 = Buffer.from(pdf).toString('base64');
  let json;
  try {
    json = await llamarIA(b64, contexto, 16000);
  } catch (e) {
    if (!e.cortada) throw e;
    json = await llamarIA(b64, contexto, 32000);
  }
  const actos = (Array.isArray(json?.actos) ? json.actos : [])
    .filter((a) => a && ACTOS.includes(a.acto) && String(a.titulo || '').trim())
    .map((a) => ({
      num_expediente: a.num_expediente ? String(a.num_expediente).trim() : null,
      tipo_iniciativa: String(a.tipo_iniciativa || '').trim() || null,
      titulo: String(a.titulo).replace(/\s+/g, ' ').trim(),
      titulo_es: a.titulo_es ? String(a.titulo_es).replace(/\s+/g, ' ').trim() : null,
      autor: a.autor || null,
      comision: a.comision || null,
      acto: a.acto,
      fecha_acto: fechaISO(a.fecha_acto),
      plazo_hasta: fechaISO(a.plazo_hasta),
      hora_plazo: a.hora_plazo || null,
      organo: a.organo || null,
      descripcion: String(a.descripcion || '').slice(0, 300) || null,
      pagina: Number.isInteger(a.pagina) && a.pagina > 0 ? a.pagina : null,
      leyes_modificadas: Array.isArray(a.leyes_modificadas) && a.leyes_modificadas.length ? a.leyes_modificadas : null,
    }));
  return { actos, modelo: MODELO };
}

// Control de fechas de la IA: un acto publicado no puede ser posterior al
// boletín (ni de hace más de un año), y un plazo no puede acabar antes del
// boletín ni más de seis meses después. Lo que no cuadra se descarta
// (y el acto queda con la fecha del boletín), en vez de guardar una fecha
// equivocada.
const DIA = 86400000;
function fechaCreible(f, fBoletin) {
  if (!f) return null;
  if (!fBoletin) return f;
  const d = (Date.parse(fBoletin) - Date.parse(f)) / DIA;
  return d >= 0 && d <= 366 ? f : null;
}
function plazoCreible(f, fBoletin) {
  if (!f) return false;
  if (!fBoletin) return true;
  const d = (Date.parse(f) - Date.parse(fBoletin)) / DIA;
  return d >= -1 && d <= 183;
}

/**
 * Guarda los actos de un boletín. Los que no traen número de expediente
 * no se pueden atribuir con seguridad: se cuentan y se descartan.
 * Devuelve { expedientes_nuevos, tramites_nuevos, sin_expediente }.
 */
export async function guardarActos(db, { parlamento, boletin, actos }) {
  const r = { expedientes_nuevos: 0, tramites_nuevos: 0, sin_expediente: 0 };
  // Expedientes ya conocidos del parlamento: si el número impreso en el
  // boletín no coincide con ninguno (cada fuente lo escribe a su manera),
  // se casa por título antes de crear uno nuevo.
  const { data: conocidos } = await db.from('ccaa_expedientes').select('id, titulo, titulo_es, raw').eq('parlamento', parlamento);
  const ids = new Set((conocidos || []).map((e) => e.id));
  const porExp = new Map();
  for (const a of actos) {
    if (!a.num_expediente || !claveExpediente(a.num_expediente)) { r.sin_expediente += 1; continue; }
    let id = idExpediente(parlamento, a.num_expediente);
    if (!ids.has(id)) {
      const igual = (conocidos || []).find((e) => mismoTitulo(e.titulo, a.titulo) || (a.titulo_es && mismoTitulo(e.titulo, a.titulo_es)) || (e.titulo_es && mismoTitulo(e.titulo_es, a.titulo)));
      if (igual) {
        id = igual.id;
        // Número provisional (Aragón: la ficha no lo da): se sustituye por
        // el que imprime el boletín.
        if (igual.raw?.num_provisional) {
          await db.from('ccaa_expedientes').update({ num_expediente: a.num_expediente, raw: { ...igual.raw, num_provisional: false } }).eq('id', id);
          igual.raw = { ...igual.raw, num_provisional: false };
        }
      }
    }
    if (!porExp.has(id)) porExp.set(id, []);
    porExp.get(id).push(a);
  }

  for (const [id, lista] of porExp) {
    const a0 = lista[0];
    const { data: existente } = await db.from('ccaa_expedientes').select('id, plazo_enmiendas, leyes_modificadas').eq('id', id).maybeSingle();
    if (!existente) {
      const { error } = await db.from('ccaa_expedientes').insert({
        id,
        parlamento,
        legislatura: PARLAMENTOS[parlamento]?.legislatura || null,
        num_expediente: a0.num_expediente,
        tipo: a0.tipo_iniciativa,
        tipo_norm: tipoNorm(a0.tipo_iniciativa, a0.titulo),
        titulo: a0.titulo,
        titulo_es: a0.titulo_es,
        autor: a0.autor,
        comision: lista.find((x) => x.comision)?.comision || null,
        url: boletin.url_pdf || boletin.url,
        slug: slugExpediente(parlamento, a0.num_expediente),
        fuente: 'boletin',
        synced_at: new Date().toISOString(),
      });
      if (!error) r.expedientes_nuevos += 1;
    }

    // Un acto de cada tipo por expediente y boletín: si la IA devuelve el
    // mismo acto dos veces (p. ej. una con fecha y otra sin ella), se queda
    // el que tiene una fecha creíble.
    const unicos = new Map();
    for (const a of lista) {
      const previo = unicos.get(a.acto);
      if (!previo || (!fechaCreible(previo.fecha_acto, boletin.fecha) && fechaCreible(a.fecha_acto, boletin.fecha))) unicos.set(a.acto, a);
    }
    const filas = [...unicos.values()].map((a) => ({
      expediente_id: id,
      tipo: a.acto,
      fecha: fechaCreible(a.fecha_acto, boletin.fecha) || boletin.fecha || null,
      plazo_hasta: plazoCreible(a.plazo_hasta, boletin.fecha) ? finDePlazo(a.plazo_hasta, a.hora_plazo) : null,
      descripcion: a.descripcion,
      organo: a.organo,
      boletin_id: boletin.id,
      pagina: a.pagina,
      url: boletin.url_pdf ? `${boletin.url_pdf}${a.pagina ? `#page=${a.pagina}` : ''}` : boletin.url,
      origen: 'boletin_ia',
    }));
    const { data: insertadas } = await db
      .from('ccaa_tramites')
      .upsert(filas, { onConflict: 'expediente_id,tipo,fecha,plazo_hasta', ignoreDuplicates: true })
      .select('id');
    r.tramites_nuevos += insertadas?.length || 0;

    // Plazo de enmiendas vigente: el más tardío conocido. Ampliaciones:
    // cuántas hay guardadas.
    const plazos = filas.filter((f) => ['plazo_enmiendas', 'ampliacion_plazo'].includes(f.tipo) && f.plazo_hasta).map((f) => f.plazo_hasta);
    const cambios = { updated_at: new Date().toISOString() };
    const ultimo = [existente?.plazo_enmiendas, ...plazos].filter(Boolean).sort().pop();
    if (ultimo && ultimo !== existente?.plazo_enmiendas) cambios.plazo_enmiendas = ultimo;
    if (filas.some((f) => f.tipo === 'ampliacion_plazo')) {
      const { count } = await db.from('ccaa_tramites').select('id', { count: 'exact', head: true }).eq('expediente_id', id).eq('tipo', 'ampliacion_plazo');
      cambios.n_ampliaciones = count || 0;
    }
    const cierre = lista.find((a) => ['aprobacion', 'rechazo', 'retirada', 'caducidad'].includes(a.acto));
    if (cierre) {
      cambios.is_closed = true;
      cambios.resultado = { aprobacion: 'aprobada', rechazo: 'rechazada', retirada: 'retirada', caducidad: 'caducada' }[cierre.acto];
    }
    const leyes = lista.find((a) => a.leyes_modificadas)?.leyes_modificadas;
    if (leyes && !existente?.leyes_modificadas) cambios.leyes_modificadas = leyes;
    await db.from('ccaa_expedientes').update(cambios).eq('id', id);
  }
  return r;
}
