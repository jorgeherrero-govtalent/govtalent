// «Buscar correo», primer intento (sql/86 y 87): deducir la dirección con el
// patrón del dominio de su organización y comprobarla en su servidor de
// correo (MillionVerifier). Rápido y barato (< 0,01 € por persona). Si no se
// confirma, la ruta sigue con la búsqueda con IA (lib/enriquecer.js).
// Solo servidor.

import { aplicarPatron, DOMINIOS_GENERICOS, MIN_MUESTRAS, limpiar } from '@/lib/patronesCorreo';
import { verificarCorreo, hayVerificador } from '@/lib/verificarCorreo';

// Sin patrón conocido para el dominio: las formas más habituales.
const PATRONES_HABITUALES = ['nombre.apellido', 'inicialapellido', 'nombre.apellidos', 'nombre.apellidoapellido'];
const MAX_VARIANTES = 4;
const MIN_ALTERNATIVA = 0.08;

const VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'para', 'por', 'the', 'of', 'and']);
const palabras = (t) =>
  limpiar(t)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter((w) => w && !VACIAS.has(w));

// Dominios por institución (sql/86): 800 filas, se leen una vez por instancia.
let tabla = null;
let tablaEn = 0;
async function tablaDominios(admin) {
  if (tabla && Date.now() - tablaEn < 3600000) return tabla;
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await admin
      .from('email_dominios_institucion')
      .select('institucion, dominio, n, cuota')
      .gte('cuota', 0.6)
      .gte('n', 3)
      .range(desde, desde + 999);
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  tabla = filas.map((f) => ({ ...f, palabras: new Set(palabras(f.institucion)) }));
  tablaEn = Date.now();
  return tabla;
}

/**
 * Dominio de correo de una organización por su nombre, sin tildes ni
 * mayúsculas: «CNMC» o «Comision Nacional de los Mercados y la
 * Competencia» → cnmc.es. Todas las palabras del nombre buscado tienen que
 * estar en el de la institución; si casan varias, la de más correos.
 */
export async function dominioDe(admin, institucion) {
  const buscadas = palabras(institucion);
  if (!buscadas.length || buscadas.join('').length < 3) return null;
  const filas = await tablaDominios(admin);
  const casan = filas.filter((f) => buscadas.every((w) => f.palabras.has(w))).sort((a, b) => b.n - a.n);
  const d = casan[0]?.dominio;
  return d && !DOMINIOS_GENERICOS.has(d) ? d : null;
}

/**
 * Los organismos por encima de la unidad de un cargo de la AGE, del más
 * cercano al ministerio (sin incluirlo): «Dirección de Energía» → CNMC →
 * Secretaría de Estado de Economía. El directorio enseña el ministerio,
 * pero el correo suele ser el del organismo (cnmc.es).
 */
async function organismosDe(admin, personaId) {
  const m = String(personaId || '').match(/^es-ejecutivo:([0-9a-f-]{36})$/);
  if (!m) return [];
  const { data: g } = await admin.from('government_officials').select('dir3_code').eq('id', m[1]).maybeSingle();
  let codigo = g?.dir3_code;
  const nombres = [];
  for (let i = 0; codigo && i < 6; i++) {
    const { data: u } = await admin.from('age_units').select('nombre, nivel, superior_code').eq('dir3_code', codigo).maybeSingle();
    if (!u || (u.nivel ?? 9) <= 1) break; // ministerio o raíz
    nombres.push(u.nombre);
    if (u.superior_code === codigo) break;
    codigo = u.superior_code;
  }
  return nombres;
}

async function comprobar(admin, email) {
  const { data } = await admin.from('email_verificaciones').select('resultado').eq('email', email).maybeSingle();
  if (data) return data.resultado;
  const v = await verificarCorreo(email, { timeout: 25 });
  // «unknown» suele ser un servidor lento: no se guarda, para reintentar.
  if (v.resultado !== 'error' && v.resultado !== 'unknown') {
    await admin
      .from('email_verificaciones')
      .upsert({ email, resultado: v.resultado, subresultado: v.subresultado, calidad: v.calidad, verificado_at: new Date().toISOString() });
  }
  return v.resultado;
}

/**
 * persona: { nombre, institucion }
 * → { email, dominio, patron, probados } si el servidor confirma una dirección; si no, null.
 */
/**
 * Dominios de una persona del directorio, por los correos de su misma
 * unidad o, si no hay bastantes, de su institución. Como luego se comprueba
 * en el servidor, valen también dominios minoritarios (un ministerio
 * mezcla economia.gob.es, mincotur.es…): hasta 2 con al menos el 20 %.
 */
async function dominiosDelDirectorio(admin, persona) {
  const inst = String(persona.institucion || '').trim();
  if (!inst) return [];
  const { data } = await admin.from('directorio_pro').select('email, unidad').eq('institucion', inst).not('email', 'is', null).limit(3000);
  const contar = (filas) => {
    const m = new Map();
    for (const f of filas) {
      const d = String(f.email || '').toLowerCase().split(/[,;\s]+/)[0].split('@')[1];
      if (d && !DOMINIOS_GENERICOS.has(d)) m.set(d, (m.get(d) || 0) + 1);
    }
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    return { total, orden: [...m.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => ({ d, cuota: n / total })) };
  };
  const filas = data || [];
  const deUnidad = persona.unidad ? contar(filas.filter((f) => f.unidad === persona.unidad)) : { total: 0, orden: [] };
  const base = deUnidad.total >= 3 ? deUnidad : contar(filas);
  if (base.total < 3) return [];
  return base.orden.filter((x) => x.cuota >= 0.2).slice(0, 2).map((x) => x.d);
}

export async function correoPorServidor(admin, persona, { pistas = [] } = {}) {
  if (!hayVerificador() || !persona?.nombre) return null;
  // 1. El organismo real de un cargo de la AGE (CNMC dentro del ministerio).
  let dominios = [];
  for (const nombre of await organismosDe(admin, persona.id)) {
    const d = await dominioDe(admin, nombre);
    if (d) {
      dominios.push(d);
      break;
    }
  }
  // 2. El dominio de un correo genérico suyo ya encontrado (comunicacion@correos.com → correos.com).
  for (const d of pistas) if (d && !DOMINIOS_GENERICOS.has(d) && !dominios.includes(d)) dominios.push(d);
  // 3. Los de su unidad o institución en el directorio.
  for (const d of await dominiosDelDirectorio(admin, persona)) if (!dominios.includes(d)) dominios.push(d);
  // 4. Por el nombre de la organización (personas fuera del directorio).
  if (!dominios.length) {
    const d = await dominioDe(admin, persona.institucion);
    if (d) dominios.push(d);
  }
  dominios = dominios.slice(0, 2);
  if (!dominios.length) return null;
  // Principal: todas las variantes; secundario: las dos más probables.
  const pruebas = await Promise.all(dominios.map((d, i) => probarDominio(admin, persona, d, i === 0 ? MAX_VARIANTES : 2)));
  return pruebas.find(Boolean) || null;
}

async function probarDominio(admin, persona, dominio, maxVariantes) {

  const { data: pat } = await admin
    .from('email_patrones')
    .select('patron, fiabilidad, muestras, alternativas, catch_all')
    .eq('dominio', dominio)
    .maybeSingle();
  // Acepta cualquier dirección: comprobar no sirve.
  if (pat?.catch_all) return null;

  const patrones = [];
  if (pat?.patron && pat.muestras >= MIN_MUESTRAS) {
    patrones.push(pat.patron, ...(pat.alternativas || []).filter((a) => a.fiabilidad >= MIN_ALTERNATIVA).map((a) => a.patron));
  }
  for (const p of PATRONES_HABITUALES) if (!patrones.includes(p)) patrones.push(p);

  const variantes = [];
  for (const p of patrones) {
    const e = aplicarPatron(persona.nombre, p, dominio);
    if (e && !variantes.some((v) => v.email === e)) variantes.push({ email: e, patron: p });
    if (variantes.length >= maxVariantes) break;
  }

  // En paralelo: cada comprobación puede tardar 15–20 s (la de cnmc.es
  // tardó 18 s) y en serie se iría a más de un minuto. Cuesta algún crédito
  // de verificación más, pero son céntimos de céntimo.
  const resultados = await Promise.all(variantes.map((v) => comprobar(admin, v.email)));
  const probados = variantes.map((v, i) => ({ ...v, resultado: resultados[i] }));
  if (resultados.includes('catch_all')) {
    if (pat) await admin.from('email_patrones').update({ catch_all: true }).eq('dominio', dominio);
    return null;
  }
  // Por orden de probabilidad: la primera que existe.
  const ok = probados.find((p) => p.resultado === 'ok');
  return ok ? { email: ok.email, dominio, patron: ok.patron, probados } : null;
}
