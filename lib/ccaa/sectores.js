// =====================================================================
// Parlamentos autonómicos — sectores de cada expediente
// lib/ccaa/sectores.js
//
// Los sectores son los mismos que usa el directorio del BOE (las
// «alertas» del BOE: Energía, Sanidad, Vivienda y urbanismo…), para que
// el filtro diga lo mismo en todas las pantallas de Regulatorio.
//
// Los parlamentos no clasifican sus iniciativas por materia (o lo hacen
// cada uno a su manera), así que la IA asigna de 1 a 3 sectores a cada
// expediente a partir del título. Solo una vez por expediente: los que
// ya tienen sectores no se vuelven a mandar. Un lote de hasta 100 títulos
// cabe en una sola llamada.
// =====================================================================

import { MODELO } from '@/lib/agenteAlarmas';

export const SECTORES = [
  'Administración de Justicia', 'Administración electrónica', 'Agricultura', 'Alimentación',
  'Asociaciones profesionales', 'Asuntos sociales', 'Comercio', 'Consumidores y usuarios',
  'Cultura y ocio', 'Deporte', 'Derecho Administrativo', 'Derecho Constitucional',
  'Derecho Mercantil', 'Derecho Penal', 'Discapacidad', 'Educación y enseñanza', 'Energía',
  'Extranjería', 'Función Pública', 'Ganadería y animales', 'Industria', 'Medio ambiente',
  'Obras y construcciones', 'Organización de la Administración', 'Pesca',
  'Relaciones internacionales', 'Sanidad', 'Seguridad Social', 'Seguridad y Defensa',
  'Sistema financiero', 'Sistema tributario', 'Tecnología e investigación',
  'Telecomunicaciones', 'Trabajo y empleo', 'Transportes y tráfico', 'Turismo',
  'Unión Europea', 'Vivienda y urbanismo',
];

const LOTE = 100;
const TIMEOUT_MS = 90000;

const SISTEMA = `Clasificas iniciativas legislativas de parlamentos autonómicos españoles por sector.
Para cada iniciativa elige de 1 a 3 sectores de esta lista, copiados exactamente:
${SECTORES.join(' | ')}

Reglas:
- Elige por el contenido que regula, no por quién la presenta.
- Presupuestos generales de una comunidad: "Sistema tributario" y "Organización de la Administración".
- Leyes de acompañamiento o de medidas fiscales y administrativas: "Sistema tributario" y los sectores que el título nombre.
- Si el título no permite saberlo, usa el sector más probable; nunca dejes una iniciativa sin sector.
Responde solo con JSON: {"1": ["Sector", ...], "2": [...]} usando los números de la lista.`;

function leerJSON(texto) {
  const limpio = String(texto || '').replace(/```(?:json)?/g, '');
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio < 0 || fin < inicio) throw new Error('La IA no devolvió JSON');
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

/**
 * Asigna sectores a los expedientes que aún no tienen.
 * Devuelve { clasificados, pendientes } o { error }.
 */
export async function clasificarSectores(db, { max = LOTE } = {}) {
  const { data: filas, error } = await db
    .from('ccaa_expedientes')
    .select('id, titulo, titulo_es, tipo')
    .is('sectores', null)
    .order('updated_at', { ascending: false })
    .limit(Math.min(max, LOTE));
  if (error) return { error: error.message };
  if (!filas?.length) return { clasificados: 0 };

  const lista = filas.map((f, i) => `${i + 1}. ${(f.titulo_es || f.titulo || '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 4000,
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: lista }],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { error: `IA: ${e.message}` };
  }
  if (!res.ok) return { error: `Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  if (data.stop_reason === 'max_tokens') return { error: 'La respuesta de la IA llegó cortada' };

  let mapa;
  try {
    mapa = leerJSON((data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
  } catch (e) {
    return { error: e.message };
  }

  // Solo se guardan nombres que estén en la lista: si la IA se inventa
  // uno («Hacienda»), se descarta y el expediente queda para la próxima.
  const validos = new Set(SECTORES);
  let clasificados = 0;
  for (const [i, f] of filas.entries()) {
    const sectores = [...new Set((mapa[String(i + 1)] || []).filter((s) => validos.has(s)))].slice(0, 3);
    if (!sectores.length) continue;
    const { error: e } = await db.from('ccaa_expedientes').update({ sectores }).eq('id', f.id);
    if (!e) clasificados += 1;
  }
  return { clasificados, sin_clasificar: filas.length - clasificados };
}
