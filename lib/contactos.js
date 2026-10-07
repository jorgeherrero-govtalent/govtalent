// Buscador de Contactos: de una frase en lenguaje natural a filtros que el
// usuario puede editar, y de los filtros a la consulta (sql/75,
// buscar_contactos sobre directorio_pro).
//
// La IA solo traduce la frase a filtros: no ve ni un dato de personas, así
// que no puede inventar contactos. Cuesta menos de un céntimo y no gasta
// créditos.

const MODELO = 'claude-sonnet-5-5';
const TIMEOUT_MS = 30000;

import { TIPOS_INSTITUCION, BANDAS, FILTROS_VACIOS, normalizarFiltros } from '@/lib/contactosFiltros';

export { TIPOS_INSTITUCION, BANDAS, FILTROS_VACIOS, normalizarFiltros, filtrosVacios, filtrosDeTexto } from '@/lib/contactosFiltros';

const SISTEMA = `Traduces peticiones de búsqueda de contactos de asuntos públicos a filtros para una base de datos. Respondes solo con un objeto JSON.

La base de datos tiene unas 18.000 personas con estos campos:
- nombre, cargo, unidad (dirección general, gabinete, comisión...), institucion (ministerio, organismo, medio, partido...), area, provincia.
- jurisdiccion: "España" o "UE".
- tipo_institucion: ${TIPOS_INSTITUCION.map((t) => `"${t}"`).join(', ')}.
  ejecutivo = Gobierno, ministerios, AGE y organismos (en España) o Comisión Europea (en UE). legislativo = Congreso de los Diputados y asesores de grupos (España) o Parlamento Europeo (UE), incluidos los asistentes de los eurodiputados (cargo «Asistente parlamentario acreditado», «Asistente local»…; unidad «Equipo de <eurodiputado>»; pais = país del eurodiputado). medios = prensa, radio y televisión. agentes sociales = sindicatos y patronales. diplomático = embajadas extranjeras en España (embajadores, consejeros, agregados de defensa, comerciales, culturales…; jurisdiccion "España", pais = código ISO del país de la embajada). internacional = organismos internacionales con sede u oficina en España. órganos UE = agencias de la UE, Comité Económico y Social Europeo, Tribunal de Cuentas, BEI-FEI y Consejo Europeo (jurisdiccion "UE"). Los embajadores de España en el extranjero son tipo "ejecutivo", institución "Ministerio de Asuntos Exteriores" y unidad "Embajada de España en …".
- banda (nivel del cargo): ${Object.keys(BANDAS).map((b) => `"${b}"`).join(', ')}. alta_direccion = ministros, secretarios de Estado, subsecretarios, directores generales, comisarios, directores generales de la Comisión. electo = diputados y eurodiputados.
- es_titular: el titular de la unidad.
- pais: código ISO de dos letras. Sirve sobre todo para el Parlamento Europeo (país del eurodiputado: "ES" para los españoles).

IMPORTANTE: los datos de la UE están en INGLÉS (cargos como "Head of Cabinet", "Deputy Head of Cabinet", "Director-General", "Head of Unit", "Member of Cabinet"; unidades como "Gabinete de Commissioner Dan JØRGENSEN — Energy and Housing", "DG ENER"). Los de España están en castellano. Si la búsqueda puede afectar a la UE, incluye los términos en los dos idiomas.

Los filtros de texto buscan subcadenas sin tildes ni mayúsculas. Usa raíces cortas para cubrir género y número: "subsecretari", "director general", "jefe de gabinete" y "jefa de gabinete", "portavoz", "asesor".

Devuelve exactamente:
{
  "terminos": [],        // palabras que TIENEN que aparecer todas en nombre, cargo, unidad, institución o área. Úsalo poco: solo para un tema o sector (p. ej. "energ").
  "cargos": [],          // basta con que el cargo contenga alguno
  "instituciones": [],   // basta con que la institución contenga alguno (p. ej. "Ministerio de Sanidad", "Comisión Europea", "El País")
  "unidades": [],        // basta con que la unidad contenga alguno
  "jurisdiccion": null,  // "España" | "UE" | null
  "tipos": [],           // valores de tipo_institucion
  "bandas": [],          // valores de banda
  "paises": [],          // códigos ISO de país, p. ej. ["ES"] para eurodiputados españoles
  "solo_titulares": false,
  "provincia": null,
  "con_contacto": false, // true solo si pide expresamente que tengan correo o teléfono
  "resumen": ""          // una frase en castellano: lo que vas a buscar
}

Reglas: no inventes nombres de personas. Si la petición es ambigua, elige filtros amplios. Si nombra un sector o tema (energía, sanidad, defensa...), ponlo en "terminos" con su raíz en castellano e inglés solo si aplica la UE, o mejor en "unidades"/"instituciones" si es un ministerio o una DG.`;

function extraerJSON(texto) {
  const m = String(texto || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/**
 * Frase → { filtros, resumen }. Lanza si la IA no responde: la ruta
 * devuelve entonces una búsqueda por texto libre como alternativa.
 */
export async function interpretarConsulta(consulta) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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
        max_tokens: 700,
        system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: String(consulta).slice(0, 500) }],
      }),
      cache: 'no-store',
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(reloj);
  }
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const texto = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const j = extraerJSON(texto);
  if (!j) throw new Error('Respuesta de la IA sin JSON');
  return {
    filtros: normalizarFiltros(j),
    resumen: typeof j.resumen === 'string' ? j.resumen.slice(0, 240) : '',
  };
}

