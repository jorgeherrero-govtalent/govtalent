// =====================================================================
// RESUMEN DEL CONSEJO DE MINISTROS
// lib/resumenConsejo.js
//
// Lo que lleva el correo del Consejo (app/api/alerts/consejo):
//
//   generarResumen()   la IA lee el sumario y la «Ampliación de
//                      contenidos» de la Referencia y devuelve, por tipo
//                      de norma, un titular corto y una o dos frases de
//                      cada punto. Solo con datos del texto oficial.
//   resumenSinIA()     lo mismo con los títulos oficiales, si la IA falla:
//                      el correo sale igual, más seco.
//   seguimientosQueCitan()  qué acuerdos citan una norma que cada usuario
//                      sigue (mismo cruce que el sync del Consejo).
//
// Todo lo que devuelve la IA se comprueba contra los acuerdos guardados:
// un id que no existe se descarta, y un punto sin ids también.
//
// Solo servidor. Usa la clave de Anthropic.
// =====================================================================

import { MODELO } from '@/lib/agenteAlarmas';
import { citas } from '@/lib/consejo';

const TIMEOUT_IA_MS = 200000;

const SISTEMA = `Eres un analista de asuntos públicos que escribe el resumen del Consejo de Ministros para profesionales de relaciones institucionales en España.

Te doy los puntos del SUMARIO de la Referencia oficial (cada uno con su id, tipo y ministerio) y el texto de la AMPLIACIÓN DE CONTENIDOS.

Devuelve SOLO un objeto JSON, sin texto alrededor ni markdown:
{
  "asunto": "...",
  "reales_decretos_ley": [ { "ids": ["..."], "titulo": "...", "resumen": "..." } ],
  "reales_decretos":     [ { "ids": ["..."], "titulo": "...", "resumen": "..." } ],
  "destacados":          [ { "ids": ["..."], "titulo": "...", "resumen": "..." } ],
  "nombramientos":       [ { "id": "...", "texto": "..." } ]
}

Reglas:
- Usa SOLO información del sumario y de la ampliación. Ninguna cifra, fecha o dato que no esté en el texto. Si la ampliación no explica un punto, el resumen dice qué regula a partir de su título, sin inventar efectos.
- "titulo": 3 a 10 palabras, en minúscula salvo la primera y los nombres propios. Qué es, no el nombre oficial completo ("Rebaja de carburantes y tope al butano", no "REAL DECRETO-LEY por el que se adoptan…").
- "resumen": una o dos frases, máximo 220 caracteres, con lo que cambia y las cifras clave si las hay. Tono neutro y profesional: sin adjetivos valorativos ni lenguaje de propaganda.
- "reales_decretos_ley": todos los de tipo real_decreto_ley, uno por elemento.
- "reales_decretos": todos los de tipo real_decreto. Puedes agrupar en UN elemento las subvenciones de concesión directa (con todos sus ids), nombrando los beneficiarios en el resumen.
- "destacados": entre 2 y 4 puntos del resto (acuerdos, informes, proyectos de ley, anteproyectos) con más impacto para empresas, sectores o territorios. Si hay proyectos o anteproyectos de ley, van siempre. Puedes agrupar acuerdos del mismo ministerio y objeto (p. ej. varios contratos de Defensa) con la suma de importes si está en el texto.
- "nombramientos": uno por cada punto de tipo nombramiento, como "Nombre Apellidos, cargo" con el nombre en mayúsculas y minúsculas normales y el cargo abreviado ("DG de Carreteras").
- "asunto": máximo 90 caracteres. Empieza por "Consejo de Ministros: " y nombra lo más relevante.
- Los ids se copian tal cual de la lista.`;

function leerJSON(texto) {
  const limpio = String(texto || '').replace(/```json|```/g, '').trim();
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio < 0 || fin < inicio) throw new Error('La IA no devolvió JSON');
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

async function llamarIA(user, maxTokens) {
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
        messages: [{ role: 'user', content: user }],
      }),
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    if (data.stop_reason === 'max_tokens') throw new Error('La respuesta de la IA llegó cortada');
    return leerJSON((data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'La IA ha tardado demasiado' : e.message);
  } finally {
    clearTimeout(reloj);
  }
}

const corta = (t, n) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};

/** Cuántos puntos hay de cada tipo, para la entradilla. */
export function conteos(acuerdos) {
  const c = { real_decreto_ley: 0, real_decreto: 0, nombramiento: 0, resto: 0 };
  for (const a of acuerdos) {
    if (a.tipo in c) c[a.tipo] += 1;
    else c.resto += 1;
  }
  return c;
}

/**
 * Comprueba y limpia lo que devuelve la IA. Lo que no se pueda
 * comprobar se tira; si falta un real decreto-ley o un real decreto, se
 * añade con su título oficial para que no se pierda ninguno.
 */
function validar(r, acuerdos) {
  const porId = new Map(acuerdos.map((a) => [a.id, a]));
  const usados = new Set();
  const lista = (v, tipos, max) =>
    (Array.isArray(v) ? v : [])
      .map((x) => {
        const ids = (Array.isArray(x?.ids) ? x.ids : []).map(String).filter((id) => porId.has(id) && (!tipos || tipos.includes(porId.get(id).tipo)));
        if (ids.length === 0 || !x?.titulo) return null;
        ids.forEach((id) => usados.add(id));
        return { ids, titulo: corta(x.titulo, 90), resumen: corta(x.resumen, 260) };
      })
      .filter(Boolean)
      .slice(0, max);

  const rdl = lista(r.reales_decretos_ley, ['real_decreto_ley'], 20);
  const rd = lista(r.reales_decretos, ['real_decreto'], 20);
  const destacados = lista(r.destacados, null, 4).filter((d) => d.ids.every((id) => !['real_decreto_ley', 'real_decreto', 'nombramiento'].includes(porId.get(id).tipo)));

  // Ninguna norma se queda fuera
  for (const a of acuerdos) {
    if (usados.has(a.id)) continue;
    if (a.tipo === 'real_decreto_ley') rdl.push({ ids: [a.id], titulo: tituloOficialCorto(a.titulo), resumen: '' });
    if (a.tipo === 'real_decreto') rd.push({ ids: [a.id], titulo: tituloOficialCorto(a.titulo), resumen: '' });
  }

  const nombramientos = (Array.isArray(r.nombramientos) ? r.nombramientos : [])
    .filter((n) => porId.get(String(n?.id))?.tipo === 'nombramiento' && n.texto)
    .map((n) => ({ id: String(n.id), texto: corta(n.texto, 140) }));
  const conNombre = new Set(nombramientos.map((n) => n.id));
  for (const a of acuerdos) {
    if (a.tipo === 'nombramiento' && !conNombre.has(a.id)) nombramientos.push({ id: a.id, texto: tituloOficialCorto(a.titulo) });
  }

  return {
    asunto: corta(r.asunto, 110),
    reales_decretos_ley: rdl,
    reales_decretos: rd,
    destacados,
    nombramientos,
  };
}

/**
 * El título oficial, legible: «REAL DECRETO-LEY por el que…» → «Real
 * decreto-ley por el que…», acortado. Es lo que sale cuando la IA no
 * ha dado un titular.
 */
export function tituloOficialCorto(titulo) {
  const t = String(titulo || '').replace(
    /^(REAL DECRETO(?:[- ]LEY| LEGISLATIVO)?|ACUERDOS?|INFORMES?|ORDEN(?:ES)?|DECLARACI[OÓ]N(?: INSTITUCIONAL)?|PROYECTO DE LEY(?: ORG[AÁ]NICA)?|ANTEPROYECTO DE LEY(?: ORG[AÁ]NICA)?)\b/,
    (m) => m.charAt(0) + m.slice(1).toLowerCase()
  );
  return corta(t, 160);
}

/** El resumen sin IA: títulos oficiales, agrupados igual. */
export function resumenSinIA(acuerdos) {
  const item = (a) => ({ ids: [a.id], titulo: tituloOficialCorto(a.titulo), resumen: '' });
  const c = conteos(acuerdos);
  return {
    asunto: `Consejo de Ministros: ${c.real_decreto_ley === 1 ? '1 real decreto-ley' : `${c.real_decreto_ley} reales decretos-ley`} y ${c.real_decreto === 1 ? '1 real decreto' : `${c.real_decreto} reales decretos`}`,
    reales_decretos_ley: acuerdos.filter((a) => a.tipo === 'real_decreto_ley').map(item),
    reales_decretos: acuerdos.filter((a) => a.tipo === 'real_decreto').map(item),
    destacados: acuerdos.filter((a) => ['proyecto_ley', 'anteproyecto'].includes(a.tipo)).slice(0, 4).map(item),
    nombramientos: acuerdos.filter((a) => a.tipo === 'nombramiento').map((a) => ({ id: a.id, texto: tituloOficialCorto(a.titulo) })),
  };
}

/**
 * El resumen de una Referencia. Si la IA falla, el de títulos: el correo
 * no se queda sin salir por eso.
 *
 * Devuelve { resumen, modelo, error? }.
 */
export async function generarResumen({ acuerdos, ampliacion, fecha }) {
  const sumario = acuerdos
    .map((a) => `- id=${a.id} | ${a.tipo} | ${a.ministerio || a.seccion || '—'} | ${a.titulo}`)
    .join('\n');
  const user = `CONSEJO DE MINISTROS DEL ${fecha}\n\nSUMARIO:\n${sumario}\n\nAMPLIACIÓN DE CONTENIDOS:\n${ampliacion || '(no disponible)'}`;
  try {
    // 12.000 tokens de respuesta y, si aun así llega cortada, un segundo
    // intento con el doble. Con 6.000, el Consejo del 29-09-2026 (67
    // puntos) llegaba cortado y el correo salía con los títulos.
    let r;
    try {
      r = await llamarIA(user, 12000);
    } catch (e) {
      if (!/cortada/.test(e.message)) throw e;
      r = await llamarIA(user, 24000);
    }
    const resumen = validar(r, acuerdos);
    if (!resumen.asunto) resumen.asunto = resumenSinIA(acuerdos).asunto;
    return { resumen, modelo: MODELO };
  } catch (e) {
    return { resumen: resumenSinIA(acuerdos), modelo: 'sin_ia', error: e.message };
  }
}

/**
 * Por usuario, los acuerdos que citan una norma que sigue: una ley en
 * tramitación que modifica la Ley 24/2013 y un real decreto que la
 * desarrolla comparten «ley 24/2013». Mismo cruce que el sync.
 *
 * Devuelve Map user_id → [{ acuerdo, cita, label }].
 */
export async function seguimientosQueCitan(db, acuerdos, userIds = null) {
  const conCitas = acuerdos.filter((a) => (a.citas || []).length > 0);
  const porUsuario = new Map();
  if (conCitas.length === 0) return porUsuario;

  let q = db.from('follows').select('user_id, kind, ref_id, label');
  if (userIds) q = q.in('user_id', userIds);
  const { data: follows } = await q;
  if (!follows?.length) return porUsuario;

  const refs = [...new Set(follows.map((f) => f.ref_id))];
  const titulos = new Map();
  for (let i = 0; i < refs.length; i += 100) {
    const { data } = await db.from('regulatorio_search').select('kind, ref_id, titulo').in('ref_id', refs.slice(i, i + 100));
    for (const r of data || []) titulos.set(`${r.kind}|${r.ref_id}`, r.titulo);
  }

  for (const f of follows) {
    const titulo = titulos.get(`${f.kind}|${f.ref_id}`) || f.label || '';
    const suyas = citas(titulo);
    if (suyas.length === 0) continue;
    for (const ac of conCitas) {
      const cita = ac.citas.find((c) => suyas.includes(c));
      if (!cita) continue;
      if (!porUsuario.has(f.user_id)) porUsuario.set(f.user_id, []);
      const lista = porUsuario.get(f.user_id);
      if (!lista.some((x) => x.acuerdo.id === ac.id)) lista.push({ acuerdo: ac, cita, label: f.label || titulo });
    }
  }
  return porUsuario;
}
