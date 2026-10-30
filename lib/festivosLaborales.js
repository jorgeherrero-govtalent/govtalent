// =====================================================================
// Calendario laboral por comunidad, para contar días hábiles
// lib/festivosLaborales.js
//
// Fuente: Resolución de 17-10-2025 (BOE 28-10-2025) y Resolución de
// 8-10-2026 (BOE 13-10-2026) de la Dirección General de Trabajo, con las
// fiestas laborales de 2026 y 2027 de cada comunidad, contrastadas con los
// decretos autonómicos. Solo fiestas de ámbito nacional y autonómico de
// las comunidades con parlamento en el sync (lib/parlamentosAutonomicos).
//
// ES APROXIMADO, y así se dice al usuario (decisión de Jorge, 30-10-2026):
//   - no incluye las dos fiestas locales de la ciudad sede del parlamento;
//   - cada reglamento parlamentario tiene sus propios días inhábiles
//     (p. ej., meses fuera del periodo de sesiones), que no están aquí.
// 2026 solo desde noviembre: lo anterior ya no cuenta para ningún plazo.
// Añadir cada año la resolución nueva (se publica en octubre).
// =====================================================================

const COMUN = {
  2026: ['2026-12-08', '2026-12-25'],
  2027: ['2027-01-01', '2027-01-06', '2027-03-26', '2027-05-01', '2027-10-12', '2027-11-01', '2027-12-06', '2027-12-08', '2027-12-25'],
};

const PROPIAS = {
  andalucia: { 2026: ['2026-11-02', '2026-12-07'], 2027: ['2027-03-01', '2027-03-25', '2027-08-16'] },
  aragon: { 2026: ['2026-11-02', '2026-12-07'], 2027: ['2027-03-25', '2027-04-23', '2027-08-16'] },
  asturias: { 2026: ['2026-11-02', '2026-12-07'], 2027: ['2027-03-25', '2027-08-16', '2027-09-08'] },
  cantabria: { 2026: ['2026-12-07'], 2027: ['2027-03-25', '2027-07-28', '2027-09-15'] },
  castillayleon: { 2026: ['2026-11-02', '2026-12-07'], 2027: ['2027-03-25', '2027-04-23', '2027-08-16'] },
  cataluna: { 2026: [], 2027: ['2027-03-29', '2027-06-24', '2027-09-11'] },
  madrid: { 2026: ['2026-11-02', '2026-12-07'], 2027: ['2027-03-19', '2027-03-25', '2027-08-16'] },
  rioja: { 2026: ['2026-12-07'], 2027: ['2027-03-25', '2027-03-29', '2027-06-09'] },
  valencia: { 2026: [], 2027: ['2027-03-19', '2027-03-29', '2027-10-09'] },
};

// Comunidad de cada parlamento, para el texto («según el calendario
// laboral de Cataluña»).
export const COMUNIDAD = {
  andalucia: 'Andalucía',
  aragon: 'Aragón',
  asturias: 'Asturias',
  cantabria: 'Cantabria',
  castillayleon: 'Castilla y León',
  cataluna: 'Cataluña',
  madrid: 'la Comunidad de Madrid',
  rioja: 'La Rioja',
  valencia: 'la Comunitat Valenciana',
};

const cache = new Map();
function festivos(parlamento) {
  if (!cache.has(parlamento)) {
    const s = new Set();
    for (const anio of Object.keys(COMUN)) {
      for (const d of COMUN[anio]) s.add(d);
      for (const d of PROPIAS[parlamento]?.[anio] || []) s.add(d);
    }
    cache.set(parlamento, s);
  }
  return cache.get(parlamento);
}

/** ¿Tenemos calendario para ese parlamento y ese año? */
export function hayCalendario(parlamento, anio) {
  return !!PROPIAS[parlamento] && !!COMUN[anio];
}

/** ¿Es hábil (lunes a viernes y no festivo) ese día AAAA-MM-DD? */
export function esHabil(dia, parlamento) {
  const d = new Date(`${dia}T12:00:00Z`);
  const s = d.getUTCDay();
  if (s === 0 || s === 6) return false;
  return !festivos(parlamento).has(dia);
}

/**
 * Días hábiles desde `desde` hasta `hasta` (AAAA-MM-DD), ambos incluidos.
 * null si falta el calendario de algún año del intervalo.
 */
export function habilesEntre(desde, hasta, parlamento) {
  if (!desde || !hasta || desde > hasta) return 0;
  for (let a = Number(desde.slice(0, 4)); a <= Number(hasta.slice(0, 4)); a += 1) {
    if (!hayCalendario(parlamento, a)) return null;
  }
  let n = 0;
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  while (d <= fin) {
    if (esHabil(d.toISOString().slice(0, 10), parlamento)) n += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}
