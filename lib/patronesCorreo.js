// =====================================================================
// Correos probables: el patrón de cada dominio (sql/86).
//
// Paso 1 · De los correos personales que ya tenemos, se deduce cómo
//          construye cada organismo sus direcciones (nombre.apellido,
//          inicial+apellido…) y cuántos casos conocidos reproduce.
// Paso 3 · Para una persona sin correo, se aplica el patrón de su
//          organismo y se ofrece como «correo probable», con su fiabilidad.
// (Paso 2, la verificación contra el servidor de correo, va aparte.)
//
// Todo aquí es puro: sin base de datos ni red.
// =====================================================================

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'da', 'das', 'do', 'dos', 'di', 'van', 'von', 'der', 'le']);

// Proveedores de correo genéricos: un patrón aquí no dice nada.
export const DOMINIOS_GENERICOS = new Set([
  'gmail.com', 'hotmail.com', 'hotmail.es', 'yahoo.com', 'yahoo.es', 'outlook.com', 'outlook.es', 'live.com',
  'icloud.com', 'me.com', 'msn.com', 'telefonica.net', 'protonmail.com', 'gmx.com', 'aol.com',
]);

export function limpiar(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/ß/g, 'ss');
}

const soloLetras = (t) => limpiar(t).replace(/[^a-z]/g, '');

/**
 * «Martínez Seijo, María Luz» · «Alicia HOMS GINEL» · «Diego Emir Pinilla
 * Zambrano» → { nombres: ['maria','luz'], apellidos: [['martinez'],['seijo']] }
 * Cada apellido es la lista de sus palabras sin partículas
 * («de la Riera» → ['riera']); un apellido compuesto con guion se parte.
 */
export function partirNombre(nombre) {
  const bruto = String(nombre || '').replace(/\s+/g, ' ').trim();
  if (!bruto) return null;
  let given = [];
  let surname = [];
  if (bruto.includes(',')) {
    const [a, n] = bruto.split(',').map((x) => x.trim());
    given = n.split(' ');
    surname = a.split(' ');
  } else {
    const tokens = bruto.split(' ');
    const mayus = tokens.filter((t) => t.length > 1 && t === t.toUpperCase() && /\p{L}/u.test(t));
    if (mayus.length && mayus.length < tokens.length) {
      given = tokens.filter((t) => !mayus.includes(t));
      surname = mayus;
    } else {
      const sinPart = tokens.filter((t) => !PARTICULAS.has(limpiar(t)));
      const nGiven = sinPart.length >= 4 ? 2 : 1;
      // Los nombres son las primeras palabras que no son partícula.
      let cuenta = 0;
      let corte = 0;
      for (let i = 0; i < tokens.length; i++) {
        if (!PARTICULAS.has(limpiar(tokens[i]))) cuenta++;
        if (cuenta === nGiven) {
          corte = i + 1;
          break;
        }
      }
      given = tokens.slice(0, corte);
      surname = tokens.slice(corte);
    }
  }
  const nombres = given.map(soloLetras).filter(Boolean);
  // Apellidos: se agrupan las partículas con la palabra que les sigue.
  const apellidos = [];
  let actual = [];
  for (const t of surname) {
    const l = limpiar(t);
    if (PARTICULAS.has(l)) continue;
    for (const parte of l.split('-')) {
      const s = parte.replace(/[^a-z]/g, '');
      if (s) actual.push(s);
    }
    apellidos.push(actual);
    actual = [];
  }
  if (!nombres.length || !apellidos.length) return null;
  return { nombres, apellidos };
}

// Las plantillas. Cada una recibe las piezas y devuelve la parte local.
function piezas(p) {
  const n1 = p.nombres[0];
  const nU = p.nombres[p.nombres.length - 1];
  const a1 = (p.apellidos[0] || []).join('');
  const a1p = (p.apellidos[0] || [])[0] || '';
  const a2 = (p.apellidos[1] || []).join('');
  return { n1, nU, a1, a1p, a2, i1: n1[0], iU: nU[0], i2: a2 ? a2[0] : '' };
}

export const PLANTILLAS = {
  'nombre.apellido': (x) => `${x.n1}.${x.a1}`,
  'nombre2.apellido': (x) => (x.nU !== x.n1 ? `${x.nU}.${x.a1}` : null),
  'nombre.apellidoapellido': (x) => (x.a2 ? `${x.n1}.${x.a1}${x.a2}` : null),
  'nombre.apellido.apellido': (x) => (x.a2 ? `${x.n1}.${x.a1}.${x.a2}` : null),
  'nombreapellido': (x) => `${x.n1}${x.a1}`,
  'nombre_apellido': (x) => `${x.n1}_${x.a1}`,
  'nombre-apellido': (x) => `${x.n1}-${x.a1}`,
  'inicialapellido': (x) => `${x.i1}${x.a1}`,
  'inicial.apellido': (x) => `${x.i1}.${x.a1}`,
  'inicialapellidoapellido': (x) => (x.a2 ? `${x.i1}${x.a1}${x.a2}` : null),
  'inicialapellidoinicial': (x) => (x.a2 ? `${x.i1}${x.a1}${x.i2}` : null),
  'inicial2apellido': (x) => (x.nU !== x.n1 ? `${x.iU}${x.a1}` : null),
  'nombre.apellidocorto': (x) => (x.a1p !== x.a1 ? `${x.n1}.${x.a1p}` : null),
  'apellido.nombre': (x) => `${x.a1}.${x.n1}`,
  'nombre': (x) => x.n1,
};

export const DESCRIPCION = {
  'nombre.apellido': 'nombre.apellido',
  'nombre2.apellido': 'segundo nombre.apellido',
  'nombre.apellidoapellido': 'nombre.apellidoapellido',
  'nombre.apellido.apellido': 'nombre.apellido.apellido',
  'nombreapellido': 'nombreapellido',
  'nombre_apellido': 'nombre_apellido',
  'nombre-apellido': 'nombre-apellido',
  'inicialapellido': 'inicial y apellido',
  'inicial.apellido': 'inicial.apellido',
  'inicialapellidoapellido': 'inicial y dos apellidos',
  'inicialapellidoinicial': 'inicial, apellido e inicial del segundo',
  'inicial2apellido': 'inicial del segundo nombre y apellido',
  'nombre.apellidocorto': 'nombre.apellido (primera parte)',
  'apellido.nombre': 'apellido.nombre',
  'nombre': 'solo el nombre',
};

/** Las plantillas que reproducen un correo concreto. */
export function plantillasQueCasan(nombre, email) {
  const p = partirNombre(nombre);
  const local = soloLetrasYSeparadores(String(email).split('@')[0]);
  if (!p || !local) return null;
  const x = piezas(p);
  // ¿Parece personal? Lleva un apellido o el nombre.
  const personal = p.apellidos.some((a) => a.some((s) => s.length > 2 && local.includes(s))) || local.includes(x.n1);
  if (!personal) return null;
  const casan = [];
  for (const [clave, fn] of Object.entries(PLANTILLAS)) {
    const v = fn(x);
    if (v && v === local) casan.push(clave);
  }
  return casan;
}

function soloLetrasYSeparadores(t) {
  return limpiar(t).replace(/[^a-z._-]/g, '');
}

/**
 * Muestras [{ nombre, email }] de un dominio → el mejor patrón.
 * { patron, aciertos, muestras, fiabilidad, alternativas: [{patron, fiabilidad}] }
 */
export function deducirPatron(muestras) {
  let personales = 0;
  const cuenta = {};
  for (const m of muestras) {
    const casan = plantillasQueCasan(m.nombre, m.email);
    if (casan === null) continue;
    personales++;
    for (const c of casan) cuenta[c] = (cuenta[c] || 0) + 1;
  }
  if (!personales) return null;
  const orden = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  if (!orden.length) return { patron: null, aciertos: 0, muestras: personales, fiabilidad: 0, alternativas: [] };
  const [patron, aciertos] = orden[0];
  return {
    patron,
    aciertos,
    muestras: personales,
    fiabilidad: Math.round((aciertos / personales) * 1000) / 1000,
    alternativas: orden.slice(1, 4).map(([p, n]) => ({ patron: p, fiabilidad: Math.round((n / personales) * 1000) / 1000 })),
  };
}

/** Aplica un patrón a un nombre. */
export function aplicarPatron(nombre, patron, dominio) {
  const p = partirNombre(nombre);
  const fn = PLANTILLAS[patron];
  if (!p || !fn || !dominio) return null;
  const local = fn(piezas(p));
  return local ? `${local}@${dominio}` : null;
}

// Umbrales para ofrecer un correo probable.
export const MIN_MUESTRAS = 5;
export const MIN_FIABILIDAD = 0.8;
