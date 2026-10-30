// =====================================================================
// Un mismo acto, dos fuentes: la ficha web y el boletín
// lib/ccaa/duplicados.js
//
// Varios parlamentos se leen por dos vías (ficha web del expediente y
// boletín con IA) y el mismo acto entra dos veces en ccaa_tramites, con
// tipos distintos («Publicación…» en la ficha, «admisión» o «criterio del
// Gobierno» en el boletín). Medido el 30-10-2026: la ficha llega casi
// siempre antes (0 a 3,6 días) y con fechas a ≤10 días del boletín.
//
// Qué fuente manda en cada parlamento (decisión del 30-10-2026):
//   · boletín (Andalucía, La Rioja): trae la cita y el acto exacto. El
//     trámite de la ficha espera ESPERA_FICHA_DIAS; si en ese tiempo entra
//     un trámite del boletín del mismo expediente a ≤VENTANA_DIAS de
//     fecha, no se avisa; si no, se avisa.
//   · ficha (Cantabria, Aragón, Castilla y León): la ficha tiene la
//     cronología completa. El trámite del boletín que tiene uno de la
//     ficha a ≤VENTANA_DIAS no se avisa.
//   · el resto solo tiene boletín (la ficha de Madrid es el registro):
//     no cambia nada.
//
// Solo afecta a los AVISOS (alarmas y seguimiento). Los trámites se
// guardan todos y se ven en la ficha de la ley.
// =====================================================================

export const MANDA = {
  andalucia: 'boletin',
  rioja: 'boletin',
  cantabria: 'ficha',
  aragon: 'ficha',
  castillayleon: 'ficha',
};
export const ESPERA_FICHA_DIAS = 4;
const VENTANA_DIAS = 10;
const DIA = 86400000;
const LOTE = 100;

const parlamentoDe = (id) => String(id || '').split(':')[0];
const esFicha = (t) => t.origen === 'ficha';
const esBoletin = (t) => t.origen === 'boletin_ia';
const cerca = (a, b) => a && b && Math.abs(Date.parse(a) - Date.parse(b)) <= VENTANA_DIAS * DIA;

/**
 * Separa unos trámites (con id, expediente_id, fecha, origen, created_at)
 * en los que se avisan ya, los que esperan (ficha a la espera del boletín)
 * y los repetidos. Lee de la base los trámites del otro origen.
 * Devuelve { avisar, esperar, repetidos }.
 */
export async function separarDuplicados(db, tramites, ahora = Date.now()) {
  const salida = { avisar: [], esperar: [], repetidos: [] };
  const conRegla = (tramites || []).filter((t) => MANDA[parlamentoDe(t.expediente_id)]);
  const sinRegla = (tramites || []).filter((t) => !MANDA[parlamentoDe(t.expediente_id)]);
  salida.avisar.push(...sinRegla);
  if (!conRegla.length) return salida;

  const exps = [...new Set(conRegla.map((t) => t.expediente_id))];
  const otros = [];
  for (let i = 0; i < exps.length; i += LOTE) {
    const { data, error } = await db.from('ccaa_tramites').select('id, expediente_id, fecha, origen').in('expediente_id', exps.slice(i, i + LOTE));
    if (error) throw new Error(error.message);
    otros.push(...(data || []));
  }
  const porExp = new Map();
  for (const o of otros) {
    if (!porExp.has(o.expediente_id)) porExp.set(o.expediente_id, []);
    porExp.get(o.expediente_id).push(o);
  }

  for (const t of conRegla) {
    const manda = MANDA[parlamentoDe(t.expediente_id)];
    const hermanos = (porExp.get(t.expediente_id) || []).filter((o) => o.id !== t.id);
    if (manda === 'boletin' && esFicha(t)) {
      if (hermanos.some((o) => esBoletin(o) && cerca(o.fecha, t.fecha))) salida.repetidos.push(t);
      else if (ahora - Date.parse(t.created_at) < ESPERA_FICHA_DIAS * DIA) salida.esperar.push(t);
      else salida.avisar.push(t);
    } else if (manda === 'ficha' && esBoletin(t)) {
      if (hermanos.some((o) => esFicha(o) && cerca(o.fecha, t.fecha))) salida.repetidos.push(t);
      else salida.avisar.push(t);
    } else {
      salida.avisar.push(t);
    }
  }
  return salida;
}
