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

// Segundos nombres de pila frecuentes (sin tildes). No incluye los que
// también son apellidos comunes (García, Martín, Ramos…).
const SEGUNDOS_NOMBRES = new Set([
  'javier', 'jose', 'maria', 'luisa', 'luis', 'carmen', 'isabel', 'antonio', 'angel', 'jesus', 'manuel', 'carlos',
  'ignacio', 'miguel', 'francisco', 'pilar', 'teresa', 'elena', 'eugenia', 'victoria', 'josefa', 'dolores',
  'mercedes', 'rosa', 'jorge', 'pablo', 'alberto', 'enrique', 'ramon', 'fernando', 'alfonso', 'eduardo', 'andres',
  'jaime', 'juan', 'pedro', 'felipe', 'gabriel', 'vicente', 'esteban', 'alejandro', 'mar', 'paz', 'angeles',
  'cristina', 'belen', 'lourdes', 'concepcion', 'jesus', 'inmaculada', 'aurora', 'emilia', 'amparo', 'antonia',
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
// Letras y guiones («Jour-Schroeder» → «jour-schroeder», «O'Connor» → «oconnor»).
const conGuion = (t) => limpiar(t).replace(/[^a-z-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

// Nombres que no son de una persona («Portavoz rotatorio», «Gabinete de
// prensa»): ni sirven de muestra ni se les deduce correo.
const NO_PERSONA = new Set([
  'portavoz', 'rotatorio', 'gabinete', 'secretaria', 'oficina', 'prensa', 'comunicacion', 'departamento', 'unidad',
  'servicio', 'servicios', 'direccion', 'registro', 'informacion', 'atencion', 'presidencia', 'vacante', 'grupo',
  'comision', 'consejo', 'redaccion', 'general', 'office', 'unit', 'secretariat', 'press', 'team', 'cabinet', 'desk',
  'info', 'contacto', 'buzon', 'mesa', 'asesoria', 'subdireccion',
]);
export function pareceNoPersona(nombre) {
  return limpiar(nombre)
    .split(/[^a-z]+/)
    .some((w) => NO_PERSONA.has(w));
}

/**
 * «Martínez Seijo, María Luz» · «Alicia HOMS GINEL» · «Diego Emir Pinilla
 * Zambrano» → { nombres: ['maria','luz'], apellidos: [['martinez'],['seijo']] }
 * Cada apellido es la lista de sus palabras sin partículas
 * («de la Riera» → ['riera']); un apellido compuesto con guion se parte.
 */
export function partirNombre(nombre) {
  // Abreviaturas habituales: «Mª», «M.ª», «Fco.».
  const bruto = String(nombre || '')
    .replace(/\bM\.?\s?ª/g, 'María ')
    .replace(/\bFco\.?(?=\s)/gi, 'Francisco')
    .replace(/\s+/g, ' ')
    .trim();
  if (!bruto || pareceNoPersona(bruto)) return null;
  let given = [];
  let surname = [];
  if (bruto.includes(',')) {
    const [a, n] = bruto.split(',').map((x) => x.trim());
    given = n.split(' ');
    surname = a.split(' ');
  } else {
    const tokens = bruto.split(' ');
    // En mayúsculas de verdad: con al menos dos letras («S.» no cuenta).
    const mayus = tokens.filter((t) => t === t.toUpperCase() && t !== t.toLowerCase() && (t.match(/\p{L}/gu) || []).length > 1);
    if (mayus.length && mayus.length < tokens.length) {
      given = tokens.filter((t) => !mayus.includes(t));
      surname = mayus;
    } else {
      const sinPart = tokens.filter((t) => !PARTICULAS.has(limpiar(t)));
      // «Fco. Javier López», «M.ª Luisa Carcedo»: con tres palabras, si la
      // segunda es un nombre de pila habitual, son dos nombres y un apellido.
      const nGiven = sinPart.length >= 4 || (sinPart.length === 3 && tokens.length === 3 && SEGUNDOS_NOMBRES.has(soloLetras(tokens[1]))) ? 2 : 1;
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
  // Nombres: «Mircea-Gheorghe» son dos.
  const nombresGuion = given.map(conGuion).filter(Boolean);
  const nombres = nombresGuion.flatMap((t) => t.split('-')).filter(Boolean);
  // Apellidos sin partículas (apellidos) y con ellas pegadas a la palabra
  // que les sigue (apellidosCon: «De los Santos» → ['de','los','santos']).
  const apellidos = [];
  const apellidosCon = [];
  let pend = [];
  for (const t of surname) {
    const l = limpiar(t);
    if (PARTICULAS.has(l)) {
      pend.push(l);
      continue;
    }
    const partes = l.split('-').map((x) => x.replace(/[^a-z]/g, '')).filter(Boolean);
    if (!partes.length) continue;
    apellidos.push(partes);
    apellidosCon.push([...pend, ...partes]);
    pend = [];
  }
  // El apellido entero tal cual se escribe, palabra a palabra con su guion.
  const apellidosGuion = surname.map(conGuion).filter(Boolean);
  // Con el nombre solo en inicial («S. Hackstock») no hay correo que deducir.
  if (!nombres.length || !apellidos.length || nombres[0].length < 2) return null;
  return { nombres, nombresGuion, apellidos, apellidosCon, apellidosGuion };
}

// Las plantillas. Cada una recibe las piezas y devuelve la parte local.
function piezas(p) {
  const n1 = p.nombres[0];
  const nU = p.nombres[p.nombres.length - 1];
  const a1 = (p.apellidos[0] || []).join('');
  const a1p = (p.apellidos[0] || [])[0] || '';
  const a2 = (p.apellidos[1] || []).join('');
  const a1con = (p.apellidosCon[0] || []).join('');
  const ag = p.apellidosGuion;
  return {
    n1, nU, a1, a1p, a2, i1: n1[0], iU: nU[0], i2: a2 ? a2[0] : '',
    a1con,
    // Todos los apellidos juntos, con sus partículas y guiones (Parlamento Europeo).
    aTodos: ag.join(''),
    // Todos los apellidos unidos por guiones (Comisión Europea).
    aGuiones: ag.join('-'),
    nGuiones: p.nombresGuion.join('-'),
  };
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
  // Variantes de apellido completo: cuentan a la vez a quien tiene uno o dos
  // apellidos, con o sin partículas, así que no se reparten los votos.
  'nombre.apellidos': (x) => `${x.n1}.${x.aTodos}`,
  'nombre.apellidos-guion': (x) => `${x.n1}.${x.aGuiones}`,
  'nombres.apellidos-guion': (x) => `${x.nGuiones}.${x.aGuiones}`,
  'nombre.apellidoparticula': (x) => (x.a1con !== x.a1 ? `${x.n1}.${x.a1con}` : `${x.n1}.${x.a1}`),
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
  'nombre.apellidos': 'nombre.apellidos (juntos)',
  'nombre.apellidos-guion': 'nombre.apellidos (con guion)',
  'nombres.apellidos-guion': 'nombres.apellidos (con guion)',
  'nombre.apellidoparticula': 'nombre.apellido (con partícula)',
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
// Dominios que aceptan cualquier dirección (catch-all): el servidor no
// permite comprobar nada, así que el correo se deduce del patrón solo si lo
// cumplen al menos estos correos nominativos reales (09-10-2026).
export const MIN_MUESTRAS_CATCH_ALL = 3;
